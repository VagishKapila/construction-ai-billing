import { useMemo, useState } from 'react'
import { useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard,
  CreditCard,
  BarChart3,
  TrendingUp,
  Settings,
  HelpCircle,
  Shield,
  ChevronRight,
  ChevronDown,
  FolderOpen,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useProjects } from '@/hooks/useProjects'
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
 * Sidebar navigation — 260px wide desktop sidebar with icon-only collapsed state
 * Desktop only (hidden on mobile via parent Shell component)
 */
export function Sidebar({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const location = useLocation()
  const { isAdmin } = useAuth()
  const { projects } = useProjects()
  const [projectsExpanded, setProjectsExpanded] = useState(true)

  /**
   * Navigation items
   * Dashboard IS the project list — no separate Projects page
   */
  const navItems: NavItem[] = useMemo(
    () => [
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: <LayoutDashboard size={20} />,
      },
      {
        label: 'Payments',
        href: '/payments',
        icon: <CreditCard size={20} />,
      },
      {
        label: 'Reports',
        href: '/reports',
        icon: <BarChart3 size={20} />,
      },
      {
        label: 'Cash Flow',
        href: '/cash-flow',
        icon: <TrendingUp size={20} />,
      },
      {
        label: 'Settings',
        href: '/settings',
        icon: <Settings size={20} />,
      },
      {
        label: 'Help',
        href: '/help',
        icon: <HelpCircle size={20} />,
      },
      ...(isAdmin
        ? [
            {
              label: 'Admin',
              href: '/admin',
              icon: <Shield size={20} />,
              adminOnly: true,
            },
          ]
        : []),
    ],
    [isAdmin],
  )

  /**
   * Check if route is active
   */
  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return location.pathname === '/dashboard' || location.pathname === '/'
    }
    return location.pathname.startsWith(href)
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen bg-white border-r border-[#e8e8f0]',
        'flex flex-col pt-6 pb-4 shadow-sm',
        isCollapsed ? 'w-[72px]' : 'w-[260px]',
        'hidden md:flex', // Desktop only
        'transition-all duration-300',
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Logo / Brand */}
      <div
        className={cn(
          'px-4 mb-8 flex items-center justify-center',
          isCollapsed ? 'h-10' : '',
        )}
      >
        {!isCollapsed && (
          <Link to="/dashboard" className="flex items-center gap-2">
            <img src="/varshyl-logo.png" alt="ConstructInvoice AI" className="h-9 w-auto" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-[#1a1a2e]">
                ConstructInvoice
              </span>
              <span className="text-[10px] font-medium text-transparent bg-clip-text bg-gradient-to-r from-[#2563eb] to-[#3b82f6]">AI</span>
            </div>
          </Link>
        )}
        {isCollapsed && (
          <Link to="/dashboard">
            <img src="/varshyl-logo.png" alt="CI" className="h-8 w-auto" />
          </Link>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 space-y-1 px-2">
        {navItems.map((item) => {
          const active = isActive(item.href)

          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium',
                'transition-all duration-200',
                'border-l-4',
                active
                  ? 'bg-[#eef2ff] border-l-[#6366f1] text-[#6366f1]'
                  : 'border-l-transparent text-[#555555] hover:bg-[#fafafe] hover:text-[#1a1a2e]',
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!isCollapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {active && (
                    <ChevronRight size={16} className="text-[#6366f1]" />
                  )}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Project List — expandable, matching old app.html sidebar */}
      {!isCollapsed && projects.length > 0 && (
        <div className="border-t border-[#e8e8f0] pt-3 px-2 overflow-y-auto flex-shrink min-h-0" style={{ maxHeight: '40vh' }}>
          <button
            onClick={() => setProjectsExpanded(!projectsExpanded)}
            className="flex items-center gap-1 px-3 py-1 text-[10px] font-semibold text-[#888] uppercase tracking-wider w-full hover:text-[#555]"
          >
            {projectsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Projects ({projects.length})
          </button>
          {projectsExpanded && (
            <div className="mt-1 space-y-0.5">
              {projects.slice(0, 15).map((project) => {
                const projActive = location.pathname.includes(`/projects/${project.id}`)
                return (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-colors truncate',
                      projActive
                        ? 'bg-[#eef2ff] text-[#6366f1] font-medium'
                        : 'text-[#666] hover:bg-[#fafafe] hover:text-[#333]',
                    )}
                    title={project.name}
                  >
                    <FolderOpen size={14} className="flex-shrink-0" />
                    <span className="truncate">{project.name}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-[#e8e8f0] pt-3 px-2">
        {/* Version indicator */}
        {!isCollapsed && (
          <div className="px-3 py-1 text-[10px] text-[#aaa]">
            v2.0 — Rev 2
          </div>
        )}
      </div>
    </aside>
  )
}
