import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Menu,
  LogOut,
  Settings,
  User,
  ChevronDown,
} from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/cn'

/**
 * Page title mapping — used for both desktop and mobile
 */
const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/': 'Dashboard',
  '/payments': 'Payments',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/help': 'Help',
  '/admin': 'Admin Dashboard',
}

/**
 * Get current page title based on route
 */
function getPageTitle(pathname: string): string {
  if (pathname in PAGE_TITLES) {
    return PAGE_TITLES[pathname]
  }

  // Try prefix match for nested routes
  for (const [route, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(route) && route !== '/') {
      return title
    }
  }

  return 'ConstructInvoice AI'
}

/**
 * Top bar (64px, sticky)
 * Shows page title (left), hamburger menu (mobile), user menu (right)
 */
export function TopBar({
  onMenuToggle,
}: {
  onMenuToggle?: (open: boolean) => void
}) {
  const location = useLocation()
  const { user, logout } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const pageTitle = getPageTitle(location.pathname)

  /**
   * Generate user initials for avatar
   */
  const getUserInitials = () => {
    if (!user?.name) return '?'
    return user.name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <header
      className={cn(
        'fixed top-0 right-0 h-[64px] bg-white border-b border-[#e8e8f0]',
        'flex items-center justify-between px-4 md:px-6',
        'z-40 shadow-sm',
      )}
      style={{
        left: 'var(--sidebar-left, 0)',
        width: 'var(--topbar-width, 100%)',
      }}
    >
      {/* Left side: hamburger (mobile) + page title */}
      <div className="flex items-center gap-4">
        {/* Mobile hamburger button */}
        <button
          onClick={() => onMenuToggle?.(true)}
          className="md:hidden p-2 hover:bg-[#fafafe] rounded-lg transition-colors"
          aria-label="Toggle sidebar"
          aria-expanded="false"
        >
          <Menu size={20} className="text-[#555555]" />
        </button>

        {/* Page title */}
        <h1 className="text-lg font-semibold text-[#1a1a2e] hidden sm:block">
          {pageTitle}
        </h1>
      </div>

      {/* Right side: user menu */}
      <div className="flex items-center gap-2">
        <DropdownMenu.Root open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenu.Trigger asChild>
            <button
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg',
                'transition-all duration-200',
                'hover:bg-[#fafafe] active:bg-[#f4f4f8]',
                dropdownOpen && 'bg-[#eef2ff]',
              )}
              aria-label={`User menu for ${user?.name || 'User'}`}
              aria-haspopup="menu"
              aria-expanded={dropdownOpen}
            >
              {/* Avatar circle with initials */}
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
                <span className="text-white text-sm font-semibold">
                  {getUserInitials()}
                </span>
              </div>

              {/* Name (hidden on mobile) + chevron */}
              <div className="hidden sm:flex items-center gap-1">
                <span className="text-sm font-medium text-[#1a1a2e]">
                  {user?.name || 'User'}
                </span>
                <ChevronDown
                  size={16}
                  className={cn(
                    'text-[#888888] transition-transform',
                    dropdownOpen && 'rotate-180',
                  )}
                />
              </div>
            </button>
          </DropdownMenu.Trigger>

          {/* Dropdown menu content */}
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className={cn(
                'min-w-[200px] bg-white rounded-lg border border-[#e8e8f0]',
                'shadow-dropdown p-1',
                'z-50',
                'animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2',
              )}
              align="end"
              sideOffset={8}
            >
              {/* User info header */}
              <div className="px-3 py-2.5 border-b border-[#e8e8f0]">
                <p className="text-sm font-medium text-[#1a1a2e]">
                  {user?.name || 'User'}
                </p>
                <p className="text-xs text-[#888888]">{user?.email}</p>
              </div>

              {/* Menu items */}
              <DropdownMenu.Item asChild>
                <a
                  href="/settings"
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 text-sm',
                    'rounded cursor-pointer',
                    'text-[#555555] hover:bg-[#fafafe] hover:text-[#1a1a2e]',
                    'transition-colors',
                  )}
                >
                  <Settings size={16} />
                  <span>Settings</span>
                </a>
              </DropdownMenu.Item>

              <DropdownMenu.Item asChild>
                <a
                  href="/settings#profile"
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 text-sm',
                    'rounded cursor-pointer',
                    'text-[#555555] hover:bg-[#fafafe] hover:text-[#1a1a2e]',
                    'transition-colors',
                  )}
                >
                  <User size={16} />
                  <span>Profile</span>
                </a>
              </DropdownMenu.Item>

              {/* Logout */}
              <DropdownMenu.Separator className="h-px bg-[#e8e8f0] my-1" />
              <DropdownMenu.Item asChild>
                <button
                  onClick={logout}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-sm',
                    'rounded cursor-pointer',
                    'text-[#dc2626] hover:bg-[#fef2f2]',
                    'transition-colors',
                  )}
                >
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  )
}
