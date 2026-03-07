import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const STAGES = [
  { key: 'sent', label: 'Sent', fill: '#3b82f6' },
  { key: 'delivered', label: 'Delivered', fill: '#10b981' },
  { key: 'read', label: 'Read', fill: '#8b5cf6' },
  { key: 'clicked', label: 'Clicked', fill: '#f59e0b' },
]

export default function WAMessageFunnelChart({ funnel, theme }) {
  const isDark = theme === 'dark'
  const data = STAGES.map((s) => ({ name: s.label, value: funnel[s.key] ?? 0, fill: s.fill }))
  const wrapClass = `rounded-xl border p-4 ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow'}`

  return (
    <div className={wrapClass}>
      <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Message funnel</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 60, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
            <XAxis type="number" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
            <YAxis type="category" dataKey="name" width={56} tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
            <Tooltip
              contentStyle={{ backgroundColor: isDark ? '#1e293b' : '#fff', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: '8px' }}
              labelStyle={{ color: isDark ? '#e2e8f0' : '#0f172a' }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} minPointSize={8}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
