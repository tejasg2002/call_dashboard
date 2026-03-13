'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { fetchEmailEvents, fetchEmailEventsRange } from '../../../src/lib/emailFirebase'
import { aggregateEmailWebhooks } from '../../../src/lib/emailAnalytics'
import { getSnapshot, saveSnapshot, buildEmailSnapshot, mergeEmailSnapshots } from '../../../src/lib/snapshotService'
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

function getLatestTime(docs) {
  let latest = null
  for (const d of docs) {
    const inner = d.document || d
    const t = inner.time || inner.createdAt || d.timestamp || ''
    if (t && (!latest || t > latest)) latest = t
  }
  return latest
}

export default function EmailPage() {
  const { dataMasked } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [snapshot, setSnapshot] = useState(null)
  const [rangeSnapshot, setRangeSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ subject: '', eventType: '', email: '', startDate: '', endDate: '' })
  const [progress, setProgress] = useState(null)
  const [toast, setToast] = useState(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const existing = await getSnapshot('email')
      if (existing) {
        setSnapshot(existing)
        setLoading(false)
        return
      }

      setSyncing(true)
      setProgress({ loaded: 0, total: 0, done: false })
      const allDocs = await fetchEmailEvents(null, (p) => setProgress(p))
      const aggregated = aggregateEmailWebhooks(allDocs)
      const lastTs = getLatestTime(allDocs)
      const snap = buildEmailSnapshot(aggregated, allDocs.length, lastTs)
      await saveSnapshot('email', snap)
      setSnapshot(snap)
      setError(null)
    } catch (err) {
      console.error('[EmailPage] load error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
      setSyncing(false)
      setProgress(null)
    }
  }, [])

  const handleRecomputeAll = useCallback(async () => {
    try {
      setSyncing(true)
      setToast(null)
      setRangeSnapshot(null)
      setFilters((prev) => ({ ...prev, startDate: '', endDate: '' }))
      setProgress({ loaded: 0, total: 0, done: false })

      const allDocs = await fetchEmailEvents(null, (p) => setProgress(p))
      const aggregated = aggregateEmailWebhooks(allDocs)
      const lastTs = getLatestTime(allDocs)
      const snap = buildEmailSnapshot(aggregated, allDocs.length, lastTs)
      await saveSnapshot('email', snap)
      setSnapshot(snap)
      setError(null)
    } catch (err) {
      console.error('[EmailPage] full recompute error:', err)
      setError(err.message)
    } finally {
      setSyncing(false)
      setProgress(null)
    }
  }, [])
  const handleRefresh = useCallback(async () => {
    try {
      setSyncing(true)
      setToast(null)

      const existing = snapshot || (await getSnapshot('email'))
      if (!existing?.lastRawDocTime) {
        setProgress({ loaded: 0, total: 0, done: false })
        const allDocs = await fetchEmailEvents(null, (p) => setProgress(p))
        const aggregated = aggregateEmailWebhooks(allDocs)
        const lastTs = getLatestTime(allDocs)
        const snap = buildEmailSnapshot(aggregated, allDocs.length, lastTs)
        await saveSnapshot('email', snap)
        setSnapshot(snap)
        setProgress(null)
        return
      }

      const newDocs = await fetchEmailEvents(existing.lastRawDocTime)
      if (newDocs.length === 0) {
        setToast('Up to date — no new events found')
        setTimeout(() => setToast(null), 3000)
        return
      }

      const deltaAggregated = aggregateEmailWebhooks(newDocs)
      const lastTs = getLatestTime(newDocs)
      const deltaSnap = buildEmailSnapshot(deltaAggregated, newDocs.length, lastTs)
      const merged = mergeEmailSnapshots(existing, deltaSnap)
      await saveSnapshot('email', merged)
      setSnapshot(merged)
      setToast(`Merged ${formatCount(newDocs.length)} new events`)
      setTimeout(() => setToast(null), 3000)
    } catch (err) {
      console.error('[EmailPage] refresh error:', err)
      setError(err.message)
    } finally {
      setSyncing(false)
      setProgress(null)
    }
  }, [snapshot])

  useEffect(() => { loadData() }, [loadData])

  const activeSnapshot = rangeSnapshot || snapshot

  const kpi = activeSnapshot?.kpi || { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0, deliveryRate: 0, openRate: 0, clickRate: 0, bounceRate: 0 }
  const templateRows = activeSnapshot?.templateRows || []

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

  const pct = progress && progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0

  // ── Recalculate analytics for date range when date filter is used ─────────────

  const recalibrateForDateRange = useCallback(async () => {
    const hasRange = filters.startDate || filters.endDate
    if (!hasRange) {
      setRangeSnapshot(null)
      return
    }
    try {
      setSyncing(true)
      setProgress({ loaded: 0, total: 0, done: false })

      // Fetch only events in the desired date range (server-side filtering)
      const rangeDocs = await fetchEmailEventsRange(filters.startDate || '', filters.endDate || '', (p) => setProgress(p))
      const aggregated = aggregateEmailWebhooks(rangeDocs)
      const lastTs = getLatestTime(rangeDocs)
      const snap = buildEmailSnapshot(aggregated, rangeDocs.length, lastTs)
      setRangeSnapshot(snap)
    } catch (err) {
      console.error('[EmailPage] range recalibrate error:', err)
      // fall back to existing snapshot; keep error banner minimal
    } finally {
      setSyncing(false)
      setProgress(null)
    }
  }, [filters.startDate, filters.endDate])

  useEffect(() => {
    // Only trigger range recalibration after the initial snapshot has loaded at least once
    if (!snapshot) return
    recalibrateForDateRange()
  }, [filters.startDate, filters.endDate, snapshot, recalibrateForDateRange])

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
              {syncing ? (progress ? 'Fetching' : 'Syncing') : 'Live'}
            </span>
            <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {snapshot?.rawDocCount ? `${formatCount(snapshot.rawDocCount)} events tracked` : '0 events'}
            </span>
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

      {/* ── Toast / Progress ──────────────────────────────────────────────── */}
      {toast && (
        <div className={`px-4 py-2.5 rounded-xl text-sm text-center font-medium ${isDark ? 'bg-violet-900/40 border border-violet-700 text-violet-300' : 'bg-violet-50 border border-violet-200 text-violet-700'}`}>
          {toast}
        </div>
      )}

      {progress && progress.total > 0 && (
        <div className={`rounded-xl p-4 ${isDark ? 'bg-slate-800/80 border border-slate-700' : 'bg-white border border-slate-200 shadow-sm'}`}>
          <div className="flex justify-between text-xs mb-2">
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Fetching email events...</span>
            <span className={`font-mono font-medium ${isDark ? 'text-violet-400' : 'text-violet-600'}`}>
              {formatCount(progress.loaded)} / {formatCount(progress.total)} ({pct}%)
            </span>
          </div>
          <div className={`w-full h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-indigo-400 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Filter ──────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <EmailFilters filters={filters} setFilters={setFilters} options={filterOptions} theme={theme} />
        {!hasDates && (filters.startDate || filters.endDate) && (
          <p className={`text-[11px] px-1 ${isDark ? 'text-amber-400/70' : 'text-amber-600/70'}`}>
            Date filtering requires updated data. Go to Settings → Recalibrate to rebuild with date info.
          </p>
        )}
      </div>

      {error && (
        <div className="p-4 bg-rose-100 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700 rounded-xl text-rose-800 dark:text-rose-200 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {progress && progress.total > 0
              ? `Loading ${formatCount(progress.loaded)} of ${formatCount(progress.total)} events...`
              : 'Loading analytics...'}
          </p>
        </div>
      ) : (
        <>
          <EmailKpiCards kpi={kpi} theme={theme} />

          <LazySection height="300px">
            <EmailSubjectTable rows={filteredTemplateRows} theme={theme} dataMasked={dataMasked} />
          </LazySection>

          {activeSnapshot?.subjectEmails && Object.keys(activeSnapshot.subjectEmails).length > 0 && (
            <LazySection height="280px">
              <EmailPaymentConversion
                subjectEmails={activeSnapshot.subjectEmails}
                cachedConversion={activeSnapshot.emailPaymentConversion || null}
                onConversionComputed={async (data) => {
                  // Persist only to the base snapshot; range view stays in-memory
                  if (snapshot) {
                    const updated = { ...snapshot, emailPaymentConversion: data }
                    setSnapshot(updated)
                    try { await saveSnapshot('email', updated) } catch {}
                  }
                }}
                theme={theme}
              />
            </LazySection>
          )}
        </>
      )}
    </div>
  )
}
