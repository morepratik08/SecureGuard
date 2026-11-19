import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, Edit3, Mail, MapPin, Phone, ShieldCheck, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getApiErrorMessage } from '../api/client.js'
import { getEmployee, getMyEmployeeProfile, updateEmployeeStatus } from '../api/employeeApi.js'
import { useAuth } from '../auth/useAuth.js'
import EmployeeStatusDialog from '../components/employees/EmployeeStatusDialog.jsx'

function DataField({ label, value }) {
  return <div className="employee-data-field"><span>{label}</span><strong>{value || '—'}</strong></div>
}

function displayDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

export default function EmployeeDetailsPage({ myProfile = false }) {
  const { employeeId } = useParams()
  const { user } = useAuth()
  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role)
  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusDialogOpen, setStatusDialogOpen] = useState(false)
  const [savingStatus, setSavingStatus] = useState(false)
  const [statusError, setStatusError] = useState('')

  useEffect(() => {
    let active = true
    const load = myProfile ? getMyEmployeeProfile() : getEmployee(employeeId)
    load.then((result) => { if (active) setEmployee(result) })
      .catch((requestError) => { if (active) setError(getApiErrorMessage(requestError, 'Unable to load employee profile.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [employeeId, myProfile])

  async function saveStatus(status) {
    setSavingStatus(true)
    setStatusError('')
    try {
      const updated = await updateEmployeeStatus(employee.id, status)
      setEmployee(updated)
      setStatusDialogOpen(false)
    } catch (requestError) {
      setStatusError(getApiErrorMessage(requestError, 'Unable to update employment status.'))
    } finally {
      setSavingStatus(false)
    }
  }

  if (loading) return <div className="page-loading" role="status">Loading employee profile…</div>
  if (error || !employee) return <div className="employee-alert" role="alert"><span>{error || 'Employee profile not found.'}</span><Link to={myProfile ? '/' : '/employees'}>Return</Link></div>

  return (
    <div className="employee-detail-page">
      <Link className="back-link" to={myProfile ? '/' : '/employees'}><ArrowLeft size={16} />Back to {myProfile ? 'overview' : 'employees'}</Link>
      <section className="employee-profile-banner panel">
        <span className="employee-profile-avatar"><UserRound size={28} /></span>
        <div className="employee-profile-title"><p className="eyebrow">EMPLOYEE PROFILE</p><h2>{employee.name}</h2><p>{employee.role === 'GUARD' ? 'Security guard' : 'Supervisor'} <span>·</span> {employee.employee_code}</p></div>
        <span className={`status-badge status-${employee.employment_status.toLowerCase().replaceAll('_', '-')}`}>{employee.employment_status.replaceAll('_', ' ')}</span>
        {isAdmin && <div className="employee-profile-actions"><Link className="secondary-button" to={`/employees/${employee.id}/edit`}><Edit3 size={15} />Edit profile</Link><button type="button" className="primary-button" onClick={() => { setStatusError(''); setStatusDialogOpen(true) }}>Change status</button></div>}
      </section>

      <div className="employee-detail-grid">
        <section className="detail-card panel"><div className="detail-card-heading"><span><UserRound size={17} /></span><div><h3>Personal information</h3><p>Basic identity details</p></div></div><div className="employee-data-grid"><DataField label="Full name" value={employee.name} /><DataField label="Role" value={employee.role === 'GUARD' ? 'Security guard' : 'Supervisor'} />{employee.date_of_birth !== undefined && <DataField label="Date of birth" value={displayDate(employee.date_of_birth)} />}{employee.gender !== undefined && <DataField label="Gender" value={employee.gender} />}{employee.qualification !== undefined && <DataField label="Qualification" value={employee.qualification} />}{employee.experience_years !== undefined && <DataField label="Experience" value={employee.experience_years ? `${employee.experience_years} years` : '—'} />}</div></section>
        <section className="detail-card panel"><div className="detail-card-heading"><span><ShieldCheck size={17} /></span><div><h3>Employment information</h3><p>Workforce record</p></div></div><div className="employee-data-grid"><DataField label="Employee code" value={employee.employee_code} /><DataField label="Employment status" value={employee.employment_status.replaceAll('_', ' ')} /><DataField label="Joining date" value={displayDate(employee.joining_date)} /><DataField label="Profile created" value={displayDate(employee.created_at)} />{'base_salary' in employee && <DataField label="Base salary" value={new Intl.NumberFormat(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(employee.base_salary))} />}</div></section>
        <section className="detail-card panel"><div className="detail-card-heading"><span><Mail size={17} /></span><div><h3>Contact information</h3><p>Communication details</p></div></div><div className="employee-data-grid"><DataField label="Email address" value={employee.email} /><DataField label="Phone number" value={employee.phone} />{employee.address !== undefined && <DataField label="Address" value={employee.address} />}{employee.emergency_contact !== undefined && <DataField label="Emergency contact" value={employee.emergency_contact} />}</div></section>
      </div>
      {!isAdmin && <p className="privacy-note"><MapPin size={14} />Only information permitted for your account is shown here.</p>}
      {statusDialogOpen && <EmployeeStatusDialog employee={employee} onClose={() => setStatusDialogOpen(false)} onConfirm={saveStatus} saving={savingStatus} error={statusError} />}
    </div>
  )
}
