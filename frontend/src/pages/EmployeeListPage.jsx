import { useEffect, useState } from 'react'
import { Activity, CalendarClock, Plus, UserRound, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getApiErrorMessage } from '../api/client.js'
import { getEmployeeSummary, getEmployees } from '../api/employeeApi.js'
import { useAuth } from '../auth/useAuth.js'
import EmployeeTable from '../components/employees/EmployeeTable.jsx'

function SummaryCard({ icon: Icon, label, value, tone }) {
  return <article className="employee-summary-card panel"><span className={`employee-summary-icon summary-${tone}`}><Icon size={18} /></span><div><span>{label}</span><strong>{value ?? '—'}</strong></div></article>
}

export default function EmployeeListPage() {
  const { user } = useAuth()
  const isSupervisor = user.role === 'SUPERVISOR'
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role)
  const [employees, setEmployees] = useState([])
  const [summary, setSummary] = useState(null)
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 0 })
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    const params = { page: pagination.page, pageSize: pagination.pageSize, search, role: role || undefined, status: status || undefined, sortBy, sortOrder }
    Promise.all([getEmployees(params), getEmployeeSummary()])
      .then(([listing, stats]) => {
        if (!active) return
        setEmployees(listing.employees)
        setPagination(listing.pagination)
        setSummary(stats)
        setError('')
      })
      .catch((requestError) => {
        if (active) setError(getApiErrorMessage(requestError, 'Unable to load employees right now.'))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [pagination.page, pagination.pageSize, search, role, status, sortBy, sortOrder, reload])

  function changeSort(field) {
    if (sortBy === field) setSortOrder((value) => value === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortOrder('asc') }
    setPagination((current) => ({ ...current, page: 1 }))
  }

  return (
    <div className="employee-page">
      <div className="employee-page-heading"><div><p className="eyebrow">WORKFORCE DIRECTORY</p><h2>Employees</h2><p>Manage security guards and supervisors across your operation.</p></div>{isAdmin && <Link className="primary-button" to="/employees/new"><Plus size={17} />Add employee</Link>}</div>

      <div className="employee-summary-grid">
        <SummaryCard label="Total guards" value={summary?.totalGuards} icon={Users} tone="blue" />
        <SummaryCard label="Total supervisors" value={summary?.totalSupervisors} icon={UserRound} tone="violet" />
        <SummaryCard label="Active employees" value={summary?.activeEmployees} icon={Activity} tone="green" />
        <SummaryCard label="Inactive employees" value={summary?.inactiveEmployees} icon={Users} tone="slate" />
        <SummaryCard label="On leave" value={summary?.employeesOnLeave} icon={CalendarClock} tone="amber" />
      </div>

      <section className="employee-filters panel" aria-label="Employee filters">
        <label className="employee-search"><span className="sr-only">Search name or employee code</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPagination((current) => ({ ...current, page: 1 })) }} placeholder="Search name, email or employee code" /></label>
        <label><span className="sr-only">Filter by role</span><select value={role} onChange={(event) => { setRole(event.target.value); setPagination((current) => ({ ...current, page: 1 })) }}><option value="">All roles</option><option value="GUARD">Security guard</option>{!isSupervisor && <option value="SUPERVISOR">Supervisor</option>}</select></label>
        <label><span className="sr-only">Filter by employment status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPagination((current) => ({ ...current, page: 1 })) }}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ON_LEAVE">On leave</option>{!isSupervisor && <option value="TERMINATED">Terminated</option>}</select></label>
      </section>

      {error && <div className="employee-alert" role="alert"><span>{error}</span><button type="button" onClick={() => setReload((value) => value + 1)}>Retry</button></div>}
      <EmployeeTable employees={employees} pagination={pagination} loading={loading} sortBy={sortBy} sortOrder={sortOrder} onSort={changeSort} onPage={(page) => setPagination((current) => ({ ...current, page }))} />
    </div>
  )
}
