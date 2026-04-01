import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  FileUp,
  FileText,
  CheckCircle2,
  CreditCard,
  Mail,
  BarChart3,
  ChevronRight,
} from 'lucide-react'

export function Landing() {
  const scrollToSection = (id: string): void => {
    const element = document.getElementById(id)
    element?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-white scroll-smooth">
      {/* Fixed Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-gray-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="font-bold text-xl text-indigo-600">ConstructInvoice AI</div>
          <div className="hidden md:flex gap-8">
            <button
              onClick={() => scrollToSection('features')}
              className="text-gray-700 hover:text-indigo-600 font-medium transition"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection('pricing')}
              className="text-gray-700 hover:text-indigo-600 font-medium transition"
            >
              Pricing
            </button>
            <button
              onClick={() => scrollToSection('contact')}
              className="text-gray-700 hover:text-indigo-600 font-medium transition"
            >
              Help
            </button>
          </div>
          <div className="flex gap-3">
            <Link to="/login">
              <Button variant="ghost" className="text-gray-700 hover:bg-gray-100">
                Sign In
              </Button>
            </Link>
            <Link to="/register">
              <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
                Start Free
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-grid-pattern" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-6 leading-tight">
            Construction Billing, Simplified.
          </h1>
          <p className="text-lg sm:text-xl text-indigo-100 mb-8 leading-relaxed max-w-2xl mx-auto">
            Create professional G702/G703 pay applications in minutes. Upload your Schedule of Values, track progress, and get paid faster.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <Link to="/register">
              <Button
                size="lg"
                className="bg-white text-indigo-600 hover:bg-gray-100 font-semibold text-lg px-8"
              >
                Start Free Trial
              </Button>
            </Link>
            <Link to="/login">
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white/10 font-semibold text-lg px-8"
              >
                Sign In
              </Button>
            </Link>
          </div>
          <p className="text-indigo-100 text-sm font-medium">
            No credit card required • 90-day free trial
          </p>
        </div>
      </section>

      {/* Social Proof Bar */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-gray-50 border-b border-gray-200">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-gray-600 font-medium mb-8">
            Trusted by contractors across the US
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div>
              <p className="text-3xl font-bold text-indigo-600">500+</p>
              <p className="text-gray-600 text-sm">Pay Apps Generated</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-indigo-600">$12M+</p>
              <p className="text-gray-600 text-sm">in Billing Tracked</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-indigo-600">90 Days</p>
              <p className="text-gray-600 text-sm">Free Trial</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
              Built for Modern Contractors
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Everything you need to manage construction billing from start to finish.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* SOV Upload */}
            <Card className="bg-white border border-gray-200 p-8 hover:shadow-lg transition">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-indigo-100 mb-6">
                <FileUp className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">SOV Upload</h3>
              <p className="text-gray-600">
                Upload Excel, CSV, PDF, or Word. Our AI parser auto-detects line items and amounts.
              </p>
            </Card>

            {/* G702/G703 PDFs */}
            <Card className="bg-white border border-gray-200 p-8 hover:shadow-lg transition">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-indigo-100 mb-6">
                <FileText className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">G702/G703 PDFs</h3>
              <p className="text-gray-600">
                AIA-standard pay applications generated in seconds. Professional formatting included.
              </p>
            </Card>

            {/* Lien Waivers */}
            <Card className="bg-white border border-gray-200 p-8 hover:shadow-lg transition">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-indigo-100 mb-6">
                <CheckCircle2 className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Lien Waivers</h3>
              <p className="text-gray-600">
                Generate conditional and unconditional lien waivers. California, Virginia, DC supported.
              </p>
            </Card>

            {/* Payment Collection */}
            <Card className="bg-white border border-gray-200 p-8 hover:shadow-lg transition">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-indigo-100 mb-6">
                <CreditCard className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Payment Collection</h3>
              <p className="text-gray-600">
                Accept ACH and card payments. Get paid directly through your invoices.
              </p>
            </Card>

            {/* Email & Send */}
            <Card className="bg-white border border-gray-200 p-8 hover:shadow-lg transition">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-indigo-100 mb-6">
                <Mail className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Email & Send</h3>
              <p className="text-gray-600">
                Send pay apps directly to owners with one click. PDF auto-attached.
              </p>
            </Card>

            {/* Reporting */}
            <Card className="bg-white border border-gray-200 p-8 hover:shadow-lg transition">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-indigo-100 mb-6">
                <BarChart3 className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Reporting</h3>
              <p className="text-gray-600">
                Track revenue, filter by project, export to CSV. See your billing at a glance.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-lg text-gray-600">
              Three simple steps to professional construction billing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-indigo-600 text-white font-bold text-xl mx-auto mb-6">
                1
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Create a Project</h3>
              <p className="text-gray-600">
                Upload your Schedule of Values and enter your project details.
              </p>
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center">
              <ChevronRight className="w-8 h-8 text-gray-400 hidden md:block" />
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-indigo-600 text-white font-bold text-xl mx-auto mb-6">
                2
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Enter Progress</h3>
              <p className="text-gray-600">
                Fill in this period's completion percentages and track changes.
              </p>
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center">
              <ChevronRight className="w-8 h-8 text-gray-400 hidden md:block" />
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-indigo-600 text-white font-bold text-xl mx-auto mb-6">
                3
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Send & Get Paid</h3>
              <p className="text-gray-600">
                Download PDF or email directly to the owner. Accept payments instantly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">Simple Pricing</h2>
          <p className="text-lg text-gray-600 mb-12">
            One plan. All the features contractors need.
          </p>

          <Card className="bg-white border border-gray-200 p-12 hover:shadow-lg transition">
            <h3 className="text-3xl font-bold text-gray-900 mb-2">Pro Plan</h3>
            <p className="text-indigo-600 font-semibold text-lg mb-8">$40/month</p>

            <p className="text-gray-600 mb-8">
              Start with a 90-day free trial. No credit card required.
            </p>

            <div className="space-y-4 mb-10 text-left">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                <span className="text-gray-700">Unlimited projects</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                <span className="text-gray-700">G702/G703 PDFs</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                <span className="text-gray-700">Payment collection (ACH + card)</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                <span className="text-gray-700">Lien waivers</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                <span className="text-gray-700">AI assistant</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                <span className="text-gray-700">Email delivery</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                <span className="text-gray-700">Reports & exports</span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                <span className="text-gray-700">Priority support</span>
              </div>
            </div>

            <Link to="/register">
              <Button
                size="lg"
                className="w-full bg-indigo-600 text-white hover:bg-indigo-700 font-semibold text-lg mb-6"
              >
                Start Free Trial
              </Button>
            </Link>

            <p className="text-sm text-gray-600">
              Can't afford it?{' '}
              <a href="mailto:vaakapila@gmail.com" className="text-indigo-600 font-medium hover:underline">
                Email vaakapila@gmail.com
              </a>
              {" — we'll work something out."}
            </p>
          </Card>
        </div>
      </section>

      {/* CTA Band Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-indigo-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            Ready to simplify your construction billing?
          </h2>
          <p className="text-lg text-indigo-100 mb-8">
            Join hundreds of contractors who save hours every month.
          </p>
          <Link to="/register">
            <Button
              size="lg"
              className="bg-white text-indigo-600 hover:bg-gray-100 font-semibold text-lg px-8"
            >
              Start Free Trial
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-900 text-gray-400">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            <div>
              <p className="font-bold text-white text-lg mb-2">ConstructInvoice AI</p>
              <p className="text-sm">A product of Varshyl Inc.</p>
            </div>
            <div>
              <p className="font-bold text-white mb-4">Product</p>
              <ul className="space-y-2 text-sm">
                <li>
                  <button
                    onClick={() => scrollToSection('features')}
                    className="hover:text-white transition"
                  >
                    Features
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => scrollToSection('pricing')}
                    className="hover:text-white transition"
                  >
                    Pricing
                  </button>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-white mb-4">Support</p>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="mailto:vaakapila@gmail.com"
                    className="hover:text-white transition"
                  >
                    Contact
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:vaakapila@gmail.com"
                    className="hover:text-white transition"
                  >
                    Help
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-white mb-4">Legal</p>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="#" className="hover:text-white transition">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-white transition">
                    Terms
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>© 2026 Varshyl Inc. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
