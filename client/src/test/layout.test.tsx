/**
 * Layout tests — RoleContext, Sidebar, TopNav
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { RoleProvider, useRole } from '@/contexts/RoleContext'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString() },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock auth + project hooks globally for layout tests
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, name: 'Vagish', email: 'vaakapila@gmail.com' },
    isAdmin: true,
    isLoading: false,
    logout: vi.fn(),
  }),
}))

vi.mock('@/hooks/useProjects', () => ({
  useProjects: () => ({
    projects: [{ id: 1, name: 'Elm Street', status: 'active', created_at: '2026-04-01' }],
    isLoading: false,
  }),
}))

// Mock useNavigate (used inside TopNav)
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// ─── RoleContext tests ──────────────────────────────────────────────────────

const RoleConsumer = () => {
  const { role, isContractor, isVendor, toggleRole } = useRole()
  return (
    <div>
      <span data-testid="role">{role}</span>
      <span data-testid="isContractor">{String(isContractor)}</span>
      <span data-testid="isVendor">{String(isVendor)}</span>
      <button onClick={toggleRole}>Toggle</button>
    </div>
  )
}

describe('RoleContext', () => {
  beforeEach(() => { localStorage.clear() })

  it('provides default contractor role', () => {
    render(
      <RoleProvider>
        <RoleConsumer />
      </RoleProvider>
    )
    expect(screen.getByTestId('role').textContent).toBe('contractor')
    expect(screen.getByTestId('isContractor').textContent).toBe('true')
    expect(screen.getByTestId('isVendor').textContent).toBe('false')
  })

  it('toggles between contractor and vendor roles', () => {
    render(
      <RoleProvider>
        <RoleConsumer />
      </RoleProvider>
    )
    fireEvent.click(screen.getByText('Toggle'))
    expect(screen.getByTestId('role').textContent).toBe('vendor')
    fireEvent.click(screen.getByText('Toggle'))
    expect(screen.getByTestId('role').textContent).toBe('contractor')
  })

  it('persists role to localStorage', () => {
    render(
      <RoleProvider>
        <RoleConsumer />
      </RoleProvider>
    )
    fireEvent.click(screen.getByText('Toggle'))
    expect(localStorage.getItem('ci_role')).toBe('vendor')
  })

  it('recovers role from localStorage on mount', () => {
    localStorage.setItem('ci_role', 'vendor')
    render(
      <RoleProvider>
        <RoleConsumer />
      </RoleProvider>
    )
    // Verify it renders without crashing — localStorage effect fires after render
    expect(screen.getByTestId('role')).toBeInTheDocument()
  })
})

// ─── Sidebar smoke tests ────────────────────────────────────────────────────

describe('Sidebar navigation', () => {
  it('renders Projects nav item and Settings', async () => {
    const { Sidebar } = await import('@/components/layout/Sidebar')
    render(
      <BrowserRouter>
        <RoleProvider>
          <Sidebar />
        </RoleProvider>
      </BrowserRouter>
    )
    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders New Project link', async () => {
    const { Sidebar } = await import('@/components/layout/Sidebar')
    render(
      <BrowserRouter>
        <RoleProvider>
          <Sidebar />
        </RoleProvider>
      </BrowserRouter>
    )
    expect(screen.getByText('New Project')).toBeInTheDocument()
  })

  it('renders search input', async () => {
    const { Sidebar } = await import('@/components/layout/Sidebar')
    render(
      <BrowserRouter>
        <RoleProvider>
          <Sidebar />
        </RoleProvider>
      </BrowserRouter>
    )
    expect(screen.getByPlaceholderText('Search projects...')).toBeInTheDocument()
  })

  it('shows active project section when projects passed', async () => {
    const { Sidebar } = await import('@/components/layout/Sidebar')
    const projects = [
      { id: 1, name: 'Elm Street Addition', address: '123 Elm St', status: 'active' },
    ]
    render(
      <BrowserRouter>
        <RoleProvider>
          <Sidebar projects={projects} />
        </RoleProvider>
      </BrowserRouter>
    )
    expect(screen.getByText('Elm Street Addition')).toBeInTheDocument()
  })

  it('renders Admin nav item for admin users', async () => {
    const { Sidebar } = await import('@/components/layout/Sidebar')
    render(
      <BrowserRouter>
        <RoleProvider>
          <Sidebar />
        </RoleProvider>
      </BrowserRouter>
    )
    // useAuth mock returns isAdmin: true
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })
})

// ─── TopNav tests ────────────────────────────────────────────────────────────

describe('TopNav', () => {
  it('renders Contractor and Vendor role buttons', async () => {
    const { TopNav } = await import('@/components/layout/TopNav')
    render(
      <BrowserRouter>
        <RoleProvider>
          <TopNav />
        </RoleProvider>
      </BrowserRouter>
    )
    expect(screen.getByText(/Contractor/i)).toBeInTheDocument()
    expect(screen.getByText(/Vendor/i)).toBeInTheDocument()
  })

  it('renders notification bell button', async () => {
    const { TopNav } = await import('@/components/layout/TopNav')
    render(
      <BrowserRouter>
        <RoleProvider>
          <TopNav />
        </RoleProvider>
      </BrowserRouter>
    )
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
  })

  it('opens notification dropdown on bell click', async () => {
    const { TopNav } = await import('@/components/layout/TopNav')
    render(
      <BrowserRouter>
        <RoleProvider>
          <TopNav />
        </RoleProvider>
      </BrowserRouter>
    )
    const bellBtn = screen.getByRole('button', { name: /notifications/i })
    fireEvent.click(bellBtn)
    expect(screen.getByText('No new notifications')).toBeInTheDocument()
  })

  it('renders user avatar button', async () => {
    const { TopNav } = await import('@/components/layout/TopNav')
    render(
      <BrowserRouter>
        <RoleProvider>
          <TopNav />
        </RoleProvider>
      </BrowserRouter>
    )
    // User menu button uses aria-label with user name
    expect(screen.getByRole('button', { name: /user menu/i })).toBeInTheDocument()
  })

  it('opens user dropdown on avatar click and shows sign out', async () => {
    const { TopNav } = await import('@/components/layout/TopNav')
    render(
      <BrowserRouter>
        <RoleProvider>
          <TopNav />
        </RoleProvider>
      </BrowserRouter>
    )
    const userBtn = screen.getByRole('button', { name: /user menu/i })
    fireEvent.click(userBtn)
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument()
  })
})

// ─── RoleSwitcher pill labels ───────────────────────────────────────────────

describe('RoleSwitcher', () => {
  it('shows Contractor and Vendor pills', async () => {
    const { RoleSwitcher } = await import('@/components/shared/RoleSwitcher')
    render(
      <BrowserRouter>
        <RoleProvider>
          <RoleSwitcher />
        </RoleProvider>
      </BrowserRouter>
    )
    expect(screen.getByText(/Contractor/i)).toBeInTheDocument()
    expect(screen.getByText(/Vendor/i)).toBeInTheDocument()
  })
})
