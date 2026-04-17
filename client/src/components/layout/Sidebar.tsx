import React, { useMemo, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import {
  CreditCard,
  BarChart3,
  TrendingUp,
  Settings,
  HelpCircle,
  Shield,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  FolderKanban,
  Plus,
  Search,
  AlertCircle,
  Clock,
  Archive,
  CheckCircle2,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

/**
 * Navigation item definition
 */
interface NavItem {
  label: string
  href: string
  icon: ReactNode
  adminOnly?: boolean
}

/**
 * Project shape expected by Sidebar
 */
export interface SidebarProject {
  id: number
  address?: string | null
  name: string
  status?: string | null
}

export interface SidebarProps {
  projects?: SidebarProject[]
  activeProjectId?: number
  onProjectClick?: (id: number) => void
  onNewProject?: () => void
  isCollapsed?: boolean
}

/**
 * Collapsible project section with colored dot header
 */
function ProjectSection({
  title,
  dotColor,
  icon: _SectionIcon,
  projects,
  activeProjectId,
  defaultExpanded = true,
}: {
  title: string
  dotColor: string
  icon?: React.ComponentType<{ size?: number }>
  projects: SidebarProject[]
  activeProjectId?: number
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const location = useLocation()

  if (projects.length === 0) return null

  return (
    <div className="mb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#f8fafc] rounded-lg transition-colors group"
      >
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
        <span className="flex-1 text-left text-[11px] font-semibold uppercase tracking-wider text-[#64748b] group-hover:text-[#1e293b]">
          {title}
        </span>
        <span className="text-[10px] text-[#94a3b8] font-medium mr-1">{projects.length}</span>
        {expanded
          ? <ChevronDown size={12} className="text-[#94a3b8]" />
          : <ChevronRight size={12} className="text-[#94a3b8]" />
        }
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mt-0.5 space-y-0.5 pl-2">
              {projects.map((project) => {
                const projActive =
                  activeProjectId === project.id ||
                  location.pathname.includes(`/projects/${project.id}`)
                return (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all truncate',
                      'border-l-2',
                      projActive
                        ? 'bg-[#eff6ff] border-l-[#2563eb] text-[#2563eb] font-medium'
                        : 'border-l-transparent text-[#475569] hover:bg-[#f8fafc] hover:text-[#1e293b]',
                    )}
                    title={project.name}
                  >
                    <FolderOpen size={13} className="flex-shrink-0" />
                    <span className="truncate">{project.name}</span>
                  </Link>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Sidebar — 260px wide desktop sidebar.
 * Uses project sections: Needs Attention (red), Active (green), Billing Soon (teal), Archived (gray).
 */
export function Sidebar({
  projects: propProjects,
  activeProjectId,
  onProjectClick: _onProjectClick,
  onNewProject: _onNewProject,
  isCollapsed = false,
}: SidebarProps = {}) {
  const location = useLocation()
  const { isAdmin } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')

  // If no projects passed as props, fall back to empty (parent can pass them)
  const allProjects = propProjects ?? []

  // Filtered projects based on search
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return allProjects
    const q = searchQuery.toLowerCase()
    return allProjects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.address && p.address.toLowerCase().includes(q))
    )
  }, [allProjects, searchQuery])

  // Categorise projects into sections
  const needsAttention = useMemo(
    () => filteredProjects.filter((p) => p.status === 'overdue' || p.status === 'lien_alert'),
    [filteredProjects],
  )
  const active = useMemo(
    () =>
      filteredProjects.filter(
        (p) =>
          !p.status ||
          p.status === 'active' ||
          p.status === 'in_progress',
      ),
    [filteredProjects],
  )
  const billingSoon = useMemo(
    () => filteredProjects.filter((p) => p.status === 'billing_due' || p.status === 'pay_due'),
    [filteredProjects],
  )
  const archived = useMemo(
    () => filteredProjects.filter((p) => p.status === 'archived' || p.status === 'completed'),
    [filteredProjects],
  )

  /**
   * Primary nav items
   */
  const primaryNavItems: NavItem[] = useMemo(
    () => [
      { label: 'Projects', href: '/dashboard', icon: <FolderKanban size={20} /> },
      { label: 'Cash Flow', href: '/cash-flow', icon: <TrendingUp size={20} /> },
      { label: 'Payments', href: '/payments', icon: <CreditCard size={20} /> },
      { label: 'Reports', href: '/reports', icon: <BarChart3 size={20} /> },
      ...(isAdmin
        ? [{ label: 'Admin', href: '/admin', icon: <Shield size={20} />, adminOnly: true }]
        : []),
    ],
    [isAdmin],
  )

  const bottomNavItems: NavItem[] = useMemo(
    () => [
      { label: 'Settings', href: '/settings', icon: <Settings size={20} /> },
      { label: 'Help', href: '/help', icon: <HelpCircle size={20} /> },
    ],
    [],
  )

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return location.pathname === '/dashboard' || location.pathname === '/'
    }
    return location.pathname.startsWith(href)
  }

  const renderNavLink = (item: NavItem) => {
    const active = isActive(item.href)
    return (
      <Link
        key={item.href}
        to={item.href}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
          'transition-all duration-200 border-l-4',
          active
            ? 'bg-[#eff6ff] border-l-[#2563eb] text-[#2563eb]'
            : 'border-l-transparent text-[#475569] hover:bg-[#f8fafc] hover:text-[#1e293b]',
        )}
        title={isCollapsed ? item.label : undefined}
      >
        <span className="flex-shrink-0">{item.icon}</span>
        {!isCollapsed && (
          <>
            <span className="flex-1">{item.label}</span>
            {active && <ChevronRight size={16} className="text-[#2563eb]" />}
          </>
        )}
      </Link>
    )
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-white border-r border-[#e2e8f0]',
        'flex flex-col pt-6 pb-4',
        'shadow-[0_4px_24px_rgba(37,99,235,0.08)]',
        isCollapsed ? 'w-[72px]' : 'w-[260px]',
        'hidden md:flex',
        'transition-all duration-300',
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Logo / Brand */}
      <div className={cn('px-4 mb-6 flex items-center', isCollapsed ? 'justify-center' : '')}>
        {!isCollapsed ? (
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-[#2563eb] to-[#3b82f6] rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-white text-sm font-bold">CI</span>
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-[#0f172a]">ConstructInv AI</span>
              <span className="text-[10px] font-medium text-[#2563eb]">Billing Platform</span>
            </div>
          </Link>
        ) : (
          <Link to="/dashboard">
            <div className="w-8 h-8 bg-gradient-to-br from-[#2563eb] to-[#3b82f6] rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">CI</span>
            </div>
          </Link>
        )}
      </div>

      {/* Search + New Project */}
      {!isCollapsed && (
        <div className="px-3 mb-4 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className={cn(
                'w-full pl-8 pr-3 py-2 text-sm border border-[#e2e8f0] rounded-lg',
                'bg-[#f0f4fa] text-[#1e293b] placeholder-[#94a3b8]',
                'focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:bg-white',
                'transition-all',
              )}
            />
          </div>
          <Link
            to="/projects/new"
            className={cn(
              'w-full flex items-center justify-center gap-2 px-3 py-2',
              'text-sm font-semibold text-white',
              'bg-[#2563eb] hover:bg-[#1d4ed8] active:bg-[#1e40af]',
              'rounded-lg transition-colors',
              'shadow-[0_2px_8px_rgba(37,99,235,0.25)]',
            )}
          >
            <Plus size={16} />
            New Project
          </Link>
        </div>
      )}

      {/* Primary Navigation */}
      <nav className="space-y-0.5 px-2 mb-2" aria-label="Primary navigation">
        {primaryNavItems.map(renderNavLink)}
      </nav>

      {/* Project sections — scrollable middle area */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-3 min-h-0">
          {needsAttention.length > 0 && (
            <ProjectSection
              title="Needs Attention"
              dotColor="#dc2626"
              icon={AlertCircle}
              projects={needsAttention}
              activeProjectId={activeProjectId}
              defaultExpanded={true}
            />
          )}
          {active.length > 0 && (
            <ProjectSection
              title="Active"
              dotColor="#00b87a"
              icon={CheckCircle2}
              projects={active}
              activeProjectId={activeProjectId}
              defaultExpanded={true}
            />
          )}
          {billingSoon.length > 0 && (
            <ProjectSection
              title="Billing Soon"
              dotColor="#0891b2"
              icon={Clock}
              projects={billingSoon}
              activeProjectId={activeProjectId}
              defaultExpanded={false}
            />
          )}
          {archived.length > 0 && (
            <ProjectSection
              title="Archived"
              dotColor="#94a3b8"
              icon={Archive}
              projects={archived}
              activeProjectId={activeProjectId}
              defaultExpanded={false}
            />
          )}
          {/* Fallback: if no sections match (e.g. all "active" but none bucketed) */}
          {needsAttention.length === 0 &&
            active.length === 0 &&
            billingSoon.length === 0 &&
            archived.length === 0 &&
            filteredProjects.length > 0 && (
              <div className="space-y-0.5">
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-[#94a3b8] mb-1">
                  All Projects
                </p>
                {filteredProjects.slice(0, 20).map((project) => {
                  const projActive =
                    activeProjectId === project.id ||
                    location.pathname.includes(`/projects/${project.id}`)
                  return (
                    <Link
                      key={project.id}
                      to={`/projects/${project.id}`}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all truncate',
                        'border-l-2',
                        projActive
                          ? 'bg-[#eff6ff] border-l-[#2563eb] text-[#2563eb] font-medium'
                          : 'border-l-transparent text-[#475569] hover:bg-[#f8fafc] hover:text-[#1e293b]',
                      )}
                      title={project.name}
                    >
                      <FolderOpen size={13} className="flex-shrink-0" />
                      <span className="truncate">{project.name}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          {searchQuery && filteredProjects.length === 0 && (
            <p className="px-3 py-2 text-xs text-[#94a3b8] text-center">
              No projects matching "{searchQuery}"
            </p>
          )}
        </div>
      )}

      {/* Collapsed state: spacer */}
      {isCollapsed && <div className="flex-1" />}

      {/* Bottom nav */}
      <nav className="space-y-0.5 px-2 border-t border-[#e2e8f0] pt-3" aria-label="Secondary navigation">
        {bottomNavItems.map(renderNavLink)}
        {!isCollapsed && (
          <p className="px-3 pt-1 text-[10px] text-[#c0cfe0]">ConstructInvoice AI v3</p>
        )}
      </nav>
    </aside>
  )
}
