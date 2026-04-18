import { useMemo } from 'react';
import {
  AlertCircle,
  Mail,
  Copy,
  CheckCircle,
} from 'lucide-react';
import type { OutstandingInvoice, PayerPattern } from '@/types';
import { useCashFlow } from '@/hooks/useCashFlow';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { CollectionAlerts } from '@/components/collection/CollectionAlerts';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// KPI Card Component
interface KPICardProps {
  label: string;
  value: string;
  sublabel: string;
  isLoading: boolean;
  accentColor?: 'orange' | 'red' | 'blue' | 'green';
}

function KPICard({ label, value, sublabel, isLoading, accentColor = 'blue' }: KPICardProps) {
  const colorClasses = {
    orange: 'text-[#E8622A]',
    red: 'text-red-600',
    blue: 'text-[#6366f1]',
    green: 'text-green-600',
  };

  return (
    <Card className="p-6">
      <p className="text-sm font-medium text-gray-600">{label}</p>
      {isLoading ? (
        <Skeleton className="h-8 w-40 mt-2" />
      ) : (
        <>
          <p className={`text-2xl font-bold mt-1 font-mono tabular-nums ${colorClasses[accentColor]}`}>
            {value}
          </p>
          <p className="text-xs text-gray-500 mt-1">{sublabel}</p>
        </>
      )}
    </Card>
  );
}

// Outstanding Invoice Row
interface OutstandingInvoiceRowProps {
  invoice: OutstandingInvoice;
}

function OutstandingInvoiceRow({ invoice }: OutstandingInvoiceRowProps) {
  const urgencyConfig = {
    overdue: { badge: 'danger', label: 'Overdue', bgColor: 'bg-red-50' },
    due_soon: { badge: 'warning', label: 'Due Soon', bgColor: 'bg-yellow-50' },
    current: { badge: 'success', label: 'Current', bgColor: 'bg-green-50' },
  };

  const config = urgencyConfig[invoice.urgency] || urgencyConfig.current;

  const handleCopyLink = () => {
    if (invoice.payment_link_token) {
      const link = `${window.location.origin}/pay/${invoice.payment_link_token}`;
      navigator.clipboard.writeText(link);
    }
  };

  return (
    <tr className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{invoice.project_name}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{`PA #${invoice.app_number}`}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{invoice.owner_name}</td>
      <td className="px-4 py-3 text-sm font-mono font-semibold text-gray-900">
        {formatCurrency(invoice.amount_due)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {invoice.payment_due_date ? formatDate(invoice.payment_due_date) : '—'}
      </td>
      <td className="px-4 py-3 text-sm">
        {invoice.days_overdue > 0 ? (
          <span className="text-red-600 font-medium">{invoice.days_overdue}d overdue</span>
        ) : (
          <span className="text-gray-500">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        <Badge variant={config.badge as 'danger' | 'warning' | 'success' | 'default' | 'secondary' | 'outline'}>
          {config.label}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm flex gap-2">
        {invoice.payment_link_token && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyLink}
              title="Copy payment link"
              className="h-8 w-8 p-0"
            >
              <Copy size={16} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              asChild
              title="Send reminder email"
              className="h-8 w-8 p-0"
            >
              <a href={`mailto:${invoice.owner_email}?subject=Payment Reminder - PA #${invoice.app_number}`}>
                <Mail size={16} />
              </a>
            </Button>
          </>
        )}
      </td>
    </tr>
  );
}

// Outstanding Invoice Card (Mobile)
interface OutstandingInvoiceCardProps {
  invoice: OutstandingInvoice;
}

function OutstandingInvoiceCard({ invoice }: OutstandingInvoiceCardProps) {
  const urgencyConfig = {
    overdue: { badge: 'danger', label: 'Overdue', bgColor: 'bg-red-50' },
    due_soon: { badge: 'warning', label: 'Due Soon', bgColor: 'bg-yellow-50' },
    current: { badge: 'success', label: 'Current', bgColor: 'bg-green-50' },
  };

  const config = urgencyConfig[invoice.urgency] || urgencyConfig.current;

  const handleCopyLink = () => {
    if (invoice.payment_link_token) {
      const link = `${window.location.origin}/pay/${invoice.payment_link_token}`;
      navigator.clipboard.writeText(link);
    }
  };

  return (
    <Card className={`p-4 ${config.bgColor}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-600 uppercase tracking-wide font-medium">{invoice.project_name}</p>
          <p className="text-lg font-semibold text-gray-900 mt-0.5">{`PA #${invoice.app_number}`}</p>
        </div>
        <Badge variant={config.badge as 'danger' | 'warning' | 'success' | 'default' | 'secondary' | 'outline'}>
          {config.label}
        </Badge>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex justify-between">
          <span className="text-sm text-gray-600">Amount Due</span>
          <span className="text-sm font-mono font-semibold text-gray-900">{formatCurrency(invoice.amount_due)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-600">Owner</span>
          <span className="text-sm text-gray-900">{invoice.owner_name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-600">Due Date</span>
          <span className="text-sm text-gray-900">
            {invoice.payment_due_date ? formatDate(invoice.payment_due_date) : '—'}
          </span>
        </div>
        {invoice.days_overdue > 0 && (
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">Overdue</span>
            <span className="text-sm font-medium text-red-600">{invoice.days_overdue} days</span>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {invoice.payment_link_token && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopyLink}
              className="flex-1"
            >
              <Copy size={14} className="mr-1" />
              Copy Link
            </Button>
            <Button
              size="sm"
              variant="outline"
              asChild
              className="flex-1"
            >
              <a href={`mailto:${invoice.owner_email}?subject=Payment Reminder - PA #${invoice.app_number}`}>
                <Mail size={14} className="mr-1" />
                Email
              </a>
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

// Payer Pattern Card
interface PayerPatternCardProps {
  payer: PayerPattern;
}

function PayerPatternCard({ payer }: PayerPatternCardProps) {
  const ratingConfig = {
    reliable: { badge: 'success', label: 'Reliable', icon: '⭐' },
    slow: { badge: 'warning', label: 'Slow Payer', icon: '⏱️' },
    very_slow: { badge: 'danger', label: 'Very Slow', icon: '⚠️' },
    new_client: { badge: 'secondary', label: 'New Client', icon: '🆕' },
  };

  const config = ratingConfig[payer.payment_rating] || ratingConfig.new_client;
  const paymentRate = payer.total_invoices > 0 ? ((payer.paid_count / payer.total_invoices) * 100).toFixed(0) : 0;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-600 uppercase tracking-wide font-medium">Payer</p>
          <p className="text-base font-semibold text-gray-900 mt-0.5">{payer.owner_name}</p>
          <p className="text-xs text-gray-500 mt-1 truncate">{payer.owner_email}</p>
        </div>
        <span className="text-2xl">{config.icon}</span>
      </div>

      <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Payment Rate</span>
          <span className="font-semibold text-gray-900">{paymentRate}%</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Total Paid</span>
          <span className="font-mono font-semibold text-gray-900">{formatCurrency(payer.total_paid)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Currently Owed</span>
          <span className="font-mono font-semibold text-gray-900">{formatCurrency(payer.currently_owed)}</span>
        </div>
        {payer.avg_days_from_due && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Avg Days to Pay</span>
            <span className="font-semibold text-gray-900">{Math.round(payer.avg_days_from_due)} days</span>
          </div>
        )}
      </div>

      <Badge variant={config.badge as 'danger' | 'warning' | 'success' | 'default' | 'secondary' | 'outline'} className="w-full text-center justify-center">
        {config.label}
      </Badge>
    </Card>
  );
}

// Main CashFlow Page
export function CashFlow() {
  const { outstanding, forecast, payerPatterns, loading, error } = useCashFlow();

  const kpiData = useMemo(() => {
    if (!forecast || !outstanding) {
      return {
        totalOutstanding: '$0',
        totalOutstandingNum: 0,
        dueIn30Days: '$0',
        overdue: '$0',
        overdueCount: 0,
        expectedThisMonth: '$0',
      };
    }

    const totalOutstandingNum = outstanding.reduce((sum, inv) => sum + inv.amount_due, 0);
    const overdueTotal = outstanding
      .filter((inv) => inv.days_overdue > 0)
      .reduce((sum, inv) => sum + inv.amount_due, 0);
    const overdueCount = outstanding.filter((inv) => inv.days_overdue > 0).length;

    return {
      totalOutstanding: formatCurrency(totalOutstandingNum),
      totalOutstandingNum,
      dueIn30Days: formatCurrency(forecast.summary.total_expected_30d),
      overdue: formatCurrency(overdueTotal),
      overdueCount,
      expectedThisMonth: formatCurrency(forecast.summary.total_expected_30d),
    };
  }, [outstanding, forecast]);

  if (error) {
    return (
      <div className="p-6">
        <PageHeader
          title="Cash Flow Intelligence"
          description="Track, forecast, and collect"
        />
        <div className="mt-8">
          <EmptyState
            icon={<AlertCircle />}
            title="Failed to load cash flow data"
            description={error}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Cash Flow Intelligence"
        description="Track, forecast, and collect"
      />

      {/* KPI Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <KPICard
          label="Total Outstanding"
          value={kpiData.totalOutstanding}
          sublabel="All unpaid invoices"
          isLoading={loading}
          accentColor="orange"
        />
        <KPICard
          label="Due in 30 Days"
          value={kpiData.dueIn30Days}
          sublabel="Expected incoming"
          isLoading={loading}
          accentColor="blue"
        />
        <KPICard
          label="Overdue"
          value={kpiData.overdue}
          sublabel={`${kpiData.overdueCount} invoice${kpiData.overdueCount !== 1 ? 's' : ''}`}
          isLoading={loading}
          accentColor="red"
        />
        <KPICard
          label="Expected This Month"
          value={kpiData.expectedThisMonth}
          sublabel="Based on payment terms"
          isLoading={loading}
          accentColor="green"
        />
      </div>

      {/* Collection Alerts — Priority Priority overdue items with AI follow-up */}
      {outstanding && outstanding.length > 0 && (
        <CollectionAlerts
          overdue={outstanding.filter((inv) => inv.days_overdue > 0)}
          isLoading={loading}
        />
      )}

      {/* 30-Day Forecast Chart */}
      {forecast && forecast.daily_forecast && forecast.daily_forecast.length > 0 && (
        <Card className="p-6 mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">30-Day Cash Flow Forecast</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={forecast.daily_forecast}>
              <defs>
                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8f0" />
              <XAxis
                dataKey="due_date"
                tick={{ fontSize: 12 }}
                stroke="#888888"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="#888888"
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '1px solid #e8e8f0',
                  borderRadius: '8px',
                }}
                formatter={(value) => {
                  if (typeof value === 'number') {
                    return formatCurrency(value);
                  }
                  return value;
                }}
              />
              <Area
                type="monotone"
                dataKey="expected_incoming"
                stroke="#6366f1"
                fillOpacity={1}
                fill="url(#colorIncome)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Outstanding Invoices */}
      <Card className="mt-6">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Outstanding Invoices</h2>
        </div>
        {loading ? (
          <div className="p-6">
            <LoadingSpinner />
          </div>
        ) : outstanding && outstanding.length > 0 ? (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Project</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Pay App</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Owner</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Due Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Urgency</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {outstanding.map((invoice) => (
                    <OutstandingInvoiceRow key={invoice.id} invoice={invoice} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden p-4 space-y-3">
              {outstanding.map((invoice) => (
                <OutstandingInvoiceCard key={invoice.id} invoice={invoice} />
              ))}
            </div>
          </>
        ) : (
          <div className="p-8">
            <EmptyState
              icon={<CheckCircle />}
              title="No outstanding invoices"
              description="You're all caught up! All invoices have been paid."
            />
          </div>
        )}
      </Card>

      {/* Payer Patterns */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Payer Patterns</h2>
        {loading ? (
          <LoadingSpinner />
        ) : payerPatterns && payerPatterns.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {payerPatterns.map((payer, idx) => (
              <PayerPatternCard key={idx} payer={payer} />
            ))}
          </div>
        ) : (
          <Card className="p-8">
            <EmptyState
              icon={<AlertCircle />}
              title="No payer data yet"
              description="Once you send pay applications and receive payments, payer patterns will appear here."
            />
          </Card>
        )}
      </div>

      {/* Risk Flags */}
      {forecast && forecast.risk_flags && forecast.risk_flags.length > 0 && (
        <Card className="p-6 mt-6 border-l-4 border-l-red-500 bg-red-50">
          <div className="flex gap-3">
            <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-red-900 mb-2">Cash Flow Warnings</h3>
              <ul className="space-y-1">
                {forecast.risk_flags.map((flag, idx) => (
                  <li key={idx} className="text-sm text-red-800">
                    • {flag}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
