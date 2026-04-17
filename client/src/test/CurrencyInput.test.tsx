import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CurrencyInput } from '@/components/shared'

describe('CurrencyInput', () => {
  it('renders with placeholder', () => {
    render(<CurrencyInput value={null} onChange={() => {}} placeholder="Enter amount" />)
    expect(screen.getByPlaceholderText('Enter amount')).toBeInTheDocument()
  })

  it('displays dollar sign prefix', () => {
    const { container } = render(<CurrencyInput value={null} onChange={() => {}} />)
    expect(container.textContent).toContain('$')
  })

  it('handles disabled state', () => {
    render(<CurrencyInput value={null} onChange={() => {}} disabled={true} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('calls onChange when value changes', async () => {
    const onChange = vi.fn()
    render(<CurrencyInput value={null} onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '1234.56' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('accepts large construction amounts like 201186.41', async () => {
    const onChange = vi.fn()
    render(<CurrencyInput value={null} onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '201186.41' } })
    expect(onChange).toHaveBeenCalledWith(201186.41)
  })

  it('formats with commas on blur', async () => {
    const onChange = vi.fn()
    render(<CurrencyInput value={null} onChange={onChange} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '50000' } })
    fireEvent.blur(input)
    // After blur, formatted value should contain commas
    expect(input.value).toContain(',')
  })

  it('rejects non-numeric characters', async () => {
    const onChange = vi.fn()
    render(<CurrencyInput value={null} onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'abc' } })
    // onChange should not be called with invalid value
    expect(onChange).not.toHaveBeenCalledWith(NaN)
  })

  it('initializes with provided value', () => {
    render(<CurrencyInput value={15000} onChange={() => {}} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    // Value should be formatted
    expect(input.value).toBeTruthy()
  })
})
