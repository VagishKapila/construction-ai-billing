# ConstructInvoice AI — Changelog

## [2.1.0] — April 2026

### Infrastructure
- Added Sentry error monitoring (backend + frontend)
- Added rate limiting on auth (20/15min), pay (10/1min), and API (200/1min) routes
- Added feature flags system (`server/features/flags.js`) — all new features start as OFF
- Added structured logging with pino (`server/utils/logger.js`)
- Enhanced health check endpoint with DB status and version
- BetterStack uptime monitoring setup guide (`MONITORING_SETUP.md`)
- AI testing team: Sam (contractor), Mike (vendor), Paul (owner) Playwright agents

### Bug Fixes
- Pay page now shows friendly message when Stripe not set up (vs broken form)
- Settings: credit card toggle now has Save button (was never persisting to DB)
- Pay App #2+ now inherits PO number and notes from previous pay app
- Hub rejection flow: quick-select chips, sub notified via email, "Awaiting resubmission" badge

## [2.0.0] — April 2026

### Features
- Project Hub Phase 1: orbital canvas, magic link invites, document upload/categorize
- Trust Score /763 system (5 tiers: platinum/gold/silver/bronze/review)
- California lien module (§8200–8216, PDF generation)
- Early Pay 1.5% fee (corrected from 2.5%)
- Vendor Book service with AI column mapping
- ZIP repository export
- 2-step onboarding flow (Company Setup → Meet ARIA)
- 90-day free trial system with Stripe checkout upgrade
- Guided tour with 8 steps (replaced with dedicated /onboarding route)
- Admin dashboard with KPI cards, charts, AI insights
- Stripe Connect payment pipeline (ACH + card via Checkout)
- QuickBooks integration (built, pending env vars)
- SOV parsing for Excel, CSV, PDF, DOCX
- G702/G703 PDF generation with custom logo + signature
- Reconciliation module (< $0.02 threshold for fully reconciled)
- Job Completed tracking with trophy banner and reopen flow

### Bug Fixes
- GuidedTour removed (was blocking Stripe banner with z-50 overlay)
- Dashboard always renders 2-column layout with KPI cards visible
- Google OAuth loop fixed (redirects to /app.html not /)
- Password reset fixed (now /app.html?reset=TOKEN)
- Uploaded files persist on Railway Volume (/app/uploads)
- ACH async payment events handled (async_payment_succeeded webhook)
- Reconciliation rounding fixed (< $0.02 threshold)
- Production 502 fixed: removed CREATE INDEX on dropped columns

## [1.0.0] — Pre-April 2026

- Initial launch: SOV upload, G702/G703, pay apps, email send, lien waivers
