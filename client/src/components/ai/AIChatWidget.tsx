/**
 * Aria — AI Chat Widget (v2)
 *
 * Design goals:
 * - Draggable floating button (desktop) — never covers critical content
 * - Mobile: full-screen bottom sheet with slide-up animation
 * - Aria's avatar (ai-avatar.png) shown prominently
 * - Production-quality UI for 1M+ users
 * - WCAG 2.1 AA compliant
 * - Touch-friendly (44px minimum tap targets)
 */

import type { ReactNode } from 'react'
import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Send, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { api } from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface AIChatWidgetProps {
  triggerContent?: ReactNode
  onToggle?: (isOpen: boolean) => void
}

// ─── Quick-prompt chips shown on empty state ──────────────────────────────────
const QUICK_PROMPTS = [
  'How do I create a project?',
  'What file formats can I upload?',
  'How does retainage work?',
  'How do I send a pay app?',
]

// ─── Detect mobile viewport ───────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

// ─── Draggable position hook ──────────────────────────────────────────────────
function useDraggable(defaultPos: { x: number; y: number }) {
  const [pos, setPos] = useState(defaultPos)
  const isDragging = useRef(false)
  const hasDragged = useRef(false)
  const startRef = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    hasDragged.current = false
    startRef.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }
    e.preventDefault()
  }, [pos])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const dx = e.clientX - startRef.current.mx
      const dy = e.clientY - startRef.current.my
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasDragged.current = true
      const newX = Math.max(8, Math.min(window.innerWidth - 72, startRef.current.px + dx))
      const newY = Math.max(8, Math.min(window.innerHeight - 72, startRef.current.py + dy))
      setPos({ x: newX, y: newY })
    }
    const onUp = () => { isDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return { pos, onMouseDown, wasDragged: () => hasDragged.current }
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AIChatWidget({ onToggle }: AIChatWidgetProps) {
  const { isAuthenticated } = useAuth()
  const isMobile = useIsMobile()

  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  // Default position: bottom-right, safe distance from edges
  const { pos, onMouseDown, wasDragged } = useDraggable({
    x: window.innerWidth - 80,
    y: window.innerHeight - 80,
  })

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100)
  }, [isOpen])

  useEffect(() => { onToggle?.(isOpen) }, [isOpen, onToggle])

  // Lock body scroll on mobile when open
  useEffect(() => {
    if (isMobile && isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isMobile, isOpen])

  const handleToggle = () => {
    if (wasDragged()) return // suppress click after drag
    setIsOpen((v) => !v)
  }

  const sendMessage = async (text: string) => {
    if (!text.trim()) return
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInputValue('')
    setError(null)
    setIsLoading(true)

    try {
      const response = await api.post<{ answer: string }>('/api/ai/ask', {
        question: text.trim(),
        history: messages.map((m) => ({ role: m.role, content: m.content })),
      })
      if (response.data) {
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: response.data!.answer,
            timestamp: new Date(),
          },
        ])
      } else {
        setError(response.error || 'Something went wrong. Try again.')
      }
    } catch {
      setError('Connection error. Please try again.')
    } finally {
      setIsLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(inputValue)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputValue)
    }
  }

  if (!isAuthenticated) return null

  // ─── Floating avatar button ───────────────────────────────────────────────
  const FloatingButton = (
    <button
      onMouseDown={isMobile ? undefined : onMouseDown}
      onClick={handleToggle}
      aria-label={isOpen ? 'Close Aria chat' : 'Open Aria chat'}
      aria-expanded={isOpen}
      style={
        isMobile
          ? { position: 'fixed', bottom: 96, right: 16, zIndex: 50 } // above 80px bottom nav
          : { position: 'fixed', left: pos.x, top: pos.y, zIndex: 50, cursor: 'grab' }
      }
      className={cn(
        'w-14 h-14 rounded-full shadow-xl',
        'transition-transform duration-150 hover:scale-105 active:scale-95',
        'ring-2 ring-white ring-offset-1',
        'focus:outline-none focus:ring-4 focus:ring-indigo-400',
        'select-none overflow-hidden',
        isOpen && 'ring-indigo-400',
      )}
    >
      {isOpen ? (
        <div className="w-full h-full rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center">
          <X size={22} className="text-white" />
        </div>
      ) : (
        <>
          <img
            src="/ai-avatar.png"
            alt="Aria AI Assistant"
            className="w-full h-full object-cover object-top"
            draggable={false}
          />
          {/* Online dot */}
          <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-emerald-400 border-2 border-white rounded-full" />
        </>
      )}
    </button>
  )

  // ─── Chat panel ───────────────────────────────────────────────────────────
  // Desktop: anchored near button. Mobile: full-width bottom sheet.
  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 51,
        maxHeight: '88vh',
        borderRadius: '20px 20px 0 0',
      }
    : (() => {
        // Position panel so it doesn't go off-screen
        const panelW = 384
        const panelH = 560
        let left = pos.x - panelW + 56
        let top = pos.y - panelH - 12
        if (left < 8) left = 8
        if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8
        if (top < 8) top = pos.y + 68 // flip below button if not enough room above
        return { position: 'fixed', left, top, width: panelW, zIndex: 51, borderRadius: 20 }
      })()

  const ChatPanel = isOpen ? (
    <>
      {/* Mobile backdrop */}
      {isMobile && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div
        style={panelStyle}
        className={cn(
          'bg-white flex flex-col overflow-hidden',
          'shadow-2xl border border-gray-200/80',
          isMobile
            ? 'animate-in slide-in-from-bottom duration-300'
            : 'animate-in slide-in-from-bottom-3 fade-in duration-200',
        )}
      >
        {/* ── Header ────────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)',
            borderRadius: isMobile ? '20px 20px 0 0' : '20px 20px 0 0',
          }}
        >
          {/* Aria avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-11 h-11 rounded-full overflow-hidden ring-2 ring-white/50">
              <img
                src="/ai-avatar.png"
                alt="Aria"
                className="w-full h-full object-cover object-top"
              />
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-white rounded-full" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-white text-sm leading-tight">Ask Aria</h3>
            <p className="text-xs text-indigo-200 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block" />
              Online · AI Assistant
            </p>
          </div>

          {/* Mobile drag handle + close */}
          <div className="flex items-center gap-1">
            {isMobile && (
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Minimize"
              >
                <ChevronDown size={20} />
              </button>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close chat"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Messages ──────────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{
            background: '#f8f9fe',
            minHeight: isMobile ? 240 : 320,
            maxHeight: isMobile ? 'calc(88vh - 180px)' : 360,
          }}
        >
          {messages.length === 0 && !isLoading ? (
            // ── Empty / welcome state ─────────────────────────────
            <div className="flex flex-col items-center justify-center h-full px-5 py-8 text-center space-y-4">
              <div className="w-20 h-20 rounded-full overflow-hidden shadow-lg ring-4 ring-white">
                <img
                  src="/ai-avatar.png"
                  alt="Aria"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-base">Hi, I'm Aria!</p>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                  Your AI assistant for ConstructInvoice. Ask me anything.
                </p>
              </div>

              {/* Quick prompt chips */}
              <div className="flex flex-wrap gap-2 justify-center pt-1">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium',
                      'bg-white border border-indigo-200 text-indigo-700',
                      'hover:bg-indigo-50 hover:border-indigo-400',
                      'transition-colors shadow-sm active:scale-95',
                    )}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // ── Message list ─────────────────────────────────────
            <div className="px-4 py-4 space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn('flex gap-2.5 items-end', {
                    'justify-end': msg.role === 'user',
                  })}
                >
                  {/* Aria avatar on assistant messages */}
                  {msg.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 shadow ring-1 ring-white">
                      <img
                        src="/ai-avatar.png"
                        alt="Aria"
                        className="w-full h-full object-cover object-top"
                      />
                    </div>
                  )}

                  <div
                    className={cn(
                      'max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
                      {
                        'bg-gradient-to-br from-indigo-600 to-purple-700 text-white rounded-br-md':
                          msg.role === 'user',
                        'bg-white text-gray-800 border border-gray-200/80 rounded-bl-md':
                          msg.role === 'assistant',
                      },
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    <p
                      className={cn('text-[10px] mt-1 text-right', {
                        'text-indigo-200': msg.role === 'user',
                        'text-gray-400': msg.role === 'assistant',
                      })}
                    >
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* User initials bubble */}
                  {msg.role === 'user' && (
                    <div className="w-7 h-7 rounded-full flex-shrink-0 bg-indigo-100 flex items-center justify-center shadow ring-1 ring-white">
                      <span className="text-xs font-bold text-indigo-700">Y</span>
                    </div>
                  )}
                </div>
              ))}

              {/* Typing indicator */}
              {isLoading && (
                <div className="flex gap-2.5 items-end">
                  <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 shadow ring-1 ring-white">
                    <img src="/ai-avatar.png" alt="Aria" className="w-full h-full object-cover object-top" />
                  </div>
                  <div className="bg-white border border-gray-200/80 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                    <div className="flex gap-1.5 items-center h-4">
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
                          style={{ animationDelay: `${delay}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mx-1 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Input bar ─────────────────────────────────────────────── */}
        <div className="flex-shrink-0 border-t border-gray-200 bg-white px-3 py-3">
          <form onSubmit={handleSubmit} className="flex gap-2 items-end">
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value)
                // Auto-grow textarea
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask Aria anything..."
              disabled={isLoading}
              rows={1}
              className={cn(
                'flex-1 resize-none rounded-xl px-3.5 py-2.5',
                'border border-gray-300 bg-gray-50',
                'text-sm text-gray-900 placeholder-gray-400',
                'focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent focus:bg-white',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                'transition-all duration-150',
                'min-h-[40px] max-h-[120px] leading-5',
                // iOS: prevent zoom on focus
                'text-base md:text-sm',
              )}
              style={{ fontSize: 16 }} // Prevents iOS auto-zoom
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              aria-label="Send message"
              className={cn(
                'w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center',
                'transition-all duration-150 active:scale-95',
                inputValue.trim() && !isLoading
                  ? 'bg-gradient-to-br from-indigo-600 to-purple-700 text-white shadow-md hover:shadow-lg hover:scale-105'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed',
              )}
            >
              <Send size={16} />
            </button>
          </form>
          <p className="text-center text-[10px] text-gray-400 mt-1.5">
            Powered by ConstructInvoice AI
          </p>
        </div>
      </div>
    </>
  ) : null

  return (
    <>
      {ChatPanel}
      {FloatingButton}
    </>
  )
}
