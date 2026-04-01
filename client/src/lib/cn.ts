import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names using clsx and tailwind-merge
 * Ensures Tailwind CSS classes override correctly and removes duplicates
 * Required for shadcn/ui component styling
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
