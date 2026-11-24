import { useState } from 'react'
import { ArrowLeft, CalendarClock } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { applyForLeave } from '../api/attendanceLeaveApi.js'
import { getApiErrorMessage } from '../api/client.js'

export default function LeaveFormPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ start_date: '', end_date: '', reason: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  function update(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })) }

  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('')
    try { const leave = await applyForLeave(form); navigate(`/leaves/${leave.id}`, { state: { created: true } }) }
    catch (err) { setError(getApiErrorMessage(err, 'Unable to submit leave request.')) }
    finally { setSaving(false) }
  }

  return <main className="directory-page"><Link className="back-link" to="/leaves"><ArrowLeft size={16}/>My leave requests</Link><header className="directory-heading"><div><p className="eyebrow">TIME OFF</p><h2>Apply for leave</h2><p>Choose the leave dates and add a reason for your request.</p></div></header>{error && <div className="directory-alert" role="alert">{error}</div>}
    <form className="panel phase-form" onSubmit={submit}><h3><CalendarClock size={18}/> Leave details</h3><div className="form-grid"><label>Start date<input type="date" name="start_date" value={form.start_date} onChange={update} required/></label><label>End date<input type="date" name="end_date" value={form.end_date} min={form.start_date || undefined} onChange={update} required/></label><label className="form-grid-wide">Reason<textarea name="reason" value={form.reason} onChange={update} maxLength={5000} rows={5} required placeholder="Describe the reason for your leave"/></label></div><p className="muted-label">The current database schema does not store a leave type or rejection reason.</p><div className="directory-actions"><Link className="secondary-button" to="/leaves">Cancel</Link><button className="primary-button" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</button></div></form>
  </main>
}
