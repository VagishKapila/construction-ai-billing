import { useState, useRef, useEffect } from 'react'
import {
  Send,
  ChevronDown,
  ChevronUp,
  Sparkles,
  HelpCircle,
  Mail,
  BookOpen,
  Zap,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/cn'
import { api } from '@/api/client'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export function Help() {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const faqItems = [
    {
      id: '1',
      question: 'How do I create a new project?',
      answer:
        'To create a new project, click the "New Project" button on the Dashboard. Fill in your project details including the contract amount and general contractor information. You can upload your Schedule of Values (SOV) in Excel, CSV, PDF, or Word format.',
      icon: BookOpen,
    },
    {
      id: '2',
      question: 'What file formats can I upload for Schedule of Values?',
      answer:
        'We support Excel (.xlsx, .xls), CSV, PDF, and Word (.docx, .doc) formats for Schedule of Values. Our parser automatically detects and extracts line items and amounts from your documents.',
      icon: BookOpen,
    },
    {
      id: '3',
      question: 'How do I generate a G702/G703 pay application?',
      answer:
        'Once you have a project with a Schedule of Values, click "New Pay Application" on the project detail page. Enter the work completed this period for each line item, and we\'ll automatically calculate the G702 and G703 forms with proper retainage and payment calculations.',
      icon: Zap,
    },
    {
      id: '4',
      question: 'What is retainage and how does it work?',
      answer:
        'Retainage is a percentage of work completed that is held back from payment until project completion. You can set a default retainage percentage in Settings, or override it per line item in your pay applications. Retainage is calculated as a percentage of work completed to date.',
      icon: HelpCircle,
    },
    {
      id: '5',
      question: 'How do I send a pay application to the owner?',
      answer:
        'From your pay application, click the "Send to Owner" button. Enter the owner\'s email address and we\'ll send them a PDF of the G702/G703 forms. They can view the invoice and make a payment directly through our secure payment page.',
      icon: Mail,
    },
    {
      id: '6',
      question: 'How do I accept payments from owners?',
      answer:
        'Connect your Stripe account in Settings under "Accept Payments". Once connected, when you send pay applications to owners, they\'ll be able to pay via ACH bank transfer or credit card. You can track payment status in your Payments dashboard.',
      icon: Zap,
    },
    {
      id: '7',
      question: 'What is a lien waiver and how do I generate one?',
      answer:
        'A lien waiver is a document that releases your right to place a lien on a property in exchange for payment. You can generate conditional or unconditional lien waivers from any pay application. The form auto-fills with your company information and the payment amounts.',
      icon: HelpCircle,
    },
    {
      id: '8',
      question: 'Can I customize my company logo and signature?',
      answer:
        'Yes. Go to Settings and upload your company logo and signature under "Logo & Signature". These will be included on all generated PDFs. Your logo should be in PNG or JPG format and under 2MB.',
      icon: BookOpen,
    },
  ]

  const filteredItems = faqItems.filter(
    (item) =>
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  // Auto-scroll chat to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  /**
   * Send chat message to AI assistant
   */
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!chatInput.trim()) return

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: chatInput,
    }

    setChatMessages((prev) => [...prev, userMessage])
    setChatInput('')
    setChatError(null)
    setIsChatLoading(true)

    try {
      const response = await api.post<{ answer: string }>('/api/ai/ask', {
        question: chatInput,
        history: chatMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      })

      if (response.data) {
        const aiMessage: ChatMessage = {
          id: `msg-${Date.now()}-ai`,
          role: 'assistant',
          content: response.data.answer,
        }

        setChatMessages((prev) => [...prev, aiMessage])
      } else {
        setChatError(response.error || 'Failed to get response from AI')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setChatError(message)
    } finally {
      setIsChatLoading(false)
    }
  }

  /**
   * Click a quick suggestion
   */
  const handleQuickSuggestion = (suggestion: string) => {
    setChatInput(suggestion)
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <PageHeader
        title="Help & FAQ"
        description="Answers to common questions about ConstructInvoice AI"
      />

      {/* AI Chat Section */}
      <Card className="border border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 overflow-hidden">
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3 pb-4 border-b border-indigo-200">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Ask Aria</h3>
              <p className="text-xs text-gray-600">
                AI-powered assistant for ConstructInvoice AI questions
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="h-96 bg-white rounded-lg border border-indigo-100 flex flex-col overflow-hidden">
            {/* Messages list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 && !isChatLoading && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center space-y-4 px-4 py-8">
                    <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mx-auto">
                      <Sparkles size={24} className="text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-700 font-medium">
                        What would you like to know?
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Ask me anything about ConstructInvoice AI
                      </p>
                    </div>

                    {/* Quick suggestions */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-4">
                      {[
                        'How do I create a project?',
                        'What file formats can I upload?',
                        'How do I generate a lien waiver?',
                        'How does retainage work?',
                      ].map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleQuickSuggestion(suggestion)}
                          className={cn(
                            'px-3 py-2 rounded-lg text-xs font-medium',
                            'border border-indigo-200',
                            'text-indigo-700 hover:bg-indigo-100',
                            'transition-colors text-left',
                          )}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Chat messages */}
              {chatMessages.map((message) => (
                <div
                  key={message.id}
                  className={cn('flex gap-3', {
                    'justify-end': message.role === 'user',
                  })}
                >
                  {message.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex-shrink-0 flex items-center justify-center mt-0.5">
                      <Sparkles size={14} className="text-indigo-600" />
                    </div>
                  )}

                  <div
                    className={cn(
                      'max-w-xs rounded-lg px-3 py-2 text-sm break-words',
                      {
                        'bg-indigo-600 text-white': message.role === 'user',
                        'bg-white text-gray-900 border border-indigo-100':
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

              {/* Loading state */}
              {isChatLoading && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex-shrink-0 flex items-center justify-center mt-0.5">
                    <Sparkles size={14} className="text-indigo-600" />
                  </div>
                  <div className="bg-white border border-indigo-100 rounded-lg px-3 py-2">
                    <div className="flex gap-1">
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

              {/* Error */}
              {chatError && (
                <div className="mx-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-700">{chatError}</p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input form */}
            <form
              onSubmit={handleSendChat}
              className="border-t border-indigo-100 bg-white p-3"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask a question..."
                  disabled={isChatLoading}
                  className={cn(
                    'flex-1 px-3 py-2 rounded-lg',
                    'border border-gray-300',
                    'text-sm text-gray-900 placeholder-gray-500',
                    'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                    'disabled:bg-gray-100 disabled:cursor-not-allowed',
                  )}
                />
                <button
                  type="submit"
                  disabled={isChatLoading || !chatInput.trim()}
                  className={cn(
                    'p-2 rounded-lg flex-shrink-0 transition-all',
                    {
                      'bg-indigo-600 text-white hover:bg-indigo-700':
                        !isChatLoading && chatInput.trim(),
                      'bg-gray-200 text-gray-500 cursor-not-allowed':
                        isChatLoading || !chatInput.trim(),
                    },
                  )}
                  aria-label="Send message"
                >
                  <Send size={18} />
                </button>
              </div>
            </form>
          </div>
        </div>
      </Card>

      {/* FAQ Search */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <HelpCircle size={20} className="text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Frequently Asked Questions
          </h2>
        </div>
        <Input
          type="text"
          placeholder="Search for help..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="text-sm"
        />
      </Card>

      {/* FAQ Items */}
      <div className="space-y-3">
        {filteredItems.map((item) => {
          const IconComponent = item.icon
          return (
            <Card
              key={item.id}
              className="overflow-hidden hover:shadow-md transition-shadow"
            >
              <button
                onClick={() =>
                  setExpandedId(expandedId === item.id ? null : item.id)
                }
                className="w-full px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <IconComponent size={20} className="text-indigo-600" />
                </div>

                <h3 className="text-left font-medium text-gray-900 flex-1">
                  {item.question}
                </h3>

                <span className="ml-4 text-indigo-600 flex-shrink-0">
                  {expandedId === item.id ? (
                    <ChevronUp size={20} />
                  ) : (
                    <ChevronDown size={20} />
                  )}
                </span>
              </button>

              {expandedId === item.id && (
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                  <p className="text-gray-700 leading-relaxed">{item.answer}</p>
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {filteredItems.length === 0 && (
        <Card className="p-8 text-center">
          <HelpCircle size={32} className="mx-auto text-gray-400 mb-3" />
          <p className="text-gray-600 font-medium">
            No results found for "{searchQuery}"
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Try searching with different keywords or ask Aria above
          </p>
        </Card>
      )}

      {/* Contact Support Section */}
      <Card className="p-6 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <Mail size={24} className="text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-1">
              Need more help?
            </h3>
            <p className="text-sm text-gray-700 mb-4">
              If you can't find the answer to your question, our support team
              is here to help.
            </p>
            <a
              href="mailto:vaakapila@gmail.com"
              className={cn(
                'inline-block px-4 py-2 rounded-lg font-medium',
                'bg-indigo-600 text-white',
                'hover:bg-indigo-700 transition-colors',
              )}
            >
              Contact Support
            </a>
          </div>
        </div>
      </Card>
    </div>
  )
}
