import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, Users } from 'lucide-react'

function ChartEmptyState({ icon: Icon, title }) {
  return <div className="chart-empty"><span><Icon size={20} /></span><strong>{title}</strong><p>Chart data will appear when the dashboard API is available.</p></div>
}

export function AttendanceChart({ data = [] }) {
  return (
    <section className="panel chart-panel">
      <div className="panel-heading"><div><h2>Attendance overview</h2><p>Daily attendance activity</p></div><span className="panel-period">Last 7 days</span></div>
      {data.length ? (
        <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}><CartesianGrid stroke="#edf1f5" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#8591a1', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#8591a1', fontSize: 11 }} /><Tooltip /><Line type="monotone" dataKey="attendance" stroke="#2864dc" strokeWidth={2.5} dot={{ r: 3, fill: '#2864dc' }} /></LineChart></ResponsiveContainer></div>
      ) : <ChartEmptyState icon={Activity} title="No attendance data yet" />}
    </section>
  )
}

export function EmployeeChart({ data = [] }) {
  return (
    <section className="panel chart-panel">
      <div className="panel-heading"><div><h2>Workforce distribution</h2><p>Employees by role</p></div><span className="panel-period">Current</span></div>
      {data.length ? (
        <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}><CartesianGrid stroke="#edf1f5" vertical={false} /><XAxis dataKey="role" axisLine={false} tickLine={false} tick={{ fill: '#8591a1', fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#8591a1', fontSize: 11 }} /><Tooltip /><Bar dataKey="count" radius={[5, 5, 0, 0]}>{data.map((entry) => <Cell key={entry.role} fill={entry.color || '#2864dc'} />)}</Bar></BarChart></ResponsiveContainer></div>
      ) : <ChartEmptyState icon={Users} title="No workforce data yet" />}
    </section>
  )
}
