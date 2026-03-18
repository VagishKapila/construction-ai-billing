# Construction AI Billing — Project Context for Claude

> **READ THIS FIRST** before touching any code.
> This is the CONSTRUCTION AI BILLING project. If you are in a different project session, stop and switch tabs.

---

## What This Project Is

A web-based AIA-format construction billing platform for General Contractors.
Users create projects, upload a Schedule of Values (SOV), then generate AIA G702/G703 pay applications as PDFs.

**Live URL:** https://constructinv.varshyl.com
**Railway deploy:** construction-ai-billing-production.up.railway.app
**GitHub repo:** separate from Sleep Eyes — confirm before pushing
**Owner:** Vagish Kapila (vaakapila@gmail.com) — Varshyl Inc.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Single-file `public/index.html` (vanilla JS, no framework) |
| Backend | Node.js + Express (`server.js`) |
| Database | PostgreSQL via Railway (`db.js` runs migrations on startup) |
| SOV parsing | Node.js XLSX.js (Excel/CSV) + Python `parse_sov.py` (PDF/DOCX) |
| PDF generation | PDFKit (server-side, `server.js`) |
| Auth | JWT + bcrypt, email verification |
| Hosting | Railway (auto-deploy from GitHub `main` branch) |
| Domain | constructinv.varshyl.com → IONOS DNS CNAME + TXT verification |
| Logo | `public/varshyl-logo.png` (180×120px, 5.6KB RGBA PNG) |

---

## File Structure (critical files)

```
construction-ai-billing/
├── server.js          ← ALL backend routes, SOV parser, PDF generator
├── db.js              ← DB schema + ALTER TABLE migrations (runs on startup)
├── parse_sov.py       ← Python parser for PDF and DOCX SOV files only
├── public/
│   ├── index.html     ← ENTIRE frontend (landing page + app in one file)
│   └── varshyl-logo.png
├── qa_test.js         ← Run with `node qa_test.js` — 57 tests, must all pass
├── CLAUDE.md          ← This file
└── package.json
```

---

## Core Features & Current Status

### ✅ Working
- **Landing page** — full marketing page with Varshyl logo, 8 sections, contact info
- **Auth** — register, login, JWT, email verification banner
- **New Project wizard** — 3 steps: project info → SOV upload → review
- **SOV upload** — accepts Excel (.xlsx/.xls), CSV, PDF (.pdf), Word (.docx/.doc)
- **SOV parser** — universal column detection (finds "Total" header first, falls back to scoring)
- **Pay application** — AIA G702/G703 math, change orders, retainage per line
- **PDF generation** — G702 cover + G703 continuation sheet
- **Settings page** — company logo, signature, contact profile (name/phone/email), defaults
- **Auto-fill** — new project form pre-fills from saved company profile
- **Mobile layout** — responsive CSS, all grids collapse to single column on mobile

### ⚠️ Known Behavior
- "By Others" in SOV amount column → treated as $0 (skipped), correct behavior
- Grand Total row in SOV → excluded from line items, correct behavior
- SSL cert on custom domain — provisioned by Railway via Let's Encrypt, takes 5-15min after DNS

---

## SOV Parser Logic (server.js `parseSOVFile`)

**Human-first approach — do NOT simplify this without testing:**

1. **Step 1 (header detection):** Scan first 30 rows for a cell containing "Total", "Scheduled Value", "Amount", "Cost", "Price" → that column is the amount column. Also look for "Description", "Scope", "Work" → that's the description column.
2. **Step 2 (scoring fallback):** If Step 1 finds nothing, score every column: most numeric cells > $50 = amount col (rightmost wins ties), most text cells > 5 chars = desc col.
3. **Step 3 (row parsing):** Iterate from the row after the header. Skip rows where description OR item_id matches total/subtotal patterns. Skip rows with no amount > 0. Use `continue` (not `break`) on summary rows so Fee-type items after a subtotal are still captured.

**Tested against:** Bains contractor proposal (Vagish's real file)
→ Must find 23 rows, sum = $268,233
→ Must include: Project Management, Superintendent, Contracts Admin, Fee
→ Must exclude: "By Others" (Windows), Grand Total row, signature/phone rows

Run `node qa_test.js` to verify after any parser changes.

---

## Settings & Autofill (db.js + server.js + index.html)

`company_settings` table columns (all added via `ALTER TABLE IF NOT EXISTS`):
- `company_name`, `default_payment_terms`, `default_retainage`
- `logo_filename`, `signature_filename`
- `contact_name`, `contact_phone`, `contact_email` ← **recently added**

When user opens New Project wizard, `showNewProject()` auto-fills:
- General contractor ← `companySettings.company_name`
- Contact name/phone/email ← `companySettings.contact_name/phone/email`
- Payment terms ← `companySettings.default_payment_terms`

---

## AIA Math (G702/G703) — DO NOT CHANGE

| Col | Formula |
|-----|---------|
| A | Scheduled value |
| B | Work completed from previous |
| C | Work completed this period |
| D | B + C |
| E | Retainage % × D |
| F | D − E |
| G | Previous certificates |
| H | F − G (current payment due) |
| I | A − F (balance to finish) |

Retainage is per-line (can vary). Default from project settings.

---

## Deployment Workflow

User pushes via **GitHub Desktop → "Push origin"** → Railway auto-deploys.
Never push directly from Claude — user controls all deploys.

**To run QA before pushing:**
```bash
node qa_test.js   # must be 57/57 passes
```

---

## Things That Have Been Broken Before — Don't Repeat

1. **SOV parser skipping "Project Management"** — the old skipDesc had "project" in it. Current version uses `isSummary()` which is specific.
2. **PDF upload rejected client-side** — `processSOVFile()` in index.html was checking only xlsx/csv. Now checks pdf/docx/doc too.
3. **Settings fields not persisting** — `contact_name/phone/email` were not in the DB schema or API. Now they are (added via ALTER TABLE).
4. **Mobile layout broken** — the original mobile CSS block was 6 lines. Current version has comprehensive rules for all grids.
5. **Landing page hiding app** — `auth-screen` must start with class `hidden` so landing shows first.
6. **Logo file too large** — varshyl-logo.png must stay < 100KB (currently 5.6KB).

---

## Project Boundaries — What NOT to Touch

- **Do NOT** modify the AIA math formulas without running the full pay app test
- **Do NOT** remove the `_commaSetup` guard on `setupCommaInput`
- **Do NOT** change `parse_sov.py` for Excel files — Excel is handled by Node.js only
- **Do NOT** change the Railway/GitHub deploy setup — user manages this
- **Do NOT** push to GitHub — user does this via GitHub Desktop

---

## Other Project Warning

The user also has a **Sleep Eyes** project in a **separate Cowork tab**.
If you see files or code unrelated to construction billing, you are in the wrong session.
Ask the user to confirm which project before making any changes.
