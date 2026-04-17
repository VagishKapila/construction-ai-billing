import React, { useState } from 'react'
import { X, LayoutDashboard, CreditCard, BarChart3, TrendingUp, Settings, HelpCircle, Shield } from 'lucide-react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopNav } from './TopNav'
import { TopBar } from './TopBar'
import { MobileNav } from './MobileNav'
import { AIChatWidget } from '@/components/ai'
import { TrialBanner } from '@/components/trial/TrialBanner'
import { UpgradeModal } from '@/components/trial/UpgradeModal'
import { UpgradeNudge } from '@/components/trial/UpgradeNudge'
import { InstallPrompt } from '@/components/pwa'
import { RoleProvider } from '@/contexts/RoleContext'
import { useAuth } from '@/contexts/AuthContext'
import { useProjects } from '@/hooks/useProjects'
import { cn } from '@/lib/cn'

/**
 * Main layout shell
 *
 * Layout structure:
 * - Desktop sidebar (fixed left, 260px) — Sidebar component
 * - Top navigation bar (fixed top, 64px) — TopNav on desktop, TopBar on mobile
 * - Main content area (offset by sidebar + topnav) — bg-[#f0f4fa]
 * - Mobile: hamburger opens sidebar as overlay
 * - Trial banner above content when trial nearing expiry
 * - AI chat widget floating bottom-right
 * - PWA install prompt
 */
export function Shell({ children }: { children?: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const { user } = useAuth()
  const { projects } = useProjects()

  return (
    <RoleProvider>
      <div className="min-h-screen bg-[#f0f4fa]">

        {/* ── Desktop Sidebar ────────────────────────────────────────────── */}
        <Sidebar projects={projects} isCollapsed={false} />

        {/* ── Desktop Top Nav ────────────────────────────────────────────── */}
        {/* Hidden on mobile — TopBar handles mobile */}
        <div className="hidden md:block">
          <TopNav
            user={user}
            onSettings={() => {}}
          />
        </div>

        {/* ── Mobile Sidebar Overlay ─────────────────────────────────────── */}
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
                'flex flex-col border-r border-[#e2e8f0]',
                'animate-in slide-in-from-left-0 duration-300',
              )}
            >
              {/* Close button header */}
              <div className="p-4 border-b border-[#e2e8f0] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-[#2563eb] to-[#3b82f6] rounded-lg flex items-center justify-center">
                    <span className="text-white text-sm font-bold">CI</span>
                  </div>
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm font-semibold text-[#0f172a]">ConstructInv AI</span>
                  </div>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 hover:bg-[#f8fafc] rounded transition-colors"
                  aria-label="Close sidebar"
                >
                  <X size={20} className="text-[#475569]" />
                </button>
              </div>

              {/* Mobile overlay nav */}
              <MobileOverlayNav onClose={() => setSidebarOpen(false)} />
            </div>
          </>
        )}

        {/* ── Mobile Top Bar ─────────────────────────────────────────────── */}
        {/* Shown on mobile only — TopNav handles desktop */}
        <TopBar onMenuToggle={(open) => setSidebarOpen(open)} />

        {/* ── Trial Banner ───────────────────────────────────────────────── */}
        {/* Placed after the fixed topbar, offset by sidebar on desktop */}
        <div className="md:ml-[260px] pt-[64px]">
          <TrialBanner onUpgradeClick={() => setUpgradeModalOpen(true)} />
        </div>

        {/* ── Main Content Area ──────────────────────────────────────────── */}
        <main
          className={cn(
            'pt-0 pb-20 md:pb-4',
            'md:ml-[260px] transition-all duration-300',
            'overflow-x-hidden',
          )}
        >
          <div className="h-full px-4 sm:px-6 md:px-8 py-4 md:py-6 max-w-full">
            {children || <Outlet />}
          </div>
        </main>

        {/* ── Mobile Bottom Navigation ───────────────────────────────────── */}
        <MobileNav />

        {/* ── AI Chat Widget ─────────────────────────────────────────────── */}
        <AIChatWidget />

        {/* ── Upgrade Modal ──────────────────────────────────────────────── */}
        <UpgradeModal
          isOpen={upgradeModalOpen}
          onClose={() => setUpgradeModalOpen(false)}
        />

        {/* ── Upgrade Nudge Toast ────────────────────────────────────────── */}
        <UpgradeNudge onUpgradeClick={() => setUpgradeModalOpen(true)} />

        {/* ── PWA Install Prompt ─────────────────────────────────────────── */}
        <InstallPrompt />

      </div>
    </RoleProvider>
  )
}

/**
 * Mobile overlay nav — full nav links for the mobile sidebar drawer.
 * Mirrors Sidebar nav items but rendered inline (not fixed-positioned).
 */
function MobileOverlayNav({ onClose }: { onClose: () => void }) {
  const location = useLocation()
  const { isAdmin } = useAuth()

  const isActive = (href: string) =>
    href === '/dashboard'
      ? location.pathname === '/dashboard' || location.pathname === '/'
      : location.pathname.startsWith(href)

  const navItems = [
    { label: 'Projects',   href: '/dashboard',  icon: <LayoutDashboard size={20} /> },
    { label: 'Cash Flow',  href: '/cash-flow',  icon: <TrendingUp size={20} /> },
    { label: 'Payments',   href: '/payments',   icon: <CreditCard size={20} /> },
    { label: 'Reports',    href: '/reports',    icon: <BarChart3 size={20} /> },
    ...(isAdmin ? [{ label: 'Admin', href: '/admin', icon: <Shield size={20} /> }] : []),
    { label: 'Settings',   href: '/settings',   icon: <Settings size={20} /> },
    { label: 'Help',       href: '/help',       icon: <HelpCircle size={20} /> },
  ]

  return (
    <nav
      className="flex-1 flex flex-col gap-1 px-2 py-4 overflow-y-auto"
      aria-label="Mobile navigation"
    >
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
                ? 'bg-[#eff6ff] border-l-[#2563eb] text-[#2563eb]'
                : 'border-l-transparent text-[#475569] hover:bg-[#f8fafc] hover:text-[#1e293b]',
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
