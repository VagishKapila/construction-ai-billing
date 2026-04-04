/* eslint-disable react-refresh/only-export-components */
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const badgeVariants = cva(
  'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold',
  {
    variants: {
      variant: {
        default:
          'bg-primary-100 text-primary-700 border border-primary-200',
        success:
          'bg-success-50 text-success-700 border border-success-200',
        warning:
          'bg-warning-50 text-warning-700 border border-warning-200',
        danger:
          'bg-danger-50 text-danger-700 border border-danger-200',
        outline:
          'bg-white text-gray-700 border border-gray-300',
        secondary:
          'bg-gray-100 text-gray-700 border border-gray-200',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
