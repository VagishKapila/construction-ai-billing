import React, { useState } from 'react'
import { X } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { MobileNav } from './MobileNav'
import { AIChatWidget } from '@/components/ai'
import { cn } from '@/lib/cn'

/**
 * Main layout shell
 * Combines:
 * - Desktop sidebar (left, 260px)
 * - Top bar (sticky, 64px)
 * - Mobile bottom nav (mobile only, 80px with safe area)
 * - Content area with proper padding and scrolling
 * - Mobile overlay sidebar (hamburger menu)
 */
export function Shell({ children }: { children?: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#fafafe]">
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

            {/* Navigation items (mobile version) */}
            <nav className="flex-1 space-y-1 px-2 py-4">
              {/* Navigation will be handled by the main Sidebar component if used here */}
              <Sidebar isCollapsed={false} />
            </nav>
          </div>
        </>
      )}

      {/* Top Bar */}
      <TopBar
        onMenuToggle={(open) => setSidebarOpen(open)}
      />

      {/* Main Content Area */}
      <main
        className={cn(
          'pt-[64px] pb-20 md:pb-4',
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
    </div>
  )
}
