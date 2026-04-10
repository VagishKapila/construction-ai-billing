'use strict';
const { pool } = require('../../../db');
const XLSX = require('xlsx');

// Lazy Anthropic init
let _anthropic = null;
function getAnthropic() {
  if (!_anthropic) {
    const Anthropic = require('@anthropic-ai/sdk');
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

const vendorBookService = {
  /**
   * importVendors — parse CSV/Excel and AI-map columns
   * Returns { imported, duplicates, missing_emails, errors }
   */
  async importVendors(userId, fileBuffer, mimeType) {
    try {
      // Parse file
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      if (rows.length < 2) return { imported: 0, duplicates: 0, missing_emails: 0, errors: ['Empty file'] };

      const headers = rows[0].map(h => String(h).trim());
      const dataRows = rows.slice(1).filter(r => r.some(c => c !== ''));

      // AI column mapping
      let columnMap = { company_name: null, contact_name: null, email: null, trade_type: null, phone: null };
      try {
        const ai = getAnthropic();
        const resp = await ai.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          messages: [{
            role: 'user',
            content: `Map these column headers to: company_name, contact_name, email, trade_type, phone. Return ONLY valid JSON like {"company_name":0,"contact_name":1,"email":2,"trade_type":3,"phone":4} using column index numbers. Use null if not found. Headers: ${JSON.stringify(headers)}`
          }]
        });
        const text = resp.content[0].text.trim();
        const jsonMatch = text.match(/\{[^}]+\}/);
        if (jsonMatch) columnMap = { ...columnMap, ...JSON.parse(jsonMatch[0]) };
      } catch (aiErr) {
        console.warn('[VendorBook import] AI mapping failed, using position fallback:', aiErr.message);
        // Fallback: positional guess
        headers.forEach((h, i) => {
          const lower = h.toLowerCase();
          if (lower.includes('company') || lower.includes('name')) columnMap.company_name = columnMap.company_name ?? i;
          if (lower.includes('contact')) columnMap.contact_name = i;
          if (lower.includes('email') || lower.includes('mail')) columnMap.email = i;
          if (lower.includes('trade') || lower.includes('type')) columnMap.trade_type = i;
          if (lower.includes('phone') || lower.includes('tel')) columnMap.phone = i;
        });
      }

      let imported = 0, duplicates = 0, missing_emails = 0;
      const errors = [];

      for (const row of dataRows) {
        const companyName = columnMap.company_name !== null ? String(row[columnMap.company_name] || '').trim() : '';
        if (!companyName) { missing_emails++; continue; }

        const email = columnMap.email !== null ? String(row[columnMap.email] || '').trim().toLowerCase() : '';
        if (!email) missing_emails++;

        try {
          // Dedup on email (if provided) or company_name + owner
          if (email) {
            const existing = await pool.query(
              'SELECT id FROM vendor_address_book WHERE owner_id=$1 AND email=$2',
              [userId, email]
            );
            if (existing.rows.length > 0) { duplicates++; continue; }
          }

          await pool.query(
            `INSERT INTO vendor_address_book (owner_id, company_name, contact_name, email, trade_type, phone)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              userId,
              companyName,
              columnMap.contact_name !== null ? String(row[columnMap.contact_name] || '').trim() : null,
              email || null,
              columnMap.trade_type !== null ? String(row[columnMap.trade_type] || '').trim() : null,
              columnMap.phone !== null ? String(row[columnMap.phone] || '').trim() : null,
            ]
          );
          imported++;
        } catch (rowErr) {
          errors.push(`Row error: ${rowErr.message}`);
        }
      }

      return { imported, duplicates, missing_emails, errors };
    } catch (e) {
      throw new Error(`Import failed: ${e.message}`);
    }
  },

  /**
   * suggestVendors — suggest vendors from address book based on SOV line items
   */
  async suggestVendors(projectId, userId) {
    try {
      // Get SOV line items for project
      const sovResult = await pool.query(
        'SELECT description FROM sov_line_items WHERE project_id=$1',
        [projectId]
      );

      if (sovResult.rows.length === 0) return { suggestions: [] };

      // Extract trade types from descriptions
      const descriptions = sovResult.rows.map(r => r.description).join(', ');

      // Common construction trade keywords
      const tradeKeywords = ['plumbing', 'electrical', 'hvac', 'framing', 'roofing', 'concrete',
                              'drywall', 'painting', 'flooring', 'landscaping', 'excavation', 'masonry'];
      const foundTrades = tradeKeywords.filter(t => descriptions.toLowerCase().includes(t));

      if (foundTrades.length === 0) {
        // Return all vendors from address book as generic suggestions
        const allVendors = await pool.query(
          `SELECT id, company_name, contact_name, email, trade_type, has_account, projects_count
           FROM vendor_address_book WHERE owner_id=$1 ORDER BY projects_count DESC LIMIT 10`,
          [userId]
        );
        return { suggestions: allVendors.rows.map(v => ({ ...v, match_reason: 'From your address book' })) };
      }

      const suggestions = [];
      for (const trade of foundTrades) {
        const result = await pool.query(
          `SELECT id, company_name, contact_name, email, trade_type, has_account, projects_count
           FROM vendor_address_book
           WHERE owner_id=$1 AND LOWER(trade_type) LIKE $2
           ORDER BY projects_count DESC LIMIT 3`,
          [userId, `%${trade}%`]
        );
        suggestions.push(...result.rows.map(v => ({ ...v, match_reason: `Matches SOV: ${trade}` })));
      }

      return { suggestions: suggestions.slice(0, 10) };
    } catch (e) {
      throw new Error(`Suggest failed: ${e.message}`);
    }
  }
};

module.exports = vendorBookService;
