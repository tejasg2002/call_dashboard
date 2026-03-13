'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { fetchWAEventsBatched, fetchWAEventsSince, fetchWAEventsRange } from '../../../src/lib/waApi'
import { aggregateWebhooks, aggregateByCampaign, getFilterOptions, eventSource, stripWAForSnapshot } from '../../../src/lib/waAnalytics'
import { getSnapshot, saveSnapshot, buildWASnapshot, mergeWASnapshots } from '../../../src/lib/snapshotService'
import { useAuth } from '../../providers'
import { useTheme } from '../../providers'
import WAKpiCards from '../../../src/components/wa/WAKpiCards'
import WATemplatePerformanceTable from '../../../src/components/wa/WATemplatePerformanceTable'
import WATemplatePerformanceChart from '../../../src/components/wa/WATemplatePerformanceChart'
import WAMessageFunnelChart from '../../../src/components/wa/WAMessageFunnelChart'
import WACTAPerformanceTable from '../../../src/components/wa/WACTAPerformanceTable'
import WACostAnalytics from '../../../src/components/wa/WACostAnalytics'
import WAUserActivityTimeline from '../../../src/components/wa/WAUserActivityTimeline'
import WAFilters from '../../../src/components/wa/WAFilters'
import WACampaignManager from '../../../src/components/wa/WACampaignManager'
import WACampaignAnalytics from '../../../src/components/wa/WACampaignAnalytics'
import WAEngagementSection from '../../../src/components/wa/WAEngagementSection'
import WAPaymentConversion from '../../../src/components/wa/WAPaymentConversion'
import LazySection from '../../../src/components/LazySection'

function loadCampaigns() {
  try {
    const raw = localStorage.getItem('wa_campaigns')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function saveCampaigns(c) {
  try { localStorage.setItem('wa_campaigns', JSON.stringify(c)) } catch {}
}

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

function SectionHeader({ title, description, isDark }) {
  return (
    <div className="pt-2">
      <h2 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{title}</h2>
      {description && <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{description}</p>}
    </div>
  )
}

export default function WAApiPage() {
  const { isAdmin, dataMasked } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [snapshot, setSnapshot] = useState(null)
  const [rangeSnapshot, setRangeSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ templateName: '', eventType: '', startDate: '', endDate: '' })
  const [campaigns, _setCampaigns] = useState(loadCampaigns)
  const [progress, setProgress] = useState(null)
  const [toast, setToast] = useState(null)

  function setCampaigns(updater) {
    _setCampaigns((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveCampaigns(next)
      return next
    })
  }

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
      console.error('[WAPage] load error:', err)
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
      console.error('[WAPage] refresh error:', err)
      setError(err.message)
    } finally {
      setFetching(false)
    }
  }, [snapshot])

  useEffect(() => { loadData() }, [loadData])

  const activeSnapshot = rangeSnapshot || snapshot

  const apiTemplateRows = useMemo(
    () => (activeSnapshot?.templateRows || []).filter((r) => r.source === 'api'),
    [activeSnapshot]
  )
  const apiCtaRows = useMemo(() => activeSnapshot?.ctaRows || [], [activeSnapshot])
  const kpi = activeSnapshot?.kpi || { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, cost: 0, ctr: 0, readRate: 0, sdr: 0, str: 0 }
  const funnel = activeSnapshot?.funnel || { sent: 0, delivered: 0, read: 0, clicked: 0 }
  const costPerClick = activeSnapshot?.costPerClick || 0
  const totalCost = activeSnapshot?.totalCost || 0
  const engagementSummary = activeSnapshot?.engagementSummary || {}

  const filterOptions = useMemo(() => ({
    templateNames: apiTemplateRows.map((r) => r.template_name).sort(),
    eventTypes: [],
  }), [apiTemplateRows])

  const hasDates = useMemo(() => apiTemplateRows.some((r) => r.firstSeen || r.lastSeen), [apiTemplateRows])

  const filteredTemplateRows = useMemo(() => {
    let rows = apiTemplateRows
    if (filters.templateName) rows = rows.filter((r) => r.template_name === filters.templateName)
    if (hasDates && filters.startDate) {
      const start = new Date(filters.startDate).getTime()
      rows = rows.filter((r) => !r.lastSeen || new Date(r.lastSeen).getTime() >= start)
    }
    if (hasDates && filters.endDate) {
      const end = new Date(filters.endDate + 'T23:59:59').getTime()
      rows = rows.filter((r) => !r.firstSeen || new Date(r.firstSeen).getTime() <= end)
    }
    return rows
  }, [apiTemplateRows, filters.templateName, filters.startDate, filters.endDate, hasDates])

  // ── Recalculate analytics for date range when date filter is used ─────────────

  const recalibrateForDateRange = useCallback(async () => {
    const hasRange = filters.startDate || filters.endDate
    if (!hasRange) {
      setRangeSnapshot(null)
      return
    }
    try {
      setFetching(true)
      setProgress({ loaded: 0, total: 0, done: false })

      // Fetch only events in the desired date range (server-side filtering)
      const rangeDocs = await fetchWAEventsRange(filters.startDate || '', filters.endDate || '', (p) => setProgress(p))
      const aggregated = aggregateWebhooks(rangeDocs)
      const lastTs = getLatestTimestamp(rangeDocs)
      const snap = buildWASnapshot(aggregated, rangeDocs.length, lastTs)
      setRangeSnapshot(snap)
    } catch (err) {
      console.error('[WAPage] range recalibrate error:', err)
    } finally {
      setFetching(false)
      setProgress(null)
    }
  }, [filters.startDate, filters.endDate])

  useEffect(() => {
    if (!snapshot) return
    recalibrateForDateRange()
  }, [filters.startDate, filters.endDate, snapshot, recalibrateForDateRange])

  const campaignTemplateRows = useMemo(
    () => (activeSnapshot?.templateRows || []).filter((r) => r.source === 'campaign'),
    [activeSnapshot]
  )

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
            WhatsApp Analytics
          </h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className={`inline-flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${fetching ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
              {fetching ? 'Syncing' : 'Live'}
            </span>
            {snapshot?.rawDocCount && (
              <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {formatCount(snapshot.rawDocCount)} events tracked
              </span>
            )}
            {lastUpdated && (
              <span className={`text-xs ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                · Updated {lastUpdated}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
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

      {/* ── Filter ──────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <WAFilters filters={filters} setFilters={setFilters} options={filterOptions} theme={theme} />
        {!hasDates && (filters.startDate || filters.endDate) && (
          <p className={`text-[11px] px-1 ${isDark ? 'text-amber-400/70' : 'text-amber-600/70'}`}>
            Date filtering requires updated data. Go to Settings → Recalibrate to rebuild with date info.
          </p>
        )}
      </div>

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
                : 'Loading analytics'}
            </p>
            <p className={`text-xs mt-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>This may take a moment</p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">

          {/* ── Overview KPIs ─────────────────────────────────────────────── */}
          <WAKpiCards kpi={kpi} theme={theme} />

          {/* ── Template Performance ──────────────────────────────────────── */}
          <div className="space-y-4">
            <SectionHeader title="Template Performance" description={`${filteredTemplateRows.length} templates tracked across all API messages`} isDark={isDark} />

            <LazySection height="320px">
              <WATemplatePerformanceTable rows={filteredTemplateRows} ctaRows={apiCtaRows} theme={theme} dataMasked={dataMasked} />
            </LazySection>

            <LazySection height="300px">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <WATemplatePerformanceChart rows={filteredTemplateRows} theme={theme} />
                <WAMessageFunnelChart funnel={funnel} theme={theme} />
              </div>
            </LazySection>
          </div>

          {/* ── CTA & Engagement ──────────────────────────────────────────── */}
          <div className="space-y-4">
            <SectionHeader title="Click & Engagement Analysis" description="Button performance and user engagement depth" isDark={isDark} />

            <LazySection height="200px">
              <WACTAPerformanceTable rows={apiCtaRows} theme={theme} />
            </LazySection>

            <LazySection height="240px">
              <WAEngagementSection engagementSummary={engagementSummary} theme={theme} dataMasked={dataMasked} />
            </LazySection>
          </div>

          {/* ── Cost & Campaigns ──────────────────────────────────────────── */}
          <div className="space-y-4">
            <SectionHeader title="Cost & Campaign Management" description="Spending breakdown and campaign configuration" isDark={isDark} />

            <LazySection height="200px">
              <WACostAnalytics templateRows={filteredTemplateRows} totalCost={totalCost} costPerClick={costPerClick} clicked={kpi.clicked} theme={theme} />
            </LazySection>

            <LazySection height="260px">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-1">
                  <WACampaignManager campaigns={campaigns} setCampaigns={setCampaigns} templateNames={filterOptions.templateNames} theme={theme} />
                </div>
                <div className="lg:col-span-2">
                  <WACampaignAnalytics campaignData={[]} theme={theme} />
                </div>
              </div>
            </LazySection>
          </div>

          {/* ── Payment Conversion ────────────────────────────────────────── */}
          {((snapshot?.buttonPhones && Object.keys(snapshot.buttonPhones).length > 0) || (snapshot?.templatePhones && Object.keys(snapshot.templatePhones).length > 0)) && (
            <div className="space-y-4">
              <SectionHeader title="Payment Conversion" description="Track how WhatsApp engagement converts to completed payments" isDark={isDark} />
              <LazySection height="280px">
                <WAPaymentConversion
                  buttonPhones={snapshot.buttonPhones || {}}
                  templatePhones={snapshot.templatePhones || {}}
                  cachedConversion={snapshot.paymentConversion || null}
                  onConversionComputed={async (data) => {
                    const updated = { ...snapshot, paymentConversion: data }
                    setSnapshot(updated)
                    try { await saveSnapshot('wa', updated) } catch {}
                  }}
                  theme={theme}
                />
              </LazySection>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
