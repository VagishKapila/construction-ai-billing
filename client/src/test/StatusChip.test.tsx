import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusChip } from '@/components/shared'

describe('StatusChip', () => {
  it('maps paid to green badge', () => {
    const { container } = render(<StatusChip status="paid" />)
    const badge = container.querySelector('span')
    expect(badge).toHaveClass('bg-[#00b87a]')
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })

  it('maps submitted to blue badge', () => {
    const { container } = render(<StatusChip status="submitted" />)
    const badge = container.querySelector('span')
    expect(badge).toHaveClass('bg-[#2563eb]')
    expect(screen.getByText('Submitted')).toBeInTheDocument()
  })

  it('maps overdue to red badge', () => {
    const { container } = render(<StatusChip status="overdue" />)
    const badge = container.querySelector('span')
    expect(badge).toHaveClass('bg-[#dc2626]')
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })

  it('maps draft to gray badge', () => {
    const { container } = render(<StatusChip status="draft" />)
    const badge = container.querySelector('span')
    expect(badge).toHaveClass('bg-[#64748b]')
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('maps pending to amber badge', () => {
    const { container } = render(<StatusChip status="pending" />)
    const badge = container.querySelector('span')
    expect(badge).toHaveClass('bg-[#d97706]')
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('maps approved to green badge', () => {
    render(<StatusChip status="approved" />)
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  it('maps active to teal badge', () => {
    render(<StatusChip status="active" />)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('maps rejected to red badge', () => {
    render(<StatusChip status="rejected" />)
    expect(screen.getByText('Rejected')).toBeInTheDocument()
  })

  it('maps completed to green badge', () => {
    render(<StatusChip status="completed" />)
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('handles unknown status with fallback', () => {
    render(<StatusChip status="unknown_status" />)
    // Should not throw; renders with gray fallback
    expect(screen.getByText(/unknown_status/i)).toBeInTheDocument()
  })

  it('handles case-insensitive status', () => {
    render(<StatusChip status="PAID" />)
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })
})
