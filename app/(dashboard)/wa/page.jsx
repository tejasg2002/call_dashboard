'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { fetchWADashboard } from '../../../src/lib/waDashboardApi'
import { useAuth } from '../../providers'
import { useTheme } from '../../providers'
import WAKpiCards from '../../../src/components/wa/WAKpiCards'
import WATemplatePerformanceTable from '../../../src/components/wa/WATemplatePerformanceTable'
import WATemplatePerformanceChart from '../../../src/components/wa/WATemplatePerformanceChart'
import WAMessageFunnelChart from '../../../src/components/wa/WAMessageFunnelChart'
import WACTAPerformanceTable from '../../../src/components/wa/WACTAPerformanceTable'
import WACostAnalytics from '../../../src/components/wa/WACostAnalytics'
import WAFilters from '../../../src/components/wa/WAFilters'
import WACampaignManager from '../../../src/components/wa/WACampaignManager'
import WACampaignAnalytics from '../../../src/components/wa/WACampaignAnalytics'
import WAEngagementSection from '../../../src/components/wa/WAEngagementSection'
import WAPaymentConversionServer from '../../../src/components/wa/WAPaymentConversionServer'
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

function SectionHeader({ title, description, isDark }) {
  return (
    <div className="pt-1">
      <h2 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{title}</h2>
      {description && <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>{description}</p>}
    </div>
  )
}

export default function WAApiPage() {
  const { isAdmin, dataMasked } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ templateName: '', eventType: '', startDate: '', endDate: '' })
  const [campaigns, _setCampaigns] = useState(loadCampaigns)
  const [toast, setToast] = useState(null)
  const [elapsed, setElapsed] = useState(null)

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
      const data = await fetchWADashboard({ mode: 'cached' })
      setSnapshot(data)
      setElapsed(data.elapsed)
      setError(null)
    } catch (err) {
      console.error('[WAPage] load error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    try {
      setFetching(true)
      setToast(null)
      const data = await fetchWADashboard({ mode: 'full' })
      setSnapshot(data)
      setElapsed(data.elapsed)
      setToast(`Loaded ${formatCount(data.rawDocCount)} events in ${(data.elapsed / 1000).toFixed(1)}s`)
      setTimeout(() => setToast(null), 4000)
      setError(null)
    } catch (err) {
      console.error('[WAPage] refresh error:', err)
      setError(err.message)
    } finally {
      setFetching(false)
    }
  }, [])

  const handleRecomputeAll = useCallback(async () => {
    try {
      setFetching(true)
      setToast(null)
      setFilters((prev) => ({ ...prev, startDate: '', endDate: '' }))
      const data = await fetchWADashboard({ mode: 'full' })
      setSnapshot(data)
      setElapsed(data.elapsed)
      setToast(`Recomputed ${formatCount(data.rawDocCount)} events in ${(data.elapsed / 1000).toFixed(1)}s`)
      setTimeout(() => setToast(null), 4000)
      setError(null)
    } catch (err) {
      console.error('[WAPage] recompute error:', err)
      setError(err.message)
    } finally {
      setFetching(false)
    }
  }, [])

  const recalibrateForDateRange = useCallback(async () => {
    const hasRange = filters.startDate || filters.endDate
    if (!hasRange) {
      if (snapshot?.fromCache === undefined) return
      handleRefresh()
      return
    }
    try {
      setFetching(true)
      const data = await fetchWADashboard({
        mode: 'range',
        startDate: filters.startDate || '',
        endDate: filters.endDate || '',
      })
      setSnapshot(data)
      setElapsed(data.elapsed)
      setToast(`Date range loaded in ${(data.elapsed / 1000).toFixed(1)}s`)
      setTimeout(() => setToast(null), 4000)
    } catch (err) {
      console.error('[WAPage] range recalibrate error:', err)
    } finally {
      setFetching(false)
    }
  }, [filters.startDate, filters.endDate, snapshot, handleRefresh])

  useEffect(() => { loadData() }, [loadData])

  const apiTemplateRows = useMemo(
    () => (snapshot?.templateRows || []).filter((r) => r.source === 'api'),
    [snapshot]
  )
  const apiCtaRows = useMemo(
    () => (snapshot?.ctaRows || []).filter((r) => r.source === 'api'),
    [snapshot]
  )

  const apiKpi = useMemo(() => {
    const rows = apiTemplateRows
    const k = { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, cost: 0 }
    rows.forEach((r) => {
      k.sent += r.sent
      k.delivered += r.delivered
      k.read += r.read
      k.clicked += r.clicked
      k.failed += r.failed
      k.cost += r.total_cost || 0
    })
    const p = (n, d) => (d > 0 ? Math.min((n / d) * 100, 100) : 0)
    k.ctr = p(k.clicked, k.delivered)
    k.readRate = p(k.read, k.delivered)
    k.sdr = p(k.delivered, k.sent)
    k.str = p(k.read, k.sent)
    return k
  }, [apiTemplateRows])

  const baseKpi = apiKpi
  const totalCost = useMemo(
    () => apiTemplateRows.reduce((s, r) => s + (r.total_cost || 0), 0),
    [apiTemplateRows]
  )
  const totalClicked = useMemo(
    () => apiTemplateRows.reduce((s, r) => s + (r.clicked || 0), 0),
    [apiTemplateRows]
  )
  const costPerClick = totalClicked > 0 ? totalCost / totalClicked : 0
  const formSubmitted = snapshot?.formSubmittedCount || 0
  const failureRate =
    baseKpi.sent > 0 ? Math.min(((baseKpi.failed || 0) / baseKpi.sent) * 100, 100) : 0
  const kpi = { ...baseKpi, failureRate, costPerClick, formSubmitted }

  const funnel = useMemo(() => {
    const f = { sent: 0, delivered: 0, read: 0, clicked: 0 }
    apiTemplateRows.forEach((r) => {
      f.sent += r.sent
      f.delivered += r.delivered
      f.read += r.read
      f.clicked += r.clicked
    })
    return f
  }, [apiTemplateRows])

  const engagementSummary = snapshot?.engagementSummary || {}

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

  const lastUpdated = snapshot?.computedAt
    ? new Date(snapshot.computedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
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
              <span className={`w-1.5 h-1.5 rounded-full ${fetching ? 'bg-amber-400 animate-pulse' : 'bg-brand-500'}`} />
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
            disabled={fetching}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 ${
              isDark
                ? 'bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-900/30'
                : 'bg-brand-600 hover:bg-brand-700 text-white shadow-lg shadow-brand-600/20'
            }`}
          >
            <svg className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {fetching ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={handleRecomputeAll}
            disabled={fetching}
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
        <div className={`px-4 py-2.5 rounded-xl text-sm text-center font-medium ${isDark ? 'bg-brand-900/40 border border-brand-700 text-brand-300' : 'bg-brand-50 border border-brand-200 text-brand-700'}`}>
          {toast}
        </div>
      )}

      {/* ── Filter ──────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <WAFilters
          filters={filters}
          setFilters={setFilters}
          options={filterOptions}
          theme={theme}
          onApply={recalibrateForDateRange}
        />
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
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? 'bg-brand-900/30' : 'bg-brand-50'}`}>
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <p className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Loading analytics</p>
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
          {snapshot?.paymentConversion && (
            <div className="space-y-4">
              <SectionHeader title="Payment Conversion" description="Track how WhatsApp engagement converts to completed payments" isDark={isDark} />
              <LazySection height="280px">
                <WAPaymentConversionServer data={snapshot.paymentConversion} theme={theme} />
              </LazySection>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
