import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MoneyDisplay } from '@/components/shared'

describe('MoneyDisplay', () => {
  it('formats standard amount correctly', () => {
    render(<MoneyDisplay amount={1234.56} />)
    expect(screen.getByText('$1,234.56')).toBeInTheDocument()
  })

  it('formats large construction amount 201186.41', () => {
    render(<MoneyDisplay amount={201186.41} />)
    expect(screen.getByText('$201,186.41')).toBeInTheDocument()
  })

  it('handles null amount', () => {
    render(<MoneyDisplay amount={null} />)
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('handles undefined amount', () => {
    render(<MoneyDisplay amount={undefined} />)
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('handles zero', () => {
    render(<MoneyDisplay amount={0} />)
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('applies sm size class', () => {
    const { container } = render(<MoneyDisplay amount={1000} size="sm" />)
    const span = container.querySelector('span')
    expect(span).toHaveClass('text-sm')
  })

  it('applies xl size class', () => {
    const { container } = render(<MoneyDisplay amount={1000} size="xl" />)
    const span = container.querySelector('span')
    expect(span).toHaveClass('text-2xl')
  })

  it('uses monospace font (font-mono class)', () => {
    const { container } = render(<MoneyDisplay amount={500} />)
    const span = container.querySelector('span')
    // MoneyDisplay uses font-mono class for monospace display of money values
    expect(span).toHaveClass('font-mono')
  })

  it('applies custom className', () => {
    const { container } = render(<MoneyDisplay amount={100} className="text-green-600" />)
    const span = container.querySelector('span')
    expect(span).toHaveClass('text-green-600')
  })
})
