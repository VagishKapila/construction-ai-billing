/**
 * formatMoney — Formats a number as USD currency
 * Returns '$0.00' for null, undefined, or NaN values
 */
export const formatMoney = (
  n: number | string | null | undefined,
): string => {
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
