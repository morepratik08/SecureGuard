import { useEffect, useState } from 'react'
import { ArrowLeft, FileText } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { getApiErrorMessage } from '../api/client.js'
import { getDocument, updateDocument } from '../api/incidentDocumentApi.js'
import { useAuth } from '../auth/useAuth.js'

export default function DocumentDetailsPage() {
  const { documentId } = useParams()
  const { user } = useAuth()
  const canManage = ['SUPER_ADMIN', 'ADMIN'].includes(user.role)
  const [document, setDocument] = useState(null)
  const [documentType, setDocumentType] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    getDocument(documentId)
      .then((value) => { if (active) { setDocument(value); setDocumentType(value.document_type) } })
      .catch((err) => { if (active) setError(getApiErrorMessage(err, 'Unable to load document.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [documentId])

  async function save() {
    setSaving(true); setError(''); setNotice('')
    try { setDocument(await updateDocument(document.id, { document_type: documentType })); setNotice('Document type updated.') }
    catch (err) { setError(getApiErrorMessage(err, 'Unable to update document.')) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="panel directory-message">Loading document…</div>
  if (!document) return <main className="directory-page"><Link className="back-link" to="/documents"><ArrowLeft size={16}/>Documents</Link><div className="directory-alert" role="alert">{error || 'Document not found.'}</div></main>

  return <main className="directory-page">
    <Link className="back-link" to="/documents"><ArrowLeft size={16}/>Documents</Link>
    {error && <div className="directory-alert" role="alert">{error}</div>}
    {notice && <div className="directory-success" role="status">{notice}</div>}
    <header className="directory-heading"><div><p className="eyebrow">DOCUMENT METADATA</p><h2>{document.document_type}</h2><p>{document.guard.name} · {document.guard.employee_code}</p></div><span className={`status-pill status-${document.verification_status.toLowerCase()}`}>{document.verification_status}</span></header>
    <section className="directory-detail-grid">
      <article className="panel directory-detail-card"><h3><FileText size={18}/> Metadata</h3><dl><dt>Type</dt><dd>{document.document_type}</dd><dt>Uploaded</dt><dd>{document.uploaded_at ? new Date(document.uploaded_at).toLocaleString() : '—'}</dd><dt>Expiry</dt><dd>Not tracked in the current schema</dd><dt>File access</dt><dd>Unavailable until private storage is configured</dd></dl></article>
      {canManage && <article className="panel directory-detail-card"><h3>Metadata</h3><label className="document-status-field">Document type<input value={documentType} onChange={(event) => setDocumentType(event.target.value)} maxLength={50}/></label><button className="primary-button" disabled={saving || documentType.trim() === document.document_type} onClick={save}>{saving ? 'Saving…' : 'Save type'}</button><p className="muted-label">Verification status is read-only until authorized file review is available.</p></article>}
    </section>
    <div className="directory-alert document-storage-notice" role="status">The stored file URL is intentionally withheld. File upload and retrieval are disabled until a private storage provider is configured.</div>
  </main>
}
