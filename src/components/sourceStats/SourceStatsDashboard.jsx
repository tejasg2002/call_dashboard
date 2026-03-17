'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchSourceStats } from '../../lib/sourceStatsApi'
import { cn } from '../../lib/utils'
import SourceKpiCards from './SourceKpiCards'
import SourceTable from './SourceTable'
import SourceCharts from './SourceCharts'
import SourceCadenceHeatmap from './SourceCadenceHeatmap'
import SourceDailyActivity from './SourceDailyActivity'

const RANGE_OPTIONS = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
]

const formatDateInput = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const SourceStatsDashboard = () => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rangePreset, setRangePreset] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  const loadData = useCallback(async ({ mode = 'cached', sd, ed } = {}) => {
    try {
      setLoading(true)
      setError(null)
      const result = await fetchSourceStats({
        mode,
        startDate: sd || undefined,
        endDate: ed || undefined,
      })
      setData(result)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleQuickRange = (range) => {
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    setRangePreset(range)

    if (range === 'today') {
      const v = formatDateInput(startOfToday)
      setStartDate(v)
      setEndDate(v)
      loadData({ mode: 'range', sd: v, ed: v })
    } else if (range === 'week') {
      const day = today.getDay()
      const diff = day === 0 ? 6 : day - 1
      const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff)
      const sd = formatDateInput(weekStart)
      const ed = formatDateInput(startOfToday)
      setStartDate(sd)
      setEndDate(ed)
      loadData({ mode: 'range', sd, ed })
    } else if (range === 'month') {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
      const sd = formatDateInput(monthStart)
      const ed = formatDateInput(startOfToday)
      setStartDate(sd)
      setEndDate(ed)
      loadData({ mode: 'range', sd, ed })
    } else if (range === 'all') {
      setStartDate('')
      setEndDate('')
      loadData({ mode: 'cached' })
    }
  }

  const handleRecompute = () => {
    if (startDate || endDate) {
      loadData({ mode: 'range', sd: startDate || undefined, ed: endDate || undefined })
    } else {
      loadData({ mode: 'full' })
    }
  }

  const handleCustomDateChange = (field, value) => {
    const newSd = field === 'start' ? value : startDate
    const newEd = field === 'end' ? value : endDate
    if (field === 'start') setStartDate(value)
    else setEndDate(value)
    if (newSd && newEd) {
      loadData({ mode: 'range', sd: newSd, ed: newEd })
    }
  }

  const dateLabel = rangePreset === 'all'
    ? 'All time'
    : rangePreset === 'today'
      ? 'Today'
      : rangePreset === 'custom'
        ? `${startDate} — ${endDate}`
        : `This ${rangePreset}`

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-6 lg:py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Source Stats
            </h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                <span className={cn("w-1.5 h-1.5 rounded-full", loading ? "bg-amber-400 animate-pulse" : "bg-brand-600")} />
                {loading ? 'Computing' : 'Ready'}
              </span>
              {lastUpdated && (
                <span className="text-xs text-slate-400 dark:text-slate-600">
                  Updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {data?.fromCache && (
                <span className="text-[10px] text-slate-400 dark:text-slate-600 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  cached
                </span>
              )}
              {data?.elapsed != null && (
                <span className="text-[10px] text-slate-400 dark:text-slate-600">
                  {(data.elapsed / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRecompute}
              disabled={loading}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50",
                "bg-brand-700 hover:bg-brand-800 text-white shadow-sm shadow-brand-700/20"
              )}
            >
              <svg className={cn("w-3.5 h-3.5", loading && "animate-spin")} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              {loading ? 'Computing...' : 'Recompute'}
            </button>
          </div>
        </div>

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

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300 space-y-1">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span>{error}</span>
            </div>
          </div>
        )}

        <SourceKpiCards kpi={data?.kpi} loading={loading} dateLabel={dateLabel} />

        {data?.collectionCounts && (
          <div className={cn(
            "rounded-xl border px-5 py-3 flex flex-wrap gap-x-6 gap-y-1",
            "bg-white dark:bg-slate-900/60",
            "border-slate-200/80 dark:border-slate-800"
          )}>
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wider mr-2">
              Collection stats:
            </span>
            {[
              { label: 'CallQ Leads', value: data.collectionCounts.callQLeads },
              { label: 'Webhook Leads', value: data.collectionCounts.webhookLeads },
              { label: 'Webhook-Only Leads', value: data.collectionCounts.webhookOnlyLeads },
              { label: 'Unique Leads', value: data.collectionCounts.uniqueLeads },
              { label: 'Call Rec. Phones', value: data.collectionCounts.callRecordingPhones },
            ].map((item) => (
              <span key={item.label} className="text-[11px] text-slate-500 dark:text-slate-400">
                {item.label}: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{item.value?.toLocaleString('en-IN')}</span>
              </span>
            ))}
          </div>
        )}

        <SourceCadenceHeatmap rows={data?.sourceRows} loading={loading} />

        <SourceCharts rows={data?.sourceRows} loading={loading} />

        <SourceDailyActivity
          sourceRows={data?.sourceRows}
          dailyActivity={data?.dailyActivity}
          loading={loading}
        />

        <SourceTable rows={data?.sourceRows} loading={loading} dateLabel={dateLabel} />
      </div>
    </div>
  )
}

export default SourceStatsDashboard
