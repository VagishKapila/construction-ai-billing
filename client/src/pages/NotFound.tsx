import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

export function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-[#f0f4fa] flex flex-col items-center justify-center text-center px-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.3 }}>
        <div className="text-6xl mb-4">🏗️</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Page Not Found</h1>
        <p className="text-gray-500 mb-8">This page doesn't exist — maybe it's still under construction?</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-6 py-3 rounded-xl text-white font-semibold"
          style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }}
        >
          ← Back to Dashboard
        </button>
      </motion.div>
    </div>
  )
}
