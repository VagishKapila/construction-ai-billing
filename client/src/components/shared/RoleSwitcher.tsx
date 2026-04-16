import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

export function RoleSwitcher() {
  const [role, setRole] = useState<'contractor' | 'vendor'>('contractor')

  useEffect(() => {
    const stored = localStorage.getItem('userRole')
    if (stored === 'vendor') {
      setRole('vendor')
    }
  }, [])

  const handleRoleChange = (newRole: 'contractor' | 'vendor') => {
    setRole(newRole)
    localStorage.setItem('userRole', newRole)
    window.dispatchEvent(new CustomEvent('roleChange', { detail: { role: newRole } }))
  }

  return (
    <div className="flex items-center gap-1 bg-[#f1f5f9] p-1 rounded-lg">
      <motion.button
        layoutId="role-pill"
        onClick={() => handleRoleChange('contractor')}
        className={`px-4 py-2 rounded text-sm font-semibold transition-all ${
          role === 'contractor'
            ? 'bg-[#2563eb] text-white'
            : 'text-[#64748b] hover:text-[#0f172a]'
        }`}
      >
        🏗️ Contractor
      </motion.button>

      <motion.button
        onClick={() => handleRoleChange('vendor')}
        className={`px-4 py-2 rounded text-sm font-semibold transition-all ${
          role === 'vendor'
            ? 'bg-[#ea6c00] text-white'
            : 'text-[#64748b] hover:text-[#0f172a]'
        }`}
      >
        🔧 Vendor
      </motion.button>
    </div>
  )
}
