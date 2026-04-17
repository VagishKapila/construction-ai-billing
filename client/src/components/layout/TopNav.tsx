import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, Settings, HelpCircle, LogOut, ChevronDown, User } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/contexts/RoleContext'
import { cn } from '@/lib/cn'

export interface TopNavProps {
  user?: { name?: string; email: string } | null
  notificationCount?: number
  onSettings?: () => void
  onSignOut?: () => void
}

/**
 * Notification item shape
 */
interface Notification {
  id: string
  message: string
  time: string
  read: boolean
}

/**
 * TopNav — role switcher (left) + notification bell + user avatar (right)
 * Sits across the full width above the main content area (right of sidebar on desktop).
 */
export function TopNav({
  notificationCount = 0,
  onSettings,
  onSignOut,
}: TopNavProps) {
  const { user, logout } = useAuth()
  const { isContractor, isVendor, setRole } = useRole()
  const navigate = useNavigate()

  const [bellOpen, setBellOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)
  const userRef = useRef<HTMLDivElement>(null)

  // Sample notifications — in production these would come from an API
  const notifications: Notification[] = []

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false)
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setUserOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleRole = (role: 'contractor' | 'vendor') => {
    setRole(role)
    navigate(role === 'vendor' ? '/vendor' : '/dashboard')
  }

  const handleSignOut = () => {
    setUserOpen(false)
    if (onSignOut) {
      onSignOut()
    } else {
      logout()
    }
  }

  const handleSettings = () => {
    setUserOpen(false)
    if (onSettings) {
      onSettings()
    } else {
      navigate('/settings')
    }
  }

  const getUserInitials = () => {
    const name = user?.name
    if (!name) return '?'
    return name
      .split(' ')
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const unreadCount = notificationCount || notifications.filter((n) => !n.read).length

  return (
    <header
      className={cn(
        'fixed top-0 h-[64px] bg-white border-b border-[#e2e8f0]',
        'flex items-center justify-between px-4 md:px-6',
        'z-40',
        'shadow-[0_1px_3px_rgba(0,0,0,0.05)]',
        // Desktop: offset by sidebar
        'left-0 right-0 md:left-[260px]',
      )}
    >
      {/* Left: Role Switcher */}
      <div className="flex items-center gap-1 bg-[#f1f5f9] p-1 rounded-xl">
        <button
          onClick={() => handleRole('contractor')}
          className={cn(
            'px-3 py-1.5 text-sm font-semibold rounded-lg transition-all duration-200',
            isContractor
              ? 'bg-white text-[#2563eb] shadow-sm'
              : 'text-[#64748b] hover:text-[#0f172a]',
          )}
          aria-pressed={isContractor}
        >
          🏗️ Contractor
        </button>
        <button
          onClick={() => handleRole('vendor')}
          className={cn(
            'px-3 py-1.5 text-sm font-semibold rounded-lg transition-all duration-200',
            isVendor
              ? 'bg-[#ea6c00] text-white shadow-sm'
              : 'text-[#64748b] hover:text-[#0f172a]',
          )}
          aria-pressed={isVendor}
        >
          🔧 Vendor
        </button>
      </div>

      {/* Right: Bell + User */}
      <div className="flex items-center gap-2">
        {/* Notification Bell */}
        <div ref={bellRef} className="relative">
          <button
            onClick={() => setBellOpen(!bellOpen)}
            className={cn(
              'relative p-2 rounded-lg transition-colors',
              bellOpen ? 'bg-[#eff6ff]' : 'hover:bg-[#f8fafc]',
            )}
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            aria-haspopup="true"
            aria-expanded={bellOpen}
          >
            <Bell size={20} className="text-[#475569]" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#dc2626] rounded-full" />
            )}
          </button>

          <AnimatePresence>
            {bellOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'absolute right-0 top-full mt-2 w-80',
                  'bg-white rounded-xl border border-[#e2e8f0]',
                  'shadow-[0_8px_32px_rgba(37,99,235,0.12)]',
                  'z-50 overflow-hidden',
                )}
                role="dialog"
                aria-label="Notifications"
              >
                <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#0f172a]">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="text-xs text-[#2563eb] font-medium">{unreadCount} new</span>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Bell size={24} className="mx-auto text-[#cbd5e1] mb-2" />
                    <p className="text-sm text-[#94a3b8]">No new notifications</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#f1f5f9]">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={cn(
                          'px-4 py-3 text-sm',
                          !n.read && 'bg-[#eff6ff]',
                        )}
                      >
                        <p className="text-[#1e293b]">{n.message}</p>
                        <p className="text-[#94a3b8] text-xs mt-0.5">{n.time}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User Avatar + Dropdown */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => setUserOpen(!userOpen)}
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl',
              'transition-all duration-200',
              userOpen ? 'bg-[#eff6ff]' : 'hover:bg-[#f8fafc]',
            )}
            aria-label={`User menu — ${user?.name || user?.email}`}
            aria-haspopup="menu"
            aria-expanded={userOpen}
          >
            {/* Avatar circle */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2563eb] to-[#6366f1] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">{getUserInitials()}</span>
            </div>
            {/* Name (hidden on small screens) */}
            <span className="hidden sm:block text-sm font-medium text-[#1e293b] max-w-[120px] truncate">
              {user?.name || user?.email}
            </span>
            <ChevronDown
              size={14}
              className={cn(
                'text-[#94a3b8] transition-transform hidden sm:block',
                userOpen && 'rotate-180',
              )}
            />
          </button>

          <AnimatePresence>
            {userOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'absolute right-0 top-full mt-2 w-56',
                  'bg-white rounded-xl border border-[#e2e8f0]',
                  'shadow-[0_8px_32px_rgba(37,99,235,0.12)]',
                  'z-50 overflow-hidden',
                )}
                role="menu"
              >
                {/* User info */}
                <div className="px-4 py-3 border-b border-[#e2e8f0]">
                  <p className="text-sm font-semibold text-[#0f172a] truncate">
                    {user?.name || 'User'}
                  </p>
                  <p className="text-xs text-[#64748b] truncate">{user?.email}</p>
                </div>

                {/* Menu items */}
                <div className="p-1">
                  <button
                    onClick={handleSettings}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-[#475569] hover:bg-[#f8fafc] hover:text-[#1e293b] rounded-lg transition-colors"
                    role="menuitem"
                  >
                    <Settings size={15} />
                    Settings
                  </button>

                  <Link
                    to="/settings"
                    onClick={() => setUserOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-[#475569] hover:bg-[#f8fafc] hover:text-[#1e293b] rounded-lg transition-colors"
                    role="menuitem"
                  >
                    <User size={15} />
                    Profile
                  </Link>

                  <Link
                    to="/help"
                    onClick={() => setUserOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-[#475569] hover:bg-[#f8fafc] hover:text-[#1e293b] rounded-lg transition-colors"
                    role="menuitem"
                  >
                    <HelpCircle size={15} />
                    Help
                  </Link>

                  <div className="h-px bg-[#e2e8f0] my-1" />

                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-[#dc2626] hover:bg-[#fef2f2] rounded-lg transition-colors"
                    role="menuitem"
                  >
                    <LogOut size={15} />
                    Sign Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
