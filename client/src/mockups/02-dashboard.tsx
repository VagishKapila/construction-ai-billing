import { motion, AnimatePresence } from "framer-motion";
import { Spotlight } from "@/components/aceternity/spotlight";
import {
  CardContainer,
  CardBody,
  CardItem,
} from "@/components/aceternity/3d-card";
import {
  Building2,
  LayoutDashboard,
  FolderKanban,
  FileText,
  Settings,
  CreditCard,
  BarChart3,
  Bell,
  Search,
  Plus,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

const sidebarItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: FolderKanban, label: "Projects", active: false },
  { icon: FileText, label: "Pay Apps", active: false },
  { icon: CreditCard, label: "Payments", active: false },
  { icon: BarChart3, label: "Reports", active: false },
  { icon: Settings, label: "Settings", active: false },
];

const kpis = [
  {
    label: "Total Pipeline",
    value: "$2.4M",
    change: "+12.5%",
    trend: "up" as const,
    gradient: "from-indigo-500 to-purple-600",
    icon: Building2,
  },
  {
    label: "Billed This Month",
    value: "$186K",
    change: "+8.2%",
    trend: "up" as const,
    gradient: "from-blue-500 to-cyan-500",
    icon: FileText,
  },
  {
    label: "Outstanding",
    value: "$94K",
    change: "-3.1%",
    trend: "down" as const,
    gradient: "from-amber-500 to-orange-500",
    icon: Clock,
  },
  {
    label: "Collected",
    value: "$1.8M",
    change: "+22.4%",
    trend: "up" as const,
    gradient: "from-green-500 to-emerald-500",
    icon: CheckCircle2,
  },
];

const projects = [
  { name: "Via De Marcos Remodel", contract: "$450K", progress: 67, status: "active", payApps: 4 },
  { name: "Jay-Daniel Way Office", contract: "$285K", progress: 42, status: "active", payApps: 2 },
  { name: "Oak Street Kitchen", contract: "$85K", progress: 91, status: "billing", payApps: 6 },
  { name: "Downtown Bathroom", contract: "$42K", progress: 35, status: "active", payApps: 1 },
];

const activities = [
  { type: "payment", text: "ACH payment received — Elm Street Addition", amount: "$13,475", time: "2h ago" },
  { type: "submit", text: "Pay App #5 submitted — Via De Marcos", amount: "$52,200", time: "5h ago" },
  { type: "alert", text: "Payment overdue — Jay-Daniel Way Office", amount: "$28,500", time: "1d ago" },
  { type: "create", text: "New project created — Oak Street Kitchen", amount: "$85,000", time: "2d ago" },
];

export default function Dashboard() {
  return (
    <div className="flex h-screen bg-[#fafafe] overflow-hidden">
      {/* Sidebar */}
      <motion.aside
        initial={{ x: -240 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-60 bg-white border-r border-gray-200/80 flex flex-col"
      >
        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-3">
          <motion.div
            whileHover={{ rotateY: 180 }}
            transition={{ duration: 0.6 }}
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"
          >
            <Building2 className="w-4.5 h-4.5 text-white" />
          </motion.div>
          <span className="font-bold text-gray-900">ConstructInv</span>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-2">
          {sidebarItems.map((item) => (
            <motion.button
              key={item.label}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all mb-1 ${
                item.active
                  ? "bg-indigo-50 text-indigo-700 border-l-3 border-indigo-500"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <item.icon className="w-4.5 h-4.5" />
              {item.label}
            </motion.button>
          ))}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
              VK
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Vagish Kapila</p>
              <p className="text-xs text-gray-500">Varshyl Inc.</p>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="h-16 bg-white border-b border-gray-200/80 flex items-center justify-between px-6"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search projects, pay apps..."
                className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm w-80 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="relative p-2 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <Bell className="w-5 h-5 text-gray-500" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.03, boxShadow: "0 4px 20px rgba(99,102,241,0.3)" }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-medium rounded-xl"
            >
              <Plus className="w-4 h-4" />
              New Project
            </motion.button>
          </div>
        </motion.header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Page title */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500 mt-1">
              Welcome back, Vagish. Here's your billing overview.
            </p>
          </motion.div>

          {/* KPI Cards with 3D tilt */}
          <div className="grid grid-cols-4 gap-5 mb-8">
            <AnimatePresence>
              {kpis.map((kpi, i) => (
                <motion.div
                  key={kpi.label}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                >
                  <CardContainer containerClassName="w-full">
                    <CardBody className="relative w-full h-auto rounded-2xl bg-white border-2 border-gray-100 p-5 shadow-sm hover:shadow-lg hover:shadow-indigo-500/5 transition-shadow">
                      <CardItem translateZ={20} className="w-full">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            {kpi.label}
                          </p>
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center`}>
                            <kpi.icon className="w-4.5 h-4.5 text-white" />
                          </div>
                        </div>
                      </CardItem>
                      <CardItem translateZ={40} className="w-full mt-3">
                        <p className="text-3xl font-bold text-gray-900">{kpi.value}</p>
                      </CardItem>
                      <CardItem translateZ={15} className="w-full mt-2">
                        <div className="flex items-center gap-1.5">
                          {kpi.trend === "up" ? (
                            <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                          )}
                          <span
                            className={`text-xs font-medium ${
                              kpi.trend === "up" ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {kpi.change}
                          </span>
                          <span className="text-xs text-gray-400">vs last month</span>
                        </div>
                      </CardItem>
                    </CardBody>
                  </CardContainer>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-5 gap-6">
            {/* Projects list */}
            <Spotlight
              className="col-span-3 rounded-2xl bg-white border-2 border-gray-100 p-6"
              fill="#6366f1"
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-gray-900">Active Projects</h2>
                <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                  View All <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-4">
                {projects.map((project, i) => (
                  <motion.div
                    key={project.name}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    whileHover={{ x: 4, backgroundColor: "rgba(99,102,241,0.03)" }}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-indigo-200/50 transition-all cursor-pointer"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">{project.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {project.contract} contract | {project.payApps} pay apps
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-32">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">{project.progress}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${project.progress}%` }}
                            transition={{ duration: 1, delay: 0.5 + i * 0.15 }}
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                          />
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                          project.status === "billing"
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-green-50 text-green-700 border border-green-200"
                        }`}
                      >
                        {project.status}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Spotlight>

            {/* Activity feed */}
            <Spotlight
              className="col-span-2 rounded-2xl bg-white border-2 border-gray-100 p-6"
              fill="#8b5cf6"
            >
              <h2 className="text-lg font-bold text-gray-900 mb-5">Recent Activity</h2>
              <div className="space-y-4">
                {activities.map((activity, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    className="flex items-start gap-3"
                  >
                    <div
                      className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        activity.type === "payment"
                          ? "bg-green-50 text-green-600"
                          : activity.type === "alert"
                          ? "bg-red-50 text-red-600"
                          : activity.type === "submit"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-indigo-50 text-indigo-600"
                      }`}
                    >
                      {activity.type === "payment" ? (
                        <CreditCard className="w-4 h-4" />
                      ) : activity.type === "alert" ? (
                        <AlertCircle className="w-4 h-4" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 leading-snug">{activity.text}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-semibold text-gray-900">
                          {activity.amount}
                        </span>
                        <span className="text-xs text-gray-400">{activity.time}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </Spotlight>
          </div>
        </div>
      </div>
    </div>
  );
}
