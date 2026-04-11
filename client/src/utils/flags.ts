/**
 * Client-side Feature Flags
 * Reads from Vite environment variables (VITE_FF_*)
 * Set these on Railway under the client build environment.
 *
 * Usage:
 *   import { flags } from '@/utils/flags'
 *   if (flags.trustScore) { ... }
 */
export const flags = {
  trustScore:   import.meta.env.VITE_FF_TRUST_SCORE === 'true',
  earlyPayment: import.meta.env.VITE_FF_EARLY_PAY === 'true',
  lienModule:   import.meta.env.VITE_FF_LIEN === 'true',
  joinCode:     import.meta.env.VITE_FF_JOIN_CODE === 'true',
  orbitalV2:    import.meta.env.VITE_FF_ORBITAL_V2 === 'true',
} as const

export type FeatureFlag = keyof typeof flags

/**
 * Type-safe helper to check if a flag is enabled.
 */
export function isEnabled(flag: FeatureFlag): boolean {
  return flags[flag]
}
