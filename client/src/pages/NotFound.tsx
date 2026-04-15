export function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f4fa', flexDirection: 'column', gap: 16, fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ fontSize: 64, fontFamily: 'DM Serif Display, serif', color: '#1e293b' }}>404</div>
      <div style={{ fontSize: 20, color: '#64748b' }}>Page not found</div>
      <a href="/dashboard" style={{ background: '#2563eb', color: '#fff', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontWeight: 600 }}>
        Back to Dashboard
      </a>
    </div>
  )
}
