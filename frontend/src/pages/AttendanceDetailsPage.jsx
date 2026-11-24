import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock3 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getAttendanceRecord, verifyAttendance } from '../api/attendanceLeaveApi.js'
import { getApiErrorMessage } from '../api/client.js'
import { useAuth } from '../auth/useAuth.js'

export default function AttendanceDetailsPage() {
  const { attendanceId } = useParams()
  const { user } = useAuth()
  const supervisor = user.role === 'SUPERVISOR'
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let live = true
    getAttendanceRecord(attendanceId).then((value) => { if (live) setRecord(value) }).catch((err) => { if (live) setError(getApiErrorMessage(err, 'Unable to load attendance record.')) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [attendanceId])

  async function verify() {
    setSaving(true); setError(''); setNotice('')
    try { setRecord(await verifyAttendance(record.id)); setNotice('Attendance verified successfully.') }
    catch (err) { setError(getApiErrorMessage(err, 'Unable to verify attendance.')) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="panel directory-message">Loading attendance…</div>
  if (!record) return <main className="directory-page"><Link className="back-link" to="/attendance"><ArrowLeft size={16}/>Attendance</Link><div className="directory-alert" role="alert">{error || 'Attendance record not found.'}</div></main>
  return <main className="directory-page"><Link className="back-link" to="/attendance"><ArrowLeft size={16}/>Attendance</Link>{error && <div className="directory-alert" role="alert">{error}</div>}{notice && <div className="directory-success" role="status">{notice}</div>}
    <header className="directory-heading"><div><p className="eyebrow">ATTENDANCE RECORD</p><h2>{record.guard.name}</h2><p>{record.attendance_date} · {record.guard.employee_code}</p></div><div className="directory-heading-actions"><span className={`status-pill status-${record.status.toLowerCase().replaceAll('_', '-')}`}>{record.status}</span>{supervisor && !record.verified && <button className="primary-button" onClick={verify} disabled={saving}><CheckCircle2 size={16}/>{saving ? 'Verifying…' : 'Verify record'}</button>}</div></header>
    <section className="directory-detail-grid"><article className="panel directory-detail-card"><h3><Clock3 size={18}/> Shift and location</h3><dl><dt>Site</dt><dd>{record.site.site_name}</dd><dt>Shift</dt><dd>{record.shift.shift_name}</dd><dt>Scheduled time</dt><dd>{record.shift.start_time.slice(0, 5)}–{record.shift.end_time.slice(0, 5)}</dd><dt>Attendance date</dt><dd>{record.attendance_date}</dd></dl></article><article className="panel directory-detail-card"><h3>Recorded times</h3><dl><dt>Check-in</dt><dd>{record.check_in ? new Date(record.check_in).toLocaleString() : 'Not recorded'}</dd><dt>Check-out</dt><dd>{record.check_out ? new Date(record.check_out).toLocaleString() : 'Not recorded'}</dd><dt>Working duration</dt><dd>{record.working_duration_minutes === null ? 'Not available' : `${record.working_duration_minutes} minutes`}</dd><dt>Verification</dt><dd>{record.verified ? `Verified by ${record.verified_by?.name || 'supervisor'}` : 'Not verified'}</dd></dl></article></section>
  </main>
}
