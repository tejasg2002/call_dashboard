import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#f43f5e', '#0ea5e9', '#a855f7', '#14b8a6', '#fb923c', '#84cc16']

export default function WACostAnalytics({ templateRows, totalCost, costPerClick, clicked, theme }) {
  const isDark = theme === 'dark'
  const card = `rounded-xl border p-4 ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow'}`
  const label = `text-xs font-semibold uppercase tracking-wide mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`

  const sorted = [...templateRows]
    .filter((r) => (r.total_cost ?? 0) > 0)
    .sort((a, b) => b.total_cost - a.total_cost)

  const maxCost = sorted[0]?.total_cost ?? 1

  return (
    <div className="space-y-4">
      <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Cost analytics</h3>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total spend',    value: `₹${(totalCost ?? 0).toFixed(2)}`,                        color: 'text-indigo-600 dark:text-indigo-400' },
          { label: 'Cost per click', value: clicked > 0 ? `₹${(costPerClick ?? 0).toFixed(4)}` : '—', color: 'text-amber-600 dark:text-amber-400' },
          { label: 'Templates',      value: sorted.length,                                             color: 'text-violet-600 dark:text-violet-400' },
          { label: 'Avg per template', value: sorted.length > 0 ? `₹${((totalCost ?? 0) / sorted.length).toFixed(2)}` : '—', color: 'text-emerald-600 dark:text-emerald-400' },
        ].map((s) => (
          <div key={s.label} className={`${card} border-l-4 border-slate-300/50`}>
            <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className={`${card} text-center py-8 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          No cost data found. Cost may be stored inside <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">raw_payload</code>.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Bar chart */}
          <div className={card}>
            <p className={label}>Spend by template (bar)</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sorted.map((r) => ({
                    name: r.template_name.length > 14 ? r.template_name.slice(0, 14) + '…' : r.template_name,
                    cost: r.total_cost,
                  }))}
                  layout="vertical"
                  margin={{ top: 4, right: 48, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={isDark ? '#334155' : '#e2e8f0'} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: isDark ? '#94a3b8' : '#64748b' }} tickFormatter={(v) => `₹${v}`} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: isDark ? '#1e293b' : '#fff', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: '8px', fontSize: 12 }}
                    formatter={(v) => [`₹${Number(v).toFixed(2)}`, 'Spend']}
                  />
                  <Bar dataKey="cost" radius={[0, 4, 4, 0]} minPointSize={4}>
                    {sorted.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Clean ranked list */}
          <div className={card}>
            <p className={label}>Spend breakdown</p>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {sorted.map((r, i) => {
                const pct = Math.round((r.total_cost / maxCost) * 100)
                const sharePct = totalCost > 0 ? ((r.total_cost / totalCost) * 100).toFixed(1) : '0'
                return (
                  <div key={r.template_name}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className={`text-xs font-mono truncate ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{r.template_name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{sharePct}%</span>
                        <span className={`text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>₹{r.total_cost.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
