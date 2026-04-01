import { useState, useEffect, useCallback } from 'react'
import {
  Users,
  FolderOpen,
  FileText,
  DollarSign,
  TrendingUp,
  Shield,
  ShieldOff,
  Trash2,
  Clock,
  Search,
  Crown,
  Gift,
  RefreshCw,
} from 'lucide-react'
import type { AdminStats } from '@/types'
import type { AdminUser } from '@/api/admin'
import * as adminApi from '@/api/admin'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatCurrency,
  formatCompactCurrency,
} from '@/lib/formatters'

// ============================================================================
// KPI Card Component
// ============================================================================

interface KPICardProps {
  icon: React.ReactNode
  label: string
  value: string
  subtext?: string
  isLoading: boolean
}

function KPICard({ icon, label, value, subtext, isLoading }: KPICardProps) {
  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center">
          <div className="text-primary-600">{icon}</div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-muted">{label}</p>
          {isLoading ? (
            <Skeleton className="h-8 w-24 mt-2" />
          ) : (
            <>
              <p className="text-2xl font-bold text-text-primary mt-1 font-mono tabular-nums">
                {value}
              </p>
              {subtext && (
                <p className="text-xs text-text-secondary mt-1">{subtext}</p>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

// ============================================================================
// User Row Component
// ============================================================================

interface UserRowProps {
  user: AdminUser
  onBlock: (id: number, block: boolean) => void
  onDelete: (id: number) => void
  onExtendTrial: (id: number) => void
  onSetFreeOverride: (id: number) => void
  onUpgradeToPro: (id: number) => void
  onResetTrial: (id: number) => void
  actionLoading: number | null
}

function UserRow({
  user,
  onBlock,
  onDelete,
  onExtendTrial,
  onSetFreeOverride,
  onUpgradeToPro,
  onResetTrial,
  actionLoading,
}: UserRowProps) {
  const isBlocked = user.subscription_status === 'canceled'
  const isActionLoading = actionLoading === user.id

  const statusBadge = () => {
    switch (user.subscription_status) {
      case 'active':
        return <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">Pro</Badge>
      case 'trial':
        return <Badge variant="default" className="bg-blue-100 text-blue-800 border-blue-200">Trial</Badge>
      case 'free_override':
        return <Badge variant="default" className="bg-purple-100 text-purple-800 border-purple-200">Free</Badge>
      case 'canceled':
        return <Badge variant="danger">Blocked</Badge>
      case 'past_due':
        return <Badge variant="default" className="bg-amber-100 text-amber-800 border-amber-200">Past Due</Badge>
      default:
        return <Badge variant="outline">{user.subscription_status}</Badge>
    }
  }

  // Calculate days left in trial
  const getDaysLeft = () => {
    if (!user.trial_end_date) return null
    const endDate = new Date(user.trial_end_date)
    const today = new Date()
    const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return daysLeft > 0 ? daysLeft : 0
  }

  const daysLeft = getDaysLeft()

  const planBadge = () => {
    switch (user.subscription_status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 border-green-200">Pro</Badge>
      case 'trial': {
        const days = daysLeft
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200">
            Trial {days !== null ? `(${days}d)` : ''}
          </Badge>
        )
      }
      case 'free_override':
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200">Free Override</Badge>
      case 'canceled':
        return <Badge variant="danger">Blocked</Badge>
      case 'past_due':
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Past Due</Badge>
      default:
        return <Badge variant="outline">{user.subscription_status}</Badge>
    }
  }

  return (
    <tr className="hover:bg-[#fafafe] border-b border-border-primary last:border-0">
      <td className="px-6 py-4 whitespace-nowrap">
        <div>
          <p className="text-sm font-medium text-text-primary">{user.name}</p>
          <p className="text-xs text-text-muted">{user.email}</p>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-text-secondary">
        {user.project_count ?? 0} projects
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-text-secondary">
        {formatCurrency(user.total_billed ?? 0)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {planBadge()}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {statusBadge()}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-1 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onBlock(user.id, !isBlocked)}
            disabled={isActionLoading}
            title={isBlocked ? 'Unblock user' : 'Block user'}
          >
            {isBlocked ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onExtendTrial(user.id)}
            disabled={isActionLoading}
            title="Extend trial +30 days"
          >
            <Clock className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSetFreeOverride(user.id)}
            disabled={isActionLoading}
            title="Set free override"
          >
            <Gift className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUpgradeToPro(user.id)}
            disabled={isActionLoading}
            title="Upgrade to Pro"
          >
            <Crown className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onResetTrial(user.id)}
            disabled={isActionLoading}
            title="Reset trial"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(user.id)}
            disabled={isActionLoading}
            title="Delete user"
            className="text-danger-600 hover:text-danger-700"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ============================================================================
// Admin Dashboard
// ============================================================================

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  // Fetch admin data
  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [statsRes, usersRes] = await Promise.all([
        adminApi.getAdminStats(),
        adminApi.getAdminUsers(),
      ])

      if (statsRes.data) setStats(statsRes.data)
      if (usersRes.data) setUsers(usersRes.data)

      const err = statsRes.error || usersRes.error
      if (err) setError(err)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filter users by search
  const filteredUsers = users.filter((u) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q)
    )
  })

  // Calculate subscription KPIs
  const calculateSubscriptionKpis = () => {
    const trialUsers = users.filter((u) => u.subscription_status === 'trial').length
    const proUsers = users.filter((u) => u.subscription_status === 'active').length
    const freeOverrideUsers = users.filter((u) => u.subscription_status === 'free_override').length

    const today = new Date()
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

    const trialsExpiringThisWeek = users.filter((u) => {
      if (u.subscription_status !== 'trial' || !u.trial_end_date) return false
      const endDate = new Date(u.trial_end_date)
      return endDate >= today && endDate <= weekFromNow
    }).length

    return {
      trialUsers,
      proUsers,
      freeOverrideUsers,
      trialsExpiringThisWeek,
    }
  }

  // Calculate revenue KPIs
  const calculateRevenueKpis = () => {
    const proUsers = users.filter((u) => u.subscription_status === 'active').length
    const mrr = proUsers * 40

    const totalPaidUsers = users.filter(
      (u) => u.subscription_status === 'active' || u.subscription_status === 'free_override' || u.subscription_status === 'past_due'
    ).length
    const conversionRate =
      totalPaidUsers > 0 ? ((proUsers / totalPaidUsers) * 100).toFixed(1) : '0'

    return {
      mrr,
      conversionRate,
    }
  }

  const subscriptionKpis = calculateSubscriptionKpis()
  const revenueKpis = calculateRevenueKpis()

  // User actions
  const handleBlock = async (userId: number, block: boolean) => {
    setActionLoading(userId)
    try {
      await adminApi.toggleBlockUser(userId, block)
      await loadData()
    } catch {
      setError('Failed to update user status')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (userId: number) => {
    if (!window.confirm('Are you sure you want to permanently delete this user?')) return
    setActionLoading(userId)
    try {
      await adminApi.deleteUser(userId)
      setUsers((prev) => prev.filter((u) => u.id !== userId))
    } catch {
      setError('Failed to delete user')
    } finally {
      setActionLoading(null)
    }
  }

  const handleExtendTrial = async (userId: number) => {
    setActionLoading(userId)
    try {
      await adminApi.extendTrial(userId, 30)
      await loadData()
    } catch {
      setError('Failed to extend trial')
    } finally {
      setActionLoading(null)
    }
  }

  const handleSetFreeOverride = async (userId: number) => {
    setActionLoading(userId)
    try {
      await adminApi.setFreeOverride(userId)
      await loadData()
    } catch {
      setError('Failed to set free override')
    } finally {
      setActionLoading(null)
    }
  }

  const handleUpgradeToPro = async (userId: number) => {
    setActionLoading(userId)
    try {
      await adminApi.upgradeToPro(userId)
      await loadData()
    } catch {
      setError('Failed to upgrade user to Pro')
    } finally {
      setActionLoading(null)
    }
  }

  const handleResetTrial = async (userId: number) => {
    setActionLoading(userId)
    try {
      await adminApi.resetTrial(userId)
      await loadData()
    } catch {
      setError('Failed to reset trial')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <PageHeader
        title="Admin Dashboard"
        description="Monitor platform activity and manage users"
        actions={
          <Button variant="outline" onClick={loadData} disabled={isLoading}>
            Refresh
          </Button>
        }
      />

      {/* Error Banner */}
      {error && (
        <div className="rounded-lg bg-danger-50 border border-danger-200 p-4">
          <p className="text-sm text-danger-700">{error}</p>
        </div>
      )}

      {/* KPI Cards — Platform Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={<Users className="w-6 h-6" />}
          label="Total Users"
          value={stats?.users_count.toString() ?? '0'}
          isLoading={isLoading}
        />
        <KPICard
          icon={<FolderOpen className="w-6 h-6" />}
          label="Active Projects"
          value={stats?.projects_count.toString() ?? '0'}
          subtext="Across all users"
          isLoading={isLoading}
        />
        <KPICard
          icon={<FileText className="w-6 h-6" />}
          label="Pay Applications"
          value={stats?.pay_apps_count.toString() ?? '0'}
          subtext={`${stats?.events_today ?? 0} events today`}
          isLoading={isLoading}
        />
        <KPICard
          icon={<TrendingUp className="w-6 h-6" />}
          label="Avg Contract"
          value={formatCompactCurrency(stats?.avg_contract_size ?? 0)}
          isLoading={isLoading}
        />
      </div>

      {/* Revenue KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KPICard
          icon={<DollarSign className="w-6 h-6" />}
          label="Total Pipeline"
          value={formatCompactCurrency(stats?.total_pipeline ?? 0)}
          subtext="Sum of all active contracts"
          isLoading={isLoading}
        />
        <KPICard
          icon={<DollarSign className="w-6 h-6" />}
          label="Total Billed"
          value={formatCompactCurrency(stats?.total_billed ?? 0)}
          subtext="Total payments processed"
          isLoading={isLoading}
        />
      </div>

      {/* Subscription KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={<Users className="w-6 h-6" />}
          label="Trial Users"
          value={subscriptionKpis.trialUsers.toString()}
          isLoading={isLoading}
        />
        <KPICard
          icon={<Crown className="w-6 h-6" />}
          label="Pro Users"
          value={subscriptionKpis.proUsers.toString()}
          isLoading={isLoading}
        />
        <KPICard
          icon={<Gift className="w-6 h-6" />}
          label="Free Override"
          value={subscriptionKpis.freeOverrideUsers.toString()}
          isLoading={isLoading}
        />
        <KPICard
          icon={<Clock className="w-6 h-6" />}
          label="Trials Expiring"
          value={subscriptionKpis.trialsExpiringThisWeek.toString()}
          subtext="This week"
          isLoading={isLoading}
        />
      </div>

      {/* Users Table */}
      <Card className="overflow-hidden">
        <div className="p-6 border-b border-border-primary flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Users</h2>
            <p className="text-sm text-text-secondary mt-1">
              {users.length} total user{users.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded" />
              ))}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-text-muted text-sm">
                {searchQuery ? 'No users match your search' : 'No users found'}
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-[#fafafe]">
                <tr className="border-b border-border-primary">
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                    Projects
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                    Total Billed
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    onBlock={handleBlock}
                    onDelete={handleDelete}
                    onExtendTrial={handleExtendTrial}
                    onSetFreeOverride={handleSetFreeOverride}
                    onUpgradeToPro={handleUpgradeToPro}
                    onResetTrial={handleResetTrial}
                    actionLoading={actionLoading}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Revenue KPIs Section */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-6">Revenue Metrics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-muted">Monthly Recurring Revenue (MRR)</p>
                <p className="text-2xl font-bold text-text-primary font-mono tabular-nums">
                  {formatCurrency(revenueKpis.mrr)}
                </p>
              </div>
            </div>
            <p className="text-xs text-text-secondary mt-2">
              {subscriptionKpis.proUsers} Pro users × $40/month
            </p>
          </div>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-text-muted">Conversion Rate</p>
                <p className="text-2xl font-bold text-text-primary font-mono tabular-nums">
                  {revenueKpis.conversionRate}%
                </p>
              </div>
            </div>
            <p className="text-xs text-text-secondary mt-2">
              Pro users / Total paid users
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
