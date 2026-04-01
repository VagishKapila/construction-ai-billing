import type { ReactNode } from 'react'

export interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 pb-6 border-b border-border md:flex-row md:items-end md:justify-between">
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-sm text-text-secondary">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-shrink-0 flex-wrap gap-2 md:flex-nowrap">
          {actions}
        </div>
      )}
    </div>
  )
}
