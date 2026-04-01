import type { ReactNode } from 'react'
import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Sparkles } from 'lucide-react'
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
  /**
   * Optional custom trigger button content
   */
  triggerContent?: ReactNode

  /**
   * Called when widget opens/closes
   */
  onToggle?: (isOpen: boolean) => void
}

/**
 * Aria — AI Chat Widget
 *
 * Floating chat widget available on every app page.
 * Features:
 * - Floating button (bottom-right, indigo gradient)
 * - Expandable chat panel (400px wide)
 * - Message history within session
 * - Typing indicator
 * - Smart product question detection
 * - Error handling and loading states
 * - Only visible when authenticated
 */
export function AIChatWidget({ triggerContent, onToggle }: AIChatWidgetProps) {
  const { isAuthenticated } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Notify parent when toggling
  useEffect(() => {
    onToggle?.(isOpen)
  }, [isOpen, onToggle])

  /**
   * Check if question looks like a product question
   */
  const isProductQuestion = (text: string): boolean => {
    const productKeywords = [
      'how do',
      'how can',
      'where',
      'what',
      'help',
      'can i',
      'i want',
      'i need',
      'how to',
      'create',
      'upload',
      'generate',
      'send',
      'retainage',
      'lien waiver',
      'pay app',
      'g702',
      'g703',
      'project',
      'schedule of values',
      'sov',
      'payment',
    ]

    const lowerText = text.toLowerCase()
    return productKeywords.some((keyword) => lowerText.includes(keyword))
  }

  /**
   * Send message to AI assistant
   */
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!inputValue.trim()) return

    // Create user message
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    }

    // Add user message to history
    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setError(null)
    setIsLoading(true)

    try {
      // Check if this looks like a product question
      const isProduct = isProductQuestion(inputValue)
      let systemHint = ''
      if (isProduct) {
        systemHint =
          'Looks like you\'re asking about the product — I can help with that!'
      }

      // Call AI endpoint
      const response = await api.post<{ answer: string }>('/api/ai/ask', {
        question: inputValue,
        history: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      })

      if (response.data) {
        // Add AI response
        const aiMessage: ChatMessage = {
          id: `msg-${Date.now()}-ai`,
          role: 'assistant',
          content: response.data.answer,
          timestamp: new Date(),
        }

        setMessages((prev) => [...prev, aiMessage])

        // If we showed a hint, add it as a subtle system message
        if (systemHint) {
          // Just log it, don't add to messages
          console.log('Product question detected')
        }
      } else {
        setError(response.error || 'Failed to get response from AI')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
      console.error('AI chat error:', err)
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  // Don't show widget if not authenticated
  if (!isAuthenticated) return null

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'fixed bottom-6 right-6 z-40',
          'w-14 h-14 rounded-full',
          'bg-gradient-to-br from-indigo-600 to-purple-600',
          'flex items-center justify-center gap-2',
          'text-white shadow-lg hover:shadow-xl',
          'transition-all duration-200',
          'hover:scale-110 active:scale-95',
          'group',
        )}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        aria-expanded={isOpen}
      >
        {triggerContent ? (
          triggerContent
        ) : (
          <>
            {isOpen ? (
              <X size={24} className="transition-transform group-hover:rotate-90" />
            ) : (
              <>
                <MessageCircle size={24} />
                <Sparkles
                  size={12}
                  className="absolute top-1 right-1 animate-pulse"
                  fill="currentColor"
                />
              </>
            )}
          </>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div
          className={cn(
            'fixed bottom-24 right-6 z-40',
            'w-full max-w-[400px]',
            'h-[600px] max-h-[80vh]',
            'bg-white rounded-2xl shadow-2xl',
            'border border-gray-200',
            'flex flex-col',
            'animate-in slide-in-from-bottom-4 fade-in duration-200',
            'sm:max-w-none',
          )}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-t-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                <Sparkles size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Ask Aria</h3>
                <p className="text-xs text-gray-600">AI Assistant</p>
              </div>
            </div>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.length === 0 && !isLoading && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-3 px-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mx-auto">
                    <Sparkles size={24} className="text-indigo-600" />
                  </div>
                  <p className="text-sm text-gray-600">
                    Hi there! I'm Aria, your AI assistant. Ask me anything about
                    ConstructInvoice AI.
                  </p>
                  <div className="pt-2 space-y-2 text-xs">
                    <p className="text-gray-500">Popular topics:</p>
                    <div className="space-y-1">
                      <button
                        onClick={() =>
                          setInputValue('How do I create a new project?')
                        }
                        className="block text-indigo-600 hover:underline"
                      >
                        → Creating projects
                      </button>
                      <button
                        onClick={() =>
                          setInputValue('What file formats can I upload?')
                        }
                        className="block text-indigo-600 hover:underline"
                      >
                        → Supported file formats
                      </button>
                      <button
                        onClick={() =>
                          setInputValue('How does retainage work?')
                        }
                        className="block text-indigo-600 hover:underline"
                      >
                        → Understanding retainage
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Chat messages */}
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn('flex gap-3', {
                  'justify-end': message.role === 'user',
                })}
              >
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex-shrink-0 flex items-center justify-center">
                    <Sparkles size={16} className="text-indigo-600" />
                  </div>
                )}

                <div
                  className={cn(
                    'max-w-xs rounded-lg px-4 py-3 text-sm break-words',
                    {
                      'bg-indigo-600 text-white': message.role === 'user',
                      'bg-white text-gray-900 border border-gray-200':
                        message.role === 'assistant',
                    },
                  )}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {message.content}
                  </p>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex-shrink-0 flex items-center justify-center">
                  <Sparkles size={16} className="text-indigo-600" />
                </div>
                <div className="bg-white text-gray-900 border border-gray-200 rounded-lg px-4 py-3">
                  <div className="flex gap-1.5 items-center">
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    />
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    />
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="mx-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Footer text */}
          <div className="px-4 py-2 text-center border-t border-gray-200 bg-gray-50">
            <p className="text-xs text-gray-500">
              Powered by ConstructInvoice AI
            </p>
          </div>

          {/* Input form */}
          <form
            onSubmit={handleSendMessage}
            className="px-4 py-3 border-t border-gray-200 bg-white rounded-b-2xl"
          >
            <div className="flex gap-2 items-center">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask a question..."
                disabled={isLoading}
                className={cn(
                  'flex-1 px-3 py-2 rounded-lg',
                  'border border-gray-300',
                  'text-sm text-gray-900 placeholder-gray-500',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                  'disabled:bg-gray-100 disabled:cursor-not-allowed',
                  'transition-colors',
                )}
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className={cn(
                  'p-2 rounded-lg flex-shrink-0',
                  'transition-all duration-200',
                  {
                    'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95':
                      !isLoading && inputValue.trim(),
                    'bg-gray-200 text-gray-500 cursor-not-allowed':
                      isLoading || !inputValue.trim(),
                  },
                )}
                aria-label="Send message"
              >
                <Send size={18} />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
