import * as React from 'react'
import { cn } from '@/lib/cn'
import { AlertCircle } from 'lucide-react'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
}

// Generate a stable ID for inputs without explicit id prop
let inputCounter = 0
function generateInputId(): string {
  return `input-${++inputCounter}`
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, helperText, id, ...props }, ref) => {
    const inputId = React.useMemo(() => id || generateInputId(), [id])

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-900 mb-2"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            type={type}
            className={cn(
              'flex h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm placeholder:text-gray-400 transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-0 focus:border-transparent',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-50',
              error && 'border-danger-500 focus:ring-danger-500',
              className
            )}
            ref={ref}
            id={inputId}
            {...props}
          />
          {error && (
            <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-danger-500" />
          )}
        </div>
        {error && <p className="mt-1 text-xs text-danger-600">{error}</p>}
        {helperText && !error && (
          <p className="mt-1 text-xs text-gray-500">{helperText}</p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
