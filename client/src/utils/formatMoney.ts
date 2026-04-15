/**
 * formatMoney — Formats a number as USD currency ($X,XXX.XX)
 * Returns '$0.00' for null, undefined, or NaN values
 */
export function formatMoney(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '$0.00'
  const num = Number(n)
  if (isNaN(num)) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/**
 * formatCompact — Formats a number as compact USD ($1.2M, $45K, etc)
 * Returns '$0.00' for null/undefined/NaN
 */
export function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined) return '$0.00'
  if (isNaN(n)) return '$0.00'

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })
  return formatter.format(n)
}

/**
 * formatPercent — Formats a number as percentage (10.5%)
 * Returns '0.0%' for null/undefined/NaN
 */
export function formatPercent(
  n: number | null | undefined,
  decimals: number = 1,
): string {
  if (n === null || n === undefined) return '0.0%'
  if (isNaN(n)) return '0.0%'
  return `${n.toFixed(decimals)}%`
}
