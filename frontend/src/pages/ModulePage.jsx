import { useLocation } from 'react-router-dom'
import { Construction, LockKeyhole } from 'lucide-react'
import { useAuth } from '../auth/useAuth.js'
import AccessDeniedPage from './AccessDeniedPage.jsx'

export default function ModulePage({ route }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!route.roles.includes(user.role)) return <AccessDeniedPage />

  return (
    <section className="module-page panel">
      <div className="module-icon"><Construction size={23} /></div>
      <p className="eyebrow">{route.label.toUpperCase()}</p>
      <h2>{route.label} workspace</h2>
      <p>This module is ready for its role-based interface. Live records will appear after the corresponding backend API is implemented.</p>
      <div className="module-route"><LockKeyhole size={15} /><span>Signed in as {user.role.replaceAll('_', ' ')}</span><span className="module-dot">·</span><code>{location.pathname}</code></div>
    </section>
  )
}
