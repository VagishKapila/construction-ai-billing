import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PayAppRow } from '@/components/shared'

const mockPayApp = {
  id: 1,
  pay_app_number: 1,
  project_id: 1,
  amount_due: 15000,
  status: 'paid',
  created_at: '2026-03-15T00:00:00Z',
  period_label: 'March 2026',
}

describe('PayAppRow', () => {
  it('renders pay app number', () => {
    render(
      <PayAppRow
        payApp={mockPayApp}
        projectId={1}
        onDownloadPdf={() => {}}
        onSendEmail={() => {}}
        onShareLink={() => {}}
      />
    )
    expect(screen.getByText('# 1')).toBeInTheDocument()
  })

  it('renders period label', () => {
    render(
      <PayAppRow
        payApp={mockPayApp}
        projectId={1}
        onDownloadPdf={() => {}}
        onSendEmail={() => {}}
        onShareLink={() => {}}
      />
    )
    expect(screen.getByText('March 2026')).toBeInTheDocument()
  })

  it('displays amount in money format', () => {
    const { container } = render(
      <PayAppRow
        payApp={mockPayApp}
        projectId={1}
        onDownloadPdf={() => {}}
        onSendEmail={() => {}}
        onShareLink={() => {}}
      />
    )
    expect(container.textContent).toContain('$15,000.00')
  })

  it('shows status chip', () => {
    render(
      <PayAppRow
        payApp={mockPayApp}
        projectId={1}
        onDownloadPdf={() => {}}
        onSendEmail={() => {}}
        onShareLink={() => {}}
      />
    )
    expect(screen.getByText('Paid')).toBeInTheDocument()
  })

  it('renders download button', () => {
    render(
      <PayAppRow
        payApp={mockPayApp}
        projectId={1}
        onDownloadPdf={() => {}}
        onSendEmail={() => {}}
        onShareLink={() => {}}
      />
    )
    // Download button (↓)
    const { container } = render(
      <PayAppRow
        payApp={mockPayApp}
        projectId={1}
        onDownloadPdf={() => {}}
        onSendEmail={() => {}}
        onShareLink={() => {}}
      />
    )
    expect(container.querySelector('button[title="Download PDF"]')).toBeInTheDocument()
  })

  it('calls onDownloadPdf when download button clicked', () => {
    const onDownloadPdf = vi.fn()
    const { container } = render(
      <PayAppRow
        payApp={mockPayApp}
        projectId={1}
        onDownloadPdf={onDownloadPdf}
        onSendEmail={() => {}}
        onShareLink={() => {}}
      />
    )
    const downloadBtn = container.querySelector('button[title="Download PDF"]')
    if (downloadBtn) fireEvent.click(downloadBtn)
    expect(onDownloadPdf).toHaveBeenCalledWith(1)
  })

  it('calls onSendEmail when send button clicked', () => {
    const onSendEmail = vi.fn()
    const { container } = render(
      <PayAppRow
        payApp={mockPayApp}
        projectId={1}
        onDownloadPdf={() => {}}
        onSendEmail={onSendEmail}
        onShareLink={() => {}}
      />
    )
    const sendBtn = container.querySelector('button[title="Send Email"]')
    if (sendBtn) fireEvent.click(sendBtn)
    expect(onSendEmail).toHaveBeenCalledWith(1)
  })

  it('calls onShareLink when share button clicked', () => {
    const onShareLink = vi.fn()
    const { container } = render(
      <PayAppRow
        payApp={mockPayApp}
        projectId={1}
        onDownloadPdf={() => {}}
        onSendEmail={() => {}}
        onShareLink={onShareLink}
      />
    )
    const shareBtn = container.querySelector('button[title="Share Link"]')
    if (shareBtn) fireEvent.click(shareBtn)
    expect(onShareLink).toHaveBeenCalledWith(1)
  })

  it('handles submitted status', () => {
    const submittedPayApp = { ...mockPayApp, status: 'submitted' }
    render(
      <PayAppRow
        payApp={submittedPayApp}
        projectId={1}
        onDownloadPdf={() => {}}
        onSendEmail={() => {}}
        onShareLink={() => {}}
      />
    )
    expect(screen.getByText('Submitted')).toBeInTheDocument()
  })
})
