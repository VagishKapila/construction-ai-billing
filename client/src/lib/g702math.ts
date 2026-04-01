import type { PayAppLine, PayAppLineComputed } from '@/types'

/**
 * G702/G703 Math Utilities — SACRED FORMULAS
 * These calculations are the core of construction billing.
 * DO NOT modify without running full pay app test suite.
 */

/**
 * Compute all G702/G703 columns (A-I) for a single line
 *
 * Column definitions:
 * A = Scheduled Value (from SOV)
 * B = Work completed from previous (prev_pct × A)
 * C = Work completed this period (this_pct × A)
 * D = Total work completed (B + C)
 * E = Retainage held (retainage_pct ÷ 100 × D)
 * F = Total earned (D - E)
 * G = Previous certificates (from prior pay apps)
 * H = Current payment due (F - G)
 * I = Balance to finish (A - F)
 */
export function computeLine(
  line: PayAppLine,
  scheduledValue: number,
  description: string,
  prevCertificates: number
): PayAppLineComputed {
  // Column A: Scheduled Value (from SOV)
  const scheduledVal = scheduledValue

  // Column B: Work completed from previous
  const prevAmount = (line.prev_pct / 100) * scheduledVal

  // Column C: Work completed this period
  const thisAmount = (line.this_pct / 100) * scheduledVal

  // Column D: Total work completed
  const totalCompleted = prevAmount + thisAmount

  // Column E: Retainage held
  const retainageHeld = (line.retainage_pct / 100) * totalCompleted

  // Column F: Total earned
  const totalEarned = totalCompleted - retainageHeld

  // Column G: Previous certificates (passed as parameter)
  const prevCerts = prevCertificates

  // Column H: Current payment due
  const currentDue = totalEarned - prevCerts

  // Column I: Balance to finish
  const balanceToFinish = scheduledVal - totalEarned

  return {
    ...line,
    scheduledValue: scheduledVal,
    description,
    prevAmount,
    thisAmount,
    totalCompleted,
    retainageHeld,
    totalEarned,
    prevCertificates: prevCerts,
    currentDue,
    balanceToFinish,
  }
}

/**
 * Summary object returned by computePayAppTotals
 */
export interface PayAppTotals {
  totalScheduled: number
  totalPrevAmount: number
  totalThisAmount: number
  totalCompleted: number
  totalRetainage: number
  totalEarned: number
  totalPrevCertificates: number
  totalCurrentDue: number
  totalBalanceToFinish: number
}

/**
 * Compute totals across all lines in a pay app
 * Sums all G702/G703 columns
 */
export function computePayAppTotals(lines: PayAppLineComputed[]): PayAppTotals {
  return {
    totalScheduled: lines.reduce((sum, line) => sum + line.scheduledValue, 0),
    totalPrevAmount: lines.reduce((sum, line) => sum + line.prevAmount, 0),
    totalThisAmount: lines.reduce((sum, line) => sum + line.thisAmount, 0),
    totalCompleted: lines.reduce((sum, line) => sum + line.totalCompleted, 0),
    totalRetainage: lines.reduce((sum, line) => sum + line.retainageHeld, 0),
    totalEarned: lines.reduce((sum, line) => sum + line.totalEarned, 0),
    totalPrevCertificates: lines.reduce((sum, line) => sum + line.prevCertificates, 0),
    totalCurrentDue: lines.reduce((sum, line) => sum + line.currentDue, 0),
    totalBalanceToFinish: lines.reduce((sum, line) => sum + line.balanceToFinish, 0),
  }
}
