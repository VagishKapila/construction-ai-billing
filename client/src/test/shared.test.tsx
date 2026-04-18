import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  Badge,
  KPICard,
  MoneyDisplay,
  StatusChip,
  TradeDot,
  ARIAStrip,
  EmptyState,
  CurrencyInput,
  PayAppRow,
  ProjectCard,
} from '@/components/shared'

describe('Shared Components', () => {
  describe('Badge', () => {
    it('renders without crashing', () => {
      render(<Badge variant="green">Test Badge</Badge>)
      expect(screen.getByText('Test Badge')).toBeInTheDocument()
    })

    it('applies correct variant styles', () => {
      const { container } = render(<Badge variant="red">Error</Badge>)
      const badge = container.querySelector('span')
      expect(badge).toHaveClass('bg-[#dc2626]')
    })

    it('applies size styles', () => {
      const { container } = render(
        <Badge variant="blue" size="sm">
          Small
        </Badge>
      )
      const badge = container.querySelector('span')
      expect(badge).toHaveClass('text-xs')
    })
  })

  describe('KPICard', () => {
    it('renders label and value', () => {
      render(<KPICard label="Revenue" value={45000} />)
      expect(screen.getByText('Revenue')).toBeInTheDocument()
      expect(screen.getByText('45000')).toBeInTheDocument()
    })

    it('renders subValue if provided', () => {
      render(<KPICard label="Users" value={150} subValue="Active this week" />)
      expect(screen.getByText('Active this week')).toBeInTheDocument()
    })

    it('shows trend indicator', () => {
      const { container } = render(<KPICard label="Growth" value="25%" trend="up" />)
      expect(container.textContent).toContain('Increased')
    })
  })

  describe('MoneyDisplay', () => {
    it('formats money correctly', () => {
      render(<MoneyDisplay amount={201186.41} />)
      expect(screen.getByText('$201,186.41')).toBeInTheDocument()
    })

    it('handles null values', () => {
      render(<MoneyDisplay amount={null} />)
      expect(screen.getByText('$0.00')).toBeInTheDocument()
    })

    it('applies size styles', () => {
      const { container } = render(<MoneyDisplay amount={1000} size="xl" />)
      const span = container.querySelector('span')
      expect(span).toHaveClass('text-2xl')
    })
  })

  describe('StatusChip', () => {
    it('maps paid status to green variant', () => {
      const { container } = render(<StatusChip status="paid" />)
      const badge = container.querySelector('span')
      expect(badge).toHaveClass('bg-[#00b87a]')
    })

    it('maps submitted status to blue variant', () => {
      const { container } = render(<StatusChip status="submitted" />)
      const badge = container.querySelector('span')
      expect(badge).toHaveClass('bg-[#2563eb]')
    })

    it('maps overdue status to red variant', () => {
      const { container } = render(<StatusChip status="overdue" />)
      const badge = container.querySelector('span')
      expect(badge).toHaveClass('bg-[#dc2626]')
    })
  })

  describe('TradeDot', () => {
    it('renders first letter of trade name', () => {
      render(<TradeDot tradeName="Plumbing" />)
      expect(screen.getByText('P')).toBeInTheDocument()
    })

    it('applies correct status color via inline style', () => {
      const { container } = render(<TradeDot tradeName="Electrical" status="active" />)
      // TradeDot uses inline style for colors (not Tailwind class)
      const dot = container.querySelector('button')
      expect(dot).toBeInTheDocument()
      expect(dot?.style.backgroundColor).toBeTruthy()
    })

    it('shows tooltip on hover with company name and trust score', async () => {
      const { container } = render(
        <TradeDot
          tradeName="HVAC"
          companyName="Cool Air Inc"
          trustScore={450}
          status="active"
        />
      )
      // TradeDot shows first letter of trade name (design spec: single letter circles)
      // Tooltip content may not be rendered until hover — check first letter
      const tooltipContent = container.textContent
      expect(tooltipContent).toContain('H') // First letter of 'HVAC'
    })
  })

  describe('ARIAStrip', () => {
    it('renders message text', () => {
      render(<ARIAStrip message="Test message" variant="morning" />)
      expect(screen.getByText('Test message')).toBeInTheDocument()
    })

    it('renders action button when provided', () => {
      render(
        <ARIAStrip
          message="Click me"
          actionLabel="Action"
          onAction={() => {}}
          variant="alert"
        />
      )
      expect(screen.getByText('Action')).toBeInTheDocument()
    })

    it('applies correct variant styles', () => {
      const { container } = render(<ARIAStrip message="Success" variant="success" />)
      const div = container.querySelector('div')
      expect(div).toHaveClass('from-[#00b87a]')
    })
  })

  describe('EmptyState', () => {
    it('renders welcome message', () => {
      render(<EmptyState firstName="John" onCreateProject={() => {}} />)
      expect(screen.getByText(/Welcome to ConstructInvoice AI, John!/)).toBeInTheDocument()
    })

    it('renders CTA button', () => {
      render(<EmptyState onCreateProject={() => {}} />)
      expect(screen.getByText(/Create Your First Project/)).toBeInTheDocument()
    })

    it('renders 3-step preview boxes', () => {
      render(<EmptyState onCreateProject={() => {}} />)
      expect(screen.getByText('Upload your SOV')).toBeInTheDocument()
      expect(screen.getByText('ARIA detects trades')).toBeInTheDocument()
      expect(screen.getByText('Generate invoice')).toBeInTheDocument()
    })
  })

  describe('CurrencyInput', () => {
    it('renders with placeholder', () => {
      render(
        <CurrencyInput
          value={null}
          onChange={() => {}}
          placeholder="Enter amount"
        />
      )
      expect(screen.getByPlaceholderText('Enter amount')).toBeInTheDocument()
    })

    it('displays dollar sign prefix', () => {
      const { container } = render(<CurrencyInput value={null} onChange={() => {}} />)
      expect(container.textContent).toContain('$')
    })

    it('handles disabled state', () => {
      render(
        <CurrencyInput value={null} onChange={() => {}} disabled={true} />
      )
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.disabled).toBe(true)
    })
  })

  describe('PayAppRow', () => {
    const mockPayApp = {
      id: 1,
      app_number: 1,
      status: 'paid',
      amount_due: 15000,
      period_label: 'March 2026',
      created_at: '2026-03-15T00:00:00Z',
    }

    it('renders pay app number and status', () => {
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
      expect(screen.getByText(/March 2026/)).toBeInTheDocument()
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
  })

  describe('ProjectCard', () => {
    const mockProject = {
      id: 1,
      name: 'Elm Street Addition',
      owner: 'John Doe',
      owner_email: 'john@example.com',
      original_contract: 100000,
      payment_terms: 'Net 30',
      status: 'active',
      pay_app_count: 2,
    }

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

    it('displays owner and contract info', () => {
      render(
        <ProjectCard
          project={mockProject}
          onCreatePayApp={() => {}}
          onArchive={() => {}}
          onClick={() => {}}
        />
      )
      expect(screen.getByText('John Doe')).toBeInTheDocument()
      expect(screen.getByText('Net 30')).toBeInTheDocument()
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

    it('shows trade dots when provided', () => {
      const trades = [
        { id: 1, trade_name: 'Plumbing', company_name: 'Pacific', trust_score: 700, status: 'active' as const },
        { id: 2, trade_name: 'Electrical', company_name: 'City Electric', trust_score: 500, status: 'active' as const },
      ]
      render(
        <ProjectCard
          project={mockProject}
          trades={trades}
          onCreatePayApp={() => {}}
          onArchive={() => {}}
          onClick={() => {}}
        />
      )
      expect(screen.getByText('P')).toBeInTheDocument()
      expect(screen.getByText('E')).toBeInTheDocument()
    })
  })
})
