import { useEffect, useState } from 'react'
import { ArrowLeft, Pencil } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getApiErrorMessage } from '../api/client.js'
import { getShift, updateShiftStatus } from '../api/clientSiteApi.js'
import { useAuth } from '../auth/useAuth.js'

export default function ShiftDetailsPage() {
  const { shiftId } = useParams(); const { user } = useAuth(); const admin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role)
  const [shift, setShift] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [confirm, setConfirm] = useState(false); const [saving, setSaving] = useState(false)
  useEffect(() => { let live = true; getShift(shiftId).then((value) => { if (live) setShift(value) }).catch((e) => { if (live) setError(getApiErrorMessage(e, 'Unable to load shift.')) }).finally(() => { if (live) setLoading(false) }); return () => { live = false } }, [shiftId])
  async function toggle() { setSaving(true); try { setShift(await updateShiftStatus(shift.id, !shift.is_active)); setConfirm(false); setError('') } catch (e) { setError(getApiErrorMessage(e, 'Unable to update shift status.')) } finally { setSaving(false) } }
  if (loading) return <div className="panel directory-message">Loading shift…</div>
  if (!shift) return <div className="directory-alert" role="alert">{error || 'Shift not found.'}</div>
  return <main className="directory-page"><Link className="back-link" to="/shifts"><ArrowLeft size={16}/>Shift Management</Link>{error && <div className="directory-alert" role="alert">{error}</div>}<header className="directory-heading"><div><p className="eyebrow">SHIFT DETAILS</p><h2>{shift.shift_name}</h2><p>{shift.start_time?.slice(0, 5)} – {shift.end_time?.slice(0, 5)}{shift.end_time < shift.start_time ? ' · Overnight' : ''}</p></div>{admin && <div className="directory-heading-actions"><span className={`status-pill ${shift.is_active ? 'status-active' : 'status-inactive'}`}>{shift.is_active ? 'ACTIVE' : 'INACTIVE'}</span><Link className="secondary-button" to={`/shifts/${shift.id}/edit`}><Pencil size={16}/>Edit</Link><button className="secondary-button" onClick={() => setConfirm(true)}>{shift.is_active ? 'Deactivate' : 'Activate'}</button></div>}</header><section className="panel directory-detail-card"><h3>Configuration</h3><dl><dt>Start time</dt><dd>{shift.start_time}</dd><dt>End time</dt><dd>{shift.end_time}</dd><dt>Active assignments</dt><dd>{shift.active_assignment_count}</dd><dt>Description</dt><dd>{shift.description || '—'}</dd><dt>Break duration</dt><dd>Not available in the current schema</dd></dl></section>{confirm && <div className="dialog-backdrop"><section className="panel directory-confirm" role="dialog" aria-modal="true"><h3>{shift.is_active ? 'Deactivate shift?' : 'Activate shift?'}</h3><p>Shifts with active assignments cannot be deactivated.</p><div className="directory-actions"><button className="secondary-button" disabled={saving} onClick={() => setConfirm(false)}>Cancel</button><button className="primary-button" disabled={saving} onClick={toggle}>{saving ? 'Saving…' : 'Confirm'}</button></div></section></div>}</main>
}
