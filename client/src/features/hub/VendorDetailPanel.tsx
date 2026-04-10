import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import TrustScoreBadge from '@/features/trust/TrustScoreBadge';

export interface Trade {
  id: number;
  name: string;          // trade name e.g. "Plumbing"
  company_name: string;  // vendor company
  contact_email: string;
  status: string;        // 'active' | 'pending' | 'overdue' | 'invited'
  email_alias?: string;
  invoice_total?: number;
  last_upload_at?: string;
  doc_count?: number;
  unread_count?: number;
  trust_score?: number;
  trust_tier?: string;
}

interface VendorDetailPanelProps {
  trade: Trade | null;
  projectAddress: string;
  onClose: () => void;
}

const statusColors = {
  active: 'bg-emerald-500',
  pending: 'bg-amber-500',
  overdue: 'bg-red-500',
  invited: 'bg-gray-400',
};

const statusLabels = {
  active: 'Active',
  pending: 'Pending',
  overdue: 'Overdue',
  invited: 'Invited',
};

export function VendorDetailPanel({ trade, projectAddress, onClose }: VendorDetailPanelProps) {
  const [copiedAlias, setCopiedAlias] = useState(false);

  const handleCopyAlias = () => {
    if (trade?.email_alias) {
      navigator.clipboard.writeText(trade.email_alias);
      setCopiedAlias(true);
      setTimeout(() => setCopiedAlias(false), 2000);
    }
  };

  if (!trade) {
    return (
      <div className="w-[270px] h-full bg-white border-l-[1.5px] border-slate-200 shadow-lg flex items-center justify-center p-6">
        <p className="text-center text-sm text-slate-500">
          Select a trade to view details
        </p>
      </div>
    );
  }

  const initials = trade.company_name
    .split(' ')
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  // Color mapping for avatar — could be based on trust tier
  const avatarColors: Record<string, string> = {
    'high': 'bg-emerald-500',
    'medium': 'bg-blue-500',
    'low': 'bg-amber-500',
    'default': 'bg-slate-400',
  };
  const avatarBg = avatarColors[trade.trust_tier || 'default'];

  const status = trade.status as keyof typeof statusColors;
  const statusColor = statusColors[status] || statusColors.invited;
  const statusLabel = statusLabels[status] || 'Unknown';

  // Format currency
  const formatCurrency = (value?: number) => {
    if (typeof value !== 'number') return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  // Format relative time
  const formatRelativeTime = (isoDate?: string) => {
    if (!isoDate) return 'Never';
    const date = new Date(isoDate);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="w-[270px] h-full bg-white border-l-[1.5px] border-slate-200 shadow-[0_4px_24px_rgba(37,99,235,0.08)] flex flex-col overflow-hidden transform transition-transform duration-300 translate-x-0 font-sans">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 flex items-start gap-3 relative">
        <div className={`${avatarBg} w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm`}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-slate-900 text-sm truncate">{trade.company_name}</h3>
          <p className="text-xs text-slate-500">{trade.name}</p>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 hover:bg-slate-100 rounded-md transition-colors"
          aria-label="Close panel"
        >
          <X className="w-4 h-4 text-slate-600" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Location */}
        <div className="px-4 py-3 text-xs text-slate-600">
          📍 {projectAddress}
        </div>

        {/* Trust Score Badge */}
        <div className="px-4 py-2">
          <TrustScoreBadge
            score={trade.trust_score || 0}
            size="sm"
          />
        </div>

        {/* Status Chip */}
        <div className="px-4 py-2">
          <div className={`${statusColor} w-fit px-3 py-1 rounded-full text-white text-xs font-medium`}>
            {statusLabel}
          </div>
        </div>

        <div className="border-t border-slate-200 mt-3 pt-3" />

        {/* Last Upload */}
        <div className="px-4 py-2">
          <p className="text-xs text-slate-500 mb-0.5">Last upload</p>
          <p className="text-sm font-medium text-slate-900">
            {formatRelativeTime(trade.last_upload_at)}
          </p>
        </div>

        {/* Invoice Total */}
        <div className="px-4 py-2">
          <p className="text-xs text-slate-500 mb-0.5">Invoice total</p>
          <p className="text-sm font-medium text-slate-900">
            {formatCurrency(trade.invoice_total)}
          </p>
        </div>

        {/* Email Alias */}
        {trade.email_alias && (
          <div className="px-4 py-2">
            <p className="text-xs text-slate-500 mb-1">Email alias</p>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-6 px-2 py-1.5">
              <code className="text-xs text-slate-700 font-mono truncate">
                {trade.email_alias}
              </code>
              <button
                onClick={handleCopyAlias}
                className="flex-shrink-0 p-1 hover:bg-slate-200 rounded transition-colors"
                title="Copy to clipboard"
              >
                {copiedAlias ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                )}
              </button>
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 my-3" />

        {/* Recent Documents */}
        <div className="px-4 py-2">
          <p className="text-xs font-bold text-slate-900 mb-2">Recent Documents</p>
          {trade.doc_count && trade.doc_count > 0 ? (
            <div className="space-y-1.5">
              {/* Placeholder: show last 3 docs (would be populated from API) */}
              <p className="text-xs text-slate-500">{trade.doc_count} document{trade.doc_count !== 1 ? 's' : ''}</p>
              {trade.unread_count && trade.unread_count > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
                  {trade.unread_count} unread
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400">No documents yet</p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="border-t border-slate-200 p-4 space-y-2">
        <button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium py-2 rounded-lg transition-colors">
          Approve All
        </button>
        <button className="w-full border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium py-2 rounded-lg transition-colors">
          View All Docs
        </button>
        <button className="w-full text-slate-600 hover:text-slate-900 text-sm py-2 font-medium transition-colors">
          Get paid in 5 days
        </button>
      </div>
    </div>
  );
}
