import { useEffect, useState } from 'react'
import { ArrowLeft, Save, ShieldCheck } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getApiErrorMessage } from '../api/client.js'
import { createEmployee, getEmployee, updateEmployee } from '../api/employeeApi.js'

const EMPTY_FORM = {
  role: 'GUARD', name: '', email: '', phone: '', employee_code: '', joining_date: '',
  password: '', date_of_birth: '', gender: '', address: '', qualification: '',
  experience_years: '', emergency_contact: '', base_salary: '',
}

function passwordPolicyError(password) {
  const count = Array.from(password).length
  const bytes = new TextEncoder().encode(password).length
  if (count < 12) return 'Password must contain at least 12 characters.'
  if (bytes > 72) return 'Password cannot exceed 72 UTF-8 bytes.'
  return ''
}

export default function EmployeeFormPage({ editMode = false }) {
  const { employeeId } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(editMode)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!editMode) return undefined
    let active = true
    getEmployee(employeeId)
      .then((employee) => { if (active) setForm({ ...EMPTY_FORM, ...employee, password: '' }) })
      .catch((requestError) => { if (active) setError(getApiErrorMessage(requestError, 'Unable to load employee details.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [editMode, employeeId])

  function setField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    if (!editMode) {
      const policyError = passwordPolicyError(form.password)
      if (policyError) { setError(policyError); return }
    }
    setSaving(true)
    try {
      let employee
      if (editMode) {
        const changes = {
          name: form.name,
          email: form.email,
          phone: form.phone || null,
          employee_code: form.employee_code,
          joining_date: form.joining_date,
        }
        if (form.role === 'GUARD') {
          Object.assign(changes, {
            date_of_birth: form.date_of_birth || null,
            gender: form.gender || null,
            address: form.address || null,
            qualification: form.qualification || null,
            experience_years: form.experience_years === '' ? null : form.experience_years,
            emergency_contact: form.emergency_contact || null,
            base_salary: form.base_salary,
          })
        }
        employee = await updateEmployee(employeeId, changes)
        navigate(`/employees/${employee.id}`, { replace: true })
      } else {
        const profile = { employee_code: form.employee_code, joining_date: form.joining_date }
        if (form.role === 'GUARD') {
          Object.assign(profile, {
            base_salary: form.base_salary,
            ...(form.date_of_birth ? { date_of_birth: form.date_of_birth } : {}),
            ...(form.gender ? { gender: form.gender } : {}),
            ...(form.address ? { address: form.address } : {}),
            ...(form.qualification ? { qualification: form.qualification } : {}),
            ...(form.experience_years !== '' ? { experience_years: form.experience_years } : {}),
            ...(form.emergency_contact ? { emergency_contact: form.emergency_contact } : {}),
          })
        }
        employee = await createEmployee({
          name: form.name,
          email: form.email,
          phone: form.phone || undefined,
          password: form.password,
          role: form.role,
          profile,
        })
        navigate(`/employees/${employee.id}`, { replace: true })
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to save employee details.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page-loading" role="status">Loading employee details…</div>
  if (editMode && error && !form.id) return <div className="employee-alert" role="alert">{error}<Link to="/employees">Back to employees</Link></div>

  return (
    <div className="employee-form-page">
      <Link className="back-link" to={editMode ? `/employees/${employeeId}` : '/employees'}><ArrowLeft size={16} />Back to {editMode ? 'employee' : 'employees'}</Link>
      <div className="employee-page-heading form-page-heading"><div><p className="eyebrow">EMPLOYEE MANAGEMENT</p><h2>{editMode ? 'Edit employee' : 'Add employee'}</h2><p>{editMode ? 'Update contact and workforce information.' : 'Create a guard or supervisor account and profile.'}</p></div></div>

      <form className="employee-form panel" onSubmit={handleSubmit}>
        <div className="form-section-heading"><span><ShieldCheck size={18} /></span><div><h3>Account information</h3><p>Sign-in and contact details for this employee.</p></div></div>
        <div className="employee-form-grid">
          {!editMode && <label className="field-label">Employee role<select name="role" value={form.role} onChange={setField}><option value="GUARD">Security guard</option><option value="SUPERVISOR">Supervisor</option></select></label>}
          <label className="field-label">Full name<input name="name" value={form.name} onChange={setField} maxLength={100} autoComplete="name" required /></label>
          <label className="field-label">Email address<input name="email" type="email" value={form.email} onChange={setField} maxLength={150} autoComplete="email" required /></label>
          <label className="field-label">Phone number <span className="optional-label">Optional</span><input name="phone" value={form.phone || ''} onChange={setField} maxLength={15} autoComplete="tel" /></label>
          {!editMode && <label className="field-label">Initial password<input name="password" type="password" value={form.password} onChange={setField} minLength={12} autoComplete="new-password" required /><small>12 or more characters; maximum 72 UTF-8 bytes.</small></label>}
        </div>

        <div className="form-section-heading"><span><ShieldCheck size={18} /></span><div><h3>Employment information</h3><p>Profile fields supported by the SecureGuard database.</p></div></div>
        <div className="employee-form-grid">
          <label className="field-label">Employee code<input name="employee_code" value={form.employee_code} onChange={setField} maxLength={30} required /></label>
          <label className="field-label">Joining date<input name="joining_date" type="date" value={form.joining_date || ''} onChange={setField} required /></label>
          {form.role === 'GUARD' && <>
            <label className="field-label">Base salary<input name="base_salary" type="number" min="0" max="9999999999.99" step="0.01" value={form.base_salary || ''} onChange={setField} required /></label>
            <label className="field-label">Experience in years <span className="optional-label">Optional</span><input name="experience_years" type="number" min="0" max="999.9" step="0.1" value={form.experience_years ?? ''} onChange={setField} /></label>
            <label className="field-label">Date of birth <span className="optional-label">Optional</span><input name="date_of_birth" type="date" value={form.date_of_birth || ''} onChange={setField} /></label>
            <label className="field-label">Gender <span className="optional-label">Optional</span><input name="gender" value={form.gender || ''} onChange={setField} maxLength={20} /></label>
            <label className="field-label">Emergency contact <span className="optional-label">Optional</span><input name="emergency_contact" value={form.emergency_contact || ''} onChange={setField} maxLength={15} /></label>
            <label className="field-label">Qualification <span className="optional-label">Optional</span><input name="qualification" value={form.qualification || ''} onChange={setField} maxLength={150} /></label>
            <label className="field-label field-span-two">Address <span className="optional-label">Optional</span><textarea name="address" value={form.address || ''} onChange={setField} maxLength={5000} rows={3} /></label>
          </>}
        </div>

        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="employee-form-footer"><p>{editMode ? 'Sensitive employment changes are recorded in the audit log.' : 'The employee will be created as active. You can change their status from their profile.'}</p><div><Link className="secondary-button" to={editMode ? `/employees/${employeeId}` : '/employees'}>Cancel</Link><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Saving…' : <><Save size={16} />{editMode ? 'Save changes' : 'Create employee'}</>}</button></div></div>
      </form>
    </div>
  )
}
