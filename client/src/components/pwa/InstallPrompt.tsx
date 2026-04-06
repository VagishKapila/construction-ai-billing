import { useState, useEffect } from 'react'
import { Download, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * PWA Install Prompt
 * Shows a bottom banner on mobile when the app is installable.
 * Allows contractors to add ConstructInvoice AI to their home screen for quick access on the job site.
 */
export function InstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)

      // Show banner after 30 seconds on mobile viewport
      const isMobile = window.innerWidth < 768
      if (isMobile) {
        setTimeout(() => setShowBanner(true), 30000)
      }
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!showBanner || dismissed || !installPrompt) return null

  const handleInstall = async () => {
    try {
      await installPrompt.prompt()
      const { outcome } = await installPrompt.userChoice
      if (outcome === 'accepted') {
        setShowBanner(false)
      }
    } catch (error) {
      console.error('Install prompt failed:', error)
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-[#1A2230] border-t-2 border-[#E8622A] flex items-center gap-3 shadow-2xl safe-area-inset-bottom">
      {/* Icon */}
      <div className="w-10 h-10 rounded-lg bg-[#E8622A] flex items-center justify-center flex-shrink-0">
        <Download className="w-5 h-5 text-white" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold">Install ConstructInvoice AI</p>
        <p className="text-gray-400 text-xs">Quick access on the job site</p>
      </div>

      {/* Install Button */}
      <button
        onClick={handleInstall}
        className="px-3 py-1.5 bg-[#E8622A] text-white text-sm font-medium rounded-lg flex-shrink-0 hover:bg-[#d85a1a] transition-colors"
        aria-label="Install ConstructInvoice AI"
      >
        Install
      </button>

      {/* Dismiss Button */}
      <button
        onClick={() => setDismissed(true)}
        className="text-gray-400 hover:text-white flex-shrink-0 transition-colors"
        aria-label="Dismiss install prompt"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
