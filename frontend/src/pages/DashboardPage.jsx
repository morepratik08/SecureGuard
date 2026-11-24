import { useEffect, useState } from 'react'
import { Activity, CalendarClock, CircleAlert, Clock3, ClipboardCheck, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getAttendanceDashboard } from '../api/attendanceLeaveApi.js'
import { getDocumentSummary, getIncidentSummary } from '../api/incidentDocumentApi.js'
import { getApiErrorMessage } from '../api/client.js'
import { useAuth } from '../auth/useAuth.js'

function Metric({ label, value, icon: Icon, detail }) {
  return <article className="metric-card"><div className="metric-heading"><span>{label}</span><span className="metric-icon"><Icon size={20}/></span></div><div className="metric-value">{value ?? '—'}</div><div className="metric-detail">{detail}</div></article>
}

function SummaryMetrics({ data, role }) {
  if (role === 'GUARD') {
    const records = data.today?.attendance ?? []
    const open = records.filter((row) => row.check_in && !row.check_out).length
    const completed = records.filter((row) => row.check_out).length
    return <div className="metric-grid">
      <Metric label="Today's shifts" value={data.today?.assignments?.length ?? 0} icon={Clock3} detail="Active assignment schedule"/>
      <Metric label="Checked in" value={open} icon={Activity} detail="Attendance awaiting check-out"/>
      <Metric label="Completed today" value={completed} icon={ShieldCheck} detail="Check-in and check-out recorded"/>
      <Metric label="Leave requests" value={data.leave_requests?.length ?? 0} icon={CalendarClock} detail="Pending or approved requests"/>
    </div>
  }
  return <div className="metric-grid">
    <Metric label="Present" value={data.present} icon={Activity} detail="Today's recorded attendance"/>
    <Metric label="Absent" value={data.absent} icon={CircleAlert} detail="Generated after assigned shift ends"/>
    <Metric label={role === 'SUPERVISOR' ? 'Needs verification' : 'Late arrivals'} value={role === 'SUPERVISOR' ? data.pending_verification : data.late} icon={ClipboardCheck} detail={role === 'SUPERVISOR' ? 'Attendance at your sites' : "Today's recorded late arrivals"}/>
    <Metric label="Pending leave" value={data.pending_leaves} icon={CalendarClock} detail="Requests awaiting a decision"/>
  </div>
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [incidentSummary, setIncidentSummary] = useState(null)
  const [documentSummary, setDocumentSummary] = useState(null)

  useEffect(() => {
    let live = true
    Promise.allSettled([
      user.role === 'CLIENT' ? Promise.resolve(null) : getAttendanceDashboard(),
      getIncidentSummary(),
      user.role === 'CLIENT' ? Promise.resolve(null) : getDocumentSummary(),
    ]).then(([attendance, incidents, documents]) => {
      if (!live) return
      if (attendance.status === 'fulfilled') setData(attendance.value)
      else setError(getApiErrorMessage(attendance.reason, 'Unable to load attendance dashboard.'))
      if (incidents.status === 'fulfilled') setIncidentSummary(incidents.value)
      if (documents.status === 'fulfilled') setDocumentSummary(documents.value)
    }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [user.role])

  const firstName = user.name.trim().split(/\s+/)[0]
  const guardAssignments = data?.today?.assignments ?? []
  return <div className="dashboard-page">
    <div className="welcome-row"><div><p className="eyebrow">OPERATIONS OVERVIEW</p><h2>Good day, {firstName}</h2><p className="welcome-subtitle">Workforce and incident information visible to your SecureGuard account.</p></div><Link className="secondary-button" to={user.role === 'CLIENT' ? '/incidents' : user.role === 'GUARD' ? '/attendance' : '/leaves'}>{user.role === 'CLIENT' ? 'View incidents' : user.role === 'GUARD' ? 'Open attendance' : 'Review leave requests'}</Link></div>
    {error && <div className="directory-alert" role="alert">{error}</div>}
    {user.role === 'CLIENT' ? <section className="panel directory-message">Attendance data is not available for client accounts.</section> : loading ? <section className="panel directory-message">Loading today's attendance…</section> : data ? <>
      <SummaryMetrics data={data} role={user.role}/>
      {user.role === 'GUARD' ? <section className="panel dashboard-section"><header className="dashboard-section-heading"><div><p className="eyebrow">TODAY'S SCHEDULE</p><h3>Assigned shifts</h3></div><Link className="table-link" to="/attendance">View attendance</Link></header>{guardAssignments.length ? <div className="dashboard-shift-list">{guardAssignments.map((item) => {
        const attendance = data.today.attendance.find((row) => row.assignment_id === item.id)
        return <article className="dashboard-shift-row" key={item.id}><div><strong>{item.shift.name}</strong><span>{item.shift.start_time.slice(0, 5)}–{item.shift.end_time.slice(0, 5)} · {item.site.name}</span></div>{attendance ? <Link className="table-link" to={`/attendance/${attendance.id}`}>{attendance.check_out ? 'Completed' : attendance.check_in ? 'Check out' : attendance.status}</Link> : <Link className="table-link" to="/attendance">Check in</Link>}</article>
      })}</div> : <div className="directory-message">No active assignment is scheduled for today.</div>}</section> : <section className="panel dashboard-section"><header className="dashboard-section-heading"><div><p className="eyebrow">ATTENDANCE</p><h3>{user.role === 'SUPERVISOR' ? 'Verification queue' : "Today's summary"}</h3></div><Link className="table-link" to="/attendance">View attendance</Link></header><p className="dashboard-summary-copy">{user.role === 'SUPERVISOR' ? `${data.pending_verification} attendance records at your assigned sites are waiting for review.` : `${data.total} attendance records are available for ${data.date}.`}</p></section>}
      {user.role === 'GUARD' && <section className="dashboard-actions"><Link className="primary-button" to="/leaves/new">Apply for leave</Link><Link className="secondary-button" to="/leaves">View my leave requests</Link></section>}
    </> : null}
    {incidentSummary && <section className="phase6-dashboard-grid"><Link className="panel phase6-dashboard-card" to="/incidents"><span>Open incidents</span><strong>{incidentSummary.open}</strong><small>Incidents visible to your account</small></Link><Link className="panel phase6-dashboard-card" to="/incidents"><span>Under investigation</span><strong>{incidentSummary.investigating}</strong><small>Authorized incident records</small></Link><Link className="panel phase6-dashboard-card" to="/incidents"><span>Resolved incidents</span><strong>{incidentSummary.resolved}</strong><small>Current authorized records</small></Link></section>}
    {documentSummary && user.role !== 'CLIENT' && <section className="panel document-dashboard-note"><div><p className="eyebrow">EMPLOYEE DOCUMENTS</p><h3>{documentSummary.total} records · {documentSummary.pending} pending review</h3><p>Expiry tracking is unavailable in the current schema; private file storage is not configured.</p></div><Link className="table-link" to="/documents">View documents</Link></section>}
  </div>
}
