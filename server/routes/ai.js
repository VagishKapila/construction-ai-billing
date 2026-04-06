const express = require('express');
const router = express.Router();

const { pool } = require('../../db');
const { auth } = require('../middleware/auth');
const { adminAuth } = require('../middleware/auth');

const PRODUCT_KNOWLEDGE = `
You are Aria, the friendly AI assistant built into ConstructInvoice AI — a construction billing platform for General Contractors.
Your job is to help users understand and use the product. Be warm, concise, and practical. Use short paragraphs.

PRODUCT OVERVIEW:
ConstructInvoice AI generates AIA G702/G703 pay applications for construction projects. Users create projects, upload a Schedule of Values (SOV), then generate pay apps as PDFs.

PRICING:
- 90-day FREE trial with full features, no credit card required
- After trial: $40/month Pro plan
- If a contractor cannot afford it, they can email vaakapila@gmail.com and the team will waive the fee

KEY FEATURES & HOW-TO:

1. CREATE A PROJECT:
   - Click "+ New project" in the sidebar
   - Step 1: Enter project name, owner, contractor, architect, contract amount
   - Step 2: Upload your Schedule of Values (SOV) file
   - Step 3: Review parsed SOV line items
   - Accepted SOV formats: Excel (.xlsx, .xls), CSV, PDF (.pdf), Word (.docx, .doc)

2. CREATE A PAY APP:
   - Open a project from the Dashboard
   - Go to the Pay Apps tab, click "+ New Pay App"
   - Set the application period (from/to dates)
   - Enter % complete for each SOV line item this period
   - The G702/G703 math is calculated automatically
   - Click Save, then download the PDF

3. G702/G703 MATH:
   - Col A: Scheduled value (from SOV)
   - Col B: Work completed from previous periods
   - Col C: Work completed this period (what you enter)
   - Col D: Total completed (B + C)
   - Col E: Retainage (% of D)
   - Col F: Total earned less retainage (D - E)
   - Col G: Previous certificates for payment
   - Col H: Current payment due (F - G)
   - Col I: Balance to finish (A - F)

4. CHANGE ORDERS:
   - In the Pay App editor, find the "+ Change Order" section
   - Each change order gets its own line with description and amount
   - Change orders roll into the G702 totals automatically
   - Save with the checkmark button or press Enter

5. LIEN WAIVERS:
   - Conditional waivers are auto-created when a pay app has an amount and signatory info in Settings. You can also manually create waivers from the Preview tab.
   - Supported types: Preliminary Notice, Conditional Progress, Unconditional Progress, Conditional Final, Unconditional Final
   - Currently supports California, Virginia, and Washington D.C.
   - Sign electronically by typing your name — PDF includes timestamp and IP

6. PDF DOWNLOAD:
   - Click "Download PDF" on the pay app Preview tab
   - PDF includes G702 cover sheet + G703 continuation sheet
   - Your company logo and signature are included automatically if set in Settings

7. EMAIL / SEND:
   - Click "Send & Mark Submitted" to email the pay app PDF to the project owner
   - Lien waiver PDF is automatically attached if one was generated
   - After first send, button changes to "Resend"

8. SETTINGS:
   - Company name, contact info (auto-fills new project forms)
   - Upload company logo (appears on all PDFs)
   - Upload signature (auto-fills on pay apps)
   - Default payment terms and retainage %
   - Set up automated email reminders (7 days before, day-of, 7 days overdue)

9. REVENUE:
   - Click "Revenue" in the sidebar
   - See total billed, retention held, and net received across all projects
   - Filter by month, quarter, or year
   - Export to CSV, QuickBooks IIF, or Sage format

10. REPORTS (NEW):
    - Click "Reports" in the sidebar
    - Filter by project, date range, and status (draft/submitted/paid)
    - See monthly billing trend chart (contract billing + other invoices side by side)
    - Two tables: pay apps and other invoices, both filterable
    - Export pay apps or other invoices to CSV
    - Each project also has a mini billing summary at the bottom of the Pay Apps tab

11. OTHER INVOICES (NEW — non-contract):
    - Inside any project, scroll to "Other invoices" section below pay apps
    - Click "+ New invoice" to create permits, materials, equipment, labor, inspection, insurance, bond, or other invoices
    - These are NOT part of the G702/G703 contract total — tracked separately
    - Attach receipts or documents to each invoice
    - Download each invoice as a professional PDF
    - Vendor auto-fills from your company settings
    - Due date auto-fills to 30 days from today

12. PAYMENTS (Stripe Connect):
    - Go to Settings → Accept Payments via Stripe
    - Connect your Stripe account to accept ACH bank transfers (recommended) from property owners
    - Credit card is off by default — enable it in Settings if you want (higher dispute risk)
    - When you send a pay app email, it includes a "Pay Now" link
    - The property owner clicks the link and pays via ACH directly — funds go to your bank

13. SOV UPLOAD TIPS:
    - The parser auto-detects amount and description columns
    - "By Others" line items are treated as $0 (correct behavior)
    - Grand Total rows are automatically excluded
    - No template required — works with messy contractor spreadsheets

14. TEAM MEMBERS:
    - Settings > Team members > Invite by email
    - Roles: Field (content only), Project Manager, Accountant, Executive, Admin

RESPONSE STYLE:
- Keep answers under 3-4 short sentences when possible
- Use numbered steps for how-to questions
- Be encouraging and supportive
- If you do not know the answer, say so and suggest they email support at vaakapila@gmail.com
- Do NOT make up features that do not exist
`.trim();

const CONSTRUCTION_KNOWLEDGE = `
CONSTRUCTION BILLING DOMAIN KNOWLEDGE:

RETAINAGE:
- Standard retainage: 5-10% withheld from each payment (typical is 10%)
- Retainage is released after substantial completion or final acceptance
- Many states have retainage limits and mandatory release timelines:
  * California: Max 5% on public contracts over $1M; release within 60 days of final completion
  * Texas: 10% retainage; release within 30 days of acceptance
  * Florida: 10% retainage; can reduce to 5% after 50% completion
  * New York: 5% retainage; release within 30 days of final completion
  * Most states: 30-60 day release window after project acceptance

LIEN RIGHTS & DEADLINES:
- Mechanics liens protect contractors from non-payment
- Preliminary notice deadlines (must file BEFORE you can lien):
  * California: 20 days from first furnishing labor/materials
  * Texas: 2nd month statement by 15th of following month
  * Florida: 45 days from first furnishing
- Lien filing deadlines after completion:
  * California: 90 days after completion
  * Texas: 4th month after indebtedness accrues
  * Florida: 90 days from last furnishing
- ALWAYS consult a construction attorney for jurisdiction-specific advice

AIA FORMS:
- G702: Application for Payment (cover page, signed by contractor + architect)
- G703: Continuation Sheet (line-by-line Schedule of Values progress)
- G706: Contractor's Affidavit of Payment of Debts and Claims
- G706A: Contractor's Affidavit of Release of Liens
- G707: Consent of Surety to Final Payment
- G707A: Consent of Surety to Reduction in or Partial Release of Retainage

PAY APPLICATION TIMING:
- Most contracts: submit by 20th-25th of month, payment due by end of following month
- Net 30 is standard; Net 45/60 common on larger projects
- AIA G702 requires architect certification within 7 days of receipt

CHANGE ORDERS:
- Must be approved in writing before extra work begins (protects GC)
- Include: scope description, cost breakdown, time impact
- Request within 21 days of discovering changed conditions (AIA standard)
- T&M (Time & Materials) change orders need daily tickets signed by owner rep

CASH FLOW TIPS FOR CONTRACTORS:
- Front-load the Schedule of Values (place higher values early in project)
- Bill for stored materials (AIA G703 Column F) to improve cash flow
- Submit pay apps early in the billing cycle, every month without fail
- Follow up on overdue payments: call first, then formal letter, then lien threat
- Never let receivables go past 60 days without action — liens have deadlines
- Red flags: owner delays architect certification, vague "review pending" responses

COLLECTION STRATEGIES:
- 7 days overdue: Friendly email reminder with invoice attached
- 14 days overdue: Phone call to owner/PM, ask for payment timeline
- 21 days overdue: Formal written notice of intent to file lien (often gets paid)
- 30 days overdue: File preliminary notice if not already done
- 45-60 days: File mechanics lien — this gets attention fast
- Always document all communication in writing (email trail)

TYPICAL CONSTRUCTION PROJECT BILLING CYCLE:
1. Owner awards contract → GC signs subcontracts
2. GC submits Schedule of Values for approval
3. Monthly: GC submits G702/G703 to architect/owner
4. Architect has 7 days to certify or object
5. Owner pays within payment terms (Net 30 typical)
6. GC pays subs within 7 days of receipt (pay-when-paid clauses)
7. At substantial completion: final pay app + lien waivers
8. Retainage released 30-60 days after final acceptance
`.trim();

// Classify question type for intelligent routing
function classifyQuestion(message) {
  const lower = message.toLowerCase();
  if (/retainage|lien|g702|g703|aia|change order|pay app|schedule of values|collections|overdue|owe|who owes|who hasn.{0,5}paid|cash flow|forecast|payment pattern/i.test(lower)) {
    if (/overdue|owe|collection|cash flow|forecast|who hasn.*paid|payment pattern/i.test(lower)) {
      return 'collection_intelligence';
    }
    return 'construction_billing';
  }
  if (/how do i|where is|how to|what is the|can i|does it|what's|steps/i.test(lower)) {
    return 'product_help';
  }
  return 'general';
}

// POST /api/ai/ask - Ask AI question with conversation persistence
router.post('/api/ai/ask', auth, async (req, res) => {
  const { question } = req.body;
  if (!question) return res.status(400).json({ error: 'Question required' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI not configured' });

  try {
    // Load existing conversation history from DB
    const existingConv = await pool.query(
      'SELECT id, messages FROM ai_conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 1',
      [req.user.id]
    );

    const conversationMessages = existingConv.rows[0]?.messages || [];
    const questionType = classifyQuestion(question);

    // Build system prompt based on question type
    let systemPrompt = PRODUCT_KNOWLEDGE;
    if (questionType === 'construction_billing' || questionType === 'general') {
      systemPrompt += '\n\n' + CONSTRUCTION_KNOWLEDGE;
    }
    if (questionType === 'collection_intelligence') {
      systemPrompt += '\n\n' + CONSTRUCTION_KNOWLEDGE;
      systemPrompt += '\n\nFocus on cash flow advice, collection strategies, and payment tracking.';
    }

    // Call Claude API
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        messages: [
          ...conversationMessages.slice(-18), // keep last 18 messages
          { role: 'user', content: question }
        ],
      }),
    });

    const aiData = await aiRes.json();
    if (aiData.error) throw new Error(aiData.error.message);

    const reply = aiData.content?.[0]?.text || 'No response';

    // Save to DB
    const newMessages = [
      ...conversationMessages.slice(-18),
      { role: 'user', content: question, timestamp: new Date().toISOString() },
      { role: 'assistant', content: reply, timestamp: new Date().toISOString() }
    ];

    if (existingConv.rows[0]) {
      // Update existing conversation
      await pool.query(
        'UPDATE ai_conversations SET messages=$1, context_type=$2, updated_at=NOW() WHERE id=$3',
        [JSON.stringify(newMessages), questionType, existingConv.rows[0].id]
      );
    } else {
      // Create new conversation
      await pool.query(
        'INSERT INTO ai_conversations(user_id, messages, context_type, created_at, updated_at) VALUES($1,$2,$3,NOW(),NOW())',
        [req.user.id, JSON.stringify(newMessages), questionType]
      );
    }

    res.json({ answer: reply, questionType });
  } catch(e) {
    console.error('[AI Ask Error]', e.message);
    res.status(500).json({ error: 'AI temporarily unavailable' });
  }
});

// GET /api/ai/history - Get user's conversation history
router.get('/api/ai/history', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, messages, context_type, created_at, updated_at FROM ai_conversations WHERE user_id=$1 ORDER BY updated_at DESC',
      [req.user.id]
    );
    res.json({ conversations: result.rows });
  } catch(e) {
    console.error('[AI History Error]', e.message);
    res.status(500).json({ error: 'Failed to fetch conversation history' });
  }
});

// GET /api/ai/admin/insights - Admin endpoint for AI usage insights
router.get('/api/ai/admin/insights', adminAuth, async (req, res) => {
  try {
    // Get aggregated stats
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_conversations,
        COUNT(DISTINCT user_id) as unique_users,
        AVG((jsonb_array_length(messages))::numeric) as avg_messages_per_conv,
        MAX(updated_at) as last_conversation
      FROM ai_conversations
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);

    // Get recent conversations with context
    const recent = await pool.query(`
      SELECT
        ac.user_id,
        u.email,
        ac.messages,
        ac.context_type,
        ac.updated_at
      FROM ai_conversations ac
      JOIN users u ON ac.user_id = u.id
      ORDER BY ac.updated_at DESC
      LIMIT 20
    `);

    // Analyze question types
    const questionTypes = await pool.query(`
      SELECT
        context_type,
        COUNT(*) as count
      FROM ai_conversations
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY context_type
      ORDER BY count DESC
    `);

    res.json({
      data: {
        stats: stats.rows[0],
        recent_conversations: recent.rows,
        question_type_distribution: questionTypes.rows
      }
    });
  } catch(e) {
    console.error('[AI Insights Error]', e.message);
    res.status(500).json({ error: 'Failed to fetch AI insights' });
  }
});

module.exports = router;
