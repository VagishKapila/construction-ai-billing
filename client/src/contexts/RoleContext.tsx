import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

type Role = 'contractor' | 'vendor'

interface RoleContextValue {
  role: Role
  isVendor: boolean
  isContractor: boolean
  toggleRole: () => void
  setRole: (role: Role) => void
}

// Persists to localStorage key 'ci_role'
// Default: 'contractor'
// Every role-aware component reads from this context

const STORAGE_KEY = 'ci_role'

export const RoleContext = createContext<RoleContextValue | null>(null)

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>('contractor')

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Role | null
      if (stored === 'contractor' || stored === 'vendor') {
        setRoleState(stored)
      }
    } catch {
      // localStorage not available, use default
    }
  }, [])

  // Save to localStorage when role changes
  const setRole = (newRole: Role) => {
    setRoleState(newRole)
    try {
      localStorage.setItem(STORAGE_KEY, newRole)
    } catch {
      // localStorage not available, silent fail
    }
  }

  const toggleRole = () => {
    const newRole = role === 'contractor' ? 'vendor' : 'contractor'
    setRole(newRole)
  }

  const value: RoleContextValue = {
    role,
    isVendor: role === 'vendor',
    isContractor: role === 'contractor',
    toggleRole,
    setRole,
  }

  // Always provide context — don't gate on isReady (causes useRole to throw before mount)
  return (
    <RoleContext.Provider value={value}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext)
  if (!ctx) {
    throw new Error('useRole must be used within RoleProvider')
  }
  return ctx
}
