import { useEffect, useState } from 'react'
import { CalendarClock, Plus, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getLeaves, getMyLeaves } from '../api/attendanceLeaveApi.js'
import { getApiErrorMessage } from '../api/client.js'
import { useAuth } from '../auth/useAuth.js'

export default function LeaveListPage() {
  const { user } = useAuth()
  const guard = user.role === 'GUARD'
  const [result, setResult] = useState({ leaves: [], pagination: { total: 0, totalPages: 0 } })
  const [filters, setFilters] = useState({ status: '', search: '', from: '', to: '' })
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    const params = Object.fromEntries(Object.entries({ ...filters, page, pageSize: 20 }).filter(([, value]) => value !== ''))
    ;(guard ? getMyLeaves(params) : getLeaves(params))
      .then((response) => { if (live) { setResult(response); setError('') } })
      .catch((err) => { if (live) setError(getApiErrorMessage(err, 'Unable to load leave requests.')) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [filters, page, guard, refreshKey])
  function update(key, value) { setPage(1); setFilters((current) => ({ ...current, [key]: value })) }

  return <main className="directory-page"><header className="directory-heading"><div><p className="eyebrow">TIME OFF</p><h2>{guard ? 'My leave requests' : 'Leave management'}</h2><p>{guard ? 'Review your requests and their decision status.' : 'Review leave requests for your organization and assigned sites.'}</p></div><div className="directory-heading-actions">{guard && <Link className="primary-button" to="/leaves/new"><Plus size={17}/>Apply for leave</Link>}<button className="secondary-button" onClick={() => { setLoading(true); setRefreshKey((value) => value + 1) }} disabled={loading}><RefreshCw size={16}/>Refresh</button></div></header>
    {error && <div className="directory-alert" role="alert">{error}</div>}
    <section className="directory-toolbar panel"><label>Status <select value={filters.status} onChange={(event) => update('status', event.target.value)}><option value="">All statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></label><label>From <input type="date" value={filters.from} onChange={(event) => update('from', event.target.value)}/></label><label>To <input type="date" value={filters.to} onChange={(event) => update('to', event.target.value)}/></label>{!guard && <label>Search guard <input value={filters.search} onChange={(event) => update('search', event.target.value)} placeholder="Name or employee code"/></label>}</section>
    <section className="directory-table panel"><div className="directory-table-title"><h3>Requests</h3><span>{result.pagination.total} requests</span></div><div className="table-scroll"><table><thead><tr><th>Guard</th><th>Leave dates</th><th>Reason</th><th>Status</th><th>Reviewed</th><th></th></tr></thead><tbody>{loading ? <tr><td colSpan="6" className="directory-message">Loading leave requests…</td></tr> : !result.leaves.length ? <tr><td colSpan="6" className="directory-message"><CalendarClock size={22}/><strong>No leave requests found</strong><span>Requests will appear here after a guard submits one.</span></td></tr> : result.leaves.map((leave) => <tr key={leave.id}><td><strong>{leave.guard.name}</strong><small>{leave.guard.employee_code}</small></td><td>{leave.start_date} – {leave.end_date}</td><td className="leave-reason-cell">{leave.reason}</td><td><span className={`status-pill status-${leave.status.toLowerCase()}`}>{leave.status}</span></td><td>{leave.reviewed_by?.name || '—'}{leave.reviewed_at && <small>{new Date(leave.reviewed_at).toLocaleDateString()}</small>}</td><td><Link className="table-link" to={`/leaves/${leave.id}`}>View</Link></td></tr>)}</tbody></table></div><footer className="directory-pagination"><span>Page {page} of {result.pagination.totalPages || 1}</span><div><button className="secondary-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="secondary-button" disabled={page >= result.pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></div></footer></section>
  </main>
}
