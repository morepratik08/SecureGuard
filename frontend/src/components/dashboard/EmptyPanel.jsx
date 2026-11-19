import { Inbox } from 'lucide-react'

export default function EmptyPanel({ title, description }) {
  return (
    <section className="panel empty-panel">
      <div className="panel-heading"><div><h2>{title}</h2><p>{description}</p></div></div>
      <div className="empty-panel-content"><span className="empty-icon"><Inbox size={20} /></span><strong>Nothing to show yet</strong><p>This section will update when connected data is available.</p></div>
    </section>
  )
}
