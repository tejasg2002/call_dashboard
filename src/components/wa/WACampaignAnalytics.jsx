import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const COLORS = [
  '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b',
  '#f43f5e', '#06b6d4', '#6366f1', '#ec4899',
]

function MetricRow({ label, value, sub, isDark }) {
  return (
    <div className="flex flex-col">
      <span className={`text-[10px] uppercase font-semibold tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{label}</span>
      <span className={`text-base font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{value}</span>
      {sub && <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{sub}</span>}
    </div>
  )
}

function CampaignCard({ data, isDark, color }) {
  const [expanded, setExpanded] = useState(false)
  const { kpi } = data
  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
      {/* Color bar + name */}
      <div className="flex items-stretch">
        <div className={`w-1.5 shrink-0 ${color}`} />
        <div className="flex-1 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{data.name}</p>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {data.templates.map((t) => (
                  <span key={t} className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{t}</span>
                ))}
              </div>
            </div>
            <button
              onClick={() => setExpanded((v) => !v)}
              className={`text-xs px-2.5 py-1 rounded-lg border ${isDark ? 'border-slate-600 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            >
              {expanded ? 'Less ▴' : 'Details ▾'}
            </button>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-4 gap-4 mt-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-700">
            <MetricRow label="Sent" value={kpi.sent} isDark={isDark} />
            <MetricRow label="Delivered" value={kpi.delivered} isDark={isDark} />
            <MetricRow label="Read" value={kpi.read} isDark={isDark} />
            <MetricRow label="Clicked" value={kpi.clicked} isDark={isDark} />
            <MetricRow label="Failed" value={kpi.failed} isDark={isDark} />
            <MetricRow label="CTR" value={`${kpi.ctr.toFixed(2)}%`} isDark={isDark} />
            <MetricRow label="Read rate" value={`${kpi.readRate.toFixed(2)}%`} isDark={isDark} />
            <MetricRow label="Spend" value={`₹${kpi.cost.toFixed(2)}`} isDark={isDark} />
          </div>

          {/* Expanded: per-template breakdown table */}
          {expanded && (
            <div className="mt-4 space-y-3">
              {/* Template breakdown */}
              <div>
                <p className={`text-xs font-semibold mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Per-template breakdown</p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className={isDark ? 'text-slate-500' : 'text-slate-400'}>
                        <th className="text-left py-1 pr-4 font-medium">Template</th>
                        <th className="text-right py-1 pr-4 font-medium">Sent</th>
                        <th className="text-right py-1 pr-4 font-medium">Delivered</th>
                        <th className="text-right py-1 pr-4 font-medium">Clicked</th>
                        <th className="text-right py-1 pr-4 font-medium">CTR</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDark ? 'divide-slate-700' : 'divide-slate-100'}`}>
                      {data.templateRows.map((r) => (
                        <tr key={r.template_name}>
                          <td className={`py-1.5 pr-4 font-mono ${isDark ? 'text-violet-300' : 'text-violet-700'}`}>{r.template_name}</td>
                          <td className={`text-right py-1.5 pr-4 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{r.sent}</td>
                          <td className={`text-right py-1.5 pr-4 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{r.delivered}</td>
                          <td className={`text-right py-1.5 pr-4 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{r.clicked}</td>
                          <td className={`text-right py-1.5 pr-4 font-semibold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>{r.ctr.toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {/* CTA breakdown */}
              {data.ctaRows.length > 0 && (
                <div>
                  <p className={`text-xs font-semibold mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Buttons clicked</p>
                  <div className="flex flex-wrap gap-2">
                    {data.ctaRows.map((r) => (
                      <span key={r.button_text} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border ${isDark ? 'bg-slate-700 border-slate-600 text-slate-200' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                        {r.button_text}
                        <span className={`font-bold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>{r.total_clicks}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function WACampaignAnalytics({ campaignData, theme }) {
  const isDark = theme === 'dark'
  if (!campaignData || campaignData.length === 0) return null

  const chartData = campaignData.map((c) => ({
    name: c.name.length > 16 ? c.name.slice(0, 16) + '…' : c.name,
    CTR: parseFloat(c.kpi.ctr.toFixed(2)),
    Clicked: c.kpi.clicked,
    Delivered: c.kpi.delivered,
  }))

  return (
    <div className="space-y-4">
      <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Campaign performance</h3>
      {/* Summary chart */}
      <div className={`rounded-xl border p-4 ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow'}`}>
        <p className={`text-xs font-medium mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>CTR by campaign</p>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ backgroundColor: isDark ? '#1e293b' : '#fff', border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', borderRadius: '8px' }}
                formatter={(v, name) => [name === 'CTR' ? `${v}%` : v, name]}
              />
              <Bar dataKey="CTR" radius={[4, 4, 0, 0]} name="CTR">
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      {/* Campaign cards */}
      <div className="space-y-3">
        {campaignData.map((c, i) => (
          <CampaignCard key={c.id} data={c} isDark={isDark} color={c.color || COLORS[i % COLORS.length]} />
        ))}
      </div>
    </div>
  )
}
