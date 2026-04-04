import { Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BackgroundBeams } from '@/components/aceternity/background-beams'
import { TextGenerateEffect } from '@/components/aceternity/text-generate-effect'
import { Spotlight } from '@/components/aceternity/spotlight'
import {
  CardContainer,
  CardBody,
  CardItem,
} from '@/components/aceternity/3d-card'
// Lazy-load Three.js scene to code-split the 500KB+ three.js bundle
const GenerativeScene = lazy(() =>
  import('@/components/3d/GenerativeScene').then((m) => ({ default: m.GenerativeScene }))
)
import {
  FileUp,
  FileText,
  CheckCircle2,
  CreditCard,
  Mail,
  BarChart3,
  ArrowRight,
  Check,
  Building2,
  Zap,
} from 'lucide-react'

const fadeUp = {
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 },
}

const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.15 },
  },
}

const features = [
  {
    icon: FileUp,
    title: 'Upload Any Document',
    desc: 'Bid, proposal, SOV, Excel, PDF, CSV, or Word. AI maps your line items and generates a perfect billing document in under 5 minutes.',
    gradient: 'from-emerald-500 to-green-600',
  },
  {
    icon: FileText,
    title: 'Exact Billing Math',
    desc: 'G702/G703 computed line by line. Previous certified, this period, stored materials, retainage — all automatic and correct every time.',
    gradient: 'from-emerald-600 to-teal-600',
  },
  {
    icon: Mail,
    title: 'Automated Follow-Up',
    desc: 'AI sends follow-ups on every unpaid invoice. Automatically. On schedule. Until money hits your account. You focus on the work.',
    gradient: 'from-green-500 to-emerald-600',
  },
  {
    icon: CheckCircle2,
    title: 'Leverage Protection',
    desc: 'AI flags when Phase 1 is unpaid and Phase 2 is starting. That\'s your leverage window — we catch it before it closes.',
    gradient: 'from-amber-500 to-orange-600',
  },
  {
    icon: CreditCard,
    title: 'Reduce Receivables',
    desc: 'Faster billing plus automated follow-up means less money sitting in someone else\'s account. Less disputes. Healthier cash flow.',
    gradient: 'from-teal-500 to-cyan-600',
  },
  {
    icon: BarChart3,
    title: 'Audit-Ready Records',
    desc: 'Every pay app is locked with a complete audit trail. Protects you in disputes and keeps every billing period documented.',
    gradient: 'from-emerald-500 to-green-700',
  },
]

const steps = [
  { num: '1', title: 'We Bill Right', desc: 'AI takes your bid, proposal, SOV or any document and generates a perfect, error-free billing document in under 5 minutes.' },
  { num: '2', title: 'We Follow Up Automatically', desc: 'AI sends follow-ups on every unpaid invoice. On schedule. Until money hits your account. You focus on the work.' },
  { num: '3', title: 'We Protect Your Leverage', desc: 'AI flags when you\'re working on Phase 2 while Phase 1 is unpaid. That\'s your leverage window. We catch it before it closes.' },
]

export function Landing() {
  const scrollToSection = (id: string): void => {
    const element = document.getElementById(id)
    element?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-[#fafafe] text-gray-900 overflow-hidden scroll-smooth">
      {/* ═══════════════ HERO ═══════════════ */}
      <section className="relative min-h-screen flex flex-col">
        <BackgroundBeams className="opacity-15" />

        {/* Three.js 3D Generative Scene — animated icosahedron */}
        <div className="absolute inset-0 z-0 opacity-30">
          <Suspense fallback={null}>
            <GenerativeScene />
          </Suspense>
        </div>

        {/* Floating gradient orbs — softer on light bg */}
        <motion.div
          className="absolute top-20 left-10 w-72 h-72 bg-emerald-400/10 rounded-full blur-[120px]"
          animate={{ x: [0, 30, -20, 0], y: [0, -20, 30, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-20 right-10 w-96 h-96 bg-green-400/8 rounded-full blur-[140px]"
          animate={{ x: [0, -40, 20, 0], y: [0, 30, -20, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Navigation */}
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative z-20 flex items-center justify-between px-6 lg:px-8 py-5 max-w-7xl mx-auto w-full"
        >
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ rotateY: 180 }}
              transition={{ duration: 0.6 }}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-700 flex items-center justify-center"
            >
              <Building2 className="w-5 h-5 text-white" />
            </motion.div>
            <span className="text-xl font-bold text-gray-900">
              ConstructInvoice AI
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-500">
            <button onClick={() => scrollToSection('features')} className="hover:text-gray-900 transition-colors">Features</button>
            <button onClick={() => scrollToSection('pricing')} className="hover:text-gray-900 transition-colors">Pricing</button>
            <button onClick={() => scrollToSection('contact')} className="hover:text-gray-900 transition-colors">Help</button>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Sign In
              </motion.button>
            </Link>
            <Link to="/register">
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: '0 0 30px rgba(99,102,241,0.3)' }}
                whileTap={{ scale: 0.95 }}
                className="px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-green-700 rounded-xl hover:from-emerald-400 hover:to-green-600 transition-all"
              >
                Get Started
              </motion.button>
            </Link>
          </div>
        </motion.nav>

        {/* Hero Content */}
        <div className="relative z-10 flex-1 flex items-center justify-center max-w-7xl mx-auto px-6 lg:px-8 pb-20">
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="text-center max-w-4xl"
          >
            <motion.div
              variants={fadeUp}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm mb-8"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>AI-Powered Construction Billing</span>
            </motion.div>

            <TextGenerateEffect
              words="Remove Cash Flow Issues with AI"
              className="text-4xl sm:text-5xl md:text-7xl font-bold bg-gradient-to-b from-gray-900 via-gray-800 to-gray-500 bg-clip-text text-transparent leading-tight"
            />

            <motion.p variants={fadeUp} className="mt-4 text-xl sm:text-2xl font-medium text-gray-700 max-w-2xl mx-auto">
              Reduce Receivables. Billed Right.
            </motion.p>

            <motion.p variants={fadeUp} className="mt-3 text-base text-gray-400 italic max-w-2xl mx-auto">
              AI is here to stay — let's make the best of it.
            </motion.p>

            <motion.div variants={fadeUp} className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/register">
                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: '0 0 40px rgba(16,185,129,0.35)' }}
                  whileTap={{ scale: 0.95 }}
                  className="px-8 py-4 text-white bg-gradient-to-r from-emerald-500 to-green-700 rounded-2xl font-semibold text-lg flex items-center gap-2 hover:from-emerald-400 hover:to-green-600 transition-all"
                >
                  Get Started <ArrowRight className="w-5 h-5" />
                </motion.button>
              </Link>
              <Link to="/login">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="px-8 py-4 border border-gray-300 hover:border-gray-400 rounded-2xl font-medium text-gray-600 hover:text-gray-900 transition-all"
                >
                  Sign In
                </motion.button>
              </Link>
            </motion.div>

            <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> Billed right, every time</span>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> Automated follow-up</span>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> Leverage protection</span>
            </motion.div>
          </motion.div>
        </div>

        {/* 3D App Preview */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="relative z-10 max-w-5xl mx-auto px-6 pb-20 w-full"
        >
          <CardContainer containerClassName="w-full">
            <CardBody className="relative w-full h-auto rounded-3xl border-2 border-gray-200 bg-white/90 backdrop-blur-xl p-6 sm:p-8 shadow-xl shadow-indigo-500/5">
              <CardItem translateZ={50} className="w-full">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="ml-4 text-sm text-gray-400">constructinv.varshyl.com/app</span>
                </div>
              </CardItem>
              <CardItem translateZ={80} className="w-full">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  {[
                    { label: 'Active Projects', value: '12', color: 'from-indigo-500 to-purple-600' },
                    { label: 'Pending Pay Apps', value: '5', color: 'from-blue-500 to-cyan-500' },
                    { label: 'Amount Billed', value: '$1.2M', color: 'from-green-500 to-emerald-500' },
                    { label: 'Payments Due', value: '$340K', color: 'from-amber-500 to-orange-500' },
                  ].map((kpi) => (
                    <div key={kpi.label} className="rounded-2xl bg-gray-50 border border-gray-200 p-4">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">{kpi.label}</p>
                      <p className={`text-xl sm:text-2xl font-bold mt-1 bg-gradient-to-r ${kpi.color} bg-clip-text text-transparent`}>{kpi.value}</p>
                    </div>
                  ))}
                </div>
              </CardItem>
              <CardItem translateZ={100} className="w-full">
                <div className="rounded-xl bg-gray-50 border border-gray-200 overflow-hidden">
                  <div className="grid grid-cols-8 gap-px bg-gray-100 text-xs text-gray-500 font-medium">
                    {['Item', 'Description', 'Scheduled', 'Previous', 'This Period', 'Total', 'Retainage', 'Balance'].map((h) => (
                      <div key={h} className="bg-gray-50 px-3 py-2 hidden sm:block">{h}</div>
                    ))}
                  </div>
                  {[
                    ['1', 'General Conditions', '$45,000', '$22,500', '$11,250', '$33,750', '$3,375', '$11,250'],
                    ['2', 'Site Work', '$120,000', '$60,000', '$24,000', '$84,000', '$8,400', '$36,000'],
                    ['3', 'Concrete', '$85,000', '$42,500', '$21,250', '$63,750', '$6,375', '$21,250'],
                  ].map((row, i) => (
                    <div key={i} className="grid grid-cols-8 gap-px text-xs text-gray-700 hidden sm:grid">
                      {row.map((cell, j) => (
                        <div key={j} className="bg-white px-3 py-2">{cell}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </CardItem>
            </CardBody>
          </CardContainer>
        </motion.div>
      </section>

      {/* ═══════════════ SOCIAL PROOF ═══════════════ */}
      <section className="relative py-16 px-6 bg-gray-50 border-y border-gray-200">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-gray-400 font-medium mb-10 text-sm uppercase tracking-wider">
            Trusted by contractors across the US
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            {[
              { value: '82%', label: 'of failed businesses cite cash flow' },
              { value: '< 5 min', label: 'to generate a pay app' },
              { value: '$64', label: 'per month. That\'s it.' },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
              >
                <p className="text-4xl font-bold bg-gradient-to-r from-emerald-500 to-green-600 bg-clip-text text-transparent">
                  {stat.value}
                </p>
                <p className="text-gray-500 text-sm mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ FEATURES ═══════════════ */}
      <section id="features" className="relative py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl sm:text-5xl font-bold bg-gradient-to-b from-gray-900 to-gray-600 bg-clip-text text-transparent mb-4">
              Billed Right. Followed Up Automatically.
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              Paid — before it becomes a dispute.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <CardContainer>
                  <CardBody className="relative h-auto w-full rounded-2xl border-2 border-gray-200 bg-white hover:border-emerald-300 transition-colors p-6 shadow-sm hover:shadow-md">
                    <CardItem translateZ={40}>
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4`}>
                        <feature.icon className="w-6 h-6 text-white" />
                      </div>
                    </CardItem>
                    <CardItem translateZ={60}>
                      <h3 className="text-xl font-semibold text-gray-900">{feature.title}</h3>
                    </CardItem>
                    <CardItem translateZ={30}>
                      <p className="mt-2 text-sm text-gray-500 leading-relaxed">{feature.desc}</p>
                    </CardItem>
                  </CardBody>
                </CardContainer>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS ═══════════════ */}
      <section className="relative py-24 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">What We Do</h2>
            <p className="text-lg text-gray-500">You keep showing up. Make sure you keep getting paid.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                className="text-center"
              >
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-green-700 text-white font-bold text-xl mx-auto mb-6 shadow-lg shadow-emerald-500/20"
                >
                  {step.num}
                </motion.div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
                <p className="text-gray-500">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ PRICING ═══════════════ */}
      <section id="pricing" className="relative py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">Pricing</h2>
            <p className="text-lg text-gray-500 mb-12">One invoice we help you collect covers years of this tool.</p>
          </motion.div>

          <Spotlight className="rounded-3xl" fill="#10b981">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="rounded-3xl border-2 border-gray-200 bg-white backdrop-blur-xl p-10 shadow-lg shadow-emerald-500/5"
            >
              <p className="text-lg mb-4">
                <span className="text-6xl font-bold bg-gradient-to-r from-emerald-500 to-green-600 bg-clip-text text-transparent">$64</span>
                <span className="text-gray-500 text-xl">/month</span>
              </p>

              <div className="space-y-3 mb-10 text-left max-w-sm mx-auto">
                {['Unlimited projects', 'G702/G703 PDFs', 'Automated invoice follow-up', 'Leverage protection alerts', 'AI billing assistant', 'Email delivery', 'Reports & exports', 'Priority support'].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    <span className="text-gray-600">{item}</span>
                  </div>
                ))}
              </div>

              <Link to="/register">
                <motion.button
                  whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(16,185,129,0.3)' }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-4 text-white bg-gradient-to-r from-emerald-500 to-green-700 rounded-2xl font-semibold text-lg hover:from-emerald-400 hover:to-green-600 transition-all"
                >
                  Get Started
                </motion.button>
              </Link>

              <p className="text-sm text-gray-500 mt-6">
                Need help?{' '}
                <a href="mailto:vaakapila@gmail.com" className="text-emerald-600 hover:text-emerald-700 transition-colors">
                  Reach out
                </a>
                {" — we'll figure it out together."}
              </p>
            </motion.div>
          </Spotlight>
        </div>
      </section>

      {/* ═══════════════ CTA BAND ═══════════════ */}
      <section className="relative py-24 px-6 overflow-hidden bg-gradient-to-br from-emerald-50 via-white to-green-50">
        <BackgroundBeams className="opacity-10" />
        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <p className="text-lg text-gray-500 mb-2">Cash flow positive. That's not a hope.</p>
            <h2 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
              That's What We Deliver.
            </h2>
            <p className="text-lg text-gray-500 mb-8">
              Upload your documents. Enter this period's work. Export and submit.<br />Then our AI follows up until money is in your account.
            </p>
            <Link to="/register">
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: '0 0 40px rgba(16,185,129,0.35)' }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 text-white bg-gradient-to-r from-emerald-500 to-green-700 rounded-2xl font-semibold text-lg flex items-center gap-2 mx-auto hover:from-emerald-400 hover:to-green-600 transition-all"
              >
                Get Started <ArrowRight className="w-5 h-5" />
              </motion.button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer id="contact" className="py-16 px-6 bg-gray-50 border-t border-gray-200">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-700 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-gray-900">ConstructInvoice AI</span>
              </div>
              <p className="text-sm text-gray-500">A product of Varshyl Inc.</p>
              <p className="text-xs text-gray-400 italic mt-1">AI is here to stay. Let's make the best of it.</p>
            </div>
            <div>
              <p className="font-bold text-gray-900 mb-4 text-sm">Product</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><button onClick={() => scrollToSection('features')} className="hover:text-gray-900 transition-colors">Features</button></li>
                <li><button onClick={() => scrollToSection('pricing')} className="hover:text-gray-900 transition-colors">Pricing</button></li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-gray-900 mb-4 text-sm">Support</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="mailto:vaakapila@gmail.com" className="hover:text-gray-900 transition-colors">Contact</a></li>
                <li><Link to="/help" className="hover:text-gray-900 transition-colors">Help</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-bold text-gray-900 mb-4 text-sm">Legal</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#" className="hover:text-gray-900 transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-gray-900 transition-colors">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-200 pt-8 text-center text-sm text-gray-400">
            <p>&copy; 2026 Varshyl Inc. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
