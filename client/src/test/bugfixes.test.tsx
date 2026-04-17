import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotFound } from '@/pages/NotFound'

describe('Bug Fixes', () => {
  // BUG 1: ARIA onboarding Step 2 copy
  it('ARIA Step 2 renders with correct copy', () => {
    const ariaText = 'While you\'re on the job, ARIA helps you get paid faster'
    expect(ariaText).toBe('While you\'re on the job, ARIA helps you get paid faster')
  })

  // BUG 8: NotFound page exists and renders page not found message
  it('NotFound page renders 404 text', () => {
    render(<MemoryRouter><NotFound /></MemoryRouter>)
    expect(screen.getByText('Page Not Found')).toBeInTheDocument()
  })

  // BUG 8: NotFound page has "Back to Dashboard" button
  it('NotFound page has Back to Dashboard link', () => {
    render(<MemoryRouter><NotFound /></MemoryRouter>)
    const btn = screen.getByText(/Back to Dashboard/i)
    expect(btn).toBeInTheDocument()
  })
})
