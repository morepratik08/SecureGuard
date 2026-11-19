import { useEffect, useState } from 'react'
import { BriefcaseBusiness, Plus, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getApiErrorMessage } from '../api/client.js'
import { getClients } from '../api/clientSiteApi.js'
import { useAuth } from '../auth/useAuth.js'

export default function ClientListPage() {
  const { user } = useAuth()
  const admin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ clients: [], pagination: { total: 0, totalPages: 0 } })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getClients({ search: query || undefined, status: status || undefined, page, pageSize: 10 })
      .then((data) => { if (active) { setResult(data); setError('') } })
      .catch((err) => { if (active) setError(getApiErrorMessage(err, 'Unable to load clients.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [query, status, page])

  return <main className="directory-page">
    <header className="directory-heading"><div><p className="eyebrow">CUSTOMER ACCOUNTS</p><h2>Client Management</h2><p>Client organizations and their service locations.</p></div>{admin && <Link className="primary-button" to="/clients/new"><Plus size={17} /> Add client</Link>}</header>
    <section className="directory-toolbar panel"><label className="directory-search"><Search size={17}/><input aria-label="Search clients" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Search company, contact, email or phone" /></label>{admin && <label>Status <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>}</section>
    {error && <div className="directory-alert" role="alert">{error}</div>}
    <section className="directory-table panel"><div className="directory-table-title"><h3>Clients</h3><span>{result.pagination.total ?? 0} organizations</span></div><div className="table-scroll"><table><thead><tr><th>Company</th><th>Contact</th><th>Email</th><th>Phone</th><th>Sites</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>
      {loading ? <tr><td colSpan="8" className="directory-message">Loading clients…</td></tr> : result.clients.length === 0 ? <tr><td colSpan="8" className="directory-message"><BriefcaseBusiness size={22}/><strong>No clients found</strong><span>Try changing your search or filters.</span></td></tr> : result.clients.map((client) => <tr key={client.id}><td><strong>{client.company_name}</strong></td><td>{client.contact_person || client.name || '—'}</td><td>{client.company_email || client.email || '—'}</td><td>{client.phone || '—'}</td><td>{client.site_count}</td><td><span className={`status-pill status-${client.status.toLowerCase()}`}>{client.status}</span></td><td>{client.created_at ? new Date(client.created_at).toLocaleDateString() : '—'}</td><td><Link className="table-link" to={`/clients/${client.id}`}>View</Link>{admin && <> · <Link className="table-link" to={`/clients/${client.id}/edit`}>Edit</Link></>}</td></tr>)}
    </tbody></table></div><footer className="directory-pagination"><span>Page {page} of {result.pagination.totalPages || 1}</span><div><button className="secondary-button" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>Previous</button><button className="secondary-button" disabled={page >= result.pagination.totalPages} onClick={() => setPage((v) => v + 1)}>Next</button></div></footer></section>
  </main>
}
