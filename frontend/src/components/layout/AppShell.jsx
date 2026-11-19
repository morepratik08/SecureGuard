import { useMemo, useState } from 'react'
import { Menu, Shield } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import { NAV_ITEMS } from '../../config/navigation.js'
import { useAuth } from '../../auth/useAuth.js'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'

export default function AppShell() {
  const { user } = useAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const currentPage = useMemo(
    () => NAV_ITEMS.find((item) => item.path === location.pathname)
      ?? (location.pathname.startsWith('/employees/') ? NAV_ITEMS.find((item) => item.path === '/employees') : null)
      ?? (location.pathname.startsWith('/clients/') ? NAV_ITEMS.find((item) => item.path === '/clients') : null)
      ?? (location.pathname.startsWith('/sites/') ? NAV_ITEMS.find((item) => item.path === '/sites') : null)
      ?? NAV_ITEMS[0],
    [location.pathname],
  )

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <Sidebar mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} />
      {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <div className="workspace">
        <header className="mobile-header">
          <button className="icon-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={20} /></button>
          <span className="mobile-brand"><Shield size={18} /> SecureGuard</span>
        </header>
        <Topbar title={currentPage.label} user={user} collapsed={collapsed} onToggleSidebar={() => setCollapsed((value) => !value)} />
        <main className="page-content" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
