/* eslint-disable react-refresh/only-export-components */
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/cn'
import { LoaderCircle } from 'lucide-react'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium ring-offset-white transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-br from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 focus-visible:ring-primary-500 active:scale-95',
        secondary:
          'bg-gray-100 text-gray-900 hover:bg-gray-200 focus-visible:ring-gray-400 active:scale-95',
        outline:
          'border border-border bg-white text-gray-900 hover:bg-gray-50 focus-visible:ring-primary-500 active:scale-95',
        ghost:
          'text-gray-700 hover:bg-gray-100 focus-visible:ring-primary-500 active:scale-95',
        destructive:
          'bg-danger-500 text-white hover:bg-danger-600 focus-visible:ring-danger-500 active:scale-95',
        link: 'text-primary-500 underline-offset-4 hover:underline focus-visible:ring-primary-500',
      },
      size: {
        default: 'h-10 px-4 text-sm',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <LoaderCircle className="h-4 w-4 animate-spin" />}
        {children}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
