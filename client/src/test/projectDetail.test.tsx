/**
 * ProjectDetail smoke tests
 * Tests component renders without crashing — not brittle implementation details.
 * The split-screen layout and orbital are tested via E2E (Layer 8).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { RoleProvider } from '@/contexts/RoleContext'

// ─── Mock everything ProjectDetail depends on ───────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, name: 'Vagish', email: 'vaakapila@gmail.com' },
    isAdmin: false,
    isLoading: false,
    logout: vi.fn(),
  }),
}))

vi.mock('@/hooks/useTrial', () => ({
  useTrial: () => ({ isTrialGated: false, daysRemaining: 85, isPro: false }),
}))

vi.mock('@/hooks/useStripeAccount', () => ({
  useStripeAccount: () => ({ stripeActive: false, loading: false }),
}))

vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({ projects: [], isLoading: false }),
}))

vi.mock('@/hooks/useProject', () => ({
  useProject: () => ({
    project: {
      id: 1,
      name: '123 Elm Street',
      owner: 'Paul Bains',
      owner_email: 'paul@bains.com',
      original_contract: 268233,
      payment_terms: 'Net 30',
      status: 'active',
      created_at: '2026-04-01',
      contractor: 'Test Contractor',
      include_architect: false,
      include_retainage: true,
      default_retainage: 10,
    },
    payApps: [],
    sovLines: [],
    changeOrders: [],
    attachments: [],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
    updateProject: vi.fn(),
  }),
}))

vi.mock('@/api/hub', () => ({
  getTrades: vi.fn(() => Promise.resolve({ data: [] })),
}))

vi.mock('@/api/projects', () => ({
  getProjectReconciliation: vi.fn(() => Promise.resolve({ data: { summary: {} } })),
  completeProject: vi.fn(() => Promise.resolve({})),
  reopenProject: vi.fn(() => Promise.resolve({})),
  createProjectChangeOrder: vi.fn(() => Promise.resolve({})),
  updateChangeOrderStatus: vi.fn(() => Promise.resolve({})),
  recordManualPayment: vi.fn(() => Promise.resolve({})),
}))

vi.mock('@/api/lienWaivers', () => ({
  getLienDocs: vi.fn(() => Promise.resolve({ data: [] })),
  createLienDoc: vi.fn(() => Promise.resolve({ data: {} })),
  downloadLienDocPDF: vi.fn(() => Promise.resolve(new Blob())),
}))

vi.mock('@/api/attachments', () => ({
  uploadAttachment: vi.fn(() => Promise.resolve({ data: {} })),
  deleteAttachment: vi.fn(() => Promise.resolve({})),
}))

// Mock canvas for OrbitalCanvas
class MockCanvasContext {
  clearRect = vi.fn()
  fillRect = vi.fn()
  strokeRect = vi.fn()
  beginPath = vi.fn()
  arc = vi.fn()
  fill = vi.fn()
  stroke = vi.fn()
  moveTo = vi.fn()
  lineTo = vi.fn()
  closePath = vi.fn()
  fillText = vi.fn()
  measureText = vi.fn(() => ({ width: 50 }))
  save = vi.fn()
  restore = vi.fn()
  translate = vi.fn()
  rotate = vi.fn()
  scale = vi.fn()
  createRadialGradient = vi.fn(() => ({
    addColorStop: vi.fn()
  }))
  canvas = { width: 800, height: 600 }
}

HTMLCanvasElement.prototype.getContext = vi.fn(() => new MockCanvasContext() as unknown as CanvasRenderingContext2D)

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ProjectDetail — Split-screen Command Center', () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={['/projects/1']}>
      <RoleProvider>
        {children}
      </RoleProvider>
    </MemoryRouter>
  )

  it('renders without crashing', async () => {
    const { ProjectDetail } = await import('@/pages/ProjectDetail')
    expect(() => render(<ProjectDetail />, { wrapper: Wrapper })).not.toThrow()
  })

  it('does not crash on missing project data', async () => {
    vi.doMock('@/hooks/useProject', () => ({
      useProject: () => ({
        project: null,
        payApps: [],
        sovLines: [],
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      }),
    }))
    // Component should show loading state, not crash
    const { ProjectDetail } = await import('@/pages/ProjectDetail')
    expect(() => render(<ProjectDetail />, { wrapper: Wrapper })).not.toThrow()
  })
})

// ─── VendorDetailPanel smoke test ───────────────────────────────────────────

describe('VendorDetailPanel', () => {
  it('renders trade info without crashing', async () => {
    const { VendorDetailPanel } = await import('@/components/shared/VendorDetailPanel')
    const mockTrade = {
      id: 1,
      trade_name: 'Plumbing',
      company_name: 'Pacific Plumbing',
      status: 'active',
      trust_score: 712,
      email_alias: 'plumbing-1@hub.constructinv.varshyl.com',
    }
    const { container } = render(
      <BrowserRouter>
        <VendorDetailPanel
          trade={mockTrade}
          onClose={vi.fn()}
        />
      </BrowserRouter>
    )
    expect(screen.getByText('Pacific Plumbing')).toBeInTheDocument()
    // Trust score may be split across DOM nodes — check textContent
    expect(container.textContent).toContain('712')
  })

  it('renders with null company name gracefully', async () => {
    const { VendorDetailPanel } = await import('@/components/shared/VendorDetailPanel')
    const mockTrade = {
      id: 2,
      trade_name: 'Electrical',
      company_name: null,
      status: 'pending',
      trust_score: null,
    }
    expect(() => render(
      <BrowserRouter>
        <VendorDetailPanel
          trade={mockTrade}
          onClose={vi.fn()}
        />
      </BrowserRouter>
    )).not.toThrow()
  })
})
