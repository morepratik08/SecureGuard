import { useEffect, useState } from 'react'
import { Activity, CalendarDays, CheckCircle2, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { checkIn, checkOut, generateAbsences, getAttendance, getAttendanceDashboard, getMyAttendance, verifyAttendance } from '../api/attendanceLeaveApi.js'
import { getApiErrorMessage } from '../api/client.js'
import { useAuth } from '../auth/useAuth.js'

function todayText() { return new Date().toISOString().slice(0, 10) }
function monthStart() { return `${todayText().slice(0, 7)}-01` }
function statusClass(status) { return `status-pill status-${String(status || '').toLowerCase().replaceAll('_', '-')}` }

export default function AttendancePage() {
  const { user } = useAuth()
  const guard = user.role === 'GUARD'
  const supervisor = user.role === 'SUPERVISOR'
  const [result, setResult] = useState({ attendance: [], pagination: { total: 0, totalPages: 0 } })
  const [dashboard, setDashboard] = useState(null)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ from: guard ? undefined : todayText(), to: guard ? undefined : todayText(), status: '', guardId: '', siteId: '', shiftId: '', search: '' })
  const [absenceDate, setAbsenceDate] = useState(todayText())
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let live = true
    const params = Object.fromEntries(Object.entries({ ...filters, page, pageSize: 20 }).filter(([, value]) => value !== '' && value !== undefined))
    Promise.all([guard ? getMyAttendance(params) : getAttendance(params), getAttendanceDashboard()])
      .then(([rows, summary]) => { if (live) { setResult(rows); setDashboard(summary); setError('') } })
      .catch((err) => { if (live) setError(getApiErrorMessage(err, 'Unable to load attendance.')) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [filters, page, guard, refreshKey])

  async function runAction(key, action, success) {
    setSaving(key); setError(''); setNotice('')
    try { await action(); setNotice(success); setLoading(true); setRefreshKey((value) => value + 1) }
    catch (err) { setError(getApiErrorMessage(err, 'The attendance action could not be completed.')) }
    finally { setSaving('') }
  }

  function setFilter(key, value) { setPage(1); setFilters((current) => ({ ...current, [key]: value })) }
  function showMonth() { setPage(1); setFilters((current) => ({ ...current, from: monthStart(), to: todayText() })) }
  const todayAssignments = dashboard?.today?.assignments ?? []
  const todayRecords = dashboard?.today?.attendance ?? []

  return <main className="directory-page">
    <header className="directory-heading"><div><p className="eyebrow">WORKFORCE OPERATIONS</p><h2>{guard ? 'My attendance' : 'Attendance management'}</h2><p>{guard ? 'Check in for an assigned shift and review your attendance history.' : supervisor ? 'Review attendance and verify records for your assigned sites.' : 'Search attendance records and review daily workforce status.'}</p></div><div className="directory-heading-actions"><button className="secondary-button" onClick={() => { setLoading(true); setRefreshKey((value) => value + 1) }} disabled={loading}><RefreshCw size={16}/>Refresh</button>{!guard && !supervisor && <button className="secondary-button" onClick={showMonth}><CalendarDays size={16}/>This month</button>}</div></header>
    {error && <div className="directory-alert" role="alert">{error}</div>}{notice && <div className="directory-success" role="status">{notice}</div>}
    {dashboard && <section className="attendance-summary-grid"><article className="panel"><span>Present today</span><strong>{guard ? todayRecords.filter((row) => row.status === 'PRESENT').length : dashboard.present}</strong></article><article className="panel"><span>Late today</span><strong>{guard ? todayRecords.filter((row) => row.status === 'LATE').length : dashboard.late}</strong></article><article className="panel"><span>Absent today</span><strong>{guard ? todayRecords.filter((row) => row.status === 'ABSENT').length : dashboard.absent}</strong></article><article className="panel"><span>{supervisor ? 'Pending verification' : 'Pending leave'}</span><strong>{supervisor ? dashboard.pending_verification : guard ? dashboard.leave_requests?.filter((row) => row.status === 'PENDING').length ?? 0 : dashboard.pending_leaves}</strong></article></section>}

    {guard && <section className="panel attendance-checkin-panel"><header className="dashboard-section-heading"><div><p className="eyebrow">TODAY</p><h3>Assigned shifts</h3></div></header>{todayAssignments.length ? <div className="dashboard-shift-list">{todayAssignments.map((assignment) => {
      const record = todayRecords.find((row) => row.assignment_id === assignment.id)
      return <article className="dashboard-shift-row" key={assignment.id}><div><strong>{assignment.shift.name}</strong><span>{assignment.shift.start_time.slice(0, 5)}–{assignment.shift.end_time.slice(0, 5)} · {assignment.site.name}</span></div>{!record ? <button className="primary-button" disabled={saving === `in-${assignment.id}`} onClick={() => runAction(`in-${assignment.id}`, () => checkIn(assignment.id), 'Checked in successfully.')}>{saving === `in-${assignment.id}` ? 'Checking in…' : 'Check in'}</button> : <div className="attendance-action-state"><span className={statusClass(record.status)}>{record.status}</span>{record.check_in && !record.check_out && <button className="secondary-button" disabled={saving === `out-${record.id}`} onClick={() => runAction(`out-${record.id}`, () => checkOut(record.id), 'Checked out successfully.')}>{saving === `out-${record.id}` ? 'Checking out…' : 'Check out'}</button>}{record.check_out && <span className="muted-label">{record.working_duration_minutes ?? 0} min recorded</span>}</div>}</article>
    })}</div> : <div className="directory-message">No active shift is scheduled for today.</div>}</section>}

    {!guard && !supervisor && <section className="panel absence-generator"><label>Generate missing attendance for date <input type="date" value={absenceDate} max={todayText()} onChange={(event) => setAbsenceDate(event.target.value)}/></label><button className="secondary-button" disabled={saving === 'absences'} onClick={() => runAction('absences', () => generateAbsences(absenceDate), 'Missing attendance records generated where eligible.')}>Generate absences</button><small>Records are generated only after the assigned shift has ended. Existing verified attendance is preserved.</small></section>}

    <section className="directory-toolbar panel"><label>From <input type="date" value={filters.from ?? ''} onChange={(event) => setFilter('from', event.target.value)}/></label><label>To <input type="date" value={filters.to ?? ''} onChange={(event) => setFilter('to', event.target.value)}/></label><label>Status <select value={filters.status} onChange={(event) => setFilter('status', event.target.value)}><option value="">All statuses</option>{['PRESENT', 'LATE', 'ABSENT', 'HALF_DAY', 'ON_LEAVE'].map((status) => <option key={status}>{status}</option>)}</select></label>{!guard && <><label>Guard profile ID <input value={filters.guardId} onChange={(event) => setFilter('guardId', event.target.value)} inputMode="numeric" placeholder="All guards"/></label><label>Site ID <input value={filters.siteId} onChange={(event) => setFilter('siteId', event.target.value)} inputMode="numeric" placeholder="All sites"/></label><label>Shift ID <input value={filters.shiftId} onChange={(event) => setFilter('shiftId', event.target.value)} inputMode="numeric" placeholder="All shifts"/></label><label>Search <input value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder="Guard name or code"/></label></>}</section>

    <section className="directory-table panel"><div className="directory-table-title"><h3>Attendance records</h3><span>{result.pagination.total} records</span></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Guard</th><th>Site / shift</th><th>Check-in</th><th>Check-out</th><th>Duration</th><th>Status</th><th>Verified</th><th></th></tr></thead><tbody>{loading ? <tr><td colSpan="9" className="directory-message">Loading attendance…</td></tr> : result.attendance.length === 0 ? <tr><td colSpan="9" className="directory-message"><Activity size={22}/><strong>No attendance records found</strong><span>Records appear after check-in or after eligible absence generation.</span></td></tr> : result.attendance.map((row) => <tr key={row.id}><td>{row.attendance_date}</td><td><strong>{row.guard.name}</strong><small>{row.guard.employee_code}</small></td><td>{row.site.site_name}<small>{row.shift.shift_name} · {row.shift.start_time.slice(0, 5)}–{row.shift.end_time.slice(0, 5)}</small></td><td>{row.check_in ? new Date(row.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td><td>{row.check_out ? new Date(row.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</td><td>{row.working_duration_minutes === null ? '—' : `${row.working_duration_minutes} min`}</td><td><span className={statusClass(row.status)}>{row.status}</span></td><td>{row.verified ? <span title={row.verified_by?.name}><CheckCircle2 size={16}/> Verified</span> : '—'}</td><td className="attendance-row-actions"><Link className="table-link" to={`/attendance/${row.id}`}>Details</Link>{supervisor && !row.verified && <button className="table-link-button" disabled={saving === row.id} onClick={() => runAction(row.id, () => verifyAttendance(row.id), 'Attendance verified.')}>Verify</button>}</td></tr>)}</tbody></table></div><footer className="directory-pagination"><span>Page {page} of {result.pagination.totalPages || 1}</span><div><button className="secondary-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="secondary-button" disabled={page >= result.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div></footer></section>
  </main>
}
