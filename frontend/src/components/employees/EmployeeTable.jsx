import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Eye } from 'lucide-react'
import { Link } from 'react-router-dom'

const SORTS = [
  ['name', 'Name'], ['employeeCode', 'Employee code'], ['role', 'Role'],
  ['status', 'Status'], ['joiningDate', 'Joining date'],
]

function StatusBadge({ status }) {
  return <span className={`status-badge status-${status.toLowerCase().replaceAll('_', '-')}`}>{status.replaceAll('_', ' ')}</span>
}

export default function EmployeeTable({ employees, pagination, loading, sortBy, sortOrder, onSort, onPage }) {
  return (
    <section className="employee-table-panel panel">
      <div className="employee-table-wrap">
        <table className="employee-table">
          <thead><tr>
            {SORTS.map(([key, label]) => <th key={key}><button type="button" className="sort-button" onClick={() => onSort(key)}>{label}{sortBy === key ? (sortOrder === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ArrowUpDown size={13} />}</button></th>)}
            <th>Contact</th><th aria-label="Actions" />
          </tr></thead>
          <tbody>
            {loading && employees.length === 0 && <tr><td colSpan="7"><div className="table-state"><span className="button-spinner table-spinner" />Loading employees…</div></td></tr>}
            {!loading && employees.length === 0 && <tr><td colSpan="7"><div className="table-state"><strong>No employees found</strong><span>Try another search or adjust the filters.</span></div></td></tr>}
            {employees.map((employee) => (
              <tr key={employee.id}>
                <td><div className="employee-name-cell"><span className="employee-avatar">{employee.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span><span><strong>{employee.name}</strong><small>{employee.email}</small></span></div></td>
                <td><span className="employee-code">{employee.employee_code}</span></td>
                <td><span className="role-label">{employee.role === 'GUARD' ? 'Security guard' : 'Supervisor'}</span></td>
                <td><StatusBadge status={employee.employment_status} /></td>
                <td>{employee.joining_date || '—'}</td>
                <td>{employee.phone || '—'}</td>
                <td><Link className="employee-view-link" to={`/employees/${employee.id}`} aria-label={`View ${employee.name}`}><Eye size={16} /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && <div className="employee-pagination"><span>{pagination.total ? `Showing ${(pagination.page - 1) * pagination.pageSize + 1}–${Math.min(pagination.page * pagination.pageSize, pagination.total)} of ${pagination.total}` : '0 employees'}</span><div><button type="button" aria-label="Previous page" disabled={pagination.page <= 1 || loading} onClick={() => onPage(pagination.page - 1)}><ChevronLeft size={16} /></button><span>Page {pagination.page} of {Math.max(1, pagination.totalPages)}</span><button type="button" aria-label="Next page" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => onPage(pagination.page + 1)}><ChevronRight size={16} /></button></div></div>}
    </section>
  )
}
