import { describe, test, expect } from 'vitest'
import { formatMoney, formatCompact, formatPercent } from '../utils/formatMoney'

describe('formatMoney', () => {
  test('formats whole numbers', () => {
    expect(formatMoney(1000)).toBe('$1,000.00')
  })
  test('formats decimals', () => {
    expect(formatMoney(201186.41)).toBe('$201,186.41')
  })
  test('handles null', () => {
    expect(formatMoney(null)).toBe('$0.00')
  })
  test('handles undefined', () => {
    expect(formatMoney(undefined)).toBe('$0.00')
  })
  test('handles string numbers', () => {
    expect(formatMoney('85950.00')).toBe('$85,950.00')
  })
})

describe('formatCompact', () => {
  test('formats millions', () => {
    const result = formatCompact(1200000)
    expect(result).toContain('1.2')
    expect(result).toContain('M')
  })
  test('formats thousands', () => {
    const result = formatCompact(45000)
    expect(result).toContain('45')
    expect(result).toContain('K')
  })
  test('handles null', () => {
    expect(formatCompact(null)).toBe('$0.00')
  })
})

describe('formatPercent', () => {
  test('formats percentages with default decimals', () => {
    expect(formatPercent(10.5)).toBe('10.5%')
  })
  test('formats percentages with custom decimals', () => {
    expect(formatPercent(10.549, 1)).toBe('10.5%')
    expect(formatPercent(10.549, 2)).toBe('10.55%')
  })
  test('handles null', () => {
    expect(formatPercent(null)).toBe('0.0%')
  })
})
