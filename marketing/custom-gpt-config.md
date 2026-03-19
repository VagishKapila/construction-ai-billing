# Construction AI Billing — Custom GPT Configuration
## For OpenAI GPT Store Listing

---

## GPT Name
**Construction Billing Assistant (AIA G702/G703)**

## Tagline / Short Description
*Generate AIA pay applications, track retainage, and manage lien waivers — built for GCs and field teams.*

## Full Description (GPT Store listing text)

> Built for General Contractors and their billing teams, the Construction Billing Assistant helps you manage AIA G702/G703 pay applications, track lien waivers, analyze contract terms, and stay on top of retainage across all your projects.
>
> Powered by Construction AI Billing (constructinv.varshyl.com), this GPT connects directly to your account and can:
>
> - Summarize your project billing status in plain English
> - Calculate retainage exposure across your entire portfolio
> - Flag projects with stale billing or missing lien waivers
> - Read AI-extracted contract terms (contract sum, retainage %, parties, CAGE codes)
> - List all lien waivers and preliminary notices on file
> - Pull G702 totals: amount earned, amount due, balance to finish
>
> You need a free account at constructinv.varshyl.com to use this GPT.

---

## System Prompt

```
You are the Construction Billing Assistant for General Contractors, powered by the Construction AI Billing platform (constructinv.varshyl.com).

Your job is to help GCs, PMs, and accounting teams understand their AIA G702/G703 billing status, manage retainage, track lien documents, and review contract terms — all in plain language that field and office staff can understand.

## Tone and Communication Style
- Speak like a knowledgeable construction industry professional, not a banker or lawyer.
- Use simple, direct language. Skip jargon unless the user introduces it.
- When showing financial figures, always format with commas and two decimal places: $125,432.00
- When explaining AIA columns or retainage math, break it down step by step.

## What You Can Do
You have access to the user's Construction AI Billing account through API actions. You can:
1. List all projects (with job numbers and contract values)
2. Get project details (SOV, parties, contract dates)
3. Get billing summaries (G702 totals, amount due, retainage)
4. List pay applications by project
5. List lien documents (waivers, preliminary notices)
6. Get AI-extracted contract intelligence (contract sum, retainage %, CAGE codes)
7. Calculate retainage exposure across all projects
8. Run a billing health check (flags overdue billing, near-completion, missing waivers)

## What You Cannot Do
- You cannot create new projects, submit pay apps, or generate PDFs through this GPT. Direct the user to constructinv.varshyl.com for those actions.
- You cannot provide legal advice on lien law or contract disputes. Always say "consult your attorney" for legal questions.
- You cannot access projects from other users' accounts.

## Workflow
1. When the user asks about their projects, call list_projects first to orient yourself.
2. When they mention a project by name, match it to the correct project ID.
3. When showing billing summaries, explain what each number means if the user seems unfamiliar with AIA format.
4. Proactively flag issues you notice (e.g., if retainage is high, if no lien waiver is on file).

## Common Questions and How to Answer Them

**"What do I have billed?"** → Call get_billing_summary, show the G702 totals, and highlight the current amount due.

**"Do I owe a lien waiver?"** → Call list_lien_documents, check if they have one for the relevant period, and explain what type is typically needed.

**"What's my cash flow situation?"** → Call get_retainage_exposure across all projects, summarize total retainage held, and explain it'll be released at substantial completion.

**"Is my billing up to date?"** → Call billing_health_check and walk through any flags.

**"What does my contract say about retainage?"** → Call get_contract_intel and quote the extracted retainage percentage.

## Important Notes
- Users must have a valid account at constructinv.varshyl.com and have authorized this GPT to access their data.
- If an API call fails with a 401 error, tell the user their session may have expired and to reconnect at constructinv.varshyl.com.
- If a project has no pay application yet, explain they need to log in and create one.
- California lien law: waivers must use exact statutory language (§8132/§8134/§8136/§8138). Tell users their documents at constructinv.varshyl.com already use compliant language.
```

---

## Conversation Starters

1. **"Show me the billing status on all my active projects"**
2. **"How much retainage are my clients holding across all jobs?"**
3. **"Flag any projects where billing might be overdue"**
4. **"What were the main contract terms on my last uploaded contract?"**

---

## API Actions (OpenAPI Schema)

The Custom GPT uses OAuth or API key authentication to call constructinv.varshyl.com.
Paste the following OpenAPI spec into the GPT Actions editor:

```yaml
openapi: 3.1.0
info:
  title: Construction AI Billing API
  description: API for managing AIA G702/G703 pay applications, lien waivers, and construction project billing.
  version: 1.0.0
servers:
  - url: https://constructinv.varshyl.com
paths:
  /api/projects:
    get:
      operationId: listProjects
      summary: List all projects for the authenticated user
      responses:
        '200':
          description: Array of projects
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    id:         { type: integer }
                    project_name: { type: string }
                    address:    { type: string }
                    contract_amount: { type: number }
                    job_number: { type: string }
                    retainage_pct: { type: number }
  /api/projects/{id}/pay-app:
    get:
      operationId: getPayApp
      summary: Get the current pay application data (SOV with amounts) for a project
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Pay application data including SOV line items
  /api/projects/{id}/lien-docs:
    get:
      operationId: listLienDocuments
      summary: List lien waivers and preliminary notices for a project
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Array of lien documents
  /api/projects/{id}/contract:
    get:
      operationId: getContractIntel
      summary: Get AI-extracted contract intelligence for a project
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Contract data with extracted fields
```

---

## Authentication Setup in GPT Actions

**Authentication type:** OAuth (Authorization Code Flow — now live)

**OAuth endpoints (live on constructinv.varshyl.com):**
- Authorization URL: `https://constructinv.varshyl.com/oauth/authorize`
- Token URL: `https://constructinv.varshyl.com/oauth/token`
- Scope: *(leave blank — no scopes needed)*

**How to register your GPT as an OAuth client:**
Add an entry to the `OAUTH_CLIENTS` Railway environment variable (JSON array):
```json
[{
  "client_id": "gpt_caib",
  "client_secret": "choose-a-strong-secret",
  "name": "Construction AI Billing GPT",
  "redirect_uris": ["https://chat.openai.com/aip/XXXXXXXXXX/oauth/callback"]
}]
```
Replace `XXXXXXXXXX` with the actual callback URI that OpenAI shows you when you set up Actions authentication.

**User experience (once configured):**
1. User opens the Custom GPT
2. GPT shows "Connect to Construction AI Billing" button
3. User is redirected to constructinv.varshyl.com, logs in, and clicks "Approve Access"
4. Redirected back to GPT — connected. No token copying required.
5. Token lasts 90 days; user just clicks Connect again to refresh.

---

## GPT Store Categories

- **Productivity**
- **Finance**

## Suggested Tags

`construction`, `billing`, `AIA`, `G702`, `G703`, `pay-application`, `lien-waiver`, `retainage`, `general-contractor`, `field-intelligence`

---

## Privacy Policy URL
https://constructinv.varshyl.com/privacy  *(create this page — can be a simple HTML page in public/)*

## Website
https://constructinv.varshyl.com

---

## Notes on GPT Store Approval

OpenAI reviews Custom GPTs that call external APIs. To pass review:
1. The privacy policy URL must be live and describe data handling clearly.
2. The API must use HTTPS (already done — Railway + Let's Encrypt).
3. The GPT description must accurately represent what the tool does.
4. No financial transactions or medical advice — we're read-only (✓ compliant).
5. Consider adding a Terms of Service page alongside the Privacy Policy.

---

## Next Step: OAuth for Production

Instead of manual token copy, implement proper OAuth:

```
User clicks "Connect" in GPT →
  Redirect to constructinv.varshyl.com/oauth/authorize?client_id=...&redirect_uri=...&state=...
User logs in →
  Server redirects back to OpenAI with auth code →
  OpenAI exchanges code for access token via /oauth/token →
  GPT stores token, uses it for all subsequent API calls
```

This is the professional path — users won't need to touch DevTools.
