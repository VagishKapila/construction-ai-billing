# Construction AI Billing — Testing Guide

## The Three-Layer Testing System

```
LAYER 1: Static checks     → node qa_test.js        (run before every push, IN this folder)
LAYER 2: Live server tests → node qa_live.js         (run after Railway deploys, on YOUR machine)
LAYER 3: Visual checklist  → this document, Section B (run in your browser after deploy)
```

Each layer catches different kinds of bugs. All three are needed.

---

## A — Automated Tests (run from terminal)

### Before every GitHub push:
```bash
node qa_test.js
```
✅ Must show 57/57 PASS before you push. If anything fails, fix it first.
**Catches:** Missing code, wrong function names, DB schema gaps, file size problems.
**Does NOT catch:** Whether the live server actually works.

### After Railway finishes deploying:
Run from your local project folder (NOT in Cowork — your machine has internet):
```bash
node qa_live.js
# or test local dev server:
node qa_live.js http://localhost:3000
```
**Catches:** Server routing bugs, database connection issues, API response format issues,
whether PDF/Word/Excel upload actually routes correctly end-to-end.
**Does NOT catch:** Visual bugs in the browser (formatting, layout, UI interactions).

---

## B — Visual Browser Checklist (manual, after every deploy)

Open https://constructinv.varshyl.com and run through each item.
Check the box when it passes. Stop and fix anything that fails before telling users.

### 1. Landing Page
- [ ] Page loads (no blank screen, no error)
- [ ] Varshyl logo appears in top-left nav
- [ ] "Get Started Free" and "Log In" buttons visible
- [ ] All 8 sections load on scroll (Hero → Problem → How It Works → Features → Pricing → Coming Soon → Who It's For → CTA)
- [ ] On mobile phone: all sections stack to single column, no horizontal scroll

### 2. Registration & Login
- [ ] Click "Get Started Free" → lands on Register form (NOT the app directly)
- [ ] Register with a new email → success message appears
- [ ] Try wrong password → error message appears (not a crash)
- [ ] Log in → lands on Dashboard
- [ ] Click "← Back to home" on login page → returns to landing page
- [ ] Log out → returns to landing page (not login page)

### 3. Settings — Company Profile (RECENTLY FIXED)
- [ ] Navigate to Settings
- [ ] Type your company name in "Company name" field → Save → reload page → name persists ✅
- [ ] Type your name in "Contact name" field → Save → reload page → name persists ✅
- [ ] Type your phone in "Contact phone" → Save → reload → phone persists ✅
- [ ] Type your email in "Contact email" → Save → reload → email persists ✅
- [ ] Upload a logo → logo preview appears ✅
- [ ] Change Default payment terms to "Net 30" → Save → reload → shows Net 30 ✅

### 4. New Project Wizard — Auto-fill (RECENTLY ADDED)
- [ ] After saving settings, click "+ New project"
- [ ] **Step 1: General contractor field auto-fills with your saved company name** ✅
- [ ] **Contact name/phone/email auto-fill from saved settings** ✅
- [ ] Original contract amount field: type "268233" then click into the next field
- [ ] **"268,233" appears with comma formatting** ✅ (RECENTLY FIXED)
- [ ] Fill in project name → click Next → reaches Step 2

### 5. SOV Upload (ALL FORMATS — RECENTLY FIXED)
- [ ] On Step 2, upload an **Excel .xlsx** file → parses and shows table ✅
- [ ] Upload a **PDF** file → parses and shows rows (or error message, not rejection) ✅
- [ ] Upload a **Word .docx** file → parses and shows rows ✅
- [ ] Upload the Bains proposal file → should show **23 rows**, sum **$268,233** ✅
- [ ] Verify "Project Management" appears at the top of the list ✅
- [ ] Verify "Fee" appears near the bottom ✅
- [ ] Verify no "TOTAL" row appears in the list ✅
- [ ] "By Others" rows (Windows) are not in the list ✅

### 6. Pay Application
- [ ] Complete project creation through Step 3 → project appears on dashboard
- [ ] Open project → click "Create Pay App #1"
- [ ] Enter 20% on a few line items → check math:
  - Col D = B + C (should equal C since B=0 on first app)
  - Col E = 10% of D (retainage)
  - Col F = D - E
  - Col H = F - G (should equal F since G=0 on first app)
- [ ] Click "Download PDF" → PDF opens/downloads, contains G702 and G703 pages ✅

### 7. Mobile Smoke Test
Open the site on your phone:
- [ ] Landing page readable, no horizontal scroll
- [ ] Can navigate to login
- [ ] Can log in
- [ ] Dashboard shows properly in single column
- [ ] New project form usable on phone

---

## C — The Problem With Our Old QA (Why Bugs Got Through)

| What failed | Why qa_test.js missed it | What would have caught it |
|-------------|--------------------------|---------------------------|
| PDF upload rejected | Checked if the code was written, not if it ran | qa_live.js upload test |
| Word upload rejected | Same | qa_live.js upload test |
| Comma formatting broken | Browser behavior, can't grep for it | Visual checklist / Playwright |
| Settings not persisting | DB columns existed in code but not verified round-trip | qa_live.js settings test |
| SOV missing top rows | Parser was "written" correctly but wrong logic | qa_live.js Bains file test |

**The lesson:** Static code checks only verify intent. Tests that actually RUN the code verify behavior.

---

## D — QA Improvement Roadmap

### Now (implemented)
- `qa_test.js` — 57 static code checks (before push)
- `qa_live.js` — live API tests (after deploy)
- This visual checklist (in browser)

### Next step: Playwright browser automation (~1 week of setup)
Playwright is a tool that controls a real browser automatically. It would let us write tests like:
```
"Open the app, log in, type 268233 in the contract field,
click elsewhere, verify the field shows 268,233"
```
This catches visual/UI bugs automatically. Worth adding once the core app is stable.

### Eventually: Staging environment
Right now there's only one environment: production. Every push goes live.
A staging environment on Railway would let you deploy → test → promote to production.
Cost: one more Railway service (~$5/mo).

---

## E — After Every Deploy: The 5-Minute Smoke Test

If you only have 5 minutes, do these 5 things to confirm the deploy is healthy:

1. **Load the site** — landing page appears, no crashes
2. **Log in** — dashboard loads with your projects
3. **Upload a .xlsx file** on a new project — SOV parses and shows rows
4. **Open an existing pay app** — G702 math looks correct
5. **Download a PDF** — PDF opens without error

If all 5 pass, the deploy is healthy.
