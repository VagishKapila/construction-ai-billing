import React from 'react'
import { formatMoney } from '@/utils/formatMoney'

interface MoneyDisplayProps {
  amount: number | null | undefined
  size?: 'sm' | 'md' | 'lg' | 'xl'
  prefix?: string
  className?: string
}

const sizeStyles = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-2xl',
}

export function MoneyDisplay({
  amount,
  size = 'md',
  prefix = '$',
  className = '',
}: MoneyDisplayProps) {
  const formatted = formatMoney(amount)
  const displayValue = prefix !== '$' ? formatted.replace('$', prefix) : formatted

  return (
    <span className={`font-mono text-[#0f172a] font-semibold ${sizeStyles[size]} ${className}`}>
      {displayValue}
    </span>
  )
}
