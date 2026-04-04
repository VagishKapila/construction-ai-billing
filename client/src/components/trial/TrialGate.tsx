import type { ReactNode } from 'react'
import { useState } from 'react'
import { Lock } from 'lucide-react'
import { useTrial } from '@/hooks/useTrial'
import { UpgradeModal } from './UpgradeModal'
import { cn } from '@/lib/cn'

interface TrialGateProps {
  children: ReactNode
  action?: string
}

/**
 * TrialGate — Wrapper that blocks trial-gated actions
 *
 * When trial has expired (and user is not Pro or free override):
 * - Renders disabled overlay with upgrade prompt
 * - Opens UpgradeModal on button click
 *
 * When not gated:
 * - Renders children normally
 *
 * Usage:
 * <TrialGate action="create a project">
 *   <Button onClick={createProject}>New Project</Button>
 * </TrialGate>
 *
 * Props:
 * - children: Element(s) to gate
 * - action: Human-readable action name (e.g., "create a project", "generate a PDF")
 */
export function TrialGate({ children, action = 'continue' }: TrialGateProps): ReactNode {
  const { isTrialGated } = useTrial()
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)

  // Not gated — render children normally
  if (!isTrialGated) {
    return children
  }

  // Gated — render disabled overlay with upgrade prompt
  return (
    <>
      <div className="relative">
        {/* Children with disabled overlay */}
        <div
          className={cn(
            'relative',
            isTrialGated && 'pointer-events-none opacity-50'
          )}
          aria-disabled={isTrialGated}
        >
          {children}
        </div>

        {/* Overlay with upgrade prompt */}
        {isTrialGated && (
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center',
              'bg-black/5 backdrop-blur-sm rounded-lg',
              'cursor-default'
            )}
          >
            <div className="flex flex-col items-center gap-3 px-4 text-center">
              <Lock className="h-6 w-6 text-gray-700" />
              <p className="text-sm font-medium text-gray-900">
                Upgrade to Pro to {action}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setUpgradeModalOpen(true)
                }}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium',
                  'text-white bg-primary-600 hover:bg-primary-700',
                  'transition-colors duration-200',
                  'active:scale-95'
                )}
              >
                Upgrade
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upgrade modal */}
      <UpgradeModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
      />
    </>
  )
}
