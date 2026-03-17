'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { fetchEmailDashboard } from '../../../src/lib/emailDashboardApi'
import { useAuth } from '../../providers'
import { useTheme } from '../../providers'
import EmailKpiCards from '../../../src/components/email/EmailKpiCards'
import EmailFilters from '../../../src/components/email/EmailFilters'
import EmailSubjectTable from '../../../src/components/email/EmailSubjectTable'
import EmailPaymentConversion from '../../../src/components/email/EmailPaymentConversion'
import LazySection from '../../../src/components/LazySection'

function formatCount(n) {
  return (n || 0).toLocaleString('en-IN')
}

export default function EmailPage() {
  const { dataMasked } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ subject: '', eventType: '', email: '', startDate: '', endDate: '' })
  const [toast, setToast] = useState(null)
  const [elapsed, setElapsed] = useState(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchEmailDashboard({ mode: 'cached' })
      setSnapshot(data)
      setElapsed(data.elapsed)
      setError(null)
    } catch (err) {
      console.error('[EmailPage] load error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    try {
      setSyncing(true)
      setToast(null)
      const data = await fetchEmailDashboard({ mode: 'full' })
      setSnapshot(data)
      setElapsed(data.elapsed)
      setToast(`Loaded ${formatCount(data.rawDocCount)} events in ${(data.elapsed / 1000).toFixed(1)}s`)
      setTimeout(() => setToast(null), 4000)
      setError(null)
    } catch (err) {
      console.error('[EmailPage] refresh error:', err)
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }, [])

  const handleRecomputeAll = useCallback(async () => {
    try {
      setSyncing(true)
      setToast(null)
      setFilters((prev) => ({ ...prev, startDate: '', endDate: '' }))
      const data = await fetchEmailDashboard({ mode: 'full' })
      setSnapshot(data)
      setElapsed(data.elapsed)
      setToast(`Recomputed ${formatCount(data.rawDocCount)} events in ${(data.elapsed / 1000).toFixed(1)}s`)
      setTimeout(() => setToast(null), 4000)
      setError(null)
    } catch (err) {
      console.error('[EmailPage] recompute error:', err)
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }, [])

  const recalibrateForDateRange = useCallback(async () => {
    const hasRange = filters.startDate || filters.endDate
    if (!hasRange) return
    try {
      setSyncing(true)
      const data = await fetchEmailDashboard({
        mode: 'range',
        startDate: filters.startDate || '',
        endDate: filters.endDate || '',
      })
      setSnapshot(data)
      setElapsed(data.elapsed)
      setToast(`Date range loaded in ${(data.elapsed / 1000).toFixed(1)}s`)
      setTimeout(() => setToast(null), 4000)
    } catch (err) {
      console.error('[EmailPage] range error:', err)
    } finally {
      setSyncing(false)
    }
  }, [filters.startDate, filters.endDate])

  useEffect(() => { loadData() }, [loadData])

  const kpi = snapshot?.kpi || { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, deliveryRate: 0, openRate: 0, clickRate: 0, bounceRate: 0 }
  const templateRows = snapshot?.templateRows || []

  const filterOptions = useMemo(() => ({
    subjects: templateRows.map((r) => r.subject).filter(Boolean).sort(),
    eventTypes: [],
  }), [templateRows])

  const hasDates = useMemo(() => templateRows.some((r) => r.firstSeen || r.lastSeen), [templateRows])

  const filteredTemplateRows = useMemo(() => {
    let rows = templateRows
    if (filters.subject) rows = rows.filter((r) => r.subject === filters.subject)
    if (hasDates && filters.startDate) {
      const start = new Date(filters.startDate).getTime()
      rows = rows.filter((r) => !r.lastSeen || new Date(r.lastSeen).getTime() >= start)
    }
    if (hasDates && filters.endDate) {
      const end = new Date(filters.endDate + 'T23:59:59').getTime()
      rows = rows.filter((r) => !r.firstSeen || new Date(r.firstSeen).getTime() <= end)
    }
    return rows
  }, [templateRows, filters.subject, filters.startDate, filters.endDate, hasDates])

  const lastUpdated = snapshot?.computedAt
    ? new Date(snapshot.computedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-[1600px] mx-auto">

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Email Analytics
          </h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className={`inline-flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${syncing ? 'bg-amber-400 animate-pulse' : 'bg-violet-500'}`} />
              {syncing ? 'Syncing' : 'Live'}
            </span>
            <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {snapshot?.rawDocCount ? `${formatCount(snapshot.rawDocCount)} events tracked` : '0 events'}
            </span>
            {lastUpdated && (
              <span className={`text-xs ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                · Updated {lastUpdated}
              </span>
            )}
            {elapsed != null && (
              <span className={`text-xs ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                · {(elapsed / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={syncing}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 ${
              isDark
                ? 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/30'
                : 'bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-600/20'
            }`}
          >
            <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={handleRecomputeAll}
            disabled={syncing}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all disabled:opacity-50 ${
              isDark
                ? 'border-slate-600 text-slate-200 hover:bg-slate-800'
                : 'border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6M20 20v-6h-6M5 19a9 9 0 0112.728-12.728L19 7" />
            </svg>
            Recompute all
          </button>
        </div>
      </div>

      {/* ── Toast ──────────────────────────────────────────────── */}
      {toast && (
        <div className={`px-4 py-2.5 rounded-xl text-sm text-center font-medium ${isDark ? 'bg-violet-900/40 border border-violet-700 text-violet-300' : 'bg-violet-50 border border-violet-200 text-violet-700'}`}>
          {toast}
        </div>
      )}

      {/* ── Filter ──────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <EmailFilters filters={filters} setFilters={setFilters} options={filterOptions} theme={theme} onApply={recalibrateForDateRange} />
      </div>

      {error && (
        <div className="p-4 bg-rose-100 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700 rounded-xl text-rose-800 dark:text-rose-200 text-sm">{error}</div>
      )}

      <EmailKpiCards kpi={kpi} theme={theme} uniqueClicked={snapshot?.emailPaymentConversion?.totalClicked || 0} />

      {loading && !snapshot ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${isDark ? 'bg-violet-900/30' : 'bg-violet-50'}`}>
            <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Loading email data...</p>
        </div>
      ) : (
        <>
          <LazySection height="300px">
            <EmailSubjectTable rows={filteredTemplateRows} theme={theme} dataMasked={dataMasked} />
          </LazySection>

          {snapshot?.emailPaymentConversion && snapshot.emailPaymentConversion.totalClicked > 0 && (
            <LazySection height="280px">
              <EmailPaymentConversion
                data={snapshot.emailPaymentConversion}
                theme={theme}
                dataMasked={dataMasked}
              />
            </LazySection>
          )}
        </>
      )}
    </div>
  )
}
