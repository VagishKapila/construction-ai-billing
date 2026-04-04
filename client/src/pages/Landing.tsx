import { Suspense, lazy, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CardContainer,
  CardBody,
  CardItem,
} from '@/components/aceternity/3d-card'

const CashFlowScene = lazy(() =>
  import('@/components/3d/CashFlowScene').then((m) => ({ default: m.CashFlowScene }))
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
  AlertTriangle,
  TrendingDown,
  Clock,
  ShieldCheck,
  DollarSign,
  Menu,
  X,
} from 'lucide-react'

/* ─── animation presets ─── */
const fadeUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
}

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.1 } },
}

/* ─── data ─── */
const painPoints = [
  { icon: TrendingDown, stat: '82%', text: 'of construction businesses that fail cite cash flow as the #1 reason' },
  { icon: Clock, stat: '67 days', text: 'average time contractors wait to get paid after completing work' },
  { icon: AlertTriangle, stat: '$200K+', text: 'average annual revenue lost to billing errors and late follow-ups' },
]

const features = [
  { icon: FileUp, title: 'Upload Any Document', desc: 'Bid, proposal, SOV, Excel, PDF, CSV, or Word. AI maps your line items and generates a perfect billing document in under 5 minutes.', gradient: 'from-emerald-500 to-green-600' },
  { icon: FileText, title: 'Exact Billing Math', desc: 'G702/G703 computed line by line. Previous certified, this period, stored materials, retainage — all automatic and correct every time.', gradient: 'from-emerald-600 to-teal-600' },
  { icon: Mail, title: 'Automated Follow-Up', desc: 'AI sends follow-ups on every unpaid invoice. Automatically. On schedule. Until money hits your account. You focus on the work.', gradient: 'from-green-500 to-emerald-600' },
  { icon: CheckCircle2, title: 'Leverage Protection', desc: "AI flags when Phase 1 is unpaid and Phase 2 is starting. That's your leverage window — we catch it before it closes.", gradient: 'from-amber-500 to-orange-600' },
  { icon: CreditCard, title: 'Reduce Receivables', desc: "Faster billing plus automated follow-up means less money sitting in someone else's account. Less disputes. Healthier cash flow.", gradient: 'from-teal-500 to-cyan-600' },
  { icon: BarChart3, title: 'Audit-Ready Records', desc: 'Every pay app is locked with a complete audit trail. Protects you in disputes and keeps every billing period documented.', gradient: 'from-emerald-500 to-green-700' },
]

const steps = [
  { num: '01', title: 'Upload', desc: 'Drop in your bid, proposal, SOV — any format. AI reads it in seconds.', icon: FileUp },
  { num: '02', title: 'Generate', desc: 'Perfect G702/G703 pay app. Error-free. In under 5 minutes.', icon: FileText },
  { num: '03', title: 'Collect', desc: 'AI follows up automatically until money hits your account.', icon: DollarSign },
]

export function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Override body background for dark landing page
  useEffect(() => {
    const prev = document.body.style.backgroundColor
    document.body.style.backgroundColor = '#0a0f1a'
    return () => { document.body.style.backgroundColor = prev }
  }, [])

  const scrollToSection = (id: string): void => {
    const element = document.getElementById(id)
    element?.scrollIntoView({ behavior: 'smooth' })
    setMobileMenuOpen(false)
  }

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white overflow-hidden scroll-smooth">

      {/* ═══════════════ NAVIGATION ═══════════════ */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0f1a]/80 border-b border-white/5"
      >
        <div className="flex items-center justify-between px-6 lg:px-8 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ rotateY: 180 }}
              transition={{ duration: 0.6 }}
              className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-green-700 flex items-center justify-center"
            >
              <Building2 className="w-4.5 h-4.5 text-white" />
            </motion.div>
            <span className="text-lg font-bold text-white">ConstructInvoice AI</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <button onClick={() => scrollToSection('problem')} className="hover:text-white transition-colors">The Problem</button>
            <button onClick={() => scrollToSection('features')} className="hover:text-white transition-colors">Features</button>
            <button onClick={() => scrollToSection('pricing')} className="hover:text-white transition-colors">Pricing</button>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link to="/login">
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Sign In
              </motion.button>
            </Link>
            <Link to="/register">
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: '0 0 30px rgba(16,185,129,0.4)' }}
                whileTap={{ scale: 0.95 }}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-green-600 rounded-lg transition-all"
              >
                Get Started
              </motion.button>
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-white">
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden px-6 pb-4 flex flex-col gap-3"
            >
              <button onClick={() => scrollToSection('problem')} className="text-sm text-gray-400 hover:text-white text-left py-2">The Problem</button>
              <button onClick={() => scrollToSection('features')} className="text-sm text-gray-400 hover:text-white text-left py-2">Features</button>
              <button onClick={() => scrollToSection('pricing')} className="text-sm text-gray-400 hover:text-white text-left py-2">Pricing</button>
              <Link to="/login" className="text-sm text-gray-400 hover:text-white py-2">Sign In</Link>
              <Link to="/register" className="inline-block px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-green-600 rounded-lg text-center">Get Started</Link>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>

      {/* ═══════════════ HERO — PAIN POINT FIRST ═══════════════ */}
      <section className="relative min-h-screen flex flex-col justify-center pt-20">
        {/* 3D Cash Flow Scene */}
        <div className="absolute inset-0 z-0">
          <Suspense fallback={null}>
            <CashFlowScene />
          </Suspense>
        </div>

        {/* Dark gradient overlay for readability */}
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-[#0a0f1a]/70 via-[#0a0f1a]/50 to-[#0a0f1a]/90" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 w-full">
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="max-w-4xl"
          >
            {/* Urgency badge */}
            <motion.div
              variants={fadeUp}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-400 text-sm mb-6"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>90% of businesses can use AI to solve cash flow issues</span>
            </motion.div>

            {/* Main headline — BIG, no fluff */}
            <motion.h1
              variants={fadeUp}
              className="text-5xl sm:text-6xl md:text-8xl font-black leading-[0.95] tracking-tight"
            >
              <span className="text-white">You did the work.</span>
              <br />
              <span className="bg-gradient-to-r from-emerald-400 via-green-400 to-teal-400 bg-clip-text text-transparent">
                Where's the money?
              </span>
            </motion.h1>

            {/* Sub-headline — specific & punchy */}
            <motion.p
              variants={fadeUp}
              className="mt-6 text-xl sm:text-2xl text-gray-400 max-w-2xl leading-relaxed"
            >
              Construction billing is broken. Late invoices, manual follow-ups, and missed leverage windows are{' '}
              <span className="text-red-400 font-semibold">draining your cash flow</span>. AI fixes that.
            </motion.p>

            {/* CTA row */}
            <motion.div variants={fadeUp} className="mt-10 flex flex-col sm:flex-row items-start gap-4">
              <Link to="/register">
                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: '0 0 50px rgba(16,185,129,0.4)' }}
                  whileTap={{ scale: 0.95 }}
                  className="px-8 py-4 text-white bg-gradient-to-r from-emerald-500 to-green-600 rounded-xl font-bold text-lg flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
                >
                  Fix My Cash Flow <ArrowRight className="w-5 h-5" />
                </motion.button>
              </Link>
              <Link to="/login">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="px-8 py-4 border border-white/10 hover:border-white/20 rounded-xl font-medium text-gray-400 hover:text-white transition-all"
                >
                  Sign In
                </motion.button>
              </Link>
            </motion.div>

            {/* Quick proof */}
            <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center gap-6 text-sm text-gray-500">
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> Pay app in under 5 min</span>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> Automated follow-up</span>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> $64/month</span>
            </motion.div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        >
          <div className="w-6 h-10 rounded-full border-2 border-white/20 flex items-start justify-center p-1.5">
            <motion.div
              animate={{ y: [0, 12, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-emerald-400"
            />
          </div>
        </motion.div>
      </section>

      {/* ═══════════════ THE PROBLEM — PAIN STATS ═══════════════ */}
      <section id="problem" className="relative py-24 px-6 bg-[#0d1320]">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <p className="text-red-400 font-semibold text-sm uppercase tracking-wider mb-3">The Cash Flow Crisis</p>
            <h2 className="text-4xl sm:text-5xl font-bold text-white">
              This is what's killing your business.
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {painPoints.map((point, i) => (
              <motion.div
                key={point.stat}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="relative p-8 rounded-2xl border border-red-500/10 bg-red-500/5 hover:border-red-500/20 transition-colors group"
              >
                <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mb-5 group-hover:bg-red-500/20 transition-colors">
                  <point.icon className="w-6 h-6 text-red-400" />
                </div>
                <p className="text-4xl font-black text-red-400 mb-2">{point.stat}</p>
                <p className="text-gray-400 leading-relaxed">{point.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ THE SOLUTION — TRANSITION ═══════════════ */}
      <section className="relative py-24 px-6 overflow-hidden">
        {/* Gradient transition from red to green */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d1320] via-[#0a1a15] to-[#0a0f1a]" />

        <div className="relative z-10 max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-sm mb-6">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>AI-Powered Solution</span>
            </div>
            <h2 className="text-4xl sm:text-6xl font-black text-white mb-6">
              We fix this.{' '}
              <span className="bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">Automatically.</span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Upload your documents. AI generates perfect billing. Then follows up until you're paid.
            </p>
          </motion.div>

          {/* 3-step flow */}
          <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
            {steps.map((step, i) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                className="relative p-6 rounded-2xl border border-emerald-500/10 bg-emerald-500/5 hover:border-emerald-500/25 transition-all group"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-xs font-mono text-emerald-500 opacity-50">{step.num}</span>
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center group-hover:shadow-lg group-hover:shadow-emerald-500/20 transition-shadow">
                    <step.icon className="w-5 h-5 text-white" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{step.title}</h3>
                <p className="text-gray-400 text-sm">{step.desc}</p>
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2">
                    <ArrowRight className="w-5 h-5 text-emerald-500/30" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ APP PREVIEW ═══════════════ */}
      <section className="relative py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <CardContainer containerClassName="w-full">
              <CardBody className="relative w-full h-auto rounded-2xl border border-white/10 bg-[#111827] p-6 sm:p-8 shadow-2xl shadow-emerald-500/5">
                <CardItem translateZ={50} className="w-full">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                    <span className="ml-4 text-sm text-gray-500 font-mono">constructinv.varshyl.com/app</span>
                  </div>
                </CardItem>
                <CardItem translateZ={80} className="w-full">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    {[
                      { label: 'Active Projects', value: '12', color: 'text-emerald-400' },
                      { label: 'Pending Pay Apps', value: '5', color: 'text-blue-400' },
                      { label: 'Amount Billed', value: '$1.2M', color: 'text-green-400' },
                      { label: 'Payments Due', value: '$340K', color: 'text-amber-400' },
                    ].map((kpi) => (
                      <div key={kpi.label} className="rounded-xl bg-white/5 border border-white/5 p-4">
                        <p className="text-xs text-gray-500 uppercase tracking-wider">{kpi.label}</p>
                        <p className={`text-xl sm:text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
                      </div>
                    ))}
                  </div>
                </CardItem>
                <CardItem translateZ={100} className="w-full">
                  <div className="rounded-xl bg-white/5 border border-white/5 overflow-hidden">
                    <div className="grid grid-cols-8 gap-px text-xs text-gray-500 font-medium bg-white/5">
                      {['Item', 'Description', 'Scheduled', 'Previous', 'This Period', 'Total', 'Retainage', 'Balance'].map((h) => (
                        <div key={h} className="px-3 py-2 hidden sm:block">{h}</div>
                      ))}
                    </div>
                    {[
                      ['1', 'General Conditions', '$45,000', '$22,500', '$11,250', '$33,750', '$3,375', '$11,250'],
                      ['2', 'Site Work', '$120,000', '$60,000', '$24,000', '$84,000', '$8,400', '$36,000'],
                      ['3', 'Concrete', '$85,000', '$42,500', '$21,250', '$63,750', '$6,375', '$21,250'],
                    ].map((row, i) => (
                      <div key={i} className="grid grid-cols-8 gap-px text-xs text-gray-300 hidden sm:grid">
                        {row.map((cell, j) => (
                          <div key={j} className="bg-[#111827] px-3 py-2.5">{cell}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                </CardItem>
              </CardBody>
            </CardContainer>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ FEATURES ═══════════════ */}
      <section id="features" className="relative py-24 px-6 bg-[#0d1320]">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
              Everything you need to{' '}
              <span className="bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">get paid</span>
            </h2>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto">
              From billing to collections. Automated and error-free.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="relative p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-emerald-500/20 transition-all group"
              >
                <div className={`w-11 h-11 rounded-lg bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 group-hover:shadow-lg transition-shadow`}>
                  <feature.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ PRICING ═══════════════ */}
      <section id="pricing" className="relative py-24 px-6">
        <div className="max-w-lg mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-3">Simple Pricing</h2>
            <p className="text-gray-400 mb-12">One invoice we help you collect covers years of this tool.</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/5 to-transparent p-10 relative overflow-hidden"
          >
            {/* Glow effect */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-emerald-500/10 blur-[80px] rounded-full" />

            <div className="relative z-10">
              <p className="mb-6">
                <span className="text-6xl font-black bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent">$64</span>
                <span className="text-gray-500 text-xl ml-1">/month</span>
              </p>

              <div className="space-y-3 mb-10 text-left max-w-sm mx-auto">
                {['Unlimited projects', 'G702/G703 PDFs', 'Automated invoice follow-up', 'Leverage protection alerts', 'AI billing assistant', 'Email delivery', 'Reports & exports', 'Priority support'].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    <span className="text-gray-300">{item}</span>
                  </div>
                ))}
              </div>

              <Link to="/register">
                <motion.button
                  whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(16,185,129,0.35)' }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-4 text-white bg-gradient-to-r from-emerald-500 to-green-600 rounded-xl font-bold text-lg transition-all shadow-lg shadow-emerald-500/20"
                >
                  Get Started
                </motion.button>
              </Link>

              <p className="text-sm text-gray-500 mt-6">
                Need help?{' '}
                <a href="mailto:vaakapila@gmail.com" className="text-emerald-400 hover:text-emerald-300 transition-colors">
                  Reach out
                </a>
                {" — we'll figure it out together."}
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ FINAL CTA ═══════════════ */}
      <section className="relative py-24 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0f1a] via-[#0a1a15] to-[#0a0f1a]" />
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[120px]" />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">
              You keep showing up.
            </h2>
            <p className="text-2xl sm:text-3xl bg-gradient-to-r from-emerald-400 to-green-400 bg-clip-text text-transparent font-bold mb-6">
              Make sure you keep getting paid.
            </p>
            <p className="text-lg text-gray-500 mb-10 max-w-xl mx-auto">
              Upload your documents. AI bills it right. AI follows up. You get paid.
            </p>
            <Link to="/register">
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: '0 0 50px rgba(16,185,129,0.4)' }}
                whileTap={{ scale: 0.95 }}
                className="px-10 py-5 text-white bg-gradient-to-r from-emerald-500 to-green-600 rounded-xl font-bold text-xl flex items-center gap-3 mx-auto transition-all shadow-xl shadow-emerald-500/20"
              >
                Fix My Cash Flow <ArrowRight className="w-6 h-6" />
              </motion.button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer id="contact" className="py-12 px-6 border-t border-white/5 bg-[#060a12]">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-700 flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-white">ConstructInvoice AI</span>
              </div>
              <p className="text-sm text-gray-500">A product of Varshyl Inc.</p>
              <p className="text-xs text-gray-600 italic mt-1">AI is here to stay. Let's make the best of it.</p>
            </div>
            <div>
              <p className="font-semibold text-white mb-4 text-sm">Product</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><button onClick={() => scrollToSection('features')} className="hover:text-white transition-colors">Features</button></li>
                <li><button onClick={() => scrollToSection('pricing')} className="hover:text-white transition-colors">Pricing</button></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-white mb-4 text-sm">Support</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="mailto:vaakapila@gmail.com" className="hover:text-white transition-colors">Contact</a></li>
                <li><Link to="/help" className="hover:text-white transition-colors">Help</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-white mb-4 text-sm">Legal</p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#" className="hover:text-white transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-6 text-center text-sm text-gray-600">
            <p>&copy; 2026 Varshyl Inc. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
