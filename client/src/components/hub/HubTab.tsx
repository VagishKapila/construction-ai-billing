import { useEffect, useState } from 'react';
import {
  Inbox,
  Users,
  Settings as SettingsIcon,
  CreditCard,
  Plus,
  Clock,
  AlertCircle,
  Eye,
} from 'lucide-react';
import type { HubUpload, Trade, HubStats } from '@/types/hub';
import {
  getTrades,
  getInbox,
  getHubStats,
} from '@/api/hub';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatCurrency } from '@/lib/formatters';
import { DocDetailModal } from './DocDetailModal';
import { AddTradeModal } from './AddTradeModal';
import { UploadDocumentModal } from './UploadDocumentModal';
import { TradeCard } from './TradeCard';
import OrbitalCanvas from './OrbitalCanvas';

interface HubTabProps {
  projectId: number;
}

type SubTab = 'inbox' | 'trades' | 'team' | 'billing';

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  lien_waiver: 'Lien Waiver',
  rfi: 'RFI',
  photo: 'Photo',
  submittal: 'Submittal',
  daily_report: 'Daily Report',
  change_order: 'Change Order',
  compliance: 'Compliance',
  drawing: 'Drawing',
  other: 'Other',
};

const DOC_TYPE_COLORS: Record<string, string> = {
  invoice: 'bg-blue-100 text-blue-800 border-blue-200',
  lien_waiver: 'bg-amber-100 text-amber-800 border-amber-200',
  rfi: 'bg-purple-100 text-purple-800 border-purple-200',
  photo: 'bg-green-100 text-green-800 border-green-200',
  submittal: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  daily_report: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  change_order: 'bg-red-100 text-red-800 border-red-200',
  compliance: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  drawing: 'bg-orange-100 text-orange-800 border-orange-200',
  other: 'bg-gray-100 text-gray-800 border-gray-200',
};

export function HubTab({ projectId }: HubTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('inbox');
  const [uploads, setUploads] = useState<HubUpload[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState<HubStats | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedUpload, setSelectedUpload] = useState<HubUpload | null>(null);
  const [loading, setLoading] = useState(true);
  const [addTradeOpen, setAddTradeOpen] = useState(false);
  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [tradesRes, inboxRes, statsRes] = await Promise.all([
          getTrades(projectId),
          getInbox(projectId),
          getHubStats(projectId),
        ]);

        if (tradesRes.data) setTrades(tradesRes.data);
        if (inboxRes.data) setUploads(inboxRes.data);
        if (statsRes.data) setStats(statsRes.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load hub data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [projectId]);

  // Reload inbox when filter changes
  useEffect(() => {
    const reloadInbox = async () => {
      try {
        const res = await getInbox(projectId, { status: statusFilter });
        if (res.data) setUploads(res.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reload inbox');
      }
    };

    reloadInbox();
  }, [statusFilter, projectId]);

  const handleTradeAdded = async () => {
    setAddTradeOpen(false);
    try {
      const res = await getTrades(projectId);
      if (res.data) setTrades(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload trades');
    }
  };

  const handleUploadComplete = async () => {
    setUploadDocOpen(false);
    try {
      const res = await getInbox(projectId, { status: statusFilter });
      if (res.data) setUploads(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload inbox');
    }
  };

  const handleUploadStatusChanged = async (updatedUpload: HubUpload) => {
    // Update local state
    setUploads(uploads.map(u => u.id === updatedUpload.id ? updatedUpload : u));
    setSelectedUpload(null);
    // Reload stats
    try {
      const res = await getHubStats(projectId);
      if (res.data) setStats(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload stats');
    }
  };

  const isStale = (upload: HubUpload): boolean => {
    if (upload.status !== 'pending') return false;
    const createdDate = new Date(upload.created_at);
    const now = new Date();
    const daysDiff = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff > 2;
  };

  const filteredUploads = statusFilter === 'all'
    ? uploads
    : uploads.filter(u => u.status === statusFilter);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="rounded-lg bg-danger-50 border border-danger-200 p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-danger-600 flex-shrink-0" />
          <p className="text-sm text-danger-700">{error}</p>
        </div>
      )}

      {/* Sub-navigation tabs */}
      <div className="border-b border-border">
        <div className="flex gap-6 overflow-x-auto">
          {[
            { id: 'inbox', label: 'Inbox', icon: Inbox, badge: stats?.pending_count },
            { id: 'trades', label: 'Trades', icon: Users, badge: stats?.trade_count },
            { id: 'team', label: 'Team Roles', icon: SettingsIcon },
            { id: 'billing', label: 'Billing Integration', icon: CreditCard },
          ].map(tab => {
            const TabIcon = tab.icon;
            const isActive = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as SubTab)}
                className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-[#E8622A] text-[#E8622A]'
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-gray-50'
                }`}
              >
                <TabIcon className="w-4 h-4" />
                {tab.label}
                {tab.badge && tab.badge > 0 && (
                  <Badge className="ml-1 bg-[#E8622A] text-white">
                    {tab.badge}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* INBOX TAB */}
      {subTab === 'inbox' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2 overflow-x-auto">
              {['all', 'pending', 'approved', 'rejected'].map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status as any)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                    statusFilter === status
                      ? 'bg-[#E8622A] text-white'
                      : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>

            <Button
              onClick={() => setUploadDocOpen(true)}
              size="sm"
              className="bg-[#E8622A] hover:bg-[#d4501f]"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Upload Document
            </Button>
          </div>

          {filteredUploads.length === 0 ? (
            <Card className="p-12 text-center">
              <Inbox className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-primary font-medium">No documents</p>
              <p className="text-sm text-text-muted mt-1">
                {statusFilter === 'all'
                  ? 'Trades will upload documents here'
                  : `No ${statusFilter} documents yet`}
              </p>
            </Card>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-semibold text-text-primary">Trade</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-primary">Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-primary">Document</th>
                    <th className="text-right py-3 px-4 font-semibold text-text-primary">Amount</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-primary">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-text-primary">Date</th>
                    <th className="text-center py-3 px-4 font-semibold text-text-primary">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUploads.map(upload => {
                    const stale = isStale(upload);
                    return (
                      <tr
                        key={upload.id}
                        className={`border-b border-border hover:bg-gray-50 ${
                          upload.status === 'rejected'
                            ? 'bg-red-50/40'
                            : stale
                              ? 'bg-amber-50'
                              : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium text-text-primary">{upload.trade_name}</p>
                            <p className="text-xs text-text-muted">{upload.company_name || '—'}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={`${DOC_TYPE_COLORS[upload.doc_type] || DOC_TYPE_COLORS.other} border`}>
                            {DOC_TYPE_LABELS[upload.doc_type] || upload.doc_type}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-text-secondary">{upload.original_name}</td>
                        <td className="py-3 px-4 text-right text-text-primary font-mono">
                          {upload.amount ? formatCurrency(Number(upload.amount)) : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1">
                            <Badge
                              variant={
                                upload.status === 'approved'
                                  ? 'success'
                                  : upload.status === 'rejected'
                                    ? 'danger'
                                    : 'warning'
                              }
                            >
                              {upload.status === 'rejected' ? 'Rejected' : upload.status}
                            </Badge>
                            {upload.status === 'rejected' && (
                              <span className="text-xs text-amber-600 font-medium whitespace-nowrap">
                                ↩ Awaiting resubmission
                              </span>
                            )}
                            {upload.status === 'rejected' && upload.rejection_reason && (
                              <span
                                className="text-xs text-red-600 max-w-[140px] truncate"
                                title={upload.rejection_reason}
                              >
                                {upload.rejection_reason}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-text-secondary">
                          <div className="flex items-center gap-1">
                            {stale && <Clock className="w-3 h-3 text-amber-600" />}
                            <span>{formatDate(upload.created_at)}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setSelectedUpload(upload)}
                            className="text-[#E8622A] hover:text-[#d4501f] font-medium text-xs"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TRADES TAB */}
      {subTab === 'trades' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <Button
              onClick={() => setAddTradeOpen(true)}
              className="bg-[#E8622A] hover:bg-[#d4501f]"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Trade
            </Button>
          </div>

          {trades.length === 0 ? (
            <Card className="p-12 text-center">
              <Users className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-primary font-medium">No trades yet</p>
              <p className="text-sm text-text-muted mt-1">Add trades to enable document intake</p>
            </Card>
          ) : (
            <>
              {/* Orbital Canvas Visualization */}
              <div className="flex justify-center">
                <OrbitalCanvas
                  planets={trades.map((trade, idx) => ({
                    name: trade.name || `Trade ${idx + 1}`,
                    initials: (trade.name || `Trade ${idx + 1}`).substring(0, 3),
                    color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'][idx % 6],
                    orbitRadius: 80 + idx * 20,
                    speed: 0.5 + (idx * 0.15),
                    size: 24 + (idx % 3) * 4,
                    trustScore: Math.floor(Math.random() * 763),
                  }))}
                />
              </div>

              {/* Trades Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {trades.map(trade => (
                  <TradeCard
                    key={trade.id}
                    trade={trade}
                    projectId={projectId}
                    onTradeUpdated={handleTradeAdded}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* TEAM ROLES TAB */}
      {subTab === 'team' && (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Assign team members to receive different types of documents
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { role: 'office', title: 'Office/Accountant', desc: 'Receives invoices & compliance docs' },
              { role: 'pm', title: 'PM/PMCM', desc: 'Receives RFIs, submittals & drawings' },
              { role: 'superintendent', title: 'Superintendent', desc: 'Receives daily reports & photos' },
            ].map(item => (
              <Card key={item.role} className="p-4">
                <h3 className="font-semibold text-text-primary">{item.title}</h3>
                <p className="text-xs text-text-muted mt-1">{item.desc}</p>
                <input
                  type="text"
                  placeholder="Assign person"
                  className="mt-3 w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E8622A]"
                />
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* BILLING INTEGRATION TAB */}
      {subTab === 'billing' && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Billing Integration Flow</h3>

          <div className="space-y-4">
            {[
              {
                step: 1,
                title: 'Sub uploads invoice',
                desc: 'Subcontractor uploads invoice via magic link',
                status: 'live',
              },
              {
                step: 2,
                title: 'Hub intake & approval',
                desc: 'You review and approve invoices in Project Hub',
                status: 'live',
              },
              {
                step: 3,
                title: 'Link to pay app',
                desc: 'Approved invoices link to Schedule of Values',
                status: 'live',
              },
              {
                step: 4,
                title: 'Create G702/G703',
                desc: 'Generate pay application from Project Hub',
                status: 'live',
              },
              {
                step: 5,
                title: 'Owner pays online',
                desc: 'Owner pays via Stripe Connect (ACH or card)',
                status: 'coming',
              },
              {
                step: 6,
                title: 'QuickBooks sync',
                desc: 'Auto-sync invoices and payments to QB',
                status: 'coming',
              },
            ].map(item => (
              <div key={item.step} className="flex gap-4">
                <div className="flex-shrink-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-white ${
                    item.status === 'live' ? 'bg-emerald-500' : 'bg-gray-400'
                  }`}>
                    {item.status === 'live' ? '✓' : '◯'}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-text-primary">{item.title}</p>
                  <p className="text-sm text-text-muted">{item.desc}</p>
                  {item.status === 'coming' && (
                    <Badge className="mt-2 bg-gray-200 text-gray-700 border-gray-300">
                      Coming soon
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button className="mt-6 w-full bg-[#1A2230] hover:bg-[#0f1419]">
            Go to Pay Applications
          </Button>
        </Card>
      )}

      {/* Modals */}
      <DocDetailModal
        upload={selectedUpload}
        projectId={projectId}
        onClose={() => setSelectedUpload(null)}
        onStatusChange={handleUploadStatusChanged}
      />

      <AddTradeModal
        projectId={projectId}
        onClose={() => setAddTradeOpen(false)}
        onAdded={handleTradeAdded}
        open={addTradeOpen}
      />

      <UploadDocumentModal
        projectId={projectId}
        trades={trades}
        onClose={() => setUploadDocOpen(false)}
        onUploaded={handleUploadComplete}
        open={uploadDocOpen}
      />
    </div>
  );
}
