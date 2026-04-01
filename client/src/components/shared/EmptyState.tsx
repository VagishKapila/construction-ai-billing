import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon?: LucideIcon
  title?: string
  heading?: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
  actions?: ReactNode
}

export function EmptyState({
  icon: Icon,
  title,
  heading,
  description,
  action,
  actions,
}: EmptyStateProps) {
  const displayTitle = title || heading
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      {Icon && (
        <div className="mb-4">
          <Icon className="h-12 w-12 text-text-muted opacity-30" />
        </div>
      )}
      {displayTitle && (
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          {displayTitle}
        </h3>
      )}
      <p className="text-sm text-text-secondary text-center max-w-xs mb-6">
        {description}
      </p>
      {action && (
        <Button onClick={action.onClick} size="sm">
          {action.label}
        </Button>
      )}
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  )
}
