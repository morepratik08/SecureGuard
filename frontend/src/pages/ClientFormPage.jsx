import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getApiErrorMessage } from '../api/client.js'
import { createClient, getClient, updateClient } from '../api/clientSiteApi.js'
import { useAuth } from '../auth/useAuth.js'

const blank = { name: '', email: '', password: '', phone: '', company_name: '', contact_person: '', company_email: '', billing_address: '', gstin: '' }
export default function ClientFormPage({ editMode = false }) {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [fields, setFields] = useState(blank)
  const [loading, setLoading] = useState(editMode)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!editMode) return undefined
    let active = true
    getClient(clientId).then((client) => { if (active) setFields({ ...blank, ...client, password: '' }) }).catch((err) => { if (active) setError(getApiErrorMessage(err, 'Unable to load client.')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [clientId, editMode])
  const admin = ['ADMIN', 'SUPER_ADMIN'].includes(user.role)
  const canEdit = admin || user.role === 'CLIENT'
  function change(event) { setFields((old) => ({ ...old, [event.target.name]: event.target.value })) }
  async function submit(event) {
    event.preventDefault(); setError('')
    if (!fields.company_name.trim() || (editMode ? false : !fields.name.trim() || !fields.email.trim() || !fields.password)) { setError('Complete all required fields.'); return }
    if (!editMode && (fields.password.length < 12 || new TextEncoder().encode(fields.password).length > 72)) { setError('Password must be at least 12 characters and no more than 72 UTF-8 bytes.'); return }
    setSaving(true)
    try {
      const payload = editMode
        ? Object.fromEntries(Object.entries(fields).filter(([key]) => ['name', 'email', 'phone', 'company_name', 'contact_person', 'company_email', 'billing_address', 'gstin'].includes(key)))
        : { name: fields.name, email: fields.email, password: fields.password, phone: fields.phone, role: 'CLIENT', profile: { company_name: fields.company_name, contact_person: fields.contact_person || undefined, company_email: fields.company_email || undefined, phone: fields.phone || undefined, billing_address: fields.billing_address || undefined, gstin: fields.gstin || undefined } }
      const client = editMode ? await updateClient(clientId, payload) : await createClient(payload)
      navigate(`/clients/${client.id}`)
    } catch (err) { setError(getApiErrorMessage(err, 'Unable to save client.')) } finally { setSaving(false) }
  }
  if (!canEdit) return <div className="directory-alert" role="alert">You cannot edit this client.</div>
  if (loading) return <div className="panel directory-message">Loading client…</div>
  const field = (name, label, required = false, type = 'text') => <label className="directory-field">{label}{required && <span aria-hidden="true"> *</span>}<input name={name} type={type} value={fields[name] ?? ''} onChange={change} required={required} autoComplete={name === 'password' ? 'new-password' : 'off'} /></label>
  return <main className="directory-page"><Link className="back-link" to={editMode ? `/clients/${clientId}` : '/clients'}><ArrowLeft size={16}/>Back</Link><header className="directory-heading"><div><p className="eyebrow">CLIENT ACCOUNT</p><h2>{editMode ? 'Edit client' : 'Create client'}</h2><p>{editMode ? 'Update organization and contact information.' : 'Create a client login and organization profile.'}</p></div></header><form className="directory-form panel" onSubmit={submit}>
    <h3>Account and company</h3><div className="directory-form-grid">{!editMode && <>{field('name','Account holder name',true)}{field('email','Login email',true,'email')}{field('password','Initial password',true,'password')}</>}{field('company_name','Company name',true)}{field('contact_person','Contact person')}{field('company_email','Company email',false,'email')}{field('phone','Phone')}{field('gstin','GSTIN')}<label className="directory-field directory-span">Billing address<textarea name="billing_address" value={fields.billing_address ?? ''} onChange={change} rows="3" /></label></div>{error && <p role="alert" className="directory-alert">{error}</p>}<div className="directory-actions"><Link className="secondary-button" to={editMode ? `/clients/${clientId}` : '/clients'}>Cancel</Link><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : editMode ? 'Save changes' : 'Create client'}</button></div>
  </form></main>
}
