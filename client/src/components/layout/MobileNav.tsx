import { useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard,
  CreditCard,
  BarChart3,
  Settings,
  MoreHorizontal,
} from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/cn'
import type { ReactNode } from 'react'

/**
 * Mobile nav tab definition
 */
interface MobileTab {
  label: string
  href: string
  icon: ReactNode
  adminOnly?: boolean
}

/**
 * Mobile bottom tab bar — shown only on mobile (below 768px)
 * Fixed bottom, 44px minimum touch targets, white background
 */
export function MobileNav() {
  const location = useLocation()
  const { isAdmin } = useAuth()

  /**
   * Main tabs for mobile
   * "More" tab opens a dropdown for additional items
   */
  const mainTabs: MobileTab[] = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: <LayoutDashboard size={24} />,
    },
    {
      label: 'Payments',
      href: '/payments',
      icon: <CreditCard size={24} />,
    },
    {
      label: 'Reports',
      href: '/reports',
      icon: <BarChart3 size={24} />,
    },
    {
      label: 'Settings',
      href: '/settings',
      icon: <Settings size={24} />,
    },
  ]

  /**
   * Additional items in "More" menu
   */
  const moreItems: MobileTab[] = [
    {
      label: 'Help',
      href: '/help',
      icon: <HelpIcon size={20} />,
    },
    ...(isAdmin
      ? [
          {
            label: 'Admin',
            href: '/admin',
            icon: <AdminIcon size={20} />,
            adminOnly: true,
          },
        ]
      : []),
  ]

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
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 h-20 md:hidden',
        'bg-white border-t border-[#e8e8f0]',
        'flex items-center justify-between',
        'px-2 safe-area-inset-bottom',
        'z-50',
      )}
      role="navigation"
      aria-label="Mobile navigation"
    >
      {/* Main tabs */}
      <div className="flex items-center justify-between w-full gap-1">
        {mainTabs.map((tab) => {
          const active = isActive(tab.href)

          return (
            <Link
              key={tab.href}
              to={tab.href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-lg',
                'min-h-[44px] transition-colors',
                active
                  ? 'text-[#6366f1]'
                  : 'text-[#888888] hover:text-[#555555]',
              )}
              title={tab.label}
            >
              <span className="flex items-center justify-center">
                {tab.icon}
              </span>
              <span className="text-xs font-medium leading-none">
                {tab.label}
              </span>
            </Link>
          )
        })}

        {/* More menu (dropdown) */}
        {moreItems.length > 0 && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-lg',
                  'min-h-[44px] transition-colors',
                  'text-[#888888] hover:text-[#555555]',
                )}
                aria-label="More options"
                aria-haspopup="menu"
              >
                <span className="flex items-center justify-center">
                  <MoreHorizontal size={24} />
                </span>
                <span className="text-xs font-medium leading-none">More</span>
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className={cn(
                  'min-w-[160px] bg-white rounded-lg border border-[#e8e8f0]',
                  'shadow-dropdown p-1',
                  'z-50',
                  'animate-in fade-in-0 zoom-in-95 data-[side=top]:slide-in-from-bottom-2',
                )}
                align="end"
                side="top"
                sideOffset={8}
              >
                {moreItems.map((item) => {
                  const active = isActive(item.href)

                  return (
                    <DropdownMenu.Item key={item.href} asChild>
                      <Link
                        to={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 text-sm rounded',
                          'transition-colors',
                          active
                            ? 'bg-[#eef2ff] text-[#6366f1]'
                            : 'text-[#555555] hover:bg-[#fafafe] hover:text-[#1a1a2e]',
                        )}
                      >
                        <span className="flex items-center">{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    </DropdownMenu.Item>
                  )
                })}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}
      </div>
    </nav>
  )
}

/**
 * Helper icon components (for items that don't have lucide equivalents in main tabs)
 */
function HelpIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

function AdminIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
    </svg>
  )
}
