import { useMemo } from 'react'
import { useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard,
  CreditCard,
  BarChart3,
  Settings,
  HelpCircle,
  Shield,
  ChevronRight,
} from 'lucide-react'
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
 * Sidebar navigation — 260px wide desktop sidebar with icon-only collapsed state
 * Desktop only (hidden on mobile via parent Shell component)
 */
export function Sidebar({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const location = useLocation()
  const { isAdmin } = useAuth()

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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] rounded-lg flex items-center justify-center">
              <span className="text-white text-sm font-bold">CI</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-[#1a1a2e]">
                ConstructInvoice
              </span>
              <span className="text-xs text-[#888888]">AI</span>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className="w-8 h-8 bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">CI</span>
          </div>
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

      {/* Footer section (optional — can be expanded for user profile or additional actions) */}
      <div className="border-t border-[#e8e8f0] pt-4 px-2">
        {/* Placeholder for future user profile mini widget */}
      </div>
    </aside>
  )
}
