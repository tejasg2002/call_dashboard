'use client'

import { useState, useEffect, useCallback } from 'react'
import { useBuWorkspace } from '../context/BuWorkspaceProvider'
import { fetchCalls } from '../firebase'
import { buildCallDashboardSnapshotFromCalls } from '../lib/buildCallDashboardSnapshot'
import { fetchCallLogsIsu } from '../lib/callLogsIsuApi'
import { fetchCallDashboard } from '../lib/callDashboardApi'
import { cn } from '../lib/utils'
import { workspaceUsesIsuCallLogs } from '../lib/waWorkspace'
import MetricsCards from './MetricsCards'
import PerformanceCards from './PerformanceCards'
import PerformanceCharts from './PerformanceCharts'
import LazySection from './LazySection'

const POLLING_INTERVAL = 30000

const RANGE_OPTIONS = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
]

const Dashboard = () => {
  const { workspace } = useBuWorkspace()
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [rangePreset, setRangePreset] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const loadDashboard = useCallback(async ({ mode = 'cached', sd, ed } = {}) => {
    try {
      setLoading(true)

      if (workspaceUsesIsuCallLogs(workspace)) {
        const calls = await fetchCallLogsIsu(workspace, {
          startDate: sd || undefined,
          endDate: ed || undefined,
        })
        setSnapshot(buildCallDashboardSnapshotFromCalls(calls, { fallback: false }))
        setLastUpdated(new Date())
        setError(null)
        return
      }

      const data = await fetchCallDashboard({
        mode,
        startDate: sd || undefined,
        endDate: ed || undefined,
      })
      setSnapshot(data)
      setLastUpdated(new Date())
      setError(null)
      return
    } catch (serverErr) {
      console.error('Failed to fetch call dashboard snapshot:', serverErr)

      // Keep a safe fallback for environments where Firebase Admin credentials
      // are not configured yet. This preserves the old behavior if needed.
      if (!workspaceUsesIsuCallLogs(workspace) && !sd && !ed) {
        try {
          const calls = await fetchCalls()
          setSnapshot(buildCallDashboardSnapshotFromCalls(calls, { fallback: true }))
          setLastUpdated(new Date())
          setError(null)
          return
        } catch (fallbackErr) {
          setError({
            message: fallbackErr?.message || String(fallbackErr),
            code: fallbackErr?.code,
            rawMessage: fallbackErr?.rawMessage,
          })
        }
      } else {
        setError({ message: serverErr?.message || String(serverErr) })
      }
    } finally {
      setLoading(false)
    }
  }, [workspace])

  useEffect(() => {
    loadDashboard({
      mode: startDate || endDate ? 'range' : 'cached',
      sd: startDate || undefined,
      ed: endDate || undefined,
    })
    const intervalId = setInterval(() => {
      loadDashboard({
        mode: startDate || endDate ? 'range' : 'cached',
        sd: startDate || undefined,
        ed: endDate || undefined,
      })
    }, POLLING_INTERVAL)
    return () => { clearInterval(intervalId) }
  }, [loadDashboard, startDate, endDate])

  const formatDateInput = (date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const handleQuickRange = (range) => {
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    setRangePreset(range)

    if (range === 'today') {
      const v = formatDateInput(startOfToday)
      setStartDate(v)
      setEndDate(v)
      loadDashboard({ mode: 'range', sd: v, ed: v })
    } else if (range === 'week') {
      const day = today.getDay()
      const diff = day === 0 ? 6 : day - 1
      const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff)
      const sd = formatDateInput(weekStart)
      const ed = formatDateInput(startOfToday)
      setStartDate(sd)
      setEndDate(ed)
      loadDashboard({ mode: 'range', sd, ed })
    } else if (range === 'month') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      const sd = formatDateInput(monthStart)
      const ed = formatDateInput(startOfToday)
      setStartDate(sd)
      setEndDate(ed)
      loadDashboard({ mode: 'range', sd, ed })
    } else if (range === 'all') {
      setStartDate('')
      setEndDate('')
      loadDashboard({ mode: 'cached' })
    }
  }

  const handleCustomDateChange = (field, value) => {
    const nextStartDate = field === 'start' ? value : startDate
    const nextEndDate = field === 'end' ? value : endDate
    if (field === 'start') setStartDate(value)
    else setEndDate(value)
    if (nextStartDate && nextEndDate) {
      loadDashboard({ mode: 'range', sd: nextStartDate, ed: nextEndDate })
    }
  }

  const dateLabel = startDate || endDate
    ? (startDate === endDate ? 'Today' : 'Selected range')
    : 'All time'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Overview
            </h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                <span className={cn("w-1.5 h-1.5 rounded-full", loading ? "bg-amber-400 animate-pulse" : "bg-brand-600")} />
                {loading ? 'Refreshing' : 'Live'}
              </span>
              {lastUpdated && (
                <span className="text-xs text-slate-400 dark:text-slate-600">
                  Updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {snapshot?.fromCache && (
                <span className="text-[10px] text-slate-400 dark:text-slate-600 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  cached
                </span>
              )}
              {snapshot?.elapsed != null && (
                <span className="text-[10px] text-slate-400 dark:text-slate-600">
                  {(snapshot.elapsed / 1000).toFixed(1)}s
                </span>
              )}
              <span className="text-xs text-slate-400 dark:text-slate-600">
                {snapshot?.filteredDocCount > 0 && `${snapshot.filteredDocCount.toLocaleString('en-IN')} records`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadDashboard({ mode: 'full', sd: startDate || undefined, ed: endDate || undefined })}
              disabled={loading}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50",
                "bg-brand-700 hover:bg-brand-800 text-white shadow-sm shadow-brand-700/20"
              )}
            >
              <svg className={cn("w-3.5 h-3.5", loading && "animate-spin")} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Date range pills */}
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => handleQuickRange(opt.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                rangePreset === opt.key
                  ? "bg-brand-700 text-white shadow-sm"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:hover:border-slate-600"
              )}
            >
              {opt.label}
            </button>
          ))}
          {rangePreset === 'custom' && (
            <div className="flex items-center gap-2 ml-1">
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleCustomDateChange('start', e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-brand-400"
              />
              <span className="text-slate-300 dark:text-slate-600 text-xs">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleCustomDateChange('end', e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-brand-400"
              />
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300 space-y-1">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>{typeof error === 'string' ? error : error.message}</span>
            </div>
            {typeof error === 'object' && error?.code && (
              <p className="text-xs pl-6 opacity-80">
                Code: <code className="bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded text-[11px]">{error.code}</code>
                {error.rawMessage && <span> — {error.rawMessage}</span>}
              </p>
            )}
          </div>
        )}

        {/* KPI Cards */}
        <MetricsCards kpi={snapshot?.kpi} loading={loading} dateLabel={dateLabel} />

        {/* Performance */}
        <LazySection height="220px">
          <PerformanceCards ownerStatsToday={snapshot?.ownerStatsToday} ownerStatsMonth={snapshot?.ownerStatsMonth} />
        </LazySection>

        <LazySection height="340px">
          <PerformanceCharts ownerStats={snapshot?.ownerStatsOverall} />
        </LazySection>
      </div>
    </div>
  )
}

export default Dashboard
