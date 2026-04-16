import { useMemo } from 'react';
import {
  CreditCard,
  Clock,
  CheckCircle2,
  AlertCircle,
  Link as LinkIcon,
} from 'lucide-react';
import type { Payment } from '@/types';
import { usePayments } from '@/hooks/usePayments';
import * as paymentsApi from '@/api/payments';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { cn } from '@/lib/cn';

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string;
  isLoading: boolean;
  color: 'green' | 'amber' | 'blue';
}

function KPICard({
  icon,
  label,
  value,
  sublabel,
  isLoading,
  color,
}: KPICardProps) {
  const colorMap = {
    green: 'bg-success-50 text-success-600',
    amber: 'bg-warning-50 text-warning-600',
    blue: 'bg-primary-50 text-primary-600',
  };

  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center',
            colorMap[color]
          )}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-muted">{label}</p>
          {isLoading ? (
            <Skeleton className="h-8 w-32 mt-2" />
          ) : (
            <>
              <p className="text-2xl font-bold text-text-primary mt-1 font-mono tabular-nums">
                {value}
              </p>
              <p className="text-xs text-text-secondary mt-1">{sublabel}</p>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

interface StripeConnectionBannerProps {
  onConnect: () => void;
  isLoading: boolean;
}

function StripeConnectionBanner({
  onConnect,
  isLoading,
}: StripeConnectionBannerProps) {
  return (
    <Card className="p-6 border-primary-200 bg-primary-50">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <h3 className="font-semibold text-text-primary mb-1">
            Connect Stripe to Accept Payments
          </h3>
          <p className="text-sm text-text-secondary">
            Start collecting payments from your clients. Connect your Stripe account to enable ACH
            and credit card payments.
          </p>
        </div>
        <Button
          onClick={onConnect}
          loading={isLoading}
          className="flex-shrink-0"
        >
          <LinkIcon className="w-4 h-4" />
          Connect Now
        </Button>
      </div>
    </Card>
  );
}

interface PaymentRowProps {
  payment: Payment & { project_name?: string };
}

function PaymentRow({ payment }: PaymentRowProps) {
  const statusConfig = {
    pending: { badge: 'warning', label: 'Pending' },
    processing: { badge: 'secondary', label: 'Processing' },
    succeeded: { badge: 'success', label: 'Succeeded' },
    failed: { badge: 'danger', label: 'Failed' },
  };

  const methodConfig = {
    ach: { badge: 'outline', label: 'ACH' },
    card: { badge: 'outline', label: 'Card' },
  };

  const status = statusConfig[payment.payment_status as keyof typeof statusConfig] || {
    badge: 'secondary',
    label: 'Unknown',
  };
  const method =
    methodConfig[payment.payment_method as keyof typeof methodConfig] || {
      badge: 'outline',
      label: 'Unknown',
    };

  return (
    <tr className="border-b border-border hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(payment.created_at)}</td>
      <td className="px-4 py-3 text-sm text-text-primary font-medium">
        {payment.project_name || '—'}
      </td>
      <td className="px-4 py-3 text-sm text-text-primary font-medium">PA #{payment.pay_app_id}</td>
      <td className="px-4 py-3 text-sm text-text-primary font-mono tabular-nums font-semibold">
        {formatCurrency(payment.amount)}
      </td>
      <td className="px-4 py-3 text-sm">
        <Badge
          variant={method.badge as any}
          className="text-xs font-medium"
        >
          {method.label}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm">
        <Badge variant={status.badge as any}>{status.label}</Badge>
      </td>
      <td className="px-4 py-3 text-sm text-text-secondary">
        {payment.payer_name || '—'}
      </td>
    </tr>
  );
}

interface PaymentCardProps {
  payment: Payment & { project_name?: string };
}

function PaymentCard({ payment }: PaymentCardProps) {
  const statusConfig = {
    pending: { badge: 'warning', label: 'Pending' },
    processing: { badge: 'secondary', label: 'Processing' },
    succeeded: { badge: 'success', label: 'Succeeded' },
    failed: { badge: 'danger', label: 'Failed' },
  };

  const methodConfig = {
    ach: { label: 'ACH' },
    card: { label: 'Card' },
  };

  const status = statusConfig[payment.payment_status as keyof typeof statusConfig] || {
    badge: 'secondary',
    label: 'Unknown',
  };
  const method =
    methodConfig[payment.payment_method as keyof typeof methodConfig] || {
      label: 'Unknown',
    };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-muted">Pay App</p>
          <p className="text-lg font-semibold text-text-primary mt-0.5">
            PA #{payment.pay_app_id}
          </p>
        </div>
        <Badge variant={status.badge as any}>{status.label}</Badge>
      </div>

      <div className="space-y-2 mb-3 border-t border-border pt-3">
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Project</span>
          <span className="text-text-primary font-medium">
            {payment.project_name || '—'}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Amount</span>
          <span className="text-text-primary font-mono tabular-nums font-semibold">
            {formatCurrency(payment.amount)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Method</span>
          <span className="text-text-primary font-medium">{method.label}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Date</span>
          <span className="text-text-primary">{formatDate(payment.created_at)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Payer</span>
          <span className="text-text-primary text-right">
            {payment.payer_name || '—'}
          </span>
        </div>
      </div>
    </Card>
  );
}

export function PaymentsDashboard() {
  const { payments, summary, isLoading, error } = usePayments();

  const handleConnectStripe = async () => {
    try {
      const response = await paymentsApi.startStripeConnect();
      if (response.data?.url) {
        window.location.href = response.data.url;
      }
    } catch (err) {
      console.error('Failed to start Stripe Connect:', err);
    }
  };

  const [succeededTotal, pendingTotal, processingTotal] = useMemo(() => {
    if (!payments.length) return [0, 0, 0];

    let succeeded = 0;
    let pending = 0;
    let processing = 0;

    payments.forEach((p) => {
      if (p.payment_status === 'succeeded') {
        succeeded += p.amount;
      } else if (p.payment_status === 'pending') {
        pending += p.amount;
      } else if (p.payment_status === 'processing') {
        processing += p.amount;
      }
    });

    return [succeeded, pending, processing];
  }, [payments]);

  const hasStripeConnected = useMemo(() => {
    // Check if user has a connected Stripe account
    // This would be determined by checking if they can accept payments
    return payments.length > 0 || summary?.total !== undefined;
  }, [payments, summary]);

  if (isLoading && !payments.length) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Payments"
          description="Track payments from your clients"
        />
        <LoadingSpinner text="Loading payment data..." />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <PageHeader
        title="Payments"
        description="Track payments from your clients"
      />

      {/* Stripe Connection Banner */}
      {!hasStripeConnected && (
        <StripeConnectionBanner
          onConnect={handleConnectStripe}
          isLoading={isLoading}
        />
      )}

      {/* Error State */}
      {error && (
        <Card className="p-4 border-danger-200 bg-danger-50">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-danger-900">Error loading payments</p>
              <p className="text-sm text-danger-800 mt-1">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          icon={<CheckCircle2 className="w-5 h-5" />}
          label="Total Received"
          value={formatCurrency(succeededTotal)}
          sublabel={`${payments.filter((p) => p.payment_status === 'succeeded').length} payments`}
          isLoading={isLoading}
          color="green"
        />
        <KPICard
          icon={<Clock className="w-5 h-5" />}
          label="Pending"
          value={formatCurrency(pendingTotal)}
          sublabel={`${payments.filter((p) => p.payment_status === 'pending').length} awaiting`}
          isLoading={isLoading}
          color="amber"
        />
        <KPICard
          icon={<CreditCard className="w-5 h-5" />}
          label="Processing"
          value={formatCurrency(processingTotal)}
          sublabel={`${payments.filter((p) => p.payment_status === 'processing').length} in transit`}
          isLoading={isLoading}
          color="blue"
        />
      </div>

      {/* Payments Table / Card Grid */}
      {payments.length > 0 ? (
        <Card className="overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Pay App
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Method
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Payer
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <PaymentRow
                    key={payment.id}
                    payment={payment}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3 p-4">
            {payments.map((payment) => (
              <PaymentCard
                key={payment.id}
                payment={payment}
              />
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={<CreditCard />}
          title="No Payments Yet"
          description="Payments from your clients will appear here once you send them a payment link and they complete their payment."
        />
      )}
    </div>
  );
}
