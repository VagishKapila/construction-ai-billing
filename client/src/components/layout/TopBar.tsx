import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Menu,
  LogOut,
  Settings,
  User,
  ChevronDown,
} from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/contexts/RoleContext'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/cn'

/**
 * Page title mapping — used for both desktop and mobile
 */

/**
 * Top bar (64px, sticky)
 * Shows page title (left), hamburger menu (mobile), user menu (right)
 */
export function TopBar({
  onMenuToggle,
}: {
  onMenuToggle?: (open: boolean) => void
}) {
  const { user, logout } = useAuth()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { isContractor, isVendor, setRole } = useRole()
  const navigate = useNavigate()

  const handleRole = (role: 'contractor' | 'vendor') => {
    setRole(role)
    navigate(role === 'vendor' ? '/vendor' : '/dashboard')
  }

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
        'fixed top-0 h-[64px] bg-white border-b border-[#e8e8f0]',
        'flex items-center justify-between px-4 md:px-6',
        'z-40 shadow-sm',
        'left-0 w-full',           // Mobile: full width
        'md:left-[260px] md:w-[calc(100%-260px)]', // Desktop: offset by sidebar
      )}
    >
      {/* Left: hamburger (mobile) + role switcher pills */}
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          onClick={() => onMenuToggle?.(true)}
          className="md:hidden p-2 hover:bg-[#fafafe] rounded-lg transition-colors"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} className="text-[#555555]" />
        </button>

        {/* Role switcher — inline with logo row */}
        <div className="hidden md:flex items-center gap-1 bg-[#f1f5f9] p-1 rounded-lg">
          <button
            onClick={() => handleRole('contractor')}
            className={isContractor
              ? 'px-3 py-1 text-sm font-semibold rounded-md bg-white text-[#2563eb] shadow-sm'
              : 'px-3 py-1 text-sm font-medium rounded-md text-[#64748b] hover:text-[#1e293b]'
            }
          >🏗️ Contractor</button>
          <button
            onClick={() => handleRole('vendor')}
            className={isVendor
              ? 'px-3 py-1 text-sm font-semibold rounded-md bg-[#ea6c00] text-white shadow-sm'
              : 'px-3 py-1 text-sm font-medium rounded-md text-[#64748b] hover:text-[#1e293b]'
            }
          >🔧 Vendor</button>
        </div>
      </div>

      {/* Right: bell + user menu */}
      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <button className="p-2 hover:bg-[#fafafe] rounded-lg transition-colors relative" title="Notifications">
          <span className="text-lg">🔔</span>
        </button>
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
                <Link
                  to="/settings"
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 text-sm',
                    'rounded cursor-pointer',
                    'text-[#555555] hover:bg-[#fafafe] hover:text-[#1a1a2e]',
                    'transition-colors',
                  )}
                >
                  <Settings size={16} />
                  <span>Settings</span>
                </Link>
              </DropdownMenu.Item>

              <DropdownMenu.Item asChild>
                <Link
                  to="/settings"
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 text-sm',
                    'rounded cursor-pointer',
                    'text-[#555555] hover:bg-[#fafafe] hover:text-[#1a1a2e]',
                    'transition-colors',
                  )}
                >
                  <User size={16} />
                  <span>Profile</span>
                </Link>
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
