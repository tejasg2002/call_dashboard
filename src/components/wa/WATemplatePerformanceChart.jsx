import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function WATemplatePerformanceChart({ rows, theme }) {
  const isDark = theme === 'dark'
  const data = rows.slice(0, 12).map((r) => ({ name: r.template_name.length > 20 ? r.template_name.slice(0, 20) + '…' : r.template_name, clicks: r.clicked }))
  const wrapClass = `rounded-xl border p-4 ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow'}`

  return (
    <div className={wrapClass}>
      <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Template performance (clicks)</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
            <YAxis tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
            <Tooltip
              contentStyle={{ backgroundColor: isDark ? '#1e293b' : '#fff', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: '8px' }}
              labelStyle={{ color: isDark ? '#e2e8f0' : '#0f172a' }}
            />
            <Bar dataKey="clicks" fill={isDark ? '#818cf8' : '#6366f1'} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
