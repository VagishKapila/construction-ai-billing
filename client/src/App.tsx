import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AuthProvider, AuthGuard, AdminGuard } from '@/contexts/AuthContext'
import { ErrorBoundary } from '@/components/shared'
import { Shell } from '@/components/layout/Shell'

// Import all pages
import { Landing } from '@/pages/Landing'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { ForgotPassword } from '@/pages/ForgotPassword'
import { ResetPassword } from '@/pages/ResetPassword'
import { Dashboard } from '@/pages/Dashboard'
import { NewProject } from '@/pages/NewProject'
import { ProjectDetail } from '@/pages/ProjectDetail'
import { PayAppEditor } from '@/pages/PayAppEditor'
import { PaymentPage } from '@/pages/PaymentPage'
import { PaymentsDashboard } from '@/pages/PaymentsDashboard'
import { Reports } from '@/pages/Reports'
import { Settings } from '@/pages/Settings'
import { AdminDashboard } from '@/pages/AdminDashboard'
import { Help } from '@/pages/Help'
import { NotFound } from '@/pages/NotFound'

/**
 * Protected route wrapper — requires authentication
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <Shell>{children}</Shell>
    </AuthGuard>
  )
}

/**
 * Admin route wrapper — requires authentication + admin role
 */
function AdminRoute({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AdminGuard>
        <Shell>{children}</Shell>
      </AdminGuard>
    </AuthGuard>
  )
}

/**
 * Page transition wrapper — smooth fade between routes
 */
function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  )
}

/**
 * App Router
 */
function AppRouter() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
    <Routes location={location} key={location.pathname}>
      {/* Public routes (no auth, no shell) */}
      <Route path="/" element={<PageTransition><Landing /></PageTransition>} />
      <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
      <Route path="/register" element={<PageTransition><Register /></PageTransition>} />
      <Route path="/forgot-password" element={<PageTransition><ForgotPassword /></PageTransition>} />
      <Route path="/reset-password" element={<PageTransition><ResetPassword /></PageTransition>} />

      {/* Public payment page (no auth, no shell) */}
      <Route path="/pay/:token" element={<PageTransition><PaymentPage /></PageTransition>} />

      {/* Protected routes (auth required + shell layout) */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/new"
        element={
          <ProtectedRoute>
            <NewProject />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id"
        element={
          <ProtectedRoute>
            <ProjectDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id/pay-app/:appId"
        element={
          <ProtectedRoute>
            <PayAppEditor />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payments"
        element={
          <ProtectedRoute>
            <PaymentsDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <Reports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/help"
        element={
          <ProtectedRoute>
            <Help />
          </ProtectedRoute>
        }
      />

      {/* Admin routes (auth + admin required + shell layout) */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        }
      />

      {/* Catch-all */}
      <Route path="/404" element={<PageTransition><NotFound /></PageTransition>} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
    </AnimatePresence>
  )
}

/**
 * Root App component with providers
 * useTrial hook reads directly from AuthContext — no separate TrialProvider needed
 */
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
