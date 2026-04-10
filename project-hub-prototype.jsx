import { useState } from "react";

// ─── BRAND COLORS ───────────────────────────────────────────────────────────
const C = {
  orange: "#E8622A",
  orangeHover: "#D45220",
  navy: "#1A2230",
  navyLight: "#243044",
  bg: "#f4f5f8",
  card: "#ffffff",
  border: "#e2e5ec",
  borderLight: "#eef0f5",
  text: "#1A2230",
  textSub: "#5a6370",
  textMuted: "#9aa1ad",
  success: "#059669",
  successBg: "#ecfdf5",
  warning: "#d97706",
  warningBg: "#fffbeb",
  danger: "#dc2626",
  dangerBg: "#fef2f2",
  info: "#0891b2",
  infoBg: "#f0f9ff",
  purple: "#7c3aed",
  purpleBg: "#f5f3ff",
};

// ─── MOCK DATA ───────────────────────────────────────────────────────────────
const TRADES = [
  { id: 1, name: "Plumbing", sub: "Pacific Coast Plumbing", email: "mike@pacificplumbing.com", alias: "plumbing-123elm@hub.constructinv.com", status: "active", docs: 8, pending: 2, overdue: 1 },
  { id: 2, name: "Electrical", sub: "Bright Spark Electric", email: "office@brightspark.com", alias: "electrical-123elm@hub.constructinv.com", status: "active", docs: 5, pending: 1, overdue: 0 },
  { id: 3, name: "HVAC", sub: "AirPro Systems", email: "admin@airpro.com", alias: "hvac-123elm@hub.constructinv.com", status: "active", docs: 3, pending: 0, overdue: 0 },
  { id: 4, name: "Framing", sub: "SoCal Framing LLC", email: "jobs@socalframing.com", alias: "framing-123elm@hub.constructinv.com", status: "active", docs: 12, pending: 0, overdue: 0 },
  { id: 5, name: "Drywall", sub: "(Invite pending)", email: null, alias: "drywall-123elm@hub.constructinv.com", status: "invited", docs: 0, pending: 0, overdue: 0 },
];

const DOCS = [
  { id: 1, tradeId: 1, tradeName: "Plumbing", type: "invoice", filename: "Invoice_#2340_Rough-In.pdf", amount: "$18,400", status: "pending", stale: true, staleDays: 3, uploadedBy: "Pacific Coast Plumbing", uploadedAt: "Apr 3, 2026", source: "email", sovLine: "Plumbing", sovBudget: 42000, sovUsed: 31200, notes: "Rough-in complete. Final invoice after trim-out." },
  { id: 2, tradeId: 1, tradeName: "Plumbing", type: "lien_waiver", filename: "ConditionalWaiver_Plumbing_PA1.pdf", amount: "$12,800", status: "approved", stale: false, staleDays: 0, uploadedBy: "Pacific Coast Plumbing", uploadedAt: "Mar 28, 2026", source: "magic_link", sovLine: "Plumbing", sovBudget: 42000, sovUsed: 31200, notes: "" },
  { id: 3, tradeId: 1, tradeName: "Plumbing", type: "rfi", filename: "RFI-007_WaterHeater_Location.pdf", amount: null, status: "pending", stale: false, staleDays: 1, uploadedBy: "Pacific Coast Plumbing", uploadedAt: "Apr 4, 2026", source: "magic_link", sovLine: null, sovBudget: null, sovUsed: null, notes: "Need clarification on water heater placement per updated drawing A-103." },
  { id: 4, tradeId: 2, tradeName: "Electrical", type: "invoice", filename: "Invoice_Electrical_Rough.pdf", amount: "$22,150", status: "pending", stale: false, staleDays: 1, uploadedBy: "Bright Spark Electric", uploadedAt: "Apr 4, 2026", source: "web_app", sovLine: "Electrical", sovBudget: 55000, sovUsed: 22150, notes: "" },
  { id: 5, tradeId: 2, tradeName: "Electrical", type: "photo", filename: "Panel_Inspection_Photos.zip", amount: null, status: "approved", stale: false, staleDays: 0, uploadedBy: "Bright Spark Electric", uploadedAt: "Apr 2, 2026", source: "web_app", sovLine: null, sovBudget: null, sovUsed: null, notes: "Pre-inspection photos per inspector request." },
  { id: 6, tradeId: 3, tradeName: "HVAC", type: "submittal", filename: "AirHandler_Submittal_Trane.pdf", amount: null, status: "approved", stale: false, staleDays: 0, uploadedBy: "AirPro Systems", uploadedAt: "Mar 25, 2026", source: "email", sovLine: null, sovBudget: null, sovUsed: null, notes: "" },
  { id: 7, tradeId: 4, tradeName: "Framing", type: "daily_report", filename: "DailyReport_Apr4.pdf", amount: null, status: "approved", stale: false, staleDays: 0, uploadedBy: "SoCal Framing LLC", uploadedAt: "Apr 4, 2026", source: "magic_link", sovLine: null, sovBudget: null, sovUsed: null, notes: "" },
  { id: 8, tradeId: 1, tradeName: "Plumbing", type: "change_order", filename: "CO-003_AddSump_Pump.pdf", amount: "$2,800", status: "pending", stale: true, staleDays: 5, uploadedBy: "Pacific Coast Plumbing", uploadedAt: "Mar 30, 2026", source: "email", sovLine: null, sovBudget: null, sovUsed: null, notes: "Owner requested sump pump addition per site conditions." },
];

const NOTIFICATIONS = [
  { id: 1, type: "stale_warning", msg: "Invoice from Plumbing hasn't been reviewed in 3 days", time: "2h ago", read: false },
  { id: 2, type: "upload", msg: "Bright Spark Electric uploaded Invoice_Electrical_Rough.pdf", time: "4h ago", read: false },
  { id: 3, type: "stale_escalation", msg: "URGENT: Change Order CO-003 from Plumbing is 5 days old", time: "1d ago", read: false },
  { id: 4, type: "approval", msg: "You approved Panel_Inspection_Photos.zip from Electrical", time: "2d ago", read: true },
  { id: 5, type: "rfi_reply", msg: "New RFI reply from Pacific Coast Plumbing on RFI-007", time: "3d ago", read: true },
];

const DOC_TYPE_META = {
  invoice: { label: "Invoice", color: C.purple, bg: C.purpleBg, icon: "💰" },
  lien_waiver: { label: "Lien Waiver", color: C.success, bg: C.successBg, icon: "📋" },
  rfi: { label: "RFI", color: C.warning, bg: C.warningBg, icon: "❓" },
  photo: { label: "Photo", color: C.info, bg: C.infoBg, icon: "📷" },
  submittal: { label: "Submittal", color: "#7c3aed", bg: "#f5f3ff", icon: "📁" },
  daily_report: { label: "Daily Report", color: "#0891b2", bg: "#f0f9ff", icon: "📅" },
  change_order: { label: "Change Order", color: C.orange, bg: "#fff7f5", icon: "🔄" },
  compliance: { label: "Compliance", color: C.success, bg: C.successBg, icon: "✅" },
  drawing: { label: "Drawing", color: C.navy, bg: "#f0f2f8", icon: "📐" },
  other: { label: "Other", color: C.textSub, bg: "#f5f5f5", icon: "📎" },
};

// ─── SHARED COMPONENTS ───────────────────────────────────────────────────────

const Badge = ({ type, size = "sm" }) => {
  const m = DOC_TYPE_META[type] || DOC_TYPE_META.other;
  const pad = size === "sm" ? "3px 9px" : "5px 12px";
  const fs = size === "sm" ? "11px" : "12px";
  return (
    <span style={{ background: m.bg, color: m.color, border: `1px solid ${m.color}30`, borderRadius: 99, padding: pad, fontSize: fs, fontWeight: 600, whiteSpace: "nowrap" }}>
      {m.icon} {m.label}
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const cfg = {
    pending: { bg: C.warningBg, color: C.warning, label: "Pending Review" },
    approved: { bg: C.successBg, color: C.success, label: "Approved" },
    rejected: { bg: C.dangerBg, color: C.danger, label: "Rejected" },
    active: { bg: C.successBg, color: C.success, label: "Active" },
    invited: { bg: C.infoBg, color: C.info, label: "Invited" },
  }[status] || { bg: "#f5f5f5", color: C.textMuted, label: status };
  return (
    <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30`, borderRadius: 99, padding: "3px 9px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  );
};

const SourceBadge = ({ source }) => {
  const cfg = { web_app: { label: "Web Upload", icon: "🌐" }, magic_link: { label: "Magic Link", icon: "🔗" }, email_ingest: { label: "Email", icon: "📧" } }[source] || { label: source, icon: "📎" };
  return <span style={{ fontSize: 11, color: C.textMuted, background: "#f5f6f8", borderRadius: 6, padding: "2px 7px" }}>{cfg.icon} {cfg.label}</span>;
};

const Card = ({ children, style = {}, onClick }) => (
  <div onClick={onClick} style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "20px 24px", boxShadow: "0 2px 12px rgba(26,34,48,0.06)", transition: "all 0.15s ease", cursor: onClick ? "pointer" : "default", ...style }}
    onMouseEnter={onClick ? e => { e.currentTarget.style.boxShadow = "0 6px 24px rgba(26,34,48,0.12)"; e.currentTarget.style.transform = "translateY(-1px)"; } : undefined}
    onMouseLeave={onClick ? e => { e.currentTarget.style.boxShadow = "0 2px 12px rgba(26,34,48,0.06)"; e.currentTarget.style.transform = "translateY(0)"; } : undefined}>
    {children}
  </div>
);

const Btn = ({ children, variant = "primary", onClick, size = "md", disabled = false }) => {
  const styles = {
    primary: { bg: C.orange, color: "#fff", border: "none" },
    secondary: { bg: "transparent", color: C.navy, border: `1.5px solid ${C.border}` },
    ghost: { bg: "transparent", color: C.textSub, border: "none" },
    danger: { bg: C.dangerBg, color: C.danger, border: `1px solid ${C.danger}30` },
    success: { bg: C.successBg, color: C.success, border: `1px solid ${C.success}30` },
  }[variant];
  const pad = { sm: "5px 12px", md: "8px 18px", lg: "11px 24px" }[size];
  const fs = { sm: 12, md: 13, lg: 14 }[size];
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: styles.bg, color: styles.color, border: styles.border, borderRadius: 8, padding: pad, fontSize: fs, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, transition: "all 0.15s ease", display: "inline-flex", alignItems: "center", gap: 6 }}>
      {children}
    </button>
  );
};

const Divider = () => <div style={{ height: 1, background: C.borderLight, margin: "16px 0" }} />;

// ─── SCREEN: SIDEBAR NAV ─────────────────────────────────────────────────────
const Sidebar = ({ screen, setScreen, notifCount }) => {
  const navItems = [
    { id: "project_overview", icon: "🏗️", label: "Project Overview" },
    { id: "hub_inbox", icon: "📥", label: "Project Hub", badge: notifCount },
    { id: "hub_trades", icon: "🔧", label: "Trades", sub: true },
    { id: "hub_team", icon: "👥", label: "Team Roles", sub: true },
    { id: "ai_cashflow", icon: "🧠", label: "AI Cash Flow" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];
  return (
    <div style={{ width: 220, minHeight: "100vh", background: C.navy, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      {/* Logo */}
      <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.orange, letterSpacing: 0.5 }}>CONSTRUCTINVOICE AI</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>Project: 123 Elm St</div>
      </div>
      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 10px" }}>
        {navItems.map(item => {
          const active = screen === item.id;
          return (
            <div key={item.id} onClick={() => setScreen(item.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: item.sub ? "7px 12px 7px 28px" : "9px 12px", borderRadius: 8, cursor: "pointer", marginBottom: 2, background: active ? "rgba(232,98,42,0.15)" : "transparent", borderLeft: active ? `3px solid ${C.orange}` : "3px solid transparent", transition: "all 0.15s ease" }}>
              <span style={{ fontSize: item.sub ? 13 : 15 }}>{item.icon}</span>
              <span style={{ fontSize: item.sub ? 12 : 13, fontWeight: active ? 600 : 400, color: active ? "#fff" : "rgba(255,255,255,0.6)", flex: 1 }}>{item.label}</span>
              {item.badge > 0 && <span style={{ background: C.orange, color: "#fff", borderRadius: 99, fontSize: 10, fontWeight: 700, padding: "1px 6px" }}>{item.badge}</span>}
            </div>
          );
        })}
      </nav>
      {/* Sub view shortcut */}
      <div style={{ padding: "12px 10px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div onClick={() => setScreen("sub_magic_link")} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, cursor: "pointer", background: "rgba(255,255,255,0.05)" }}>
          <span style={{ fontSize: 14 }}>🔗</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Preview: Sub View</span>
        </div>
      </div>
    </div>
  );
};

// ─── SCREEN 1: PROJECT OVERVIEW ──────────────────────────────────────────────
const ProjectOverview = ({ setScreen }) => (
  <div style={{ padding: "28px 32px", flex: 1, overflowY: "auto" }}>
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>123 Elm Street Addition</div>
      <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>ABC General Contractors · $284,000 contract · 62% complete</div>
    </div>
    {/* Tab row */}
    <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: `2px solid ${C.border}` }}>
      {["Pay Applications", "Schedule of Values", "Project Hub ✦ NEW", "Reconciliation", "Reports"].map((t, i) => (
        <div key={t} onClick={() => i === 2 && setScreen("hub_inbox")}
          style={{ padding: "10px 18px", fontSize: 13, fontWeight: i === 2 ? 700 : 500, color: i === 2 ? C.orange : C.textSub, borderBottom: i === 2 ? `2px solid ${C.orange}` : "2px solid transparent", cursor: "pointer", marginBottom: -2, whiteSpace: "nowrap", transition: "color 0.15s" }}>
          {t}
        </div>
      ))}
    </div>
    {/* KPI row */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
      {[
        { label: "Contract Value", value: "$284,000", sub: "Original SOV total", color: C.navy },
        { label: "Total Billed", value: "$176,080", sub: "62% of contract", color: C.orange },
        { label: "Retainage Held", value: "$17,608", sub: "10% standard", color: C.warning },
        { label: "Balance to Finish", value: "$107,920", sub: "Remaining SOV", color: C.success },
      ].map(k => (
        <Card key={k.label}>
          <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>{k.label}</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: k.color }}>{k.value}</div>
          <div style={{ fontSize: 11, color: C.textSub, marginTop: 4 }}>{k.sub}</div>
        </Card>
      ))}
    </div>
    {/* Hub Callout */}
    <Card style={{ background: "linear-gradient(135deg, #fff7f5 0%, #fff3f0 100%)", border: `1.5px solid ${C.orange}30`, marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 32 }}>📥</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Project Hub — 3 items need your attention</div>
            <div style={{ fontSize: 13, color: C.textSub, marginTop: 3 }}>2 invoices pending review · 1 change order stale 5 days · 1 RFI awaiting reply</div>
          </div>
        </div>
        <Btn onClick={() => setScreen("hub_inbox")}>Open Hub →</Btn>
      </div>
    </Card>
    {/* Recent Pay Apps */}
    <Card>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>Recent Pay Applications</div>
      {[{ num: "#3", period: "Mar 2026", amount: "$28,400", status: "Paid", paid: true }, { num: "#4", period: "Apr 2026", amount: "$32,150", status: "Submitted", paid: false }].map(p => (
        <div key={p.num} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${C.borderLight}` }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Pay App {p.num}</div>
          <div style={{ fontSize: 12, color: C.textSub }}>{p.period}</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{p.amount}</div>
          <StatusBadge status={p.paid ? "approved" : "pending"} />
        </div>
      ))}
    </Card>
  </div>
);

// ─── SCREEN 2: HUB UNIFIED INBOX ─────────────────────────────────────────────
const HubInbox = ({ setScreen, setSelectedDoc }) => {
  const [filter, setFilter] = useState("all");
  const [tradeFilter, setTradeFilter] = useState("all");
  const filters = ["all", "pending", "approved", "rejected"];
  const filtered = DOCS.filter(d => (filter === "all" || d.status === filter) && (tradeFilter === "all" || d.tradeId === parseInt(tradeFilter)));

  return (
    <div style={{ padding: "28px 32px", flex: 1, overflowY: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>📥 Project Hub</div>
          <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>123 Elm Street Addition · All incoming documents from trades</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="secondary" onClick={() => setScreen("hub_trades")}>Manage Trades</Btn>
          <Btn onClick={() => setScreen("hub_add_trade")}>+ Add Trade</Btn>
        </div>
      </div>

      {/* Alert Cards */}
      {DOCS.filter(d => d.stale).map(d => (
        <div key={d.id} style={{ background: d.staleDays >= 5 ? C.dangerBg : C.warningBg, border: `1.5px solid ${d.staleDays >= 5 ? C.danger : C.warning}40`, borderRadius: 12, padding: "14px 20px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>{d.staleDays >= 5 ? "🚨" : "⚠️"}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: d.staleDays >= 5 ? C.danger : C.warning }}>
                {d.staleDays >= 5 ? "URGENT" : "Needs Review"} — {d.tradeName}: {d.filename}
              </div>
              <div style={{ fontSize: 12, color: C.textSub }}>Uploaded {d.uploadedAt} · Waiting {d.staleDays} day{d.staleDays !== 1 ? "s" : ""}</div>
            </div>
          </div>
          <Btn size="sm" onClick={() => { setSelectedDoc(d); setScreen("hub_doc_detail"); }}>Review Now →</Btn>
        </div>
      ))}

      {/* Filter Row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, background: "#f0f2f8", borderRadius: 8, padding: 3 }}>
          {filters.map(f => (
            <div key={f} onClick={() => setFilter(f)}
              style={{ padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", background: filter === f ? C.navy : "transparent", color: filter === f ? "#fff" : C.textSub, textTransform: "capitalize", transition: "all 0.15s" }}>
              {f} {f === "all" ? `(${DOCS.length})` : `(${DOCS.filter(d => d.status === f).length})`}
            </div>
          ))}
        </div>
        <select value={tradeFilter} onChange={e => setTradeFilter(e.target.value)}
          style={{ border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", fontSize: 12, color: C.text, background: C.card, outline: "none" }}>
          <option value="all">All Trades</option>
          {TRADES.filter(t => t.status === "active").map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {/* Document Table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8f9fb" }}>
              {["Trade", "Document", "Type", "Amount", "Source", "Status", "Uploaded", ""].map(h => (
                <th key={h} style={{ padding: "12px 16px", fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, textAlign: "left", borderBottom: `1.5px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((doc, i) => (
              <tr key={doc.id} style={{ borderBottom: `1px solid ${C.borderLight}`, background: i % 2 === 0 ? "#fff" : "#fafbfc", cursor: "pointer" }}
                onClick={() => { setSelectedDoc(doc); setScreen("hub_doc_detail"); }}
                onMouseEnter={e => e.currentTarget.style.background = "#f0f2ff"}
                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafbfc"}>
                <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 600, color: C.text }}>{doc.tradeName}</td>
                <td style={{ padding: "13px 16px", fontSize: 12, color: C.text, maxWidth: 200 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {doc.stale && <span title={`Stale ${doc.staleDays}d`} style={{ fontSize: 14 }}>{doc.staleDays >= 5 ? "🚨" : "⏰"}</span>}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.filename}</span>
                  </div>
                </td>
                <td style={{ padding: "13px 16px" }}><Badge type={doc.type} /></td>
                <td style={{ padding: "13px 16px", fontSize: 13, fontWeight: 600, color: C.text }}>{doc.amount || "—"}</td>
                <td style={{ padding: "13px 16px" }}><SourceBadge source={doc.source} /></td>
                <td style={{ padding: "13px 16px" }}><StatusBadge status={doc.status} /></td>
                <td style={{ padding: "13px 16px", fontSize: 12, color: C.textSub, whiteSpace: "nowrap" }}>{doc.uploadedAt}</td>
                <td style={{ padding: "13px 16px" }}><Btn size="sm" variant="ghost">{doc.status === "pending" ? "Review →" : "View →"}</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

// ─── SCREEN 3: DOCUMENT DETAIL ────────────────────────────────────────────────
const DocDetail = ({ doc, setScreen }) => {
  const [status, setStatus] = useState(doc?.status || "pending");
  const [comment, setComment] = useState("");
  const [rfiReply, setRfiReply] = useState("");
  const [comments, setComments] = useState([
    { author: "You", time: "2d ago", text: "Please confirm the scope matches SOV line 4.", type: "comment" }
  ]);
  if (!doc) return null;

  const approve = () => { setStatus("approved"); setComments(c => [...c, { author: "You", time: "Just now", text: "✅ Approved", type: "approval" }]); };
  const reject = () => { setStatus("rejected"); setComments(c => [...c, { author: "You", time: "Just now", text: "❌ Rejected — please revise and resubmit.", type: "rejection" }]); };
  const sendComment = () => { if (!comment.trim()) return; setComments(c => [...c, { author: "You", time: "Just now", text: comment, type: "comment" }]); setComment(""); };
  const sendRfi = () => { if (!rfiReply.trim()) return; setComments(c => [...c, { author: "You", time: "Just now", text: `RFI Reply: ${rfiReply}`, type: "rfi_reply" }]); setRfiReply(""); };

  return (
    <div style={{ padding: "28px 32px", flex: 1, overflowY: "auto" }}>
      {/* Back */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, cursor: "pointer", color: C.textSub, fontSize: 13 }} onClick={() => setScreen("hub_inbox")}>
        ← Back to Inbox
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
        {/* Left: Document info */}
        <div>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <Badge type={doc.type} size="md" />
                  <StatusBadge status={status} />
                  <SourceBadge source={doc.source} />
                  {doc.stale && <span style={{ background: doc.staleDays >= 5 ? C.dangerBg : C.warningBg, color: doc.staleDays >= 5 ? C.danger : C.warning, borderRadius: 99, padding: "3px 9px", fontSize: 11, fontWeight: 700 }}>⚠️ Stale {doc.staleDays}d</span>}
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>{doc.filename}</div>
                <div style={{ fontSize: 13, color: C.textSub }}>From {doc.uploadedBy} · {doc.tradeName} · Uploaded {doc.uploadedAt}</div>
              </div>
              {doc.amount && <div style={{ fontSize: 22, fontWeight: 800, color: C.orange }}>{doc.amount}</div>}
            </div>
            {doc.notes && <div style={{ background: "#f8f9fb", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: C.text, borderLeft: `3px solid ${C.orange}` }}>{doc.notes}</div>}

            {/* SOV Check */}
            {doc.sovLine && (
              <>
                <Divider />
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>🧠 AI SOV Budget Check</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span style={{ color: C.textSub }}>{doc.sovLine} SOV Budget</span>
                      <span style={{ fontWeight: 700 }}>${(doc.sovUsed + parseInt(doc.amount?.replace(/\D/g, "") || 0)).toLocaleString()} / ${doc.sovBudget?.toLocaleString()}</span>
                    </div>
                    <div style={{ height: 8, background: "#e8eaf0", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", background: doc.sovUsed / doc.sovBudget > 0.85 ? C.danger : C.orange, width: `${Math.min(100, (doc.sovUsed / doc.sovBudget) * 100)}%`, borderRadius: 99 }} />
                    </div>
                    <div style={{ fontSize: 11, color: C.textSub, marginTop: 4 }}>Currently ${doc.sovUsed?.toLocaleString()} billed against ${doc.sovBudget?.toLocaleString()} budget</div>
                  </div>
                  {doc.sovUsed / doc.sovBudget > 0.8 && (
                    <span style={{ background: C.warningBg, color: C.warning, borderRadius: 8, padding: "6px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>⚠️ Near Budget</span>
                  )}
                </div>
              </>
            )}

            {/* PDF preview placeholder */}
            <Divider />
            <div style={{ background: "#f8f9fb", border: `1.5px dashed ${C.border}`, borderRadius: 10, height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ fontSize: 36 }}>📄</span>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.textSub }}>{doc.filename}</div>
              <Btn size="sm" variant="secondary">⬇ Download File</Btn>
            </div>
          </Card>

          {/* RFI reply — only for RFI type */}
          {doc.type === "rfi" && (
            <Card style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>💬 Reply to RFI</div>
              <div style={{ fontSize: 13, color: C.textSub, marginBottom: 12 }}>{doc.notes}</div>
              <textarea value={rfiReply} onChange={e => setRfiReply(e.target.value)} placeholder="Type your reply here..."
                style={{ width: "100%", minHeight: 80, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: 12, fontSize: 13, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <Btn onClick={sendRfi}>📤 Send RFI Reply</Btn>
                <Btn variant="secondary" size="md">📎 Attach File</Btn>
              </div>
            </Card>
          )}

          {/* Comments/Activity */}
          <Card>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Activity & Comments</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {comments.map((c, i) => (
                <div key={i} style={{ background: c.type === "approval" ? C.successBg : c.type === "rejection" ? C.dangerBg : c.type === "rfi_reply" ? C.warningBg : "#f8f9fb", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{c.author}</span>
                    <span style={{ fontSize: 11, color: C.textMuted }}>· {c.time}</span>
                  </div>
                  <div style={{ fontSize: 13, color: C.text }}>{c.text}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment..."
                style={{ flex: 1, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" }}
                onKeyDown={e => e.key === "Enter" && sendComment()} />
              <Btn onClick={sendComment}>Send</Btn>
            </div>
          </Card>
        </div>

        {/* Right: Action Panel */}
        <div>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>Review Actions</div>
            {status === "pending" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button onClick={approve} style={{ width: "100%", padding: "13px", background: C.success, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  ✅ Approve Document
                </button>
                <button onClick={reject} style={{ width: "100%", padding: "13px", background: C.dangerBg, color: C.danger, border: `1.5px solid ${C.danger}40`, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  ❌ Reject & Request Revision
                </button>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <StatusBadge status={status} />
                <div style={{ fontSize: 12, color: C.textSub, marginTop: 8 }}>Reviewed just now</div>
              </div>
            )}
          </Card>

          <Card style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Document Details</div>
            {[
              { label: "Trade", value: doc.tradeName },
              { label: "Subcontractor", value: doc.uploadedBy },
              { label: "Uploaded Via", value: doc.source === "magic_link" ? "Magic Link" : doc.source === "email" ? "Email Ingest" : "Web Upload" },
              { label: "Upload Date", value: doc.uploadedAt },
              ...(doc.amount ? [{ label: "Invoice Amount", value: doc.amount }] : []),
            ].map(r => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.borderLight}`, fontSize: 12 }}>
                <span style={{ color: C.textSub }}>{r.label}</span>
                <span style={{ fontWeight: 600, color: C.text }}>{r.value}</span>
              </div>
            ))}
          </Card>

          <Card>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Notifications Sent</div>
            {[
              { icon: "📧", text: "Email sent to you on upload", time: doc.uploadedAt },
              ...(doc.stale ? [{ icon: "⚠️", text: `Stale alert after ${doc.staleDays} days`, time: "Automated" }] : []),
            ].map((n, i) => (
              <div key={i} style={{ display: "flex", gap: 8, padding: "7px 0", borderBottom: `1px solid ${C.borderLight}`, fontSize: 12 }}>
                <span>{n.icon}</span>
                <div style={{ flex: 1 }}><div style={{ color: C.text }}>{n.text}</div><div style={{ color: C.textMuted, fontSize: 11 }}>{n.time}</div></div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
};

// ─── SCREEN 4: TRADES MANAGEMENT ──────────────────────────────────────────────
const TradesView = ({ setScreen }) => (
  <div style={{ padding: "28px 32px", flex: 1, overflowY: "auto" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>🔧 Trades</div>
        <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>123 Elm Street Addition · Manage subs and their upload access</div>
      </div>
      <Btn onClick={() => setScreen("hub_add_trade")}>+ Add Trade</Btn>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
      {TRADES.map(t => (
        <Card key={t.id} style={{ borderLeft: t.status === "invited" ? `3px solid ${C.info}` : `3px solid ${C.orange}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{t.name}</div>
              <div style={{ fontSize: 12, color: C.textSub, marginTop: 2 }}>{t.sub}</div>
            </div>
            <StatusBadge status={t.status} />
          </div>
          {/* Stats row */}
          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{t.docs}</div>
              <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase" }}>Total Docs</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: t.pending > 0 ? C.warning : C.success }}>{t.pending}</div>
              <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase" }}>Pending</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: t.overdue > 0 ? C.danger : C.textMuted }}>{t.overdue}</div>
              <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase" }}>Overdue</div>
            </div>
          </div>
          <Divider />
          {/* Email alias */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Email Alias</div>
            <div style={{ background: "#f5f6f9", borderRadius: 7, padding: "7px 10px", fontSize: 11, fontFamily: "monospace", color: C.navy, wordBreak: "break-all" }}>{t.alias}</div>
          </div>
          {/* Actions */}
          <div style={{ display: "flex", gap: 8 }}>
            {t.status === "invited" ? (
              <Btn size="sm" variant="secondary">Resend Invite</Btn>
            ) : (
              <>
                <Btn size="sm" variant="secondary">Copy Link</Btn>
                <Btn size="sm" variant="secondary">View Docs</Btn>
                <Btn size="sm" variant="ghost">· · ·</Btn>
              </>
            )}
          </div>
        </Card>
      ))}
    </div>
  </div>
);

// ─── SCREEN 5: ADD TRADE MODAL ────────────────────────────────────────────────
const AddTrade = ({ setScreen }) => {
  const [tradeName, setTradeName] = useState("");
  const [subName, setSubName] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const alias = tradeName ? `${tradeName.toLowerCase().replace(/\s+/g, "-")}-123elm@hub.constructinv.com` : "";

  if (sent) return (
    <div style={{ padding: "28px 32px", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 8 }}>Invite Sent!</div>
        <div style={{ fontSize: 14, color: C.textSub, marginBottom: 24, lineHeight: 1.6 }}>
          <strong>{subName || "The sub"}</strong> will receive a magic link to upload documents directly.<br />
          Their email alias <span style={{ fontFamily: "monospace", background: "#f0f2f8", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>{alias}</span> is now active.
        </div>
        <Btn size="lg" onClick={() => setScreen("hub_trades")}>View All Trades →</Btn>
      </div>
    </div>
  );

  return (
    <div style={{ padding: "28px 32px", flex: 1, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, cursor: "pointer", color: C.textSub, fontSize: 13 }} onClick={() => setScreen("hub_trades")}>
        ← Back to Trades
      </div>
      <div style={{ maxWidth: 560 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 6 }}>Add a Trade</div>
        <div style={{ fontSize: 13, color: C.textSub, marginBottom: 28 }}>Add a trade to Project Hub. The sub gets a magic link — no account needed.</div>

        <Card>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {[
              { label: "Trade / Scope Name", key: "trade", value: tradeName, set: setTradeName, placeholder: "e.g. Plumbing, Electrical, HVAC, Framing..." },
              { label: "Subcontractor Company", key: "sub", value: subName, set: setSubName, placeholder: "e.g. Pacific Coast Plumbing LLC" },
              { label: "Sub Contact Email", key: "email", value: email, set: setEmail, placeholder: "office@plumbingco.com" },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 6 }}>{f.label}</label>
                <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                  style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 9, padding: "10px 14px", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
              </div>
            ))}

            {/* Auto-generated alias preview */}
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 6 }}>Email Alias (Auto-Generated)</label>
              <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 9, padding: "10px 14px", fontSize: 12, fontFamily: "monospace", color: alias ? C.navy : C.textMuted, background: "#f8f9fb" }}>
                {alias || "Trade name will generate an alias automatically..."}
              </div>
              <div style={{ fontSize: 11, color: C.textSub, marginTop: 6 }}>📬 Sub can email docs directly to this address. Attachments auto-routed to this trade's Hub.</div>
            </div>

            <Divider />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setSent(true)} disabled={!tradeName || !email}
                style={{ flex: 1, padding: "12px", background: tradeName && email ? C.orange : "#e0e0e0", color: tradeName && email ? "#fff" : "#aaa", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: tradeName && email ? "pointer" : "not-allowed" }}>
                📤 Send Magic Link Invite
              </button>
              <Btn variant="secondary" onClick={() => setScreen("hub_trades")}>Cancel</Btn>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── SCREEN 6: TEAM ROLES ─────────────────────────────────────────────────────
const TeamRoles = () => {
  const roles = [
    { id: "office", icon: "🧾", title: "Office / Accountant", desc: "Receives invoices, lien waivers, compliance documents", docTypes: ["invoice", "lien_waiver", "compliance"], members: [{ name: "Sarah Johnson", email: "sarah@abcgc.com", isYou: true }] },
    { id: "pm", icon: "📋", title: "PM / PMCM", desc: "Receives RFIs, submittals, change orders, drawings", docTypes: ["rfi", "submittal", "change_order", "drawing"], members: [{ name: "Marcus Torres", email: "marcus@abcgc.com", isYou: false }] },
    { id: "super", icon: "🦺", title: "Superintendent", desc: "Receives daily reports, photos, safety docs, punch lists", docTypes: ["daily_report", "photo", "other"], members: [] },
  ];

  return (
    <div style={{ padding: "28px 32px", flex: 1, overflowY: "auto" }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>👥 Team Roles</div>
        <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>3 fixed roles per project. Document type determines who gets notified automatically.</div>
      </div>

      <div style={{ background: C.infoBg, border: `1px solid ${C.info}30`, borderRadius: 12, padding: "12px 18px", marginBottom: 24, fontSize: 13, color: C.info }}>
        💡 When a sub uploads a document, it's automatically routed to the right role based on the document type. No manual sorting needed.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {roles.map(role => (
          <Card key={role.id}>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ fontSize: 32 }}>{role.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 3 }}>{role.title}</div>
                <div style={{ fontSize: 13, color: C.textSub, marginBottom: 12 }}>{role.desc}</div>
                {/* Doc types */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                  {role.docTypes.map(dt => <Badge key={dt} type={dt} size="sm" />)}
                </div>
                <Divider />
                {/* Team members */}
                <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Assigned Members</div>
                {role.members.length === 0 ? (
                  <div style={{ color: C.textMuted, fontSize: 13, fontStyle: "italic" }}>No one assigned yet — notifications will go to the account owner.</div>
                ) : (
                  role.members.map(m => (
                    <div key={m.email} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${C.orange}, ${C.navy})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>{m.name[0]}</div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{m.name} {m.isYou && <span style={{ fontSize: 10, background: C.orange, color: "#fff", borderRadius: 4, padding: "1px 5px" }}>You</span>}</div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>{m.email}</div>
                        </div>
                      </div>
                      <Btn size="sm" variant="ghost">Remove</Btn>
                    </div>
                  ))
                )}
                <div style={{ marginTop: 12 }}>
                  <Btn size="sm" variant="secondary">+ Add Team Member</Btn>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ─── SCREEN 7: AI CASH FLOW ───────────────────────────────────────────────────
const AICashFlow = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const tabs = ["overview", "collections", "forecast"];
  return (
    <div style={{ padding: "28px 32px", flex: 1, overflowY: "auto" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>🧠 AI Cash Flow Intelligence</div>
        <div style={{ fontSize: 13, color: C.textSub, marginTop: 4 }}>AI tracks your money in real-time and keeps you cash-flow positive</div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, background: "#f0f2f8", borderRadius: 10, padding: 4, marginBottom: 24, width: "fit-content" }}>
        {tabs.map(t => (
          <div key={t} onClick={() => setActiveTab(t)} style={{ padding: "7px 20px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", background: activeTab === t ? C.navy : "transparent", color: activeTab === t ? "#fff" : C.textSub, textTransform: "capitalize", transition: "all 0.15s" }}>
            {t}
          </div>
        ))}
      </div>

      {activeTab === "overview" && (
        <>
          {/* Cash position */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
            {[
              { label: "Outstanding (Owed to You)", value: "$32,150", sub: "Pay App #4 — Submitted Apr 1", color: C.orange, icon: "📤" },
              { label: "Overdue (30+ Days)", value: "$0", sub: "All collections on track", color: C.success, icon: "✅" },
              { label: "Upcoming (Next 30 Days)", value: "$28,900", sub: "Est. based on active pay apps", color: C.info, icon: "📅" },
            ].map(k => (
              <Card key={k.label} style={{ borderTop: `3px solid ${k.color}` }}>
                <div style={{ fontSize: 20, marginBottom: 8 }}>{k.icon}</div>
                <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: k.color, marginBottom: 4 }}>{k.value}</div>
                <div style={{ fontSize: 11, color: C.textSub }}>{k.sub}</div>
              </Card>
            ))}
          </div>

          {/* Payer health */}
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14 }}>Payer Patterns</div>
            {[
              { name: "ABC Properties (Owner)", avgDays: 12, pattern: "Fast payer", health: "excellent" },
              { name: "City of LA (Public)", avgDays: 32, pattern: "Moderate — lien waivers required", health: "ok" },
              { name: "Elm Street LLC", avgDays: 8, pattern: "Pays early", health: "excellent" },
            ].map(p => (
              <div key={p.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: C.textSub }}>{p.pattern}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: p.avgDays > 25 ? C.warning : C.success }}>{p.avgDays} days avg</div>
                  <span style={{ fontSize: 11, background: p.health === "excellent" ? C.successBg : C.warningBg, color: p.health === "excellent" ? C.success : C.warning, borderRadius: 4, padding: "2px 6px" }}>{p.health}</span>
                </div>
              </div>
            ))}
          </Card>

          {/* AI Insight */}
          <Card style={{ background: "linear-gradient(135deg, #1A2230, #243044)", border: "none" }}>
            <div style={{ display: "flex", gap: 14 }}>
              <span style={{ fontSize: 28 }}>🤖</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 6 }}>AI Insight</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>
                  Pay App #4 ($32,150) was submitted 5 days ago. Based on ABC Properties' payment history, expect receipt within 7-9 days. If unpaid by April 12, I'll auto-send a payment reminder.
                </div>
                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <Btn size="sm" onClick={() => {}}>Send Reminder Now</Btn>
                  <Btn size="sm" variant="ghost" style={{ color: "rgba(255,255,255,0.5)" }}>Dismiss</Btn>
                </div>
              </div>
            </div>
          </Card>
        </>
      )}

      {activeTab === "collections" && (
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>Collection Tracking</div>
          {[
            { payapp: "Pay App #4 — Apr 2026", client: "ABC Properties", amount: "$32,150", due: "Apr 30, 2026", status: "On Track", daysLeft: 24 },
            { payapp: "Pay App #3 — Mar 2026", client: "ABC Properties", amount: "$28,400", due: "Paid Mar 15", status: "Paid", daysLeft: null },
            { payapp: "Pay App #2 — Feb 2026", client: "ABC Properties", amount: "$24,600", due: "Paid Feb 12", status: "Paid", daysLeft: null },
          ].map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: `1px solid ${C.borderLight}` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{p.payapp}</div>
                <div style={{ fontSize: 12, color: C.textSub }}>{p.client} · Due: {p.due}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{p.amount}</div>
                <StatusBadge status={p.status === "Paid" ? "approved" : "pending"} />
              </div>
            </div>
          ))}
        </Card>
      )}

      {activeTab === "forecast" && (
        <>
          <Card style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>30-Day Cash Flow Forecast</div>
            {/* Simple bar chart visualization */}
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 140 }}>
              {[
                { week: "Wk 1", in: 0, out: 12000 },
                { week: "Wk 2", in: 32150, out: 8000 },
                { week: "Wk 3", in: 0, out: 15000 },
                { week: "Wk 4", in: 28900, out: 6000 },
              ].map((w, i) => (
                <div key={i} style={{ flex: 1, display: "flex", gap: 3, alignItems: "flex-end", justifyContent: "center" }}>
                  <div title={`In: $${w.in.toLocaleString()}`} style={{ flex: 1, background: C.success, borderRadius: "4px 4px 0 0", height: `${(w.in / 35000) * 120}px`, minHeight: w.in ? 4 : 0, opacity: 0.85 }} />
                  <div title={`Out: $${w.out.toLocaleString()}`} style={{ flex: 1, background: C.danger, borderRadius: "4px 4px 0 0", height: `${(w.out / 35000) * 120}px`, opacity: 0.7 }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: C.textSub }}>
              {["Wk 1", "Wk 2", "Wk 3", "Wk 4"].map(w => <div key={w} style={{ flex: 1, textAlign: "center" }}>{w}</div>)}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11 }}>
              <span style={{ color: C.success }}>■ Cash In</span>
              <span style={{ color: C.danger }}>■ Cash Out</span>
            </div>
          </Card>
          <Card>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>AI Forecast Summary</div>
            <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7 }}>
              📈 <strong>30-day net position: +$27,650</strong><br />
              Based on Pay App #4 expected payment on Apr 10 (+$32,150) and estimated vendor payments (~$21,000).<br /><br />
              ⚠️ <strong>Gap warning:</strong> Week 1 and Week 3 show negative daily cash flow. Your current balance should cover this, but delay in Pay App #4 could create a ~$9,000 shortfall by April 15.
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

// ─── SCREEN 8: SUB MAGIC LINK VIEW ────────────────────────────────────────────
const SubMagicLink = ({ setScreen }) => {
  const [uploaded, setUploaded] = useState(false);
  const [docType, setDocType] = useState("invoice");
  const [note, setNote] = useState("");
  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f8", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "40px 20px" }}>
      {/* Sub view header */}
      <div style={{ width: "100%", maxWidth: 600 }}>
        <div style={{ background: C.navy, borderRadius: "14px 14px 0 0", padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.orange }}>CONSTRUCTINVOICE AI</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>Secure Document Upload</div>
          </div>
          <div style={{ fontSize: 11, background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", borderRadius: 6, padding: "4px 10px" }}>🔗 Magic Link</div>
        </div>

        <div style={{ background: "#fff", borderRadius: "0 0 14px 14px", padding: "28px", boxShadow: "0 8px 40px rgba(0,0,0,0.12)" }}>
          {!uploaded ? (
            <>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4 }}>Hello, Pacific Coast Plumbing 👋</div>
                <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.6 }}>
                  You've been invited to upload documents for <strong>123 Elm Street Addition</strong> (ABC General Contractors).<br />
                  No account needed — just upload and you're done.
                </div>
              </div>

              {/* Doc type */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 8 }}>Document Type</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {["invoice", "lien_waiver", "rfi", "photo", "submittal", "other"].map(dt => {
                    const m = DOC_TYPE_META[dt];
                    return (
                      <div key={dt} onClick={() => setDocType(dt)}
                        style={{ border: `2px solid ${docType === dt ? C.orange : C.border}`, borderRadius: 9, padding: "10px 8px", textAlign: "center", cursor: "pointer", background: docType === dt ? "#fff7f5" : "#fff", transition: "all 0.15s" }}>
                        <div style={{ fontSize: 18, marginBottom: 3 }}>{m.icon}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: docType === dt ? C.orange : C.textSub }}>{m.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Upload zone */}
              <div style={{ border: `2px dashed ${C.orange}60`, borderRadius: 12, padding: "32px 20px", textAlign: "center", background: "#fff7f5", marginBottom: 16, cursor: "pointer" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📁</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Drop files here or click to browse</div>
                <div style={{ fontSize: 12, color: C.textSub }}>PDF, Word, Excel, Images · Up to 50MB</div>
              </div>

              {/* Note */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: 0.6, display: "block", marginBottom: 6 }}>Note (Optional)</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Add any notes about this document..."
                  style={{ width: "100%", minHeight: 60, border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>

              <button onClick={() => setUploaded(true)}
                style={{ width: "100%", padding: "14px", background: C.orange, color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                📤 Upload Document
              </button>

              {/* Email alias info */}
              <div style={{ background: "#f5f6f9", borderRadius: 10, padding: "12px 14px", marginTop: 16, fontSize: 12, color: C.textSub }}>
                💡 <strong>Prefer email?</strong> Send documents directly to:<br />
                <span style={{ fontFamily: "monospace", color: C.navy, fontSize: 11 }}>plumbing-123elm@hub.constructinv.com</span>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 8 }}>Document Uploaded!</div>
              <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.6, marginBottom: 24 }}>ABC General Contractors will review your document and notify you when it's been approved or if they have questions.</div>
              <Btn onClick={() => setUploaded(false)} variant="secondary">Upload Another Document</Btn>
            </div>
          )}
        </div>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: C.textMuted }}>
          Powered by ConstructInvoice AI · Secure upload · No account required
        </div>
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <Btn size="sm" variant="ghost" onClick={() => setScreen("hub_inbox")} style={{ color: C.textMuted }}>← Back to GC View</Btn>
        </div>
      </div>
    </div>
  );
};

// ─── SCREEN 9: SETTINGS ───────────────────────────────────────────────────────
const Settings = () => (
  <div style={{ padding: "28px 32px", flex: 1, overflowY: "auto" }}>
    <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 24 }}>⚙️ Hub Settings</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <Card>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>Email Ingestion</div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 4 }}>Catch-all Domain</div>
          <div style={{ fontFamily: "monospace", fontSize: 13, color: C.navy, background: "#f5f6f9", padding: "8px 12px", borderRadius: 7 }}>hub.constructinv.com</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 8, height: 8, background: C.success, borderRadius: "50%" }} />
          <span style={{ fontSize: 13, color: C.success }}>Mailgun Active — receiving emails</span>
        </div>
        <div style={{ fontSize: 12, color: C.textSub }}>Emails to any {"{trade}-{slug}@hub.constructinv.com"} are automatically routed to the correct project hub.</div>
      </Card>
      <Card>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>Stale Alert Schedule</div>
        {[
          { days: 2, label: "Warning", icon: "⚠️", color: C.warning },
          { days: 5, label: "Escalation", icon: "🔴", color: C.danger },
          { days: 7, label: "Urgent", icon: "🚨", color: C.danger },
        ].map(a => (
          <div key={a.days} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.borderLight}` }}>
            <span>{a.icon}</span>
            <div style={{ flex: 1, fontSize: 13, color: C.text }}>{a.label} — Day {a.days}</div>
            <span style={{ fontSize: 11, color: a.color, fontWeight: 600 }}>In-app + Email</span>
          </div>
        ))}
      </Card>
      <Card>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>Magic Link Settings</div>
        <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7 }}>
          Magic links expire after <strong>60 days</strong> of inactivity.<br />
          Subs can forward links to team members — this is intentional.<br />
          Links can be regenerated from the Trades tab at any time.
        </div>
      </Card>
      <Card>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>QuickBooks Sync</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ width: 8, height: 8, background: C.warning, borderRadius: "50%" }} />
          <span style={{ fontSize: 13, color: C.warning }}>Not connected (env vars pending)</span>
        </div>
        <div style={{ fontSize: 12, color: C.textSub, marginBottom: 12 }}>Connect QuickBooks to auto-sync approved invoices, pay apps, and payments.</div>
        <Btn variant="secondary" size="sm">Connect QuickBooks</Btn>
      </Card>
    </div>
  </div>
);

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("hub_inbox");
  const [selectedDoc, setSelectedDoc] = useState(null);
  const notifCount = NOTIFICATIONS.filter(n => !n.read).length;

  const renderScreen = () => {
    switch (screen) {
      case "project_overview": return <ProjectOverview setScreen={setScreen} />;
      case "hub_inbox": return <HubInbox setScreen={setScreen} setSelectedDoc={setSelectedDoc} />;
      case "hub_doc_detail": return <DocDetail doc={selectedDoc} setScreen={setScreen} />;
      case "hub_trades": return <TradesView setScreen={setScreen} />;
      case "hub_add_trade": return <AddTrade setScreen={setScreen} />;
      case "hub_team": return <TeamRoles />;
      case "ai_cashflow": return <AICashFlow />;
      case "sub_magic_link": return <SubMagicLink setScreen={setScreen} />;
      case "settings": return <Settings />;
      default: return <HubInbox setScreen={setScreen} setSelectedDoc={setSelectedDoc} />;
    }
  };

  // Sub view has its own full-page layout
  if (screen === "sub_magic_link") {
    return (
      <div style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <SubMagicLink setScreen={setScreen} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif", display: "flex", height: "100vh", overflow: "hidden", background: C.bg }}>
      <Sidebar screen={screen} setScreen={setScreen} notifCount={notifCount} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{ height: 52, background: C.card, borderBottom: `1.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", flexShrink: 0 }}>
          <div style={{ fontSize: 12, color: C.textSub }}>
            <span style={{ fontWeight: 600, color: C.text }}>ConstructInvoice AI</span> · 123 Elm Street Addition · <span style={{ color: C.orange }}>Project Hub</span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {/* Notification bell */}
            <div style={{ position: "relative", cursor: "pointer" }} onClick={() => alert("Notification center coming soon!")}>
              <span style={{ fontSize: 20 }}>🔔</span>
              {notifCount > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: C.danger, color: "#fff", borderRadius: "50%", fontSize: 9, fontWeight: 700, width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>{notifCount}</span>}
            </div>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: `linear-gradient(135deg, ${C.orange}, ${C.navy})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>V</div>
          </div>
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {renderScreen()}
        </div>
      </div>
    </div>
  );
}
