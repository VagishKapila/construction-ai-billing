/**
 * Formatting utilities for currency, dates, and percentages
 * Used throughout the app for consistent display of financial and temporal data
 */

/**
 * Format a number as USD currency
 * @param amount - The amount to format (can be null/undefined)
 * @returns Formatted string like "$1,234.56" or "($1,234.56)" for negatives
 */
export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) {
    return '$0.00'
  }

  const num = Number(amount)
  if (isNaN(num)) return '$0.00'

  const isNegative = num < 0
  const absAmount = Math.abs(num)

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absAmount)

  return isNegative ? `(${formatted})` : formatted
}

/**
 * Format a date string as "Jan 15, 2026"
 * @param date - ISO 8601 date string or null/undefined
 * @returns Formatted date string or '—' if date is null/undefined
 */
export function formatDate(date: string | null | undefined): string {
  if (!date) {
    return '—'
  }

  try {
    const d = new Date(date)
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(d)
  } catch {
    return '—'
  }
}

/**
 * Format a percentage value
 * @param value - The percentage value (0-100) or null/undefined
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string like "10.0%" or "0.0%" if value is null/undefined
 */
export function formatPercent(value: number | string | null | undefined, decimals = 1): string {
  if (value === null || value === undefined) {
    return `0.${'0'.repeat(decimals)}%`
  }

  const num = Number(value)
  if (isNaN(num)) return `0.${'0'.repeat(decimals)}%`
  return `${num.toFixed(decimals)}%`
}

/**
 * Format a large currency amount in compact form for KPI cards
 * @param amount - The amount to format
 * @returns Compact formatted string like "$1.2M", "$250K", or "$1,234"
 */
export function formatCompactCurrency(amount: number | string | null | undefined): string {
  const num = Number(amount) || 0
  const absAmount = Math.abs(num)

  if (absAmount >= 1_000_000) {
    const millions = absAmount / 1_000_000
    return `$${millions.toFixed(millions >= 10 ? 0 : 1)}M`
  }

  if (absAmount >= 1_000) {
    const thousands = absAmount / 1_000
    return `$${thousands.toFixed(thousands >= 10 ? 0 : 1)}K`
  }

  return `$${absAmount.toFixed(0)}`
}

/**
 * Format a date as a relative time string
 * @param date - ISO 8601 date string
 * @returns Relative date like "Today", "Yesterday", "3 days ago", or "Jan 15"
 */
export function formatRelativeDate(date: string): string {
  try {
    const d = new Date(date)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate())

    const diffTime = today.getTime() - dateOnly.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return 'Today'
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays > 1 && diffDays <= 30) {
      return `${diffDays} days ago`
    } else {
      // Fall back to "Jan 15" format
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
      }).format(d)
    }
  } catch {
    return date
  }
}
