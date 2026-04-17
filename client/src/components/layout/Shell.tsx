import React, { useState } from 'react'
import { X, LayoutDashboard, CreditCard, BarChart3, TrendingUp, Settings, HelpCircle, Shield } from 'lucide-react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { MobileNav } from './MobileNav'
import { AIChatWidget } from '@/components/ai'
import { TrialBanner } from '@/components/trial/TrialBanner'
import { UpgradeModal } from '@/components/trial/UpgradeModal'
import { UpgradeNudge } from '@/components/trial/UpgradeNudge'
import { InstallPrompt } from '@/components/pwa'
import { RoleProvider } from '@/contexts/RoleContext'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/cn'

/**
 * Main layout shell
 * Combines:
 * - Desktop sidebar (left, 260px)
 * - Desktop top nav (sticky, 56px) — role switcher + user menu
 * - Mobile top bar (sticky, 64px) — hamburger + title + user
 * - Mobile bottom nav (mobile only, 80px with safe area)
 * - Content area with proper padding and scrolling
 * - Mobile overlay sidebar (hamburger menu)
 * - Role context provider for role-aware navigation
 */
export function Shell({ children }: { children?: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)

  return (
    <RoleProvider>
      <div className="min-h-screen bg-[#f0f4fa]">
        {/* Desktop Sidebar */}
        <Sidebar isCollapsed={false} />

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className={cn(
              'fixed inset-0 bg-black/50 z-30 md:hidden',
              'transition-opacity duration-200',
            )}
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />

          {/* Mobile sidebar panel */}
          <div
            className={cn(
              'fixed left-0 top-0 h-screen w-[260px] bg-white z-40',
              'flex flex-col border-r border-[#e8e8f0]',
              'animate-in slide-in-from-left-0 duration-300',
            )}
          >
            {/* Close button */}
            <div className="p-4 border-b border-[#e8e8f0] flex items-center justify-between">
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
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 hover:bg-[#fafafe] rounded transition-colors"
                aria-label="Close sidebar"
              >
                <X size={20} className="text-[#555555]" />
              </button>
            </div>

            {/* Navigation items (mobile version — inline links matching Sidebar nav) */}
            <MobileOverlayNav onClose={() => setSidebarOpen(false)} />
          </div>
        </>
      )}

      {/* Mobile Top Bar (hamburger + title + user) */}
      <TopBar
        onMenuToggle={(open) => setSidebarOpen(open)}
      />

      {/* Trial Banner — shows above content when trial nearing expiry */}
      <div className="md:ml-[260px] pt-[64px]">
        <TrialBanner onUpgradeClick={() => setUpgradeModalOpen(true)} />
      </div>

      {/* Main Content Area */}
      <main
        className={cn(
          'pt-0 pb-20 md:pb-4',
          'md:ml-[260px] transition-all duration-300',
          'overflow-x-hidden',
        )}
      >
        {/* Page content container with padding */}
        <div className="h-full px-4 sm:px-6 md:px-8 py-4 md:py-6 max-w-full">
          {children || <Outlet />}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNav />

      {/* AI Chat Widget */}
      <AIChatWidget />

      {/* Upgrade Modal — triggered by trial banner or nudge */}
      <UpgradeModal isOpen={upgradeModalOpen} onClose={() => setUpgradeModalOpen(false)} />

      {/* Upgrade Nudge Toast — subtle bottom-right prompt */}
      <UpgradeNudge onUpgradeClick={() => setUpgradeModalOpen(true)} />

      {/* PWA Install Prompt — shows 30s after mobile page load */}
      <InstallPrompt />
    </div>
    </RoleProvider>
  )
}

/**
 * Nav links for the mobile overlay sidebar panel
 * Mirrors the Sidebar nav items but renders as a flex column (no fixed positioning)
 */
function MobileOverlayNav({ onClose }: { onClose: () => void }) {
  const location = useLocation()
  const { isAdmin } = useAuth()

  const isActive = (href: string) =>
    href === '/dashboard'
      ? location.pathname === '/dashboard' || location.pathname === '/'
      : location.pathname.startsWith(href)

  const navItems = [
    { label: 'Projects', href: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { label: 'Cash Flow', href: '/cash-flow', icon: <TrendingUp size={20} /> },
    { label: 'Payments', href: '/payments', icon: <CreditCard size={20} /> },
    { label: 'Reports', href: '/reports', icon: <BarChart3 size={20} /> },
    ...(isAdmin ? [{ label: 'Admin', href: '/admin', icon: <Shield size={20} /> }] : []),
    { label: 'Settings', href: '/settings', icon: <Settings size={20} /> },
    { label: 'Help', href: '/help', icon: <HelpCircle size={20} /> },
  ]

  return (
    <nav className="flex-1 flex flex-col gap-1 px-2 py-4" aria-label="Mobile navigation">
      {navItems.map((item) => {
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            to={item.href}
            onClick={onClose}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              'border-l-4',
              active
                ? 'bg-[#eef2ff] border-l-[#6366f1] text-[#6366f1]'
                : 'border-l-transparent text-[#555555] hover:bg-[#fafafe] hover:text-[#1a1a2e]',
            )}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

