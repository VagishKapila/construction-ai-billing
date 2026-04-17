import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KPICard } from '@/components/shared'

describe('KPICard', () => {
  it('renders label and value', () => {
    render(<KPICard label="Revenue" value="$45,000" />)
    expect(screen.getByText('Revenue')).toBeInTheDocument()
    expect(screen.getByText('$45,000')).toBeInTheDocument()
  })

  it('renders numeric value', () => {
    render(<KPICard label="Projects" value={12} />)
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('renders subValue when provided', () => {
    render(<KPICard label="Users" value={150} subValue="Active this week" />)
    expect(screen.getByText('Active this week')).toBeInTheDocument()
  })

  it('renders icon when provided', () => {
    render(<KPICard label="Revenue" value="$10K" icon={<span data-testid="icon">💰</span>} />)
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<KPICard label="Clickable" value="click me" onClick={onClick} />)
    fireEvent.click(screen.getByText('click me'))
    expect(onClick).toHaveBeenCalled()
  })

  it('shows trend up indicator', () => {
    const { container } = render(<KPICard label="Growth" value="25%" trend="up" />)
    expect(container.textContent).toContain('Increased')
  })

  it('shows trend down indicator', () => {
    const { container } = render(<KPICard label="Loss" value="5%" trend="down" />)
    expect(container.textContent).toContain('Decreased')
  })

  it('shows flat trend indicator', () => {
    const { container } = render(<KPICard label="Flat" value="0%" trend="flat" />)
    expect(container.textContent).toContain('Flat')
  })

  it('renders without optional props', () => {
    render(<KPICard label="Simple" value="42" />)
    expect(screen.getByText('Simple')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })
})
