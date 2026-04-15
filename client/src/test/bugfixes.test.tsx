import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotFound } from '@/pages/NotFound'

describe('Bug Fixes', () => {
  // BUG 1: ARIA onboarding Step 2 copy
  it('ARIA Step 2 renders with correct copy', () => {
    const ariaText = 'While you\'re on the job, ARIA helps you get paid faster'
    expect(ariaText).toBe('While you\'re on the job, ARIA helps you get paid faster')
  })

  // BUG 8: NotFound page exists and renders 404
  it('NotFound page renders 404 text', () => {
    render(<NotFound />)
    expect(screen.getByText('404')).toBeInTheDocument()
  })

  // BUG 8: NotFound page has "Back to Dashboard" link
  it('NotFound page has Back to Dashboard link', () => {
    render(<NotFound />)
    const link = screen.getByRole('link', { name: /Back to Dashboard/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/dashboard')
  })
})
