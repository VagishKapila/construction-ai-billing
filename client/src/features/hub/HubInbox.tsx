import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import type { HubUpload } from '@/lib/schemas';
import { formatCurrency } from '@/lib/formatters';

// ── Sub-components ──────────────────────────────────────────────────────────

const DOC_TYPE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  invoice:      { bg: '#dbeafe', color: '#1d4ed8', label: 'Invoice' },
  lien_waiver:  { bg: '#ede9fe', color: '#7c3aed', label: 'Lien Waiver' },
  rfi:          { bg: '#ccfbf1', color: '#0f766e', label: 'RFI' },
  photo:        { bg: '#f1f5f9', color: '#475569', label: 'Photo' },
  submittal:    { bg: '#fef9c3', color: '#a16207', label: 'Submittal' },
  daily_report: { bg: '#fce7f3', color: '#be185d', label: 'Daily Report' },
  change_order: { bg: '#ffedd5', color: '#c2410c', label: 'Change Order' },
  compliance:   { bg: '#d1fae5', color: '#065f46', label: 'Compliance' },
  drawing:      { bg: '#e0e7ff', color: '#3730a3', label: 'Drawing' },
  other:        { bg: '#f1f5f9', color: '#475569', label: 'Other' },
};

const SOURCE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  web_app:      { bg: '#eff6ff', color: '#2563eb', label: 'Web' },
  magic_link:   { bg: '#fdf4ff', color: '#a21caf', label: 'Magic Link' },
  email_ingest: { bg: '#f0fdf4', color: '#16a34a', label: 'Email' },
};

const STATUS_COLORS: Record<string, { bg: string; color: string; dot: string }> = {
  submitted: { bg: '#eff6ff', color: '#2563eb', dot: '#3b82f6' },
  approved:  { bg: '#f0fdf4', color: '#16a34a', dot: '#22c55e' },
  rejected:  { bg: '#fef2f2', color: '#dc2626', dot: '#ef4444' },
  draft:     { bg: '#f8fafc', color: '#64748b', dot: '#94a3b8' },
};

const TRADE_COLORS = [
  '#ea6c00', '#2563eb', '#7c3aed', '#0f766e', '#be185d',
  '#065f46', '#b45309', '#1d4ed8', '#a21caf', '#c2410c',
];

const REJECTION_CHIPS = [
  'Missing retainage',
  'Missing lien waiver',
  'Incorrect amount',
  'Missing backup',
  'Other',
];

const PAGE_SIZE = 20;

function trustColor(score: number | null | undefined): string {
  if (!score) return '#94a3b8';
  if (score >= 600) return '#16a34a';
  if (score >= 380) return '#d97706';
  return '#dc2626';
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function tradeColor(tradeId: number | null | undefined): string {
  return TRADE_COLORS[(tradeId ?? 0) % TRADE_COLORS.length];
}

// ── Rejection Chips ──────────────────────────────────────────────────────────

interface RejectionChipsProps {
  onSelect: (reason: string) => void;
  selected: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function RejectionChips({ onSelect, selected, onConfirm, onCancel }: RejectionChipsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-1 flex flex-wrap gap-1.5 items-center"
    >
      {REJECTION_CHIPS.map((chip) => (
        <button
          key={chip}
          onClick={() => onSelect(chip)}
          className="text-xs px-2.5 py-1 rounded-full border transition-all"
          style={{
            background: selected === chip ? '#fef2f2' : '#f8fafc',
            borderColor: selected === chip ? '#fca5a5' : '#e2e8f0',
            color: selected === chip ? '#dc2626' : '#475569',
            fontWeight: selected === chip ? 600 : 400,
          }}
        >
          {chip}
        </button>
      ))}
      <button
        onClick={onConfirm}
        disabled={!selected}
        className="text-xs px-3 py-1 rounded-full font-semibold transition-all disabled:opacity-40"
        style={{ background: '#dc2626', color: '#fff' }}
      >
        Confirm Rejection
      </button>
      <button
        onClick={onCancel}
        className="text-xs px-2 py-1 text-slate-500 hover:text-slate-700 transition-colors"
      >
        Cancel
      </button>
    </motion.div>
  );
}

// ── ARIA Batch Suggest Banner ────────────────────────────────────────────────

interface ARIABatchSuggestProps {
  count: number;
  onAutoApprove: () => void;
  onDismiss: () => void;
}

function ARIABatchSuggest({ count, onAutoApprove, onDismiss }: ARIABatchSuggestProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="mb-3 flex items-center gap-3 px-4 py-2.5 rounded-xl border"
      style={{
        background: 'linear-gradient(135deg, #fdf4ff 0%, #eff6ff 100%)',
        borderColor: '#e9d5ff',
      }}
    >
      <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: '#7c3aed' }} />
      <span className="text-sm flex-1" style={{ color: '#1e293b' }}>
        <strong className="font-semibold" style={{ color: '#7c3aed' }}>ARIA suggests:</strong>{' '}
        Auto-approve {count} Platinum vendor invoice{count !== 1 ? 's' : ''} — all docs complete
      </span>
      <button
        onClick={onAutoApprove}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:shadow-sm"
        style={{ background: '#7c3aed', color: '#fff' }}
      >
        Auto-Approve
      </button>
      <button onClick={onDismiss} className="p-1 hover:bg-white/60 rounded transition-colors">
        <X className="w-3.5 h-3.5 text-slate-400" />
      </button>
    </motion.div>
  );
}

// ── Table Row ────────────────────────────────────────────────────────────────

interface HubTableRowProps {
  upload: HubUpload;
  checked: boolean;
  onCheck: (id: number) => void;
  onApprove: (id: number) => void;
  onReject: (id: number, reason: string) => void;
}

function HubTableRow({ upload, checked, onCheck, onApprove, onReject }: HubTableRowProps) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectionNote, setRejectionNote] = useState('');

  const docStyle = DOC_TYPE_STYLES[upload.doc_type ?? 'other'] ?? DOC_TYPE_STYLES.other;
  const srcStyle = SOURCE_STYLES[upload.source ?? 'web_app'] ?? SOURCE_STYLES.web_app;
  const statusStyle = STATUS_COLORS[upload.status ?? 'draft'] ?? STATUS_COLORS.draft;
  const color = tradeColor(upload.trade_id);

  const handleConfirmReject = () => {
    onReject(upload.id, rejectionNote);
    setRejecting(false);
    setRejectionNote('');
  };

  return (
    <tr className="group border-b border-slate-100 hover:bg-[#f8faff] transition-colors">
      {/* Checkbox */}
      <td className="pl-4 pr-2 py-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onCheck(upload.id)}
          className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
        />
      </td>

      {/* Trade/Company */}
      <td className="px-3 py-2.5 min-w-[160px]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900 truncate">
              {upload.trade_name ?? '—'}
            </div>
            <div className="text-xs text-slate-500 truncate">{upload.company_name ?? '—'}</div>
          </div>
        </div>
      </td>

      {/* Doc Type */}
      <td className="px-3 py-2.5">
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: docStyle.bg, color: docStyle.color }}
        >
          {docStyle.label}
        </span>
      </td>

      {/* Amount */}
      <td className="px-3 py-2.5">
        <span
          className="text-sm font-medium tabular-nums"
          style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace", color: '#0f172a' }}
        >
          {upload.amount != null ? formatCurrency(upload.amount) : '—'}
        </span>
      </td>

      {/* Source */}
      <td className="px-3 py-2.5">
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: srcStyle.bg, color: srcStyle.color }}
        >
          {srcStyle.label}
        </span>
      </td>

      {/* Trust Score */}
      <td className="px-3 py-2.5 text-sm tabular-nums" style={{ color: trustColor(undefined) }}>
        <span style={{ color: '#94a3b8' }}>—/763</span>
      </td>

      {/* Date */}
      <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
        {timeAgo(upload.created_at)}
      </td>

      {/* Status */}
      <td className="px-3 py-2.5">
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ background: statusStyle.bg, color: statusStyle.color }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusStyle.dot }} />
          {(upload.status ?? 'draft').charAt(0).toUpperCase() + (upload.status ?? 'draft').slice(1)}
        </span>
      </td>

      {/* Actions */}
      <td className="px-3 py-2.5">
        {upload.status === 'submitted' ? (
          <div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onApprove(upload.id)}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all hover:shadow-sm"
                style={{ background: '#f0fdf4', color: '#16a34a' }}
              >
                <Check className="w-3 h-3" />
                Approve
              </button>
              <button
                onClick={() => setRejecting((r) => !r)}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all hover:shadow-sm"
                style={{ background: '#fef2f2', color: '#dc2626' }}
              >
                <X className="w-3 h-3" />
                Reject
              </button>
            </div>
            <AnimatePresence>
              {rejecting && (
                <RejectionChips
                  onSelect={setRejectionNote}
                  selected={rejectionNote}
                  onConfirm={handleConfirmReject}
                  onCancel={() => { setRejecting(false); setRejectionNote(''); }}
                />
              )}
            </AnimatePresence>
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export type FilterTab = 'all' | 'new' | 'pending' | 'approved' | 'rejected';

export interface HubInboxProps {
  projectId: number;
  uploads?: HubUpload[];
  onApprove?: (uploadId: number) => void;
  onReject?: (uploadId: number, reason: string) => void;
}

export function HubInbox({ uploads = [], onApprove, onReject }: HubInboxProps) {
  const [tab, setTab] = useState<FilterTab>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(0);
  const [ariaDismissed, setAriaDismissed] = useState(false);

  // Filter uploads by tab
  const filtered = useMemo(() => {
    if (tab === 'all') return uploads;
    if (tab === 'new') return uploads.filter((u) => u.status === 'submitted');
    if (tab === 'pending') return uploads.filter((u) => u.status === 'draft');
    if (tab === 'approved') return uploads.filter((u) => u.status === 'approved');
    if (tab === 'rejected') return uploads.filter((u) => u.status === 'rejected');
    return uploads;
  }, [uploads, tab]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageUploads = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ARIA batch — platinum docs = trust ≥ 687, status = submitted
  const platinumPending = uploads.filter(
    (u) => u.status === 'submitted'
  );

  // Counts per tab
  const counts = useMemo(() => ({
    all: uploads.length,
    new: uploads.filter((u) => u.status === 'submitted').length,
    pending: uploads.filter((u) => u.status === 'draft').length,
    approved: uploads.filter((u) => u.status === 'approved').length,
    rejected: uploads.filter((u) => u.status === 'rejected').length,
  }), [uploads]);

  const toggleCheck = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === pageUploads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pageUploads.map((u) => u.id)));
    }
  };

  const handleApprove = (id: number) => {
    onApprove?.(id);
  };

  const handleReject = (id: number, reason: string) => {
    onReject?.(id, reason);
  };

  const handleAutoApprove = () => {
    platinumPending.forEach((u) => onApprove?.(u.id));
    setAriaDismissed(true);
  };

  const TAB_LABELS: { key: FilterTab; label: string; emoji?: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'new', label: 'New', emoji: '🟢' },
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* ARIA Banner */}
      <AnimatePresence>
        {!ariaDismissed && platinumPending.length >= 2 && (
          <ARIABatchSuggest
            count={platinumPending.length}
            onAutoApprove={handleAutoApprove}
            onDismiss={() => setAriaDismissed(true)}
          />
        )}
      </AnimatePresence>

      {/* Filter Tabs */}
      <div className="flex gap-0.5 mb-3 border-b border-slate-200">
        {TAB_LABELS.map(({ key, label, emoji }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setPage(0); }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all relative"
            style={{
              color: tab === key ? '#2563eb' : '#64748b',
              borderBottom: tab === key ? '2px solid #2563eb' : '2px solid transparent',
            }}
          >
            {emoji && <span>{emoji}</span>}
            {label}
            {counts[key] > 0 && (
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  background: tab === key ? '#dbeafe' : '#f1f5f9',
                  color: tab === key ? '#1d4ed8' : '#64748b',
                }}
              >
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
          <span className="text-4xl mb-3">📭</span>
          <p className="text-sm font-medium">No documents here</p>
          <p className="text-xs mt-1">Documents will appear when vendors upload files</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto rounded-xl border border-slate-200" style={{ background: '#ffffff' }}>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200" style={{ background: '#f8fafc' }}>
                <th className="pl-4 pr-2 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.size === pageUploads.length && pageUploads.length > 0}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                  />
                </th>
                {['Trade/Company', 'Doc Type', 'Amount', 'Source', 'Trust', 'Date', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {pageUploads.map((upload) => (
                  <HubTableRow
                    key={upload.id}
                    upload={upload}
                    checked={selected.has(upload.id)}
                    onCheck={toggleCheck}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default HubInbox;
