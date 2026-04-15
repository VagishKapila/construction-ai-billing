import React from 'react'

interface BadgeProps {
  variant: 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'teal' | 'gray' | 'orange'
  children: React.ReactNode
  size?: 'sm' | 'md'
}

const variantStyles = {
  green: 'bg-[#00b87a] text-white',
  amber: 'bg-[#d97706] text-white',
  red: 'bg-[#dc2626] text-white',
  blue: 'bg-[#2563eb] text-white',
  purple: 'bg-[#7c3aed] text-white',
  teal: 'bg-[#0891b2] text-white',
  gray: 'bg-[#64748b] text-white',
  orange: 'bg-[#ea6c00] text-white',
}

const sizeStyles = {
  sm: 'px-2 py-1 text-xs font-medium rounded',
  md: 'px-3 py-1.5 text-sm font-medium rounded-md',
}

export function Badge({ variant, children, size = 'md' }: BadgeProps) {
  return (
    <span className={`inline-block ${variantStyles[variant]} ${sizeStyles[size]}`}>
      {children}
    </span>
  )
}
