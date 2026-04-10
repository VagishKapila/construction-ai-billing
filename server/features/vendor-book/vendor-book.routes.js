'use strict';
const express = require('express');
const router = express.Router();
const { auth } = require('../../middleware/auth');
const { pool: db } = require("../../../db");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

// GET /api/vendor-book
router.get('/api/vendor-book', auth, async (req, res) => {
  try {
    const { search, trade } = req.query;
    let query = 'SELECT * FROM vendor_address_book WHERE owner_id = $1';
    const params = [req.user.id];
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      query += ` AND (LOWER(company_name) LIKE $${params.length} OR LOWER(contact_name) LIKE $${params.length})`;
    }
    if (trade) { params.push(trade); query += ` AND trade_type = $${params.length}`; }
    query += ' ORDER BY company_name ASC';
    const result = await db.query(query, params);
    res.json({ data: result.rows, error: null });
  } catch (err) {
    console.error('[VendorBook] list error:', err);
    res.status(500).json({ data: null, error: 'Failed to load vendor book' });
  }
});

// POST /api/vendor-book — add single vendor
router.post('/api/vendor-book', auth, async (req, res) => {
  try {
    const { company_name, contact_name, email, phone, trade_type, address, notes } = req.body;
    if (!company_name) return res.status(400).json({ data: null, error: 'company_name required' });
    const result = await db.query(
      `INSERT INTO vendor_address_book (owner_id, company_name, contact_name, email, phone, trade_type, address, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (owner_id, email) DO UPDATE SET company_name=EXCLUDED.company_name, updated_at=NOW()
       RETURNING *`,
      [req.user.id, company_name, contact_name||null, email||null, phone||null, trade_type||null, address||null, notes||null]
    );
    res.status(201).json({ data: result.rows[0], error: null });
  } catch (err) {
    console.error('[VendorBook] add error:', err);
    res.status(500).json({ data: null, error: 'Failed to add vendor' });
  }
});

// DELETE /api/vendor-book/:id
router.delete('/api/vendor-book/:id', auth, async (req, res) => {
  try {
    await db.query(
      'DELETE FROM vendor_address_book WHERE id = $1 AND owner_id = $2',
      [parseInt(req.params.id), req.user.id]
    );
    res.json({ data: { deleted: true }, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: 'Failed to delete vendor' });
  }
});

// POST /api/vendor-book/ai-map — ARIA column mapping for import
router.post('/api/vendor-book/ai-map', auth, async (req, res) => {
  try {
    const { headers, sample_rows } = req.body;
    if (!headers || !Array.isArray(headers)) return res.status(400).json({ data: null, error: 'headers array required' });

    if (!ANTHROPIC_API_KEY) {
      // Keyword fallback
      const fieldKeywords = {
        company_name: ['company','business','firm','org','name'],
        contact_name: ['contact','person','rep','first','last'],
        email: ['email','e-mail','mail'],
        trade_type: ['trade','type','specialty','scope'],
        phone: ['phone','tel','mobile','cell']
      };
      const mapping = {};
      const uncertain = [];
      headers.forEach(h => {
        const hl = h.toLowerCase();
        let matched = false;
        for (const [field, kws] of Object.entries(fieldKeywords)) {
          if (kws.some(kw => hl.includes(kw))) { mapping[h] = field; matched = true; break; }
        }
        if (!matched) { mapping[h] = null; uncertain.push(h); }
      });
      return res.json({ data: { mapping, uncertain, method: 'keyword' }, error: null });
    }

    try {
      const Anthropic = require('@anthropic-ai/sdk');
      const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `Map these spreadsheet column headers to vendor database fields: company_name, contact_name, email, trade_type, phone. Return ONLY valid JSON.

Headers: ${JSON.stringify(headers)}
Sample data (first 3 rows): ${JSON.stringify(sample_rows?.slice(0,3) || [])}

Return: { "mapping": { "Header Name": "field_name_or_null" }, "uncertain": ["Header Name if confidence low"] }`
        }]
      });
      const text = message.content[0]?.type === 'text' ? message.content[0].text : '{}';
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : { mapping: {}, uncertain: [] };
      return res.json({ data: { ...parsed, method: 'ai' }, error: null });
    } catch(aiErr) {
      console.warn('[VendorBook] AI map failed, using keyword fallback:', aiErr.message);
      const mapping = {};
      headers.forEach(h => { mapping[h] = null; });
      return res.json({ data: { mapping, uncertain: headers, method: 'keyword' }, error: null });
    }
  } catch (err) {
    console.error('[VendorBook] ai-map error:', err);
    res.status(500).json({ data: null, error: 'AI mapping failed' });
  }
});

// POST /api/vendor-book/import — bulk import vendors
router.post('/api/vendor-book/import', auth, async (req, res) => {
  try {
    const { vendors } = req.body;
    if (!Array.isArray(vendors) || vendors.length === 0) {
      return res.status(400).json({ data: null, error: 'vendors array required' });
    }
    let imported = 0;
    for (const v of vendors) {
      if (!v.company_name) continue;
      await db.query(
        `INSERT INTO vendor_address_book (owner_id, company_name, contact_name, email, phone, trade_type, import_source)
         VALUES ($1, $2, $3, $4, $5, $6, 'ai_import')
         ON CONFLICT (owner_id, email) DO UPDATE SET company_name=EXCLUDED.company_name, updated_at=NOW()`,
        [req.user.id, v.company_name, v.contact_name||null, v.email||null, v.phone||null, v.trade_type||null]
      );
      imported++;
    }
    res.status(201).json({ data: { imported }, error: null, message: `${imported} vendors imported` });
  } catch (err) {
    console.error('[VendorBook] import error:', err);
    res.status(500).json({ data: null, error: 'Import failed' });
  }
});

// GET /api/vendor-book/sov-suggestions/:projectId
router.get('/api/vendor-book/sov-suggestions/:projectId', auth, async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const sovLines = await db.query(
      'SELECT id, description FROM sov_lines WHERE project_id = $1 ORDER BY id LIMIT 20',
      [projectId]
    );
    const vendors = await db.query(
      'SELECT * FROM vendor_address_book WHERE owner_id = $1 ORDER BY company_name',
      [req.user.id]
    );
    const suggestions = sovLines.rows.map(line => {
      const matches = vendors.rows.filter(v => {
        if (!v.trade_type) return false;
        return line.description.toLowerCase().includes(v.trade_type.toLowerCase().substring(0, 5));
      });
      return { sov_line_id: line.id, description: line.description, suggested_vendors: matches.slice(0, 3) };
    }).filter(s => s.suggested_vendors.length > 0);
    res.json({ data: suggestions, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: 'Failed to generate suggestions' });
  }
});

module.exports = router;
