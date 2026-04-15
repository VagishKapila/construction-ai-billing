/**
 * Date formatting utilities
 */

/**
 * timeAgo — Formats a date relative to now ("3 days ago", "2 hours ago", etc)
 */
export function timeAgo(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000)

  const units: Array<[string, number]> = [
    ['year', 365 * 24 * 3600],
    ['month', 30 * 24 * 3600],
    ['week', 7 * 24 * 3600],
    ['day', 24 * 3600],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ]

  for (const [unit, secondsInUnit] of units) {
    const interval = Math.floor(seconds / secondsInUnit)
    if (interval >= 1) {
      return interval === 1 ? `1 ${unit} ago` : `${interval} ${unit}s ago`
    }
  }

  return 'just now'
}

/**
 * daysUntil — Returns days until a date (positive = future, negative = past)
 */
export function daysUntil(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const msPerDay = 24 * 60 * 60 * 1000
  const diffMs = d.getTime() - now.getTime()
  return Math.ceil(diffMs / msPerDay)
}

/**
 * formatDate — Formats a date as "Apr 13, 2026"
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
