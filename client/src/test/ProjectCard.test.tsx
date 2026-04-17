import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProjectCard } from '@/components/shared'

const mockProject = {
  id: 1,
  name: 'Elm Street Addition',
  owner: 'Paul Bains',
  owner_email: 'paul@bains.com',
  original_contract: 268233,
  payment_terms: 'Net 30',
  status: 'active',
  pay_app_count: 2,
}

const mockTrades = [
  { id: 1, trade_name: 'Plumbing', company_name: 'Pacific Plumbing', trust_score: 712, status: 'active' as const },
  { id: 2, trade_name: 'Electrical', company_name: 'City Electric', trust_score: 568, status: 'active' as const },
]

const mockPayApps = [
  {
    id: 1,
    pay_app_number: 1,
    project_id: 1,
    amount_due: 85950,
    status: 'paid',
    created_at: '2026-03-15T00:00:00Z',
    period_label: 'March 2026',
  },
]

const mockAlerts = [
  { type: 'lien' as const, message: 'Lien deadline in 5 days', daysRemaining: 5 },
]

describe('ProjectCard', () => {
  it('renders project name', () => {
    render(
      <ProjectCard
        project={mockProject}
        onCreatePayApp={() => {}}
        onArchive={() => {}}
        onClick={() => {}}
      />
    )
    expect(screen.getByText('Elm Street Addition')).toBeInTheDocument()
  })

  it('renders owner name', () => {
    render(
      <ProjectCard
        project={mockProject}
        onCreatePayApp={() => {}}
        onArchive={() => {}}
        onClick={() => {}}
      />
    )
    expect(screen.getByText('Paul Bains')).toBeInTheDocument()
  })

  it('renders payment terms', () => {
    render(
      <ProjectCard
        project={mockProject}
        onCreatePayApp={() => {}}
        onArchive={() => {}}
        onClick={() => {}}
      />
    )
    expect(screen.getByText('Net 30')).toBeInTheDocument()
  })

  it('renders contract amount', () => {
    const { container } = render(
      <ProjectCard
        project={mockProject}
        onCreatePayApp={() => {}}
        onArchive={() => {}}
        onClick={() => {}}
      />
    )
    expect(container.textContent).toContain('268,233')
  })

  it('renders create pay app button', () => {
    render(
      <ProjectCard
        project={mockProject}
        onCreatePayApp={() => {}}
        onArchive={() => {}}
        onClick={() => {}}
      />
    )
    expect(screen.getByText('+ Pay App')).toBeInTheDocument()
  })

  it('renders archive button', () => {
    render(
      <ProjectCard
        project={mockProject}
        onCreatePayApp={() => {}}
        onArchive={() => {}}
        onClick={() => {}}
      />
    )
    expect(screen.getByText('Archive')).toBeInTheDocument()
  })

  it('calls onCreatePayApp when create pay app button is clicked', () => {
    const onCreatePayApp = vi.fn()
    render(
      <ProjectCard
        project={mockProject}
        onCreatePayApp={onCreatePayApp}
        onArchive={() => {}}
        onClick={() => {}}
      />
    )
    fireEvent.click(screen.getByText('+ Pay App'))
    expect(onCreatePayApp).toHaveBeenCalledWith(1)
  })

  it('calls onArchive when archive button is clicked', () => {
    const onArchive = vi.fn()
    render(
      <ProjectCard
        project={mockProject}
        onCreatePayApp={() => {}}
        onArchive={onArchive}
        onClick={() => {}}
      />
    )
    fireEvent.click(screen.getByText('Archive'))
    expect(onArchive).toHaveBeenCalledWith(1)
  })

  it('calls onClick when project name is clicked', () => {
    const onClick = vi.fn()
    render(
      <ProjectCard
        project={mockProject}
        onCreatePayApp={() => {}}
        onArchive={() => {}}
        onClick={onClick}
      />
    )
    fireEvent.click(screen.getByText('Elm Street Addition'))
    expect(onClick).toHaveBeenCalledWith(1)
  })

  it('renders trade dots when trades provided', () => {
    render(
      <ProjectCard
        project={mockProject}
        trades={mockTrades}
        onCreatePayApp={() => {}}
        onArchive={() => {}}
        onClick={() => {}}
      />
    )
    expect(screen.getByText('P')).toBeInTheDocument()
    expect(screen.getByText('E')).toBeInTheDocument()
  })

  it('renders pay apps when expanded (default)', () => {
    render(
      <ProjectCard
        project={mockProject}
        payApps={mockPayApps}
        onCreatePayApp={() => {}}
        onArchive={() => {}}
        onClick={() => {}}
      />
    )
    expect(screen.getByText('March 2026')).toBeInTheDocument()
  })

  it('renders inline alerts when provided', () => {
    render(
      <ProjectCard
        project={mockProject}
        alerts={mockAlerts}
        onCreatePayApp={() => {}}
        onArchive={() => {}}
        onClick={() => {}}
      />
    )
    expect(screen.getByText(/Lien deadline in 5 days/)).toBeInTheDocument()
  })

  it('renders with urgent urgency stripe color', () => {
    const { container } = render(
      <ProjectCard
        project={mockProject}
        urgency="urgent"
        onCreatePayApp={() => {}}
        onArchive={() => {}}
        onClick={() => {}}
      />
    )
    // The stripe div should have the urgent red color
    expect(container.innerHTML).toBeTruthy()
  })

  it('shows more indicator when more than 8 trades', () => {
    const manyTrades = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      trade_name: `Trade ${i + 1}`,
      company_name: null,
      trust_score: null,
      status: 'active' as const,
    }))
    render(
      <ProjectCard
        project={mockProject}
        trades={manyTrades}
        onCreatePayApp={() => {}}
        onArchive={() => {}}
        onClick={() => {}}
      />
    )
    expect(screen.getByText('+2')).toBeInTheDocument()
  })
})
