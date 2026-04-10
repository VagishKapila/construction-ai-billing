import { motion } from "framer-motion";
import { Spotlight } from "@/components/aceternity/spotlight";
import {
  Building2,
  LayoutDashboard,
  FolderKanban,
  FileText,
  Settings,
  CreditCard,
  BarChart3,
  Download,
  Send,
  Save,
  Plus,
  ChevronDown,
  PenLine,
  Calculator,
} from "lucide-react";

const sovLines = [
  { id: 1, desc: "General Conditions", scheduled: 45000, prevPct: 50, thisPct: 25, retPct: 10 },
  { id: 2, desc: "Site Work & Demolition", scheduled: 120000, prevPct: 50, thisPct: 20, retPct: 10 },
  { id: 3, desc: "Concrete & Foundation", scheduled: 85000, prevPct: 50, thisPct: 25, retPct: 10 },
  { id: 4, desc: "Structural Steel", scheduled: 65000, prevPct: 30, thisPct: 20, retPct: 10 },
  { id: 5, desc: "Rough Carpentry", scheduled: 42000, prevPct: 60, thisPct: 15, retPct: 10 },
  { id: 6, desc: "Electrical", scheduled: 78000, prevPct: 40, thisPct: 15, retPct: 10 },
  { id: 7, desc: "Plumbing", scheduled: 55000, prevPct: 45, thisPct: 20, retPct: 10 },
  { id: 8, desc: "HVAC", scheduled: 38000, prevPct: 35, thisPct: 15, retPct: 10 },
];

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function PayAppEditor() {
  const totalScheduled = sovLines.reduce((s, l) => s + l.scheduled, 0);
  const totalPrev = sovLines.reduce((s, l) => s + l.scheduled * l.prevPct / 100, 0);
  const totalThis = sovLines.reduce((s, l) => s + l.scheduled * l.thisPct / 100, 0);
  const totalCompleted = totalPrev + totalThis;
  const totalRetainage = sovLines.reduce((s, l) => s + (l.scheduled * (l.prevPct + l.thisPct) / 100) * l.retPct / 100, 0);
  const netPayable = totalCompleted - totalRetainage - totalPrev;

  return (
    <div className="flex h-screen bg-[#fafafe] overflow-hidden">
      {/* Sidebar (same as dashboard) */}
      <motion.aside
        initial={{ x: -240 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.4 }}
        className="w-60 bg-white border-r border-gray-200/80 flex flex-col"
      >
        <div className="px-5 py-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Building2 className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="font-bold text-gray-900">ConstructInv</span>
        </div>
        <nav className="flex-1 px-3 py-2">
          {[
            { icon: LayoutDashboard, label: "Dashboard", active: false },
            { icon: FolderKanban, label: "Projects", active: false },
            { icon: FileText, label: "Pay Apps", active: true },
            { icon: CreditCard, label: "Payments", active: false },
            { icon: BarChart3, label: "Reports", active: false },
            { icon: Settings, label: "Settings", active: false },
          ].map((item) => (
            <button
              key={item.label}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-1 ${
                item.active
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <item.icon className="w-4.5 h-4.5" />
              {item.label}
            </button>
          ))}
        </nav>
      </motion.aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="h-16 bg-white border-b border-gray-200/80 flex items-center justify-between px-6"
        >
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              Pay Application #5 — Via De Marcos Remodel
            </h1>
            <p className="text-xs text-gray-500">Application Period: March 1 - March 31, 2026</p>
          </div>
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50"
            >
              <Save className="w-4 h-4" /> Save Draft
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50"
            >
              <Download className="w-4 h-4" /> Download PDF
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: "0 4px 20px rgba(99,102,241,0.3)" }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-medium rounded-xl"
            >
              <Send className="w-4 h-4" /> Submit & Send
            </motion.button>
          </div>
        </motion.header>

        <div className="flex-1 overflow-y-auto p-6">
          {/* G702 Summary Cards */}
          <div className="grid grid-cols-5 gap-4 mb-6">
            {[
              { label: "Original Contract", value: fmt(totalScheduled), gradient: "from-indigo-500 to-purple-600" },
              { label: "Previous Billed", value: fmt(totalPrev), gradient: "from-blue-500 to-cyan-500" },
              { label: "This Period", value: fmt(totalThis), gradient: "from-green-500 to-emerald-500" },
              { label: "Retainage Held", value: fmt(totalRetainage), gradient: "from-amber-500 to-orange-500" },
              { label: "Current Due", value: fmt(netPayable), gradient: "from-green-600 to-green-400" },
            ].map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(99,102,241,0.1)" }}
                className="rounded-2xl bg-white border-2 border-gray-100 p-4 transition-all"
              >
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{card.label}</p>
                <p className={`text-xl font-bold mt-1 bg-gradient-to-r ${card.gradient} bg-clip-text text-transparent`}>
                  {card.value}
                </p>
              </motion.div>
            ))}
          </div>

          {/* G703 Continuation Sheet */}
          <Spotlight className="rounded-2xl bg-white border-2 border-gray-100 overflow-hidden" fill="#6366f1">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-indigo-600" />
                <h2 className="text-sm font-bold text-gray-900">G703 Continuation Sheet</h2>
              </div>
              <div className="flex items-center gap-2">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Change Order
                </motion.button>
              </div>
            </div>

            {/* Data grid */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80">
                    {["#", "Description of Work", "Scheduled Value", "Previous %", "This Period %", "Total Completed", "Retainage", "Net Payable", "Balance"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sovLines.map((line, i) => {
                    const totalComp = line.scheduled * (line.prevPct + line.thisPct) / 100;
                    const ret = totalComp * line.retPct / 100;
                    const prev = line.scheduled * line.prevPct / 100;
                    const net = totalComp - ret - prev;
                    const balance = line.scheduled - totalComp + ret;
                    return (
                      <motion.tr
                        key={line.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + i * 0.05 }}
                        whileHover={{ backgroundColor: "rgba(99,102,241,0.03)" }}
                        className="border-b border-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">{line.id}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{line.desc}</td>
                        <td className="px-4 py-3 text-gray-700 font-mono">{fmt(line.scheduled)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 font-mono">{line.prevPct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <motion.div
                            whileHover={{ scale: 1.05 }}
                            className="inline-flex items-center gap-1"
                          >
                            <input
                              type="text"
                              defaultValue={`${line.thisPct}%`}
                              className="w-16 px-2 py-1 bg-indigo-50/50 border border-indigo-200/50 rounded-lg text-indigo-700 font-mono text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-all"
                            />
                            <PenLine className="w-3 h-3 text-indigo-400" />
                          </motion.div>
                        </td>
                        <td className="px-4 py-3 text-gray-700 font-mono">{fmt(totalComp)}</td>
                        <td className="px-4 py-3 text-amber-600 font-mono">{fmt(ret)}</td>
                        <td className="px-4 py-3 font-bold text-green-700 font-mono">{fmt(net)}</td>
                        <td className="px-4 py-3 text-gray-500 font-mono">{fmt(balance)}</td>
                      </motion.tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50/80 font-bold">
                    <td className="px-4 py-3" colSpan={2}>
                      <span className="text-gray-900">TOTALS</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-900">{fmt(totalScheduled)}</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 font-mono text-gray-900">{fmt(totalCompleted)}</td>
                    <td className="px-4 py-3 font-mono text-amber-600">{fmt(totalRetainage)}</td>
                    <td className="px-4 py-3 font-mono text-green-700">{fmt(netPayable)}</td>
                    <td className="px-4 py-3 font-mono text-gray-500">{fmt(totalScheduled - totalCompleted + totalRetainage)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Spotlight>

          {/* Change Orders + Notes row */}
          <div className="grid grid-cols-2 gap-6 mt-6">
            <Spotlight className="rounded-2xl bg-white border-2 border-gray-100 p-5" fill="#8b5cf6">
              <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <ChevronDown className="w-4 h-4" /> Change Orders
              </h3>
              <div className="space-y-2">
                <motion.div
                  whileHover={{ x: 3 }}
                  className="flex items-center justify-between p-3 rounded-xl bg-purple-50/50 border border-purple-100/50"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">CO #1 — Additional electrical</p>
                    <p className="text-xs text-gray-500">Approved Mar 15, 2026</p>
                  </div>
                  <span className="text-sm font-bold text-purple-700">+$12,500</span>
                </motion.div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  className="w-full flex items-center justify-center gap-2 p-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:text-indigo-600 hover:border-indigo-300 transition-all"
                >
                  <Plus className="w-4 h-4" /> Add Change Order
                </motion.button>
              </div>
            </Spotlight>

            <Spotlight className="rounded-2xl bg-white border-2 border-gray-100 p-5" fill="#6366f1">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Notes & Attachments</h3>
              <textarea
                placeholder="Add notes for this pay application..."
                className="w-full h-24 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all"
              />
            </Spotlight>
          </div>
        </div>
      </div>
    </div>
  );
}
