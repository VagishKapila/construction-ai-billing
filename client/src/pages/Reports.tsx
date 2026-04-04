import { useState, useMemo } from 'react';
import {
  Download,
  FileText,
  TrendingUp,
  AlertCircle,
  Filter as FilterIcon,
} from 'lucide-react';
import type { PayAppReport } from '@/api/reports';
import { useReports } from '@/hooks/useReports';
import { useProjects } from '@/hooks/useProjects';
import type { ReportFilters } from '@/api/reports';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { formatCurrency, formatDate, formatPercent } from '@/lib/formatters';

interface KPICardProps {
  label: string;
  value: string;
  sublabel: string;
  isLoading: boolean;
}

function KPICard({ label, value, sublabel, isLoading }: KPICardProps) {
  return (
    <Card className="p-6">
      <p className="text-sm font-medium text-text-muted">{label}</p>
      {isLoading ? (
        <Skeleton className="h-8 w-40 mt-2" />
      ) : (
        <>
          <p className="text-2xl font-bold text-text-primary mt-1 font-mono tabular-nums">
            {value}
          </p>
          <p className="text-xs text-text-secondary mt-1">{sublabel}</p>
        </>
      )}
    </Card>
  );
}

interface PayAppRowProps {
  row: PayAppReport;
}

function PayAppRow({ row }: PayAppRowProps) {
  const statusConfig: Record<string, { badge: string; label: string }> = {
    draft: { badge: 'secondary', label: 'Draft' },
    submitted: { badge: 'warning', label: 'Submitted' },
    paid: { badge: 'success', label: 'Paid' },
  };

  const status = statusConfig[row.status] || { badge: 'secondary', label: 'Unknown' };

  return (
    <tr className="border-b border-border hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm text-text-primary font-medium">{`PA #${row.app_number}`}</td>
      <td className="px-4 py-3 text-sm text-text-secondary">{row.project_name}</td>
      <td className="px-4 py-3 text-sm text-text-secondary">{row.period_label}</td>
      <td className="px-4 py-3 text-sm text-text-primary font-mono tabular-nums font-semibold">
        {formatCurrency(row.amount_due)}
      </td>
      <td className="px-4 py-3 text-sm">
        <Badge variant={status.badge as 'secondary' | 'success' | 'warning' | 'danger' | 'default' | 'outline'}>{status.label}</Badge>
      </td>
      <td className="px-4 py-3 text-sm text-text-secondary">
        {row.submitted_at ? formatDate(row.submitted_at) : '—'}
      </td>
    </tr>
  );
}

interface PayAppCardProps {
  row: PayAppReport;
}

function PayAppCard({ row }: PayAppCardProps) {
  const statusConfig: Record<string, { badge: string; label: string }> = {
    draft: { badge: 'secondary', label: 'Draft' },
    submitted: { badge: 'warning', label: 'Submitted' },
    paid: { badge: 'success', label: 'Paid' },
  };

  const status = statusConfig[row.status] || { badge: 'secondary', label: 'Unknown' };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-muted uppercase tracking-wide font-medium">Pay App</p>
          <p className="text-lg font-semibold text-text-primary mt-0.5">{`PA #${row.app_number}`}</p>
        </div>
        <Badge variant={status.badge as 'secondary' | 'success' | 'warning' | 'danger' | 'default' | 'outline'}>{status.label}</Badge>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Project</span>
          <span className="text-text-primary font-medium text-right">{row.project_name}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Period</span>
          <span className="text-text-primary">{row.period_label}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Amount Due</span>
          <span className="text-text-primary font-mono tabular-nums font-semibold">
            {formatCurrency(row.amount_due)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Submitted</span>
          <span className="text-text-primary">
            {row.submitted_at ? formatDate(row.submitted_at) : '—'}
          </span>
        </div>
      </div>
    </Card>
  );
}

export function Reports() {
  const { payAppRows, isLoading, error, setFilters, exportCSV, exportPDF } =
    useReports();
  const { projects } = useProjects();

  const [localFilters, setLocalFilters] = useState<ReportFilters>({});
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const handleApplyFilters = () => {
    setFilters(localFilters);
  };

  const handleClearFilters = () => {
    setLocalFilters({});
    setFilters({});
  };

  const handleExportCSV = async () => {
    try {
      setIsExportingCSV(true);
      await exportCSV();
    } finally {
      setIsExportingCSV(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      setIsExportingPDF(true);
      await exportPDF();
    } finally {
      setIsExportingPDF(false);
    }
  };

  // Calculate summary metrics from filtered pay apps
  const summaryMetrics = useMemo(() => {
    if (!payAppRows.length) {
      return {
        totalBilled: 0,
        outstanding: 0,
        collectionRate: 0,
      };
    }

    const totalBilled = payAppRows.reduce((sum, row) => sum + row.amount_due, 0);
    const paid = payAppRows.reduce((sum, row) => {
      if (row.status === 'paid') {
        return sum + row.amount_due;
      }
      return sum;
    }, 0);
    const outstanding = totalBilled - paid;
    const collectionRate = totalBilled > 0 ? (paid / totalBilled) * 100 : 0;

    return {
      totalBilled,
      outstanding,
      collectionRate,
    };
  }, [payAppRows]);

  if (isLoading && !payAppRows.length) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Reports"
          description="Billing reports and analytics"
        />
        <LoadingSpinner text="Loading reports..." />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <PageHeader
        title="Reports"
        description="Billing reports and analytics"
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              loading={isExportingCSV}
              disabled={!payAppRows.length}
            >
              <FileText className="w-4 h-4" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportPDF}
              loading={isExportingPDF}
              disabled={!payAppRows.length}
            >
              <Download className="w-4 h-4" />
              PDF
            </Button>
          </div>
        }
      />

      {/* Filter Card */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <FilterIcon className="w-5 h-5 text-text-muted" />
          <h3 className="font-semibold text-text-primary">Filters</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">From Date</label>
            <Input
              type="date"
              value={localFilters.from || ''}
              onChange={(e) =>
                setLocalFilters({ ...localFilters, from: e.target.value || undefined })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">To Date</label>
            <Input
              type="date"
              value={localFilters.to || ''}
              onChange={(e) =>
                setLocalFilters({ ...localFilters, to: e.target.value || undefined })
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Project</label>
            <select
              value={localFilters.project_id || ''}
              onChange={(e) =>
                setLocalFilters({
                  ...localFilters,
                  project_id: e.target.value ? parseInt(e.target.value) : undefined,
                })
              }
              className="w-full h-10 px-3 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary bg-white"
            >
              <option value="">All Projects</option>
              {projects.map((project) => (
                <option
                  key={project.id}
                  value={project.id}
                >
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Status</label>
            <select
              value={localFilters.status || ''}
              onChange={(e) =>
                setLocalFilters({ ...localFilters, status: e.target.value || undefined })
              }
              className="w-full h-10 px-3 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-text-primary bg-white"
            >
              <option value="">All</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="paid">Paid</option>
            </select>
          </div>

          <div className="flex gap-2 items-end">
            <Button
              onClick={handleApplyFilters}
              size="sm"
              className="flex-1"
            >
              Apply
            </Button>
            <Button
              variant="ghost"
              onClick={handleClearFilters}
              size="sm"
              className="flex-shrink-0"
            >
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="p-4 border-danger-200 bg-danger-50">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-danger-900">Error loading reports</p>
              <p className="text-sm text-danger-800 mt-1">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard
          label="Total Billed"
          value={formatCurrency(summaryMetrics.totalBilled)}
          sublabel={`${payAppRows.length} pay applications`}
          isLoading={isLoading}
        />
        <KPICard
          label="Outstanding"
          value={formatCurrency(summaryMetrics.outstanding)}
          sublabel={`${payAppRows.filter((p) => p.status !== 'paid').length} unpaid`}
          isLoading={isLoading}
        />
        <KPICard
          label="Collection Rate"
          value={formatPercent(summaryMetrics.collectionRate, 1)}
          sublabel={`Of total billed`}
          isLoading={isLoading}
        />
      </div>

      {/* Pay Applications Table / Card Grid */}
      {payAppRows.length > 0 ? (
        <Card className="overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">
                    App
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Period
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Amount Due
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">
                    Submitted
                  </th>
                </tr>
              </thead>
              <tbody>
                {payAppRows.map((row) => (
                  <PayAppRow
                    key={row.id}
                    row={row}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3 p-4">
            {payAppRows.map((row) => (
              <PayAppCard
                key={row.id}
                row={row}
              />
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={TrendingUp}
          title="No Pay Applications"
          description="No pay applications match your filter criteria. Adjust your filters or create a new pay application to get started."
        />
      )}
    </div>
  );
}
