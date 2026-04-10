import { motion } from "framer-motion";
import { BackgroundBeams } from "@/components/aceternity/background-beams";
import { TextGenerateEffect } from "@/components/aceternity/text-generate-effect";
import {
  CardContainer,
  CardBody,
  CardItem,
} from "@/components/aceternity/3d-card";
import {
  FileText,
  DollarSign,
  Shield,
  Zap,
  ArrowRight,
  Check,
  Building2,
} from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 },
};

const staggerContainer = {
  animate: {
    transition: { staggerChildren: 0.15 },
  },
};

export default function LandingHero() {
  return (
    <div className="relative min-h-screen bg-[#0a0a1a] text-white overflow-hidden">
      {/* Animated background beams */}
      <BackgroundBeams className="opacity-40" />

      {/* Floating gradient orbs */}
      <motion.div
        className="absolute top-20 left-10 w-72 h-72 bg-indigo-500/20 rounded-full blur-[120px]"
        animate={{
          x: [0, 30, -20, 0],
          y: [0, -20, 30, 0],
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/15 rounded-full blur-[140px]"
        animate={{
          x: [0, -40, 20, 0],
          y: [0, 30, -20, 0],
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Navigation */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-20 flex items-center justify-between px-8 py-5 max-w-7xl mx-auto"
      >
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ rotateY: 180 }}
            transition={{ duration: 0.6 }}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"
          >
            <Building2 className="w-5 h-5 text-white" />
          </motion.div>
          <span className="text-xl font-bold bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">
            ConstructInvoice AI
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="#demo" className="hover:text-white transition-colors">Demo</a>
        </div>
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
          >
            Sign In
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(99,102,241,0.4)" }}
            whileTap={{ scale: 0.95 }}
            className="px-5 py-2.5 text-sm font-medium bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl hover:from-indigo-400 hover:to-purple-500 transition-all"
          >
            Start Free Trial
          </motion.button>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <div className="relative z-10 max-w-7xl mx-auto px-8 pt-20 pb-32">
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="text-center max-w-4xl mx-auto"
        >
          {/* Badge */}
          <motion.div
            variants={fadeUp}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-sm mb-8"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>AI-Powered Construction Billing</span>
          </motion.div>

          {/* Headline with text generate effect */}
          <TextGenerateEffect
            words="G702/G703 Pay Applications in Minutes, Not Hours"
            className="text-5xl md:text-7xl font-bold bg-gradient-to-b from-white via-white to-gray-500 bg-clip-text text-transparent leading-tight"
          />

          <motion.p
            variants={fadeUp}
            className="mt-6 text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed"
          >
            Upload your Schedule of Values. Generate AIA-standard pay applications.
            Get paid faster with built-in ACH and card payments. Built for General
            Contractors who are done with spreadsheets.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div variants={fadeUp} className="mt-10 flex items-center justify-center gap-4">
            <motion.button
              whileHover={{
                scale: 1.05,
                boxShadow: "0 0 40px rgba(99,102,241,0.5)",
              }}
              whileTap={{ scale: 0.95 }}
              className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl font-semibold text-lg flex items-center gap-2 hover:from-indigo-400 hover:to-purple-500 transition-all"
            >
              Start Free — 90 Days
              <ArrowRight className="w-5 h-5" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="px-8 py-4 border border-gray-700 hover:border-gray-500 rounded-2xl font-medium text-gray-300 hover:text-white transition-all"
            >
              Watch Demo
            </motion.button>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            variants={fadeUp}
            className="mt-8 flex items-center justify-center gap-6 text-sm text-gray-500"
          >
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-green-500" /> No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-green-500" /> 90-day free trial
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="w-4 h-4 text-green-500" /> Cancel anytime
            </span>
          </motion.div>
        </motion.div>

        {/* 3D App Preview Card */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-20"
        >
          <CardContainer containerClassName="w-full">
            <CardBody className="relative w-full h-auto max-w-5xl mx-auto rounded-3xl border border-gray-800/50 bg-gradient-to-br from-gray-900/80 to-gray-950/80 backdrop-blur-xl p-8 shadow-2xl shadow-indigo-500/10">
              <CardItem translateZ={50} className="w-full">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="ml-4 text-sm text-gray-500">
                    constructinv.varshyl.com/app
                  </span>
                </div>
              </CardItem>

              <CardItem translateZ={80} className="w-full">
                {/* Mock dashboard inside the 3D card */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                  {[
                    { label: "Active Projects", value: "12", color: "from-indigo-500 to-purple-600" },
                    { label: "Pending Pay Apps", value: "5", color: "from-blue-500 to-cyan-500" },
                    { label: "Amount Billed", value: "$1.2M", color: "from-green-500 to-emerald-500" },
                    { label: "Payments Due", value: "$340K", color: "from-amber-500 to-orange-500" },
                  ].map((kpi) => (
                    <div
                      key={kpi.label}
                      className="rounded-2xl bg-gray-800/60 border border-gray-700/50 p-4"
                    >
                      <p className="text-xs text-gray-500 uppercase tracking-wider">
                        {kpi.label}
                      </p>
                      <p
                        className={`text-2xl font-bold mt-1 bg-gradient-to-r ${kpi.color} bg-clip-text text-transparent`}
                      >
                        {kpi.value}
                      </p>
                    </div>
                  ))}
                </div>
              </CardItem>

              <CardItem translateZ={100} className="w-full">
                {/* Mock G703 grid */}
                <div className="rounded-xl bg-gray-800/40 border border-gray-700/40 overflow-hidden">
                  <div className="grid grid-cols-8 gap-px bg-gray-700/30 text-xs text-gray-400 font-medium">
                    {["Item", "Description", "Scheduled", "Previous", "This Period", "Total", "Retainage", "Balance"].map((h) => (
                      <div key={h} className="bg-gray-800/80 px-3 py-2">
                        {h}
                      </div>
                    ))}
                  </div>
                  {[
                    ["1", "General Conditions", "$45,000", "$22,500", "$11,250", "$33,750", "$3,375", "$11,250"],
                    ["2", "Site Work", "$120,000", "$60,000", "$24,000", "$84,000", "$8,400", "$36,000"],
                    ["3", "Concrete", "$85,000", "$42,500", "$21,250", "$63,750", "$6,375", "$21,250"],
                  ].map((row, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-8 gap-px text-xs text-gray-300"
                    >
                      {row.map((cell, j) => (
                        <div
                          key={j}
                          className="bg-gray-900/60 px-3 py-2 hover:bg-indigo-500/10 transition-colors"
                        >
                          {cell}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </CardItem>
            </CardBody>
          </CardContainer>
        </motion.div>

        {/* Feature Cards with 3D hover */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          className="mt-32 grid md:grid-cols-3 gap-6 max-w-5xl mx-auto"
        >
          {[
            {
              icon: FileText,
              title: "Smart SOV Parsing",
              desc: "Upload Excel, CSV, PDF, or Word. Our AI detects columns, descriptions, and amounts automatically.",
              gradient: "from-indigo-500 to-blue-600",
            },
            {
              icon: DollarSign,
              title: "Get Paid Instantly",
              desc: "Built-in ACH ($25 flat) and card payments. Owner gets a Pay Now link. You get paid in 1-2 days.",
              gradient: "from-green-500 to-emerald-600",
            },
            {
              icon: Shield,
              title: "Auto Lien Waivers",
              desc: "Conditional or unconditional waivers generated automatically when you submit. One less thing to track.",
              gradient: "from-purple-500 to-pink-600",
            },
          ].map((feature, i) => (
            <CardContainer key={i}>
              <CardBody className="relative h-auto w-full rounded-2xl border border-gray-800/50 bg-gray-900/50 backdrop-blur-sm p-6 hover:border-indigo-500/30 transition-colors">
                <CardItem translateZ={40}>
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4`}
                  >
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                </CardItem>
                <CardItem translateZ={60}>
                  <h3 className="text-xl font-semibold text-white">
                    {feature.title}
                  </h3>
                </CardItem>
                <CardItem translateZ={30}>
                  <p className="mt-2 text-sm text-gray-400 leading-relaxed">
                    {feature.desc}
                  </p>
                </CardItem>
              </CardBody>
            </CardContainer>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
