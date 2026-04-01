import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

interface LoadingSpinnerProps {
  text?: string
  size?: 'sm' | 'md' | 'lg'
  fullScreen?: boolean
}

export function LoadingSpinner({
  text,
  size = 'md',
  fullScreen = false,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  }

  const content = (
    <div className="flex flex-col items-center justify-center gap-4">
      <LoaderCircle
        className={cn('animate-spin text-primary-500', sizeClasses[size])}
      />
      {text && <p className="text-sm text-gray-600">{text}</p>}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface">
        {content}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center py-12">
      {content}
    </div>
  )
}
