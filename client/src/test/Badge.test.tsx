import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '@/components/shared'

describe('Badge', () => {
  it('renders green variant', () => {
    render(<Badge variant="green">Active</Badge>)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders amber variant', () => {
    render(<Badge variant="amber">Pending</Badge>)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders red variant', () => {
    const { container } = render(<Badge variant="red">Error</Badge>)
    const badge = container.querySelector('span')
    expect(badge).toHaveClass('bg-[#dc2626]')
  })

  it('renders blue variant', () => {
    const { container } = render(<Badge variant="blue">Info</Badge>)
    const badge = container.querySelector('span')
    expect(badge).toHaveClass('bg-[#2563eb]')
  })

  it('renders purple variant', () => {
    render(<Badge variant="purple">Premium</Badge>)
    expect(screen.getByText('Premium')).toBeInTheDocument()
  })

  it('renders teal variant', () => {
    render(<Badge variant="teal">ARIA</Badge>)
    expect(screen.getByText('ARIA')).toBeInTheDocument()
  })

  it('renders gray variant', () => {
    render(<Badge variant="gray">Draft</Badge>)
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('renders orange variant', () => {
    render(<Badge variant="orange">Vendor</Badge>)
    expect(screen.getByText('Vendor')).toBeInTheDocument()
  })

  it('renders small size', () => {
    const { container } = render(<Badge variant="green" size="sm">Small</Badge>)
    const badge = container.querySelector('span')
    expect(badge).toHaveClass('text-xs')
  })

  it('renders medium size by default', () => {
    const { container } = render(<Badge variant="green">Default</Badge>)
    const badge = container.querySelector('span')
    expect(badge).toBeInTheDocument()
  })
})
