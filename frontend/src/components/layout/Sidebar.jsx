import { LogOut, Shield } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { navigationForRole } from '../../config/navigation.js'
import { useAuth } from '../../auth/useAuth.js'

export default function Sidebar({ mobileOpen, closeMobile }) {
  const { user, logout } = useAuth()
  const items = navigationForRole(user.role)

  return (
    <aside className={`sidebar${mobileOpen ? ' sidebar-mobile-open' : ''}`}>
      <NavLink to="/" className="brand-lockup" onClick={closeMobile}>
        <span className="brand-mark"><Shield size={21} strokeWidth={2.2} /></span>
        <span className="brand-copy"><strong>SecureGuard</strong><small>WORKFORCE OPERATIONS</small></span>
      </NavLink>

      <div className="nav-caption">WORKSPACE</div>
      <nav aria-label="Main navigation" className="sidebar-nav">
        {items.map(({ label, path, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            title={label}
            onClick={closeMobile}
            className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-help">
          <span className="help-icon"><Shield size={16} /></span>
          <div><strong>Secure by design</strong><small>Access is role based</small></div>
        </div>
        <button type="button" className="sidebar-logout" onClick={logout}>
          <LogOut size={17} /><span>Sign out</span>
        </button>
      </div>
    </aside>
  )
}
