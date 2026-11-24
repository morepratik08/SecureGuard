import { useEffect, useState } from 'react'
import { ArrowLeft, Siren } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { getApiErrorMessage } from '../api/client.js'
import { createIncident, getIncidentReportSites } from '../api/incidentDocumentApi.js'

function localDateTime() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
export default function IncidentFormPage() {
  const navigate = useNavigate()
  const [sites, setSites] = useState([])
  const [form, setForm] = useState({ site_id: '', incident_title: '', description: '', severity: 'LOW', incident_time: localDateTime() })
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  useEffect(() => { let active = true; getIncidentReportSites().then((value) => { if (active) { setSites(value); setForm((current) => ({ ...current, site_id: value[0]?.id ?? '' })) } }).catch((err) => { if (active) setError(getApiErrorMessage(err, 'Unable to load authorized sites.')) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [])
  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })) }
  async function submit(event) { event.preventDefault(); setSaving(true); setError(''); try { const incident = await createIncident({ ...form, incident_time: new Date(form.incident_time).toISOString() }); navigate(`/incidents/${incident.id}`) } catch (err) { setError(getApiErrorMessage(err, 'Unable to report incident.')) } finally { setSaving(false) } }
  return <main className="directory-page"><Link className="back-link" to="/incidents"><ArrowLeft size={16}/>Incidents</Link><header className="directory-heading"><div><p className="eyebrow">INCIDENT REPORTING</p><h2>Report an incident</h2><p>Reporter identity is taken from your signed-in account.</p></div></header>{error && <div className="directory-alert" role="alert">{error}</div>}
    <form className="panel phase-form" onSubmit={submit}><h3><Siren size={18}/> Incident details</h3>{loading ? <div className="directory-message">Loading authorized sites…</div> : !sites.length ? <div className="directory-message">No active authorized site is available for incident reporting.</div> : <><div className="form-grid"><label>Site<select name="site_id" value={form.site_id} onChange={change} required>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label><label>Incident time<input type="datetime-local" name="incident_time" value={form.incident_time} onChange={change} required/></label><label>Severity<select name="severity" value={form.severity} onChange={change}>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value}>{value}</option>)}</select></label><label>Title<input name="incident_title" value={form.incident_title} onChange={change} maxLength="150" required/></label><label className="form-grid-wide">Description<textarea name="description" value={form.description} onChange={change} maxLength="20000" rows={6} required/></label></div><div className="directory-actions"><Link className="secondary-button" to="/incidents">Cancel</Link><button className="primary-button" disabled={saving}>{saving ? 'Submitting…' : 'Submit report'}</button></div></>}</form>
  </main>
}
