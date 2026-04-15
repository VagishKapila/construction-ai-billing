import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ChevronDown } from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/contexts/RoleContext'
import { cn } from '@/lib/cn'

/**
 * TopNav component — sticky top bar with role switcher and user menu
 * Height: 56px, shows above main content
 * Left: RoleSwitcher pills (Contractor blue | Vendor orange)
 * Right: Notifications + User avatar with dropdown
 */
export function TopNav() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { role, setRole, isContractor, isVendor } = useRole()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  // Notification count (placeholder — integrate with real notification system)
  const notificationCount = 0

  const getUserInitials = () => {
    if (!user?.name) return '?'
    return user.name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const handleRoleChange = (newRole: 'contractor' | 'vendor') => {
    setRole(newRole)
    // When switching to vendor, navigate to vendor dashboard (if it exists)
    if (newRole === 'vendor') {
      navigate('/vendor')
    }
  }

  return (
    <header
      className={cn(
        'sticky top-0 h-14 bg-white border-b border-[#e2e8f0]',
        'flex items-center justify-between px-6',
        'z-40 shadow-sm',
      )}
    >
      {/* Left: Role Switcher */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => handleRoleChange('contractor')}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-full transition-all',
            isContractor
              ? 'bg-[#dbeafe] text-[#2563eb]'
              : 'bg-[#f0f4fa] text-[#888888] hover:bg-[#e5e9f2]',
          )}
          title="Switch to Contractor mode"
        >
          🏗️ Contractor
        </button>
        <button
          onClick={() => handleRoleChange('vendor')}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-full transition-all',
            isVendor
              ? 'bg-[#fed7aa] text-[#ea6c00]'
              : 'bg-[#f0f4fa] text-[#888888] hover:bg-[#e5e9f2]',
          )}
          title="Switch to Vendor mode"
        >
          🔧 Vendor
        </button>
      </div>

      {/* Right: Notifications + User Menu */}
      <div className="flex items-center gap-4">
        {/* Notification Bell */}
        <button
          className="relative p-2 hover:bg-[#f0f4fa] rounded-lg transition-colors"
          title="Notifications"
        >
          <Bell size={20} className="text-[#555555]" />
          {notificationCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-[#dc2626] text-white text-xs rounded-full flex items-center justify-center font-bold">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </button>

        {/* User Avatar + Dropdown Menu */}
        <DropdownMenu.Root open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenu.Trigger asChild>
            <button
              className={cn(
                'flex items-center gap-3 px-3 py-1.5 rounded-lg',
                'transition-all duration-200',
                'hover:bg-[#f0f4fa]',
                dropdownOpen && 'bg-[#dbeafe]',
              )}
              aria-label={`User menu for ${user?.name || 'User'}`}
              aria-haspopup="menu"
              aria-expanded={dropdownOpen}
            >
              {/* Avatar circle with initials */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2563eb] to-[#3b82f6] flex items-center justify-center">
                <span className="text-white text-xs font-semibold">
                  {getUserInitials()}
                </span>
              </div>

              {/* Name + chevron */}
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
                'min-w-[200px] bg-white rounded-lg border border-[#e2e8f0]',
                'shadow-lg p-1',
                'z-50',
              )}
              align="end"
              sideOffset={8}
            >
              {/* User info header */}
              <div className="px-3 py-2.5 border-b border-[#e2e8f0]">
                <p className="text-sm font-medium text-[#1a1a2e]">
                  {user?.name || 'User'}
                </p>
                <p className="text-xs text-[#888888]">{user?.email}</p>
              </div>

              {/* Settings */}
              <DropdownMenu.Item asChild>
                <button
                  onClick={() => {
                    navigate('/settings')
                    setDropdownOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-sm',
                    'rounded cursor-pointer',
                    'text-[#555555] hover:bg-[#f0f4fa] hover:text-[#1a1a2e]',
                    'transition-colors text-left',
                  )}
                >
                  ⚙️ Settings
                </button>
              </DropdownMenu.Item>

              {/* Logout */}
              <DropdownMenu.Separator className="h-px bg-[#e2e8f0] my-1" />
              <DropdownMenu.Item asChild>
                <button
                  onClick={() => {
                    logout()
                    setDropdownOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-sm',
                    'rounded cursor-pointer',
                    'text-[#dc2626] hover:bg-[#fef2f2]',
                    'transition-colors text-left',
                  )}
                >
                  ← Sign Out
                </button>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  )
}
