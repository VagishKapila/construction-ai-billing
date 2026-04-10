import { motion } from "framer-motion";
import { BackgroundBeams } from "@/components/aceternity/background-beams";
import {
  CardContainer,
  CardBody,
  CardItem,
} from "@/components/aceternity/3d-card";
import {
  Building2,
  Shield,
  Lock,
  CheckCircle2,
  CreditCard,
  Landmark,
  ChevronDown,
  Star,
} from "lucide-react";

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

export default function PaymentPage() {
  const grossAmount = 15000;
  const retainagePct = 10;
  const retainageAmount = grossAmount * retainagePct / 100;
  const netAmount = grossAmount - retainageAmount;
  const achFee = 25;
  const cardFeePct = 3.3;
  const cardFeeFlat = 0.40;
  const cardFee = netAmount * cardFeePct / 100 + cardFeeFlat;

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-[#0a0a1a] via-[#0f0f2e] to-[#0a0a1a] text-white overflow-hidden">
      <BackgroundBeams className="opacity-30" />

      {/* Floating orbs */}
      <motion.div
        className="absolute top-40 left-20 w-64 h-64 bg-green-500/10 rounded-full blur-[100px]"
        animate={{ x: [0, 20, -15, 0], y: [0, -15, 20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 flex items-center justify-between px-8 py-5 max-w-4xl mx-auto"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Building2 className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-bold text-white/90">ConstructInvoice AI</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Lock className="w-3.5 h-3.5 text-green-500" />
          <span>256-bit SSL encrypted</span>
        </div>
      </motion.div>

      {/* Main payment card */}
      <div className="relative z-10 max-w-2xl mx-auto px-6 pt-8 pb-20">
        <CardContainer containerClassName="w-full">
          <CardBody className="relative w-full h-auto rounded-3xl border border-gray-800/50 bg-gradient-to-br from-gray-900/90 to-gray-950/90 backdrop-blur-xl p-8">
            {/* Company info */}
            <CardItem translateZ={20} className="w-full text-center mb-6">
              <p className="text-sm text-gray-400">Payment requested by</p>
              <p className="text-lg font-bold text-white mt-1">ABC General Contractors</p>
              <p className="text-sm text-gray-500">Via De Marcos Remodel — Pay App #5</p>
            </CardItem>

            {/* Amount display */}
            <CardItem translateZ={60} className="w-full text-center mb-8">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, type: "spring" }}
              >
                <p className="text-6xl font-bold bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent">
                  {fmt(netAmount)}
                </p>
                <p className="text-sm text-gray-500 mt-2">Amount Due</p>
              </motion.div>
            </CardItem>

            {/* Invoice details expandable */}
            <CardItem translateZ={30} className="w-full mb-8">
              <motion.details className="group">
                <summary className="flex items-center justify-center gap-2 text-sm text-indigo-400 cursor-pointer hover:text-indigo-300 transition-colors">
                  <span>View Invoice Details</span>
                  <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
                </summary>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 rounded-xl bg-gray-800/50 border border-gray-700/50 overflow-hidden"
                >
                  <table className="w-full text-sm">
                    <tbody>
                      {[
                        ["Gross Work This Period", fmt(grossAmount)],
                        [`Less Retainage (${retainagePct}%)`, `-${fmt(retainageAmount)}`],
                      ].map(([label, val]) => (
                        <tr key={label} className="border-b border-gray-700/30">
                          <td className="px-4 py-2.5 text-gray-400">{label}</td>
                          <td className="px-4 py-2.5 text-right text-gray-300 font-mono">{val}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-800/80">
                        <td className="px-4 py-3 font-bold text-white">Net Amount Due</td>
                        <td className="px-4 py-3 text-right font-bold text-green-400 font-mono">{fmt(netAmount)}</td>
                      </tr>
                    </tbody>
                  </table>
                </motion.div>
              </motion.details>
            </CardItem>

            {/* Payment method selection */}
            <CardItem translateZ={40} className="w-full space-y-3">
              <p className="text-sm font-semibold text-gray-300 mb-3">Choose Payment Method</p>

              {/* ACH - Recommended */}
              <motion.div
                whileHover={{ scale: 1.01, borderColor: "rgba(34,197,94,0.5)" }}
                whileTap={{ scale: 0.99 }}
                className="relative p-4 rounded-2xl border-2 border-green-500/30 bg-green-500/5 cursor-pointer transition-all"
              >
                <div className="absolute -top-2.5 right-4">
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-green-500 text-white rounded-full flex items-center gap-1">
                    <Star className="w-3 h-3" /> Recommended
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <Landmark className="w-6 h-6 text-green-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">Bank Transfer (ACH)</p>
                    <p className="text-xs text-gray-400 mt-0.5">1-2 business days | Flat fee</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-green-400">{fmt(netAmount + achFee)}</p>
                    <p className="text-xs text-gray-500">${achFee} fee</p>
                  </div>
                </div>
              </motion.div>

              {/* Card */}
              <motion.div
                whileHover={{ scale: 1.01, borderColor: "rgba(99,102,241,0.4)" }}
                whileTap={{ scale: 0.99 }}
                className="p-4 rounded-2xl border-2 border-gray-700/50 bg-gray-800/20 cursor-pointer transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-indigo-400" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">Credit / Debit Card</p>
                    <p className="text-xs text-gray-400 mt-0.5">Instant | Visa, Mastercard, Amex</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-300">{fmt(netAmount + cardFee)}</p>
                    <p className="text-xs text-gray-500">{cardFeePct}% + ${cardFeeFlat.toFixed(2)} fee</p>
                  </div>
                </div>
              </motion.div>
            </CardItem>

            {/* Pay button */}
            <CardItem translateZ={50} className="w-full mt-6">
              <motion.button
                whileHover={{
                  scale: 1.02,
                  boxShadow: "0 0 50px rgba(34,197,94,0.3)",
                }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl font-bold text-lg text-white hover:from-green-400 hover:to-emerald-400 transition-all flex items-center justify-center gap-2"
              >
                <Lock className="w-5 h-5" />
                Pay {fmt(netAmount + achFee)}
              </motion.button>
            </CardItem>

            {/* Trust indicators */}
            <CardItem translateZ={15} className="w-full mt-4">
              <div className="flex items-center justify-center gap-6 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-green-500" /> Secure Payment
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> PCI Compliant
                </span>
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-green-500" /> Powered by Stripe
                </span>
              </div>
            </CardItem>
          </CardBody>
        </CardContainer>
      </div>
    </div>
  );
}
