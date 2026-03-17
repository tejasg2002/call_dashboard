'use client'

import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { cn } from '../../lib/utils'

const BAR_COLORS = [
  '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626',
  '#7c3aed', '#db2777', '#0d9488', '#ca8a04', '#6366f1',
  '#e11d48', '#16a34a', '#ea580c', '#4f46e5', '#84cc16',
]

const PIE_COLORS = [
  '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#eab308', '#818cf8',
  '#f43f5e', '#22c55e', '#f97316', '#6366f1', '#a3e635',
]

const SourceCharts = ({ rows, loading }) => {
  const barData = useMemo(() => {
    if (!rows) return []
    return rows
      .slice(0, 15)
      .map((r) => ({
        name: r.source?.length > 20 ? r.source.slice(0, 18) + '...' : r.source,
        fullName: r.source,
        calls: r.totalCalls,
        leads: r.totalLeads,
      }))
  }, [rows])

  const pieData = useMemo(() => {
    if (!rows) return []
    const top10 = rows.slice(0, 10)
    const rest = rows.slice(10)
    const data = top10.map((r) => ({
      name: r.source,
      value: r.totalLeads,
    }))
    if (rest.length > 0) {
      data.push({
        name: 'Others',
        value: rest.reduce((sum, r) => sum + r.totalLeads, 0),
      })
    }
    return data
  }, [rows])

  if (loading && (!rows || rows.length === 0)) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className={cn(
              "rounded-xl border p-5 h-[380px] flex items-center justify-center",
              "bg-white dark:bg-slate-900/60",
              "border-slate-200/80 dark:border-slate-800"
            )}
          >
            <p className="text-xs text-slate-400 dark:text-slate-500">Loading charts...</p>
          </div>
        ))}
      </div>
    )
  }

  if (!rows || rows.length === 0) return null

  const CustomBarTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className={cn(
        "rounded-lg border px-3 py-2 text-xs shadow-lg",
        "bg-white dark:bg-slate-800",
        "border-slate-200 dark:border-slate-700"
      )}>
        <p className="font-semibold text-slate-900 dark:text-white mb-1">{d.fullName}</p>
        <p className="text-slate-500 dark:text-slate-400">
          Calls: <span className="font-mono text-slate-700 dark:text-slate-200">{d.calls.toLocaleString('en-IN')}</span>
        </p>
        <p className="text-slate-500 dark:text-slate-400">
          Leads: <span className="font-mono text-slate-700 dark:text-slate-200">{d.leads.toLocaleString('en-IN')}</span>
        </p>
      </div>
    )
  }

  const CustomPieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]
    return (
      <div className={cn(
        "rounded-lg border px-3 py-2 text-xs shadow-lg",
        "bg-white dark:bg-slate-800",
        "border-slate-200 dark:border-slate-700"
      )}>
        <p className="font-semibold text-slate-900 dark:text-white">{d.name}</p>
        <p className="text-slate-500 dark:text-slate-400">
          Leads: <span className="font-mono text-slate-700 dark:text-slate-200">{d.value.toLocaleString('en-IN')}</span>
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className={cn(
        "rounded-xl border p-5",
        "bg-white dark:bg-slate-900/60",
        "border-slate-200/80 dark:border-slate-800"
      )}>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
          Top Sources by Call Volume
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
            <YAxis
              dataKey="name"
              type="category"
              width={120}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
            />
            <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Bar dataKey="calls" radius={[0, 4, 4, 0]} maxBarSize={24}>
              {barData.map((_, idx) => (
                <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={cn(
        "rounded-xl border p-5",
        "bg-white dark:bg-slate-900/60",
        "border-slate-200/80 dark:border-slate-800"
      )}>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
          Lead Distribution by Source
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={70}
              outerRadius={110}
              paddingAngle={2}
              dataKey="value"
            >
              {pieData.map((_, idx) => (
                <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomPieTooltip />} />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span className="text-[11px] text-slate-600 dark:text-slate-400">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default SourceCharts
