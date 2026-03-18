'use client'

import { useEffect, useState, useCallback } from 'react'
import { fetchSmsDashboard } from '../../../src/lib/smsDashboardApi'
import { useTheme } from '../../providers'
import { cn } from '../../../src/lib/utils'

function fmt(n) { return (n || 0).toLocaleString('en-IN') }

function KpiCard({ label, value, sub, accent, icon, isDark }) {
  const iconBg = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400',
    green: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    red: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400',
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  }
  const valColor = {
    brand: 'text-brand-700 dark:text-brand-400',
    green: 'text-green-600 dark:text-green-400',
    red: 'text-red-500 dark:text-red-400',
    blue: 'text-blue-600 dark:text-blue-400',
    amber: 'text-amber-600 dark:text-amber-400',
  }
  return (
    <div className={cn(
      "rounded-xl border p-4 transition-all duration-200",
      "bg-white dark:bg-slate-900/60",
      "border-slate-200/80 dark:border-slate-800",
      "hover:shadow-card-hover hover:border-slate-300 dark:hover:border-slate-700"
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", iconBg[accent])}>
          {icon}
        </div>
        {sub && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {sub}
          </span>
        )}
      </div>
      <p className={cn("text-xl font-bold font-mono tracking-tight", valColor[accent])}>{value}</p>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium">{label}</p>
    </div>
  )
}

export default function SmsPage() {
  const { isDark } = useTheme()
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async (mode = 'cached') => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchSmsDashboard({ mode })
      setSnapshot(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const kpi = snapshot?.kpi || {}
  const campaignRows = snapshot?.campaignRows || []
  const topFailures = snapshot?.topFailures || []

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className={cn("text-2xl font-bold tracking-tight", isDark ? "text-white" : "text-slate-900")}>
            SMS Analytics
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={cn("inline-flex items-center gap-1.5 text-xs", isDark ? "text-slate-500" : "text-slate-400")}>
              <span className={cn("w-1.5 h-1.5 rounded-full", loading ? "bg-amber-400 animate-pulse" : "bg-brand-600")} />
              {loading ? 'Loading' : 'Ready'}
            </span>
            {snapshot?.rawDocCount != null && (
              <span className={cn("text-xs", isDark ? "text-slate-500" : "text-slate-400")}>
                {fmt(snapshot.rawDocCount)} events
              </span>
            )}
            {snapshot?.fromCache && (
              <span className="text-[10px] text-slate-400 dark:text-slate-600 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">cached</span>
            )}
          </div>
        </div>
        <button
          onClick={() => loadData('full')}
          disabled={loading}
          className={cn(
            "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50",
            "bg-brand-700 hover:bg-brand-800 text-white shadow-sm shadow-brand-700/20"
          )}
        >
          <svg className={cn("w-3.5 h-3.5", loading && "animate-spin")} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard label="Sent" value={fmt(kpi.sent)} accent="brand" isDark={isDark} icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
        } />
        <KpiCard label="Delivered" value={fmt(kpi.delivered)} sub={`${(kpi.deliveryRate || 0).toFixed(1)}%`} accent="green" isDark={isDark} icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        } />
        <KpiCard label="Failed" value={fmt(kpi.failed)} sub={`${(kpi.failureRate || 0).toFixed(1)}%`} accent="red" isDark={isDark} icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
        } />
        <KpiCard label="Unique Phones" value={fmt(kpi.uniquePhones)} accent="blue" isDark={isDark} icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
        } />
        <KpiCard label="Total Cost" value={`₹${(kpi.totalCost || 0).toFixed(2)}`} accent="amber" isDark={isDark} icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
        } />
      </div>

      {campaignRows.length > 0 && (
        <div className={cn(
          "rounded-xl border overflow-hidden",
          "bg-white dark:bg-slate-900/60",
          "border-slate-200/80 dark:border-slate-800"
        )}>
          <div className="px-5 py-4 border-b border-slate-200/80 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Campaign Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  {['Campaign', 'Sent', 'Delivered', 'Failed', 'Delivery %', 'Phones', 'Cost'].map((h) => (
                    <th key={h} className={cn(
                      "px-5 py-3 font-semibold text-[11px] uppercase tracking-wider",
                      "text-slate-400 dark:text-slate-500",
                      h === 'Campaign' ? 'text-left' : 'text-right'
                    )}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaignRows.map((r) => (
                  <tr key={r.campaign} className="border-b last:border-b-0 border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3 font-medium text-slate-900 dark:text-white text-xs">{r.campaign}</td>
                    <td className="px-5 py-3 text-right text-slate-600 dark:text-slate-300 font-mono text-xs">{fmt(r.sent)}</td>
                    <td className="px-5 py-3 text-right text-green-600 dark:text-green-400 font-mono text-xs">{fmt(r.delivered)}</td>
                    <td className="px-5 py-3 text-right text-red-500 dark:text-red-400 font-mono text-xs">{fmt(r.failed)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={cn(
                        "inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold",
                        r.deliveryRate >= 90 ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : r.deliveryRate >= 50 ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                      )}>
                        {r.deliveryRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-slate-600 dark:text-slate-300 font-mono text-xs">{fmt(r.uniquePhones)}</td>
                    <td className="px-5 py-3 text-right text-slate-600 dark:text-slate-300 font-mono text-xs">₹{r.cost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {topFailures.length > 0 && (
        <div className={cn(
          "rounded-xl border overflow-hidden",
          "bg-white dark:bg-slate-900/60",
          "border-slate-200/80 dark:border-slate-800"
        )}>
          <div className="px-5 py-4 border-b border-slate-200/80 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Top Failure Reasons</h3>
          </div>
          <div className="px-5 py-3 space-y-2">
            {topFailures.map((f) => (
              <div key={f.reason} className="flex items-center justify-between gap-4">
                <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1">{f.reason}</span>
                <span className="text-xs font-mono font-semibold text-red-500 dark:text-red-400 shrink-0">{fmt(f.count)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && snapshot?.rawDocCount === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-slate-400 dark:text-slate-500">No SMS events found yet</p>
        </div>
      )}
    </div>
  )
}
