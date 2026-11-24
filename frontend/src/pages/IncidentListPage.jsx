import { useEffect, useState } from 'react'
import { Plus, Search, Siren } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getApiErrorMessage } from '../api/client.js'
import { getIncidents } from '../api/incidentDocumentApi.js'

function badge(value) { return `status-pill status-${String(value).toLowerCase().replaceAll('_', '-')}` }
export default function IncidentListPage() {
  const canReport = true
  const [filters, setFilters] = useState({ search: '', status: '', severity: '', from: '', to: '' })
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ incidents: [], pagination: { total: 0, totalPages: 0 } })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const params = Object.fromEntries(Object.entries({ ...filters, page, pageSize: 20 }).filter(([, value]) => value !== ''))
    getIncidents(params).then((value) => { if (active) { setResult(value); setError('') } }).catch((err) => { if (active) setError(getApiErrorMessage(err, 'Unable to load incidents.')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters, page])
  function update(key, value) { setPage(1); setFilters((current) => ({ ...current, [key]: value })) }
  return <main className="directory-page"><header className="directory-heading"><div><p className="eyebrow">FIELD OPERATIONS</p><h2>Incident management</h2><p>Review incidents visible to your account and track their investigation status.</p></div>{canReport && <Link className="primary-button" to="/incidents/new"><Plus size={17}/>Report incident</Link>}</header>
    <section className="directory-toolbar panel"><label className="directory-search"><Search size={17}/><input aria-label="Search incidents" value={filters.search} onChange={(event) => update('search', event.target.value)} placeholder="Search title or description"/></label><label>Status<select value={filters.status} onChange={(event) => update('status', event.target.value)}><option value="">All statuses</option>{['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED'].map((value) => <option key={value}>{value}</option>)}</select></label><label>Severity<select value={filters.severity} onChange={(event) => update('severity', event.target.value)}><option value="">All severities</option>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value}>{value}</option>)}</select></label><label>From<input type="date" value={filters.from} onChange={(event) => update('from', event.target.value)}/></label><label>To<input type="date" value={filters.to} onChange={(event) => update('to', event.target.value)}/></label></section>
    {error && <div className="directory-alert" role="alert">{error}</div>}<section className="directory-table panel"><div className="directory-table-title"><h3>Incidents</h3><span>{result.pagination.total} records</span></div><div className="table-scroll"><table><thead><tr><th>Incident</th><th>Site</th><th>Reported by</th><th>Time</th><th>Severity</th><th>Status</th><th></th></tr></thead><tbody>{loading ? <tr><td colSpan="7" className="directory-message">Loading incidents…</td></tr> : !result.incidents.length ? <tr><td colSpan="7" className="directory-message"><Siren size={22}/><strong>No incidents found</strong><span>Incidents you are authorized to access will appear here.</span></td></tr> : result.incidents.map((incident) => <tr key={incident.id}><td><strong>{incident.title}</strong><small>{incident.description.slice(0, 100)}</small></td><td>{incident.site.name}</td><td>{incident.reporter.name}</td><td>{new Date(incident.incident_time).toLocaleString()}</td><td><span className={badge(incident.severity)}>{incident.severity}</span></td><td><span className={badge(incident.status)}>{incident.status}</span></td><td><Link className="table-link" to={`/incidents/${incident.id}`}>Details</Link></td></tr>)}</tbody></table></div><footer className="directory-pagination"><span>Page {page} of {result.pagination.totalPages || 1}</span><div><button className="secondary-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="secondary-button" disabled={page >= result.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div></footer></section>
  </main>
}
