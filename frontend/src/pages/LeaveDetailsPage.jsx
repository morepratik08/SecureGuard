import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarClock } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { approveLeave, getLeave, rejectLeave } from '../api/attendanceLeaveApi.js'
import { getApiErrorMessage } from '../api/client.js'
import { useAuth } from '../auth/useAuth.js'

export default function LeaveDetailsPage() {
  const { leaveId } = useParams()
  const location = useLocation()
  const { user } = useAuth()
  const admin = ['SUPER_ADMIN', 'ADMIN'].includes(user.role)
  const [leave, setLeave] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(location.state?.created ? 'Leave request submitted.' : '')

  useEffect(() => {
    let live = true
    getLeave(leaveId).then((value) => { if (live) setLeave(value) }).catch((err) => { if (live) setError(getApiErrorMessage(err, 'Unable to load leave request.')) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [leaveId])

  async function decide(action) {
    const label = action === 'approve' ? 'approve' : 'reject'
    if (!window.confirm(`Are you sure you want to ${label} this leave request?`)) return
    setSaving(true); setError(''); setNotice('')
    try { setLeave(await (action === 'approve' ? approveLeave(leave.id) : rejectLeave(leave.id))); setNotice(`Leave request ${action === 'approve' ? 'approved' : 'rejected'}.`) }
    catch (err) { setError(getApiErrorMessage(err, `Unable to ${label} leave request.`)) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="panel directory-message">Loading leave request…</div>
  if (!leave) return <main className="directory-page"><Link className="back-link" to="/leaves"><ArrowLeft size={16}/>Leave requests</Link><div className="directory-alert" role="alert">{error || 'Leave request not found.'}</div></main>
  return <main className="directory-page"><Link className="back-link" to="/leaves"><ArrowLeft size={16}/>Leave requests</Link>{error && <div className="directory-alert" role="alert">{error}</div>}{notice && <div className="directory-success" role="status">{notice}</div>}
    <header className="directory-heading"><div><p className="eyebrow">LEAVE REQUEST</p><h2>{leave.guard.name}</h2><p>{leave.guard.employee_code} · {leave.start_date} – {leave.end_date}</p></div><div className="directory-heading-actions"><span className={`status-pill status-${leave.status.toLowerCase()}`}>{leave.status}</span>{admin && leave.status === 'PENDING' && <><button className="primary-button" disabled={saving} onClick={() => decide('approve')}>{saving ? 'Saving…' : 'Approve'}</button><button className="secondary-button" disabled={saving} onClick={() => decide('reject')}>Reject</button></>}</div></header>
    <section className="directory-detail-grid"><article className="panel directory-detail-card"><h3><CalendarClock size={18}/> Request details</h3><dl><dt>Start date</dt><dd>{leave.start_date}</dd><dt>End date</dt><dd>{leave.end_date}</dd><dt>Submitted</dt><dd>{leave.created_at ? new Date(leave.created_at).toLocaleString() : '—'}</dd><dt>Reason</dt><dd>{leave.reason}</dd></dl></article><article className="panel directory-detail-card"><h3>Decision</h3><dl><dt>Status</dt><dd>{leave.status}</dd><dt>Reviewed by</dt><dd>{leave.reviewed_by?.name || 'Not reviewed'}</dd><dt>Reviewed at</dt><dd>{leave.reviewed_at ? new Date(leave.reviewed_at).toLocaleString() : '—'}</dd><dt>Rejection reason</dt><dd>Not supported by the current database schema.</dd></dl></article></section>
  </main>
}
