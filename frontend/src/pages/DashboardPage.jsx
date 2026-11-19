import { useEffect, useState } from 'react'
import { Activity, CalendarClock, MapPinned, Users } from 'lucide-react'
import { useAuth } from '../auth/useAuth.js'
import { getDashboardConnectionStatus } from '../api/dashboardApi.js'
import MetricCard from '../components/dashboard/MetricCard.jsx'
import { AttendanceChart, EmployeeChart } from '../components/dashboard/DashboardCharts.jsx'
import EmptyPanel from '../components/dashboard/EmptyPanel.jsx'

export default function DashboardPage() {
  const { user } = useAuth()
  const [connection, setConnection] = useState('checking')

  useEffect(() => {
    let active = true
    getDashboardConnectionStatus()
      .then(() => { if (active) setConnection('connected') })
      .catch(() => { if (active) setConnection('unavailable') })
    return () => { active = false }
  }, [])

  const firstName = user.name.trim().split(/\s+/)[0]

  return (
    <div className="dashboard-page">
      <div className="welcome-row">
        <div><p className="eyebrow">OPERATIONS OVERVIEW</p><h2>Good day, {firstName}</h2><p className="welcome-subtitle">Here’s your workforce snapshot for today.</p></div>
        <div className={`api-status api-status-${connection}`}><span />{connection === 'checking' ? 'Checking connection' : connection === 'connected' ? 'API connected' : 'API unavailable'}</div>
      </div>

      <div className="metric-grid">
        <MetricCard label="Total guards" icon={Users} accent="blue" value={null} detail="Waiting for workforce data" />
        <MetricCard label="Active sites" icon={MapPinned} accent="green" value={null} detail="Waiting for site data" />
        <MetricCard label="Today's attendance" icon={Activity} accent="violet" value={null} detail="Waiting for attendance data" />
        <MetricCard label="Pending leaves" icon={CalendarClock} accent="amber" value={null} detail="Waiting for leave data" />
      </div>

      <div className="charts-grid"><AttendanceChart /><EmployeeChart /></div>
      <div className="activity-grid">
        <EmptyPanel title="Recent activity" description="Latest updates across your organization" />
        <EmptyPanel title="Recent incidents" description="Incident reports that need your attention" />
      </div>
      <p className="dashboard-footnote">Dashboard totals and activity are not available from the current backend API yet.</p>
    </div>
  )
}
