export default function MetricCard({ label, icon: Icon, accent, value, detail }) {
  return (
    <article className="metric-card">
      <div className="metric-heading"><span>{label}</span><span className={`metric-icon metric-icon-${accent}`}><Icon size={18} /></span></div>
      <div className="metric-value">{value ?? '—'}</div>
      <div className="metric-detail">{detail}</div>
    </article>
  )
}
