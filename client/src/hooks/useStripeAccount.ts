/**
 * useStripeAccount — Stripe Connect account status for the current GC user
 *
 * Fetches the connected account once on mount and exposes helpers for
 * starting onboarding, checking connection status, and refreshing state.
 * Designed to be consumed by Dashboard, Settings, and the gate modal so
 * all three always show a consistent picture.
 */

import { useState, useEffect, useCallback } from 'react'
import * as paymentsApi from '@/api/payments'
import type { ConnectedAccount } from '@/types'

export interface UseStripeAccountReturn {
  /** The connected account details (null = not yet connected or still loading) */
  account: (ConnectedAccount & { connected?: boolean; status?: string; account_id?: string }) | null
  isLoading: boolean
  error: string | null

  /** true when the GC has a connected account AND charges are enabled */
  isActive: boolean

  /** true when connected but Stripe onboarding is not yet complete */
  isPending: boolean

  /** Refresh account status from the API */
  refresh: () => Promise<void>

  /** Start Connect onboarding — opens Stripe URL in same tab */
  startOnboarding: () => Promise<void>

  /** Disconnect Stripe — removes account from our DB */
  disconnect: () => Promise<void>
}

export function useStripeAccount(): UseStripeAccountReturn {
  const [account, setAccount] = useState<UseStripeAccountReturn['account']>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await paymentsApi.getStripeAccountStatus()
      if (response.error) {
        setError(response.error)
        setAccount(null)
      } else if (response.data) {
        // Backend returns a flat object with `connected` flag; cast it
        setAccount(response.data as UseStripeAccountReturn['account'])
      } else {
        setAccount(null)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load Stripe status'
      setError(msg)
      setAccount(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const startOnboarding = useCallback(async () => {
    try {
      const response = await paymentsApi.startStripeConnect()
      if (response.data?.url) {
        window.location.href = response.data.url
      } else {
        throw new Error(response.error || 'Failed to get onboarding URL')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start Stripe onboarding'
      setError(msg)
    }
  }, [])

  const disconnect = useCallback(async () => {
    try {
      setIsLoading(true)
      await paymentsApi.disconnectStripe()
      setAccount(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to disconnect Stripe'
      setError(msg)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const connected = Boolean((account as any)?.connected)
  const isActive = connected && Boolean((account as any)?.charges_enabled)
  const isPending = connected && !Boolean((account as any)?.charges_enabled)

  return { account, isLoading, error, isActive, isPending, refresh, startOnboarding, disconnect }
}
