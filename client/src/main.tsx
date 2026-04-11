import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import * as Sentry from '@sentry/react'
import { ErrorPage } from './components/ErrorPage'

// Initialize Sentry for frontend error monitoring
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1,
  // Only initialize if DSN is configured
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorPage />}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
