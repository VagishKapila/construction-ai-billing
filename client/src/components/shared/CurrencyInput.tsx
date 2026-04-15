import React, { useState, useCallback } from 'react'

interface CurrencyInputProps {
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function CurrencyInput({
  value,
  onChange,
  placeholder = '0.00',
  className = '',
  disabled = false,
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState(value ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '')

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let input = e.target.value
    
    // Remove all non-numeric characters except period
    input = input.replace(/[^0-9.]/g, '')
    
    // Remove multiple periods
    const parts = input.split('.')
    if (parts.length > 2) {
      input = parts[0] + '.' + parts.slice(1).join('')
    }

    // Limit to 2 decimal places
    if (parts.length === 2) {
      input = parts[0] + '.' + parts[1].slice(0, 2)
    }

    setDisplayValue(input)

    // Parse and call onChange
    if (input === '' || input === '.') {
      onChange(null)
    } else {
      const numValue = parseFloat(input)
      if (!isNaN(numValue)) {
        onChange(numValue)
      }
    }
  }, [onChange])

  const handleBlur = useCallback(() => {
    if (displayValue === '' || displayValue === '.') {
      setDisplayValue('')
      onChange(null)
    } else {
      const numValue = parseFloat(displayValue)
      if (!isNaN(numValue)) {
        setDisplayValue(numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
        onChange(numValue)
      }
    }
  }, [displayValue, onChange])

  return (
    <div className="relative flex items-center">
      <span className="absolute left-3 text-[#94a3b8] font-mono text-sm">$</span>
      <input
        type="text"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={`pl-7 pr-4 py-2 border border-[#e2e8f0] rounded-[8px] font-mono text-sm placeholder-[#cbd5e1] focus:outline-none focus:ring-2 focus:ring-[#2563eb] focus:border-transparent disabled:bg-[#f1f5f9] disabled:text-[#94a3b8] ${className}`}
      />
    </div>
  )
}
