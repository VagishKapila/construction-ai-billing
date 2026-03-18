# Construction AI Billing — MCP Server

Connect **Claude Desktop** (or any MCP client) directly to your
[Construction AI Billing](https://constructinv.varshyl.com) account.

Ask Claude things like:
- *"What's my retainage exposure across all projects?"*
- *"Flag any projects where billing is overdue."*
- *"What did we bill this month on the Oakland Civic Center job?"*
- *"Do we have a lien waiver on file for project 12?"*
- *"What were the key terms extracted from the contract I uploaded?"*

---

## Tools Exposed

| Tool | What it does |
|------|-------------|
| `list_projects` | All your projects with job numbers and contract values |
| `get_project_details` | SOV, parties, contract dates for a single project |
| `get_billing_summary` | G702 totals: earned, retainage, amount due, balance |
| `list_pay_applications` | All billing periods with dates and certified amounts |
| `list_lien_documents` | Waivers and preliminary notices on file |
| `get_contract_intel` | AI-extracted contract sum, retainage %, parties, CAGE codes |
| `get_retainage_exposure` | Cash flow view — total retainage held across all jobs |
| `billing_health_check` | Health flags: stale billing, near-completion, missing waivers |

---

## Setup (Claude Desktop)

**Step 1** — Get your API token:
1. Log in at [constructinv.varshyl.com](https://constructinv.varshyl.com)
2. Open DevTools → Application → Local Storage → copy the value of `cai_token`

**Step 2** — Edit your Claude Desktop config:

On **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
On **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "construction-ai-billing": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-plugin/index.js"],
      "env": {
        "CAI_API_TOKEN": "paste-your-jwt-token-here"
      }
    }
  }
}
```

**Step 3** — Restart Claude Desktop. You should see **8 new tools** in the toolbar.

---

## Requirements

- Node.js 18 or higher (uses built-in `fetch`)
- No additional npm packages required

---

## Security Notes

- Your JWT token is stored only in the Claude Desktop config file (local to your machine)
- All API calls go to `constructinv.varshyl.com` over HTTPS
- The token expires after 7 days — repeat Step 1 to refresh it
- Claude never sends your token anywhere else

---

## Support

Questions? Email [vaakapila@gmail.com](mailto:vaakapila@gmail.com) or file an issue at the GitHub repo.
