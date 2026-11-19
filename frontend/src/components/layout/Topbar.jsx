import { Bell, ChevronDown, LogOut, PanelLeftClose, PanelLeftOpen, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/useAuth.js'

function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U'
}

export default function Topbar({ title, user, collapsed, onToggleSidebar }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { logout } = useAuth()

  return (
    <div className="topbar">
      <div className="topbar-heading"><div className="breadcrumb">SECUREGUARD <span>/</span> WORKSPACE</div><h1>{title}</h1></div>
      <div className="topbar-actions">
        <button type="button" className="icon-button desktop-collapse-button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggleSidebar}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <div className="popover-anchor">
          <button type="button" className="icon-button notification-button" aria-label="Notifications" aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((value) => !value); setProfileOpen(false) }}>
            <Bell size={19} />
          </button>
          {notificationsOpen && <div className="floating-popover notification-popover"><strong>Notifications</strong><p>No notification feed is connected yet.</p></div>}
        </div>
        <div className="profile-divider" />
        <div className="popover-anchor">
          <button type="button" className="profile-trigger" aria-expanded={profileOpen} onClick={() => { setProfileOpen((value) => !value); setNotificationsOpen(false) }}>
            <span className="avatar">{initials(user.name)}</span>
            <span className="profile-copy"><strong>{user.name}</strong><small>{user.role.replaceAll('_', ' ')}</small></span>
            <ChevronDown size={15} className="profile-chevron" />
          </button>
          {profileOpen && <div className="floating-popover profile-popover"><div className="profile-popover-user"><UserRound size={17} /><span>{user.email}</span></div><button type="button" onClick={logout}><LogOut size={16} /> Sign out</button></div>}
        </div>
      </div>
    </div>
  )
}
