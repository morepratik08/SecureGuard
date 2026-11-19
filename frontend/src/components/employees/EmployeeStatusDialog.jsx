import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

export default function EmployeeStatusDialog({ employee, onClose, onConfirm, saving, error }) {
  const [status, setStatus] = useState(employee.employment_status)
  const options = employee.role === 'GUARD'
    ? ['ACTIVE', 'ON_LEAVE', 'INACTIVE', 'TERMINATED']
    : ['ACTIVE', 'INACTIVE']

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <section className="employee-dialog panel" role="dialog" aria-modal="true" aria-labelledby="status-dialog-title">
        <button type="button" className="dialog-close" aria-label="Close status dialog" onClick={onClose} disabled={saving}><X size={18} /></button>
        <span className="dialog-warning-icon"><AlertTriangle size={20} /></span>
        <h2 id="status-dialog-title">Change employee status</h2>
        <p>Changing status affects this employee’s access. Historical attendance, assignments and salary records are retained.</p>
        <label className="field-label" htmlFor="employee-status">Employment status</label>
        <select id="employee-status" value={status} onChange={(event) => setStatus(event.target.value)} disabled={saving}>
          {options.map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}
        </select>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="primary-button" onClick={() => onConfirm(status)} disabled={saving || status === employee.employment_status}>{saving ? 'Saving…' : 'Confirm status'}</button></div>
      </section>
    </div>
  )
}
