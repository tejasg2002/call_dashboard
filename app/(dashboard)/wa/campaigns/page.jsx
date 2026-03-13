'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { fetchWAEventsBatched, fetchWAEventsSince } from '../../../../src/lib/waApi'
import { aggregateWebhooks, eventSource } from '../../../../src/lib/waAnalytics'
import { getSnapshot, saveSnapshot, buildWASnapshot, mergeWASnapshots } from '../../../../src/lib/snapshotService'
import { useAuth } from '../../../providers'
import { useTheme } from '../../../providers'
import WAKpiCards from '../../../../src/components/wa/WAKpiCards'
import WATemplatePerformanceTable from '../../../../src/components/wa/WATemplatePerformanceTable'
import LazySection from '../../../../src/components/LazySection'

function formatCount(n) {
  return (n || 0).toLocaleString('en-IN')
}

function getLatestTimestamp(docs) {
  let latest = null
  for (const d of docs) {
    const ts = d.event_timestamp || d.timestamp || ''
    if (ts && (!latest || ts > latest)) latest = ts
  }
  return latest
}

export default function WACampaignsPage() {
  const { isAdmin, dataMasked } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(null)
  const [toast, setToast] = useState(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const existing = await getSnapshot('wa')
      if (existing) {
        setSnapshot(existing)
        setLoading(false)
        return
      }

      setFetching(true)
      setProgress({ loaded: 0, total: 0, done: false })
      const allDocs = await fetchWAEventsBatched((p) => setProgress(p))
      const aggregated = aggregateWebhooks(allDocs)
      const lastTs = getLatestTimestamp(allDocs)
      const snap = buildWASnapshot(aggregated, allDocs.length, lastTs)
      await saveSnapshot('wa', snap)
      setSnapshot(snap)
      setError(null)
    } catch (err) {
      console.error('[WACampaigns] load error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
      setFetching(false)
      setProgress(null)
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    try {
      setFetching(true)
      setToast(null)

      const existing = snapshot || (await getSnapshot('wa'))
      if (!existing?.lastRawDocTime) {
        setProgress({ loaded: 0, total: 0, done: false })
        const allDocs = await fetchWAEventsBatched((p) => setProgress(p))
        const aggregated = aggregateWebhooks(allDocs)
        const lastTs = getLatestTimestamp(allDocs)
        const snap = buildWASnapshot(aggregated, allDocs.length, lastTs)
        await saveSnapshot('wa', snap)
        setSnapshot(snap)
        setProgress(null)
        return
      }

      const newDocs = await fetchWAEventsSince(existing.lastRawDocTime)
      if (newDocs.length === 0) {
        setToast('Up to date — no new events found')
        setTimeout(() => setToast(null), 3000)
        return
      }

      const deltaAggregated = aggregateWebhooks(newDocs)
      const lastTs = getLatestTimestamp(newDocs)
      const deltaSnap = buildWASnapshot(deltaAggregated, newDocs.length, lastTs)
      const merged = mergeWASnapshots(existing, deltaSnap)
      await saveSnapshot('wa', merged)
      setSnapshot(merged)
      setToast(`Merged ${formatCount(newDocs.length)} new events`)
      setTimeout(() => setToast(null), 3000)
    } catch (err) {
      console.error('[WACampaigns] refresh error:', err)
      setError(err.message)
    } finally {
      setFetching(false)
    }
  }, [snapshot])

  useEffect(() => { loadData() }, [loadData])

  const campaignTemplateRows = useMemo(
    () => (snapshot?.templateRows || []).filter((r) => r.source === 'campaign'),
    [snapshot]
  )

  const campaignKpi = useMemo(() => {
    const rows = campaignTemplateRows
    const k = { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, cost: 0 }
    rows.forEach((r) => { k.sent += r.sent; k.delivered += r.delivered; k.read += r.read; k.clicked += r.clicked; k.failed += r.failed; k.cost += r.total_cost || 0 })
    const pct = (n, d) => (d > 0 ? Math.min((n / d) * 100, 100) : 0)
    k.ctr = pct(k.clicked, k.delivered)
    k.readRate = pct(k.read, k.delivered)
    k.sdr = pct(k.delivered, k.sent)
    k.str = pct(k.read, k.sent)
    return k
  }, [campaignTemplateRows])

  const totalEvents = campaignTemplateRows.reduce((s, r) => s + r.sent + r.delivered + r.read + r.clicked + r.failed, 0)
  const pct = progress && progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0

  const lastUpdated = snapshot?.updatedAt
    ? new Date(snapshot.updatedAt.seconds ? snapshot.updatedAt.seconds * 1000 : snapshot.updatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-[1600px] mx-auto">

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Campaign Analytics
          </h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className={`inline-flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${fetching ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
              {fetching ? 'Syncing' : 'Live'}
            </span>
            <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {formatCount(totalEvents)} events · {campaignTemplateRows.length} templates
            </span>
            {lastUpdated && (
              <span className={`text-xs ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                · Updated {lastUpdated}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={handleRefresh}
          disabled={fetching}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 ${
            isDark
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20'
          }`}
        >
          <svg className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {fetching ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </div>

      {/* ── Toast / Progress ──────────────────────────────────────────────── */}
      {toast && (
        <div className={`px-4 py-2.5 rounded-xl text-sm text-center font-medium ${isDark ? 'bg-emerald-900/40 border border-emerald-700 text-emerald-300' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
          {toast}
        </div>
      )}

      {progress && progress.total > 0 && (
        <div className={`rounded-xl p-4 ${isDark ? 'bg-slate-800/80 border border-slate-700' : 'bg-white border border-slate-200 shadow-sm'}`}>
          <div className="flex justify-between text-xs mb-2">
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>Fetching WhatsApp events...</span>
            <span className={`font-mono font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
              {formatCount(progress.loaded)} / {formatCount(progress.total)} ({pct}%)
            </span>
          </div>
          <div className={`w-full h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className={`p-4 rounded-xl text-sm ${isDark ? 'bg-rose-900/30 border border-rose-700 text-rose-200' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
          {error}
        </div>
      )}

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? 'bg-emerald-900/30' : 'bg-emerald-50'}`}>
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <p className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              {progress && progress.total > 0
                ? `Loading ${formatCount(progress.loaded)} of ${formatCount(progress.total)} events`
                : 'Loading campaign analytics'}
            </p>
            <p className={`text-xs mt-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>This may take a moment</p>
          </div>
        </div>
      ) : campaignTemplateRows.length === 0 ? (
        <div className={`rounded-2xl border-2 border-dashed p-12 text-center ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <svg className={`w-12 h-12 mx-auto mb-4 ${isDark ? 'text-slate-700' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No campaign data yet</p>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Campaign events will appear here once detected</p>
        </div>
      ) : (
        <div className="space-y-8">
          <WAKpiCards kpi={campaignKpi} theme={theme} />

          <LazySection height="320px">
            <WATemplatePerformanceTable rows={campaignTemplateRows} ctaRows={[]} theme={theme} dataMasked={dataMasked} />
          </LazySection>
        </div>
      )}
    </div>
  )
}
