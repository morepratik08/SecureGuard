import { ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function AccessDeniedPage() {
  return (
    <section className="access-denied panel">
      <span className="access-denied-icon"><ShieldAlert size={24} /></span>
      <p className="eyebrow">ACCESS CONTROL</p>
      <h2>You don’t have access to this area</h2>
      <p>Your account role does not include this workspace.</p>
      <Link to="/" className="primary-link">Return to overview</Link>
    </section>
  )
}
