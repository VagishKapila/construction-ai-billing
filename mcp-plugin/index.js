#!/usr/bin/env node
/**
 * Construction AI Billing — MCP Server
 * Implements the Model Context Protocol (JSON-RPC 2.0 over stdio)
 * Compatible with Claude Desktop, Claude.ai plugins, and any MCP client.
 *
 * Setup:
 *   export CAI_API_TOKEN="your-jwt-from-constructinv.varshyl.com"
 *   export CAI_BASE_URL="https://constructinv.varshyl.com"   # optional, defaults shown
 *   node index.js
 *
 * Claude Desktop config (~/Library/Application Support/Claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "construction-ai-billing": {
 *         "command": "node",
 *         "args": ["/path/to/mcp-plugin/index.js"],
 *         "env": {
 *           "CAI_API_TOKEN": "your-jwt-token-here"
 *         }
 *       }
 *     }
 *   }
 */

import readline from 'readline';

// ─── Config ──────────────────────────────────────────────────────────────────
const BASE_URL = (process.env.CAI_BASE_URL || 'https://constructinv.varshyl.com').replace(/\/$/, '');
const TOKEN    = process.env.CAI_API_TOKEN || '';

if (!TOKEN) {
  process.stderr.write('[CAI-MCP] Warning: CAI_API_TOKEN not set. All API calls will fail with 401.\n');
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    ...opts.headers,
  };
  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}

// ─── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'list_projects',
    description: 'List all construction projects for the authenticated user. Returns project IDs, names, addresses, contract amounts, and job numbers.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_project_details',
    description: 'Get full details of a specific project including SOV (Schedule of Values), general contractor, owner, architect, contract dates, and current billing status.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'The numeric project ID (get from list_projects)',
        },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'get_billing_summary',
    description: 'Get the AIA G702/G703 pay application summary for a project — totals billed to date, current period, retainage held, amount due, and balance to finish.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'The numeric project ID',
        },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'list_pay_applications',
    description: 'List all pay applications (billing periods) for a project, with application numbers, dates, amounts certified, and PDF download links.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'The numeric project ID',
        },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'list_lien_documents',
    description: 'List lien waivers and preliminary notices filed for a project. Returns document type (conditional/unconditional waiver, preliminary notice), amount, date, jurisdiction, and signatory.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'The numeric project ID',
        },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'get_contract_intel',
    description: 'Get AI-extracted contract intelligence for a project: contract sum, retainage percentage, owner name, contractor name, contract date, contract type (AIA, federal DoD, state, subcontract), and any CAGE codes or federal contract numbers.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'The numeric project ID',
        },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'get_retainage_exposure',
    description: 'Calculate the total retainage held across all projects (or a single project). Useful for cash flow analysis — shows how much money is being withheld and the expected release date.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: {
          type: 'string',
          description: 'Optional — the numeric project ID. Omit to get totals across all projects.',
        },
      },
      required: [],
    },
  },
  {
    name: 'billing_health_check',
    description: 'Run a health check across all active projects: flag projects with no recent pay application (>45 days), projects nearing contract completion (>90% billed), and projects with no lien waiver on file.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ─── Tool handlers ────────────────────────────────────────────────────────────
async function handleTool(name, args) {
  switch (name) {

    case 'list_projects': {
      const projects = await api('/api/projects');
      if (!Array.isArray(projects) || projects.length === 0) {
        return { text: 'No projects found. Create your first project at constructinv.varshyl.com.' };
      }
      const lines = projects.map(p => {
        const contract = p.contract_amount ? `$${Number(p.contract_amount).toLocaleString()}` : 'No contract set';
        const job = p.job_number ? ` [${p.job_number}]` : '';
        return `• **${p.project_name}**${job} (ID: ${p.id})\n  ${p.address || 'No address'} | ${contract}`;
      });
      return { text: `**${projects.length} project(s):**\n\n${lines.join('\n\n')}` };
    }

    case 'get_project_details': {
      const { project_id } = args;
      const p = await api(`/api/projects/${project_id}`);
      const sov = p.sov_items || [];
      const sovLines = sov.slice(0, 10).map((item, i) =>
        `  ${i + 1}. ${item.description} — $${Number(item.scheduled_value || 0).toLocaleString()}`
      );
      if (sov.length > 10) sovLines.push(`  … and ${sov.length - 10} more line items`);
      return {
        text: [
          `**Project: ${p.project_name}** (ID: ${p.id})`,
          `Job Number: ${p.job_number || 'Not assigned'}`,
          `Address: ${p.address || 'Not set'}`,
          `Owner: ${p.owner_name || 'Not set'}`,
          `Architect: ${p.architect_name || 'Not set'}`,
          `General Contractor: ${p.gc_name || 'Not set'}`,
          `Contract Amount: ${p.contract_amount ? '$' + Number(p.contract_amount).toLocaleString() : 'Not set'}`,
          `Contract Date: ${p.contract_date || 'Not set'}`,
          `Retainage: ${p.retainage_pct || 10}%`,
          `Payment Terms: ${p.payment_terms || 'Not set'}`,
          `\n**Schedule of Values (${sov.length} items):**`,
          ...sovLines,
        ].join('\n'),
      };
    }

    case 'get_billing_summary': {
      const { project_id } = args;
      const data = await api(`/api/projects/${project_id}/pay-app`);
      const sov = data.sov_items || [];

      let totalScheduled = 0, totalPrevious = 0, totalThisPeriod = 0;
      let totalCompleted = 0, totalRetainage = 0, totalEarned = 0;

      sov.forEach(item => {
        const sv = Number(item.scheduled_value) || 0;
        const prev = Number(item.work_previous) || 0;
        const curr = Number(item.work_this_period) || 0;
        const ret = Number(item.retainage_pct) || (data.retainage_pct || 10);
        const comp = prev + curr;
        const retAmt = comp * (ret / 100);
        totalScheduled   += sv;
        totalPrevious    += prev;
        totalThisPeriod  += curr;
        totalCompleted   += comp;
        totalRetainage   += retAmt;
        totalEarned      += comp - retAmt;
      });

      const prevCerts = data.previous_certificates || 0;
      const amountDue = Math.max(0, totalEarned - prevCerts);
      const pctComplete = totalScheduled > 0
        ? ((totalCompleted / totalScheduled) * 100).toFixed(1)
        : '0.0';

      const fmt = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      return {
        text: [
          `**Billing Summary — ${data.project_name || 'Project ' + project_id}**`,
          '',
          `Original Contract Value:  ${fmt(totalScheduled)}`,
          `% Complete:               ${pctComplete}%`,
          `Work Completed (prior):   ${fmt(totalPrevious)}`,
          `Work This Period:         ${fmt(totalThisPeriod)}`,
          `Total Earned to Date:     ${fmt(totalCompleted)}`,
          `Retainage Held:           ${fmt(totalRetainage)}`,
          `Net Earned (less ret.):   ${fmt(totalEarned)}`,
          `Previous Certifications:  ${fmt(prevCerts)}`,
          `**Current Amount Due:     ${fmt(amountDue)}**`,
          `Balance to Finish:        ${fmt(Math.max(0, totalScheduled - totalCompleted))}`,
        ].join('\n'),
      };
    }

    case 'list_pay_applications': {
      const { project_id } = args;
      const apps = await api(`/api/projects/${project_id}/pay-apps`);
      if (!Array.isArray(apps) || apps.length === 0) {
        return { text: 'No pay applications found for this project.' };
      }
      const lines = apps.map(a => {
        const amt = a.amount_due != null ? '$' + Number(a.amount_due).toLocaleString() : 'Draft';
        return `• App #${a.application_number} | ${a.period_to || a.created_at?.slice(0, 10)} | ${amt} | ${a.status || 'draft'}`;
      });
      return { text: `**Pay Applications (${apps.length}):**\n\n${lines.join('\n')}` };
    }

    case 'list_lien_documents': {
      const { project_id } = args;
      const docs = await api(`/api/projects/${project_id}/lien-docs`);
      if (!Array.isArray(docs) || docs.length === 0) {
        return { text: 'No lien documents on file for this project.' };
      }
      const typeLabels = {
        ca_8132: 'CA Conditional Progress Waiver (§8132)',
        ca_8134: 'CA Unconditional Progress Waiver (§8134)',
        ca_8136: 'CA Conditional Final Waiver (§8136)',
        ca_8138: 'CA Unconditional Final Waiver (§8138)',
        ca_8200: 'CA Preliminary Notice (§8200)',
        va_43_4: 'VA Notice to Owner (§43-4)',
      };
      const lines = docs.map(d => {
        const label = typeLabels[d.doc_type] || d.doc_type;
        const amt = d.amount ? '$' + Number(d.amount).toLocaleString() : 'N/A';
        return `• ${label}\n  Amount: ${amt} | Signed by: ${d.signatory_name || 'N/A'} | Date: ${d.signed_at?.slice(0, 10) || 'N/A'}`;
      });
      return { text: `**Lien Documents (${docs.length}):**\n\n${lines.join('\n\n')}` };
    }

    case 'get_contract_intel': {
      const { project_id } = args;
      const data = await api(`/api/projects/${project_id}/contract`);
      if (!data || !data.extracted) {
        return { text: 'No contract uploaded for this project yet. Upload a contract PDF at constructinv.varshyl.com to enable AI extraction.' };
      }
      const f = data.extracted;
      const typeLabels = {
        aia: 'AIA Standard Form',
        federal_dod: 'Federal — Department of Defense',
        federal_civilian: 'Federal — Civilian Agency',
        state: 'State/Municipal',
        subcontract: 'Subcontract',
      };
      return {
        text: [
          `**Contract Intelligence — Project ${project_id}**`,
          `Type: ${typeLabels[data.contract_type] || data.contract_type || 'Unknown'}`,
          `Contract Sum: ${f.contract_sum ? '$' + Number(f.contract_sum).toLocaleString() : 'Not extracted'}`,
          `Retainage: ${f.retainage_pct != null ? f.retainage_pct + '%' : 'Not extracted'}`,
          `Owner: ${f.owner || 'Not extracted'}`,
          `Contractor: ${f.contractor || 'Not extracted'}`,
          `Contract Date: ${f.contract_date || 'Not extracted'}`,
          f.contract_number ? `Contract #: ${f.contract_number}` : null,
          f.cage_code        ? `CAGE Code: ${f.cage_code}` : null,
          f.period_of_performance ? `Period of Performance: ${f.period_of_performance}` : null,
        ].filter(Boolean).join('\n'),
      };
    }

    case 'get_retainage_exposure': {
      const { project_id } = args;
      const projects = project_id
        ? [await api(`/api/projects/${project_id}`)]
        : await api('/api/projects');

      if (!Array.isArray(projects) || projects.length === 0) {
        return { text: 'No projects found.' };
      }

      let grandTotal = 0;
      const rows = [];

      for (const p of projects) {
        try {
          const data = await api(`/api/projects/${p.id}/pay-app`);
          const sov = data.sov_items || [];
          let ret = 0;
          sov.forEach(item => {
            const comp = (Number(item.work_previous) || 0) + (Number(item.work_this_period) || 0);
            const pct  = Number(item.retainage_pct) || (p.retainage_pct || 10);
            ret += comp * (pct / 100);
          });
          grandTotal += ret;
          if (ret > 0) {
            rows.push(`• **${p.project_name}**: $${ret.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} held`);
          }
        } catch {
          // skip projects with no pay app data
        }
      }

      if (rows.length === 0) {
        return { text: 'No retainage on file (no pay applications found).' };
      }

      return {
        text: [
          '**Retainage Exposure**',
          '',
          ...rows,
          '',
          `**Total Retainage Held: $${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}**`,
          '',
          '_Retainage is typically released at substantial completion per the contract terms._',
        ].join('\n'),
      };
    }

    case 'billing_health_check': {
      const projects = await api('/api/projects');
      if (!Array.isArray(projects) || projects.length === 0) {
        return { text: 'No projects found.' };
      }

      const warnings = [];
      const today = new Date();

      for (const p of projects) {
        const issues = [];
        try {
          const data = await api(`/api/projects/${p.id}/pay-app`);
          const sov = data.sov_items || [];

          // Check % complete
          let totalSV = 0, totalComp = 0;
          sov.forEach(item => {
            totalSV   += Number(item.scheduled_value)  || 0;
            totalComp += (Number(item.work_previous) || 0) + (Number(item.work_this_period) || 0);
          });
          const pct = totalSV > 0 ? totalComp / totalSV : 0;
          if (pct > 0.9 && pct < 1.0) {
            issues.push(`⚠️ ${(pct * 100).toFixed(0)}% billed — approaching contract completion`);
          }

          // Check for stale billing (no recent app)
          if (data.last_app_date) {
            const last = new Date(data.last_app_date);
            const daysSince = Math.floor((today - last) / (1000 * 60 * 60 * 24));
            if (daysSince > 45) {
              issues.push(`⚠️ No pay app submitted in ${daysSince} days`);
            }
          }
        } catch { /* no pay app yet */ }

        // Check for lien docs
        try {
          const docs = await api(`/api/projects/${p.id}/lien-docs`);
          if (!Array.isArray(docs) || docs.length === 0) {
            issues.push('⚠️ No lien waiver on file');
          }
        } catch { /* ignore */ }

        if (issues.length > 0) {
          warnings.push(`**${p.project_name}** (ID: ${p.id})\n${issues.map(i => '  ' + i).join('\n')}`);
        }
      }

      if (warnings.length === 0) {
        return { text: `✅ All ${projects.length} project(s) look healthy — no billing issues detected.` };
      }

      return {
        text: [
          `**Billing Health Check — ${warnings.length} project(s) need attention:**`,
          '',
          ...warnings,
          '',
          `_${projects.length - warnings.length} of ${projects.length} projects are healthy._`,
        ].join('\n'),
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP JSON-RPC 2.0 protocol (stdio transport) ─────────────────────────────
const SERVER_INFO = {
  name: 'construction-ai-billing',
  version: '1.0.0',
};

const CAPABILITIES = {
  tools: {},
};

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message, data) {
  send({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });
}

async function handleMessage(msg) {
  let parsed;
  try {
    parsed = JSON.parse(msg);
  } catch {
    sendError(null, -32700, 'Parse error');
    return;
  }

  const { id, method, params } = parsed;

  try {
    switch (method) {
      case 'initialize':
        sendResult(id, {
          protocolVersion: '2024-11-05',
          serverInfo: SERVER_INFO,
          capabilities: CAPABILITIES,
        });
        break;

      case 'notifications/initialized':
        // Notification — no response needed
        break;

      case 'tools/list':
        sendResult(id, { tools: TOOLS });
        break;

      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs  = params?.arguments || {};
        if (!toolName) {
          sendError(id, -32602, 'Missing tool name');
          return;
        }
        const tool = TOOLS.find(t => t.name === toolName);
        if (!tool) {
          sendError(id, -32602, `Tool not found: ${toolName}`);
          return;
        }
        try {
          const result = await handleTool(toolName, toolArgs);
          sendResult(id, {
            content: [
              { type: 'text', text: result.text },
            ],
          });
        } catch (err) {
          sendResult(id, {
            content: [
              { type: 'text', text: `Error: ${err.message}` },
            ],
            isError: true,
          });
        }
        break;
      }

      case 'ping':
        sendResult(id, {});
        break;

      default:
        sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    sendError(id, -32603, 'Internal error', err.message);
  }
}

// ─── Main: read line-by-line from stdin ──────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', line => {
  if (line.trim()) handleMessage(line.trim());
});

rl.on('close', () => {
  process.exit(0);
});

process.stderr.write(`[CAI-MCP] Construction AI Billing MCP server started. Base URL: ${BASE_URL}\n`);
