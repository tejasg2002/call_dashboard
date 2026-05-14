'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { fetchWADashboard } from '../../../src/lib/waDashboardApi'
import {
  WA_WORKSPACE_IHM,
  WA_WORKSPACE_IDM,
  WA_WORKSPACE_MBA,
  WA_WORKSPACE_BBA,
  WA_WORKSPACE_BTECH,
  normalizeWAWorkspace,
  workspacePayloadMatchesExpected,
} from '../../../src/lib/waWorkspace'
import { normaliseMobile } from '../../../src/lib/waPhoneMatch'
import { useAuth, useTheme } from '../../providers'
import { useWAWorkspace } from '../../../src/context/BuWorkspaceProvider'
import WAKpiCards from '../../../src/components/wa/WAKpiCards'
import WATemplatePerformanceTable from '../../../src/components/wa/WATemplatePerformanceTable'
import WAMessageFunnelChart from '../../../src/components/wa/WAMessageFunnelChart'
import WACTAPerformanceTable from '../../../src/components/wa/WACTAPerformanceTable'
import WAFilters from '../../../src/components/wa/WAFilters'
import WACampaignManager from '../../../src/components/wa/WACampaignManager'
import WACampaignAnalytics from '../../../src/components/wa/WACampaignAnalytics'
import WAPaymentConversionServer from '../../../src/components/wa/WAPaymentConversionServer'
import WAClickBreakdown from '../../../src/components/wa/WAClickBreakdown'
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

function leadFilterSectionSuffix(pickedStages, pickedSources) {
  const st = pickedStages || []
  const so = pickedSources || []
  const bits = []
  if (st.length) bits.push(`stages: ${st.join(', ')}`)
  if (so.length) bits.push(`sources: ${so.join(', ')}`)
  return bits.length ? ` (${bits.join(' · ')})` : ''
}

/** Lead cohort phones from /api/wa-lead-filter (mode=phones) are already normalised. */
function filterPaymentConversionByLeadCohort(paymentConversion, clickBreakdown, normalizedPhoneList) {
  if (!paymentConversion) return null
  if (!Array.isArray(normalizedPhoneList) || normalizedPhoneList.length === 0) {
    return {
      ...paymentConversion,
      totalClicked: 0,
      formSubmitted: 0,
      conversionRate: 0,
      formSubmittedMobiles: [],
      formSubmittedDetails: [],
    }
  }
  const normSet = new Set(normalizedPhoneList)
  const details = (paymentConversion.formSubmittedDetails || []).filter((d) => {
    const n = normaliseMobile(d.mobile)
    return n && normSet.has(n)
  })
  let totalClicked = 0
  for (const row of clickBreakdown || []) {
    const n = normaliseMobile(row.phone)
    if (n && normSet.has(n)) totalClicked += 1
  }
  const formSubmitted = details.length
  const conversionRate =
    totalClicked > 0 ? parseFloat(((formSubmitted / totalClicked) * 100).toFixed(2)) : 0
  return {
    ...paymentConversion,
    totalClicked,
    formSubmitted,
    conversionRate,
    formSubmittedMobiles: details.map((d) => d.mobile).filter(Boolean),
    formSubmittedDetails: details,
  }
}

function SectionHeader({ title, description, isDark }) {
  return (
    <div className="pt-1">
      <h2 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{title}</h2>
      {description && <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>{description}</p>}
    </div>
  )
}

// Workspaces that support lead stage / source filtering
const LEAD_FILTER_WORKSPACES = new Set([
  WA_WORKSPACE_MBA,
  WA_WORKSPACE_BBA,
  WA_WORKSPACE_BTECH,
  WA_WORKSPACE_IDM,
  WA_WORKSPACE_IHM,
])

export default function WAApiPage() {
  const { isAdmin, dataMasked } = useAuth()
  const { theme } = useTheme()
  const { workspace } = useWAWorkspace()
  const workspaceRef = useRef(workspace)
  workspaceRef.current = workspace
  const isDark = theme === 'dark'
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({
    templateName: '',
    eventType: '',
    startDate: '',
    endDate: '',
    pickedLeadStages: [],
    pickedSources: [],
  })
  const [campaigns, _setCampaigns] = useState(loadCampaigns)
  const [toast, setToast] = useState(null)
  const [elapsed, setElapsed] = useState(null)

  // ── Lead filter state ──────────────────────────────────────────────────────
  const hasLeadFilter       = LEAD_FILTER_WORKSPACES.has(normalizeWAWorkspace(workspace))
  const [leadFilterOpts, setLeadFilterOpts]         = useState(null)    // { leadStages, sources }
  const [leadFilterLoading, setLeadFilterLoading]   = useState(false)
  const [leadAnalytics, setLeadAnalytics]           = useState(null)    // result from /api/wa-lead-analytics
  const [leadAnalyticsLoading, setLeadAnalyticsLoading] = useState(false)
  /** Normalised CRM/webhook phones for the active lead filter (same cohort as analytics). */
  const [leadFilterPhoneNormals, setLeadFilterPhoneNormals] = useState(null)
  const isLeadFilterActive =
    (filters.pickedLeadStages?.length || 0) > 0 || (filters.pickedSources?.length || 0) > 0

  const finishWADashboardFetch = useCallback((requestedWs, data) => {
    const ws = normalizeWAWorkspace(requestedWs)
    if (normalizeWAWorkspace(workspaceRef.current) !== ws) {
      return false
    }
    if (!workspacePayloadMatchesExpected(data, ws)) {
      setError(
        'Analytics did not match the selected workspace. Pick the correct BU workspace again or refresh.',
      )
      setSnapshot(null)
      return false
    }
    setSnapshot(data)
    setElapsed(data.elapsed)
    setError(null)
    return true
  }, [])

  useEffect(() => {
    setSnapshot(null)
    setError(null)
    setLeadAnalytics(null)
    setLeadFilterPhoneNormals(null)
    setLeadFilterOpts(null)
    setFilters((f) => ({ ...f, pickedLeadStages: [], pickedSources: [] }))
  }, [workspace])

  // Load lead filter options when workspace supports CRM / webhook lead cohorts
  useEffect(() => {
    const ws = normalizeWAWorkspace(workspace)
    if (!LEAD_FILTER_WORKSPACES.has(ws)) return
    setLeadFilterLoading(true)
    fetch(`/api/wa-lead-filter?workspace=${ws}&mode=options`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          console.error('[WAPage] leadFilterOpts:', data.error)
          setToast(`Lead filter options: ${data.error}`)
          setTimeout(() => setToast(null), 8000)
          setLeadFilterOpts({ leadStages: [], sources: [] })
          return
        }
        setLeadFilterOpts(data)
      })
      .catch((err) => {
        console.error('[WAPage] leadFilterOpts error:', err)
        setToast('Could not load lead stage / source options')
        setTimeout(() => setToast(null), 8000)
      })
      .finally(() => setLeadFilterLoading(false))
  }, [workspace])

  function setCampaigns(updater) {
    _setCampaigns((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveCampaigns(next)
      return next
    })
  }

  const loadData = useCallback(async () => {
    const ws = normalizeWAWorkspace(workspace)
    try {
      setLoading(true)
      const data = await fetchWADashboard({ mode: 'cached', workspace: ws })
      finishWADashboardFetch(ws, data)
    } catch (err) {
      console.error('[WAPage] load error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [workspace, finishWADashboardFetch])

  const handleRefresh = useCallback(async () => {
    const ws = normalizeWAWorkspace(workspace)
    try {
      setFetching(true)
      setToast(null)
      const data = await fetchWADashboard({ mode: 'cached', workspace: ws })
      if (data.pending) {
        // Cache is cold — don't wipe existing data; prompt user to recompute
        setToast('No snapshot available. Click "Recompute all" to build the cache, then Refresh again.')
        setTimeout(() => setToast(null), 8000)
        return
      }
      if (finishWADashboardFetch(ws, data)) {
        const ageMin = data.computedAt
          ? Math.round((Date.now() - new Date(data.computedAt).getTime()) / 60000)
          : 0
        setToast(`Loaded ${formatCount(data.rawDocCount)} events (snapshot ${ageMin}m old)`)
        setTimeout(() => setToast(null), 4000)
      }
    } catch (err) {
      console.error('[WAPage] refresh error:', err)
      setError(err.message)
    } finally {
      setFetching(false)
    }
  }, [workspace, finishWADashboardFetch])

  const handleRecomputeAll = useCallback(() => {
    const ws = normalizeWAWorkspace(workspace)
    setFilters((prev) => ({ ...prev, startDate: '', endDate: '' }))
    setToast('Recomputing in background — use Refresh in 1-2 min to see updated data.')
    setTimeout(() => setToast(null), 10000)

    // Fire and forget — UI stays responsive while heavy compute runs in background
    fetch(`/api/wa-dashboard/recompute?workspace=${ws}`, { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setToast(`Recompute done in ${(data.elapsed / 1000).toFixed(1)}s — click Refresh to load.`)
          setTimeout(() => setToast(null), 8000)
        } else {
          console.warn('[WAPage] recompute failed', data.error)
        }
      })
      .catch((err) => console.warn('[WAPage] recompute background error:', err))
  }, [workspace])

  const recalibrateForDateRange = useCallback(async (partialFilters = null) => {
    // Ignore React click events if onApply is ever passed directly as onClick.
    const partial =
      partialFilters &&
      typeof partialFilters === 'object' &&
      !('nativeEvent' in partialFilters)
        ? partialFilters
        : null
    const f = partial ? { ...filters, ...partial } : filters
    if (partial) {
      setFilters((prev) => ({ ...prev, ...partial }))
    }

    const hasRange = f.startDate || f.endDate

    // ── Lead filter: if active, fetch filtered analytics ─────────────────────
    const ws = normalizeWAWorkspace(workspace)
    const pickedStages = f.pickedLeadStages || []
    const pickedSrcs = f.pickedSources || []
    if (hasLeadFilter && (pickedStages.length || pickedSrcs.length)) {
      setLeadAnalyticsLoading(true)
      const analyticsParams = new URLSearchParams({ workspace: ws })
      for (const v of pickedStages) analyticsParams.append('leadStage', v)
      for (const v of pickedSrcs) analyticsParams.append('source', v)
      if (f.startDate) analyticsParams.set('startDate', f.startDate)
      if (f.endDate) analyticsParams.set('endDate', f.endDate)

      const phoneParams = new URLSearchParams({ workspace: ws, mode: 'phones' })
      for (const v of pickedStages) phoneParams.append('leadStage', v)
      for (const v of pickedSrcs) phoneParams.append('source', v)

      try {
        const [aRes, pRes] = await Promise.all([
          fetch(`/api/wa-lead-analytics?${analyticsParams.toString()}`),
          fetch(`/api/wa-lead-filter?${phoneParams.toString()}`),
        ])
        const data = await aRes.json()
        const phonesPayload = await pRes.json()
        if (!aRes.ok || data.error) throw new Error(data.error || 'Lead analytics failed')
        if (!pRes.ok || phonesPayload.error) throw new Error(phonesPayload.error || 'Lead phones lookup failed')
        setLeadAnalytics(data)
        setLeadFilterPhoneNormals(Array.isArray(phonesPayload.phones) ? phonesPayload.phones : [])
        setToast(`Lead filter: ${data.totalLeads.toLocaleString('en-IN')} leads matched`)
        setTimeout(() => setToast(null), 5000)
      } catch (err) {
        console.error('[WAPage] lead analytics error:', err)
        setLeadAnalytics(null)
        setLeadFilterPhoneNormals(null)
        setToast(`Lead filter error: ${err.message}`)
        setTimeout(() => setToast(null), 6000)
      } finally {
        setLeadAnalyticsLoading(false)
      }
    } else {
      // Clear lead analytics when filter is cleared
      setLeadAnalytics(null)
      setLeadFilterPhoneNormals(null)
    }

    // No custom date range: reload full snapshot unless we only applied a lead cohort
    // (lead-filtered template/KPI rows come from /api/wa-lead-analytics; refreshing the cache
    // here is redundant and can briefly replace the view or fail workspace checks).
    if (!hasRange) {
      const leadCohortActive = hasLeadFilter && (pickedStages.length || pickedSrcs.length)
      if (!leadCohortActive) await handleRefresh()
      return
    }
    try {
      setFetching(true)
      const data = await fetchWADashboard({
        mode: 'range',
        startDate: f.startDate || '',
        endDate: f.endDate || '',
        workspace: ws,
      })
      if (finishWADashboardFetch(ws, data)) {
        setToast(`Date range loaded in ${(data.elapsed / 1000).toFixed(1)}s`)
        setTimeout(() => setToast(null), 4000)
      }
    } catch (err) {
      console.error('[WAPage] range recalibrate error:', err)
    } finally {
      setFetching(false)
    }
  }, [filters, snapshot, handleRefresh, workspace, finishWADashboardFetch, hasLeadFilter])

  useEffect(() => { loadData() }, [loadData])

  const apiTemplateRows = useMemo(
    () => (snapshot?.templateRows || []).filter((r) => r.source === 'api'),
    [snapshot]
  )
  const apiCtaRows = useMemo(
    () => (snapshot?.ctaRows || []).filter((r) => r.source === 'api'),
    [snapshot]
  )

  const paymentConversionForDisplay = useMemo(() => {
    const pc = snapshot?.paymentConversion
    if (!pc) return null
    if (!isLeadFilterActive || !leadAnalytics || !Array.isArray(leadFilterPhoneNormals)) return pc
    return filterPaymentConversionByLeadCohort(pc, snapshot?.clickBreakdown, leadFilterPhoneNormals)
  }, [
    snapshot?.paymentConversion,
    snapshot?.clickBreakdown,
    isLeadFilterActive,
    leadAnalytics,
    leadFilterPhoneNormals,
  ])

  const baseKpi = snapshot?.kpi || { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, cost: 0, ctr: 0, readRate: 0, sdr: 0, str: 0 }
  const totalCost = Number(snapshot?.totalCost || baseKpi.cost || 0)
  const totalClicked = Number(baseKpi.clicked || 0)
  const costPerClick = Number(snapshot?.costPerClick || (totalClicked > 0 ? totalCost / totalClicked : 0))
  const formSubmitted =
    isLeadFilterActive && leadAnalytics && paymentConversionForDisplay
      ? paymentConversionForDisplay.formSubmitted
      : snapshot?.formSubmittedCount || 0

  const funnel = snapshot?.funnel || { sent: 0, delivered: 0, read: 0, clicked: 0 }

  const engagementSummary = snapshot?.engagementSummary || {}

  const filterOptions = useMemo(() => {
    const names = apiTemplateRows
      .map((r) => r.template_name)
      .filter((n) => n != null && String(n).trim() !== '')
    const uniqueSorted = [...new Set(names)].sort((a, b) => String(a).localeCompare(String(b)))
    return {
      templateNames: uniqueSorted,
      eventTypes: [],
    }
  }, [apiTemplateRows])

  const hasDates = useMemo(() => apiTemplateRows.some((r) => r.firstSeen || r.lastSeen), [apiTemplateRows])

  const filteredTemplateRows = useMemo(() => {
    // When lead filter is active, use lead-analytics rows (already server-filtered)
    let rows = isLeadFilterActive && leadAnalytics
      ? (leadAnalytics.templateRows || [])
      : apiTemplateRows

    if (filters.templateName) rows = rows.filter((r) => r.template_name === filters.templateName)
    if (!isLeadFilterActive || !leadAnalytics) {
      // Date slicing only needed on snapshot rows (lead analytics already respects dates)
      if (hasDates && filters.startDate) {
        const start = new Date(filters.startDate).getTime()
        rows = rows.filter((r) => !r.lastSeen || new Date(r.lastSeen).getTime() >= start)
      }
      if (hasDates && filters.endDate) {
        const end = new Date(filters.endDate + 'T23:59:59').getTime()
        rows = rows.filter((r) => !r.firstSeen || new Date(r.firstSeen).getTime() <= end)
      }
    }
    return rows
  }, [apiTemplateRows, filters.templateName, filters.startDate, filters.endDate, hasDates, isLeadFilterActive, leadAnalytics])

  // KPI: use lead-analytics KPI when lead filter is active, snapshot KPI otherwise
  const activeKpiBase = isLeadFilterActive && leadAnalytics ? leadAnalytics.kpi : baseKpi
  const failureRate   = activeKpiBase.sent > 0 ? Math.min(((activeKpiBase.failed || 0) / activeKpiBase.sent) * 100, 100) : 0
  const kpi           = { ...activeKpiBase, failureRate, costPerClick, formSubmitted }

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
          hasLeadFilter={hasLeadFilter}
          leadFilterOpts={leadFilterOpts}
          leadFilterLoading={leadFilterLoading}
        />
        {/* Lead filter active banner */}
        {isLeadFilterActive && leadAnalytics && (
          <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm ${
            isDark
              ? 'bg-brand-900/20 border-brand-700/40 text-brand-300'
              : 'bg-brand-50 border-brand-200 text-brand-700'
          }`}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span className="font-medium">
              Showing data for{' '}
              <strong>{leadAnalytics.totalLeads.toLocaleString('en-IN')} leads</strong>
              {(filters.pickedLeadStages || []).length > 0 && (
                <>
                  {' '}
                  in stage{(filters.pickedLeadStages || []).length > 1 ? 's' : ''}{' '}
                  <strong>{(filters.pickedLeadStages || []).join(' · ')}</strong>
                </>
              )}
              {(filters.pickedSources || []).length > 0 && (
                <>
                  {' '}
                  from source{(filters.pickedSources || []).length > 1 ? 's' : ''}{' '}
                  <strong>{(filters.pickedSources || []).join(' · ')}</strong>
                </>
              )}
            </span>
            {leadAnalyticsLoading && (
              <span className="ml-auto inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        )}
        {leadAnalyticsLoading && !leadAnalytics && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            <span className="inline-block w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            Loading lead-filtered analytics…
          </div>
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
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? 'bg-brand-900/30' : 'bg-brand-50'}`}>
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <p className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Loading analytics</p>
            <p className={`text-xs mt-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>This may take a moment</p>
          </div>
        </div>
      ) : snapshot?.pending ? (
        <div className={`p-6 rounded-xl text-center ${isDark ? 'bg-amber-900/20 border border-amber-700/40 text-amber-300' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
          <p className="text-sm font-semibold">Initial snapshot is still computing</p>
          <p className={`text-xs mt-1 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
            Click <strong>Recompute all</strong> to start a background recompute, then use <strong>Refresh</strong> in 1-2 minutes to load the data.
          </p>
        </div>
      ) : (
        <div className="space-y-8">

          {/* ── Overview KPIs ─────────────────────────────────────────────── */}
          <WAKpiCards kpi={kpi} theme={theme} />

          {/* ── Template Performance ──────────────────────────────────────── */}
          <div className="space-y-4">
            <SectionHeader
              title="Template Performance"
              description={
                isLeadFilterActive && leadAnalytics
                  ? `${filteredTemplateRows.length} templates · filtered to ${leadAnalytics.totalLeads.toLocaleString('en-IN')} leads${leadFilterSectionSuffix(filters.pickedLeadStages, filters.pickedSources)}`
                  : `${filteredTemplateRows.length} templates tracked across all API messages`
              }
              isDark={isDark}
            />

            <LazySection height="320px">
              <WATemplatePerformanceTable rows={filteredTemplateRows} ctaRows={apiCtaRows} theme={theme} dataMasked={dataMasked} workspace={workspace} />
            </LazySection>

            <LazySection height="300px">
              <WAMessageFunnelChart funnel={funnel} theme={theme} />
            </LazySection>
          </div>

          {/* ── CTA Performance ───────────────────────────────────────────── */}
          <div className="space-y-4">
            <SectionHeader title="Button / CTA Performance" description="Click performance per button across all templates" isDark={isDark} />

            <LazySection height="200px">
              <WACTAPerformanceTable rows={apiCtaRows} theme={theme} />
            </LazySection>
          </div>

          {/* ── Campaign Management ───────────────────────────────────────── */}
          <div className="space-y-4">
            <SectionHeader title="Campaign Management" description="Campaign configuration and analytics" isDark={isDark} />

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

          {/* ── Click Breakdown ───────────────────────────────────────────── */}
          {snapshot?.clickBreakdown && snapshot.clickBreakdown.length > 0 && (
            <div className="space-y-4">
              <SectionHeader title="Click Breakdown" description="Every user who clicked — what template, button, and link" isDark={isDark} />
              <LazySection height="400px">
                <WAClickBreakdown data={snapshot.clickBreakdown} theme={theme} dataMasked={dataMasked} />
              </LazySection>
            </div>
          )}

          {/* ── Payment / Form Conversion ──────────────────────────────────── */}
          {snapshot?.paymentConversion && (
            <div className="space-y-4">
              <SectionHeader
                title={
                  workspace === WA_WORKSPACE_IHM
                    ? 'Form conversion (IHM)'
                    : workspace === WA_WORKSPACE_IDM
                    ? 'Form conversion (IDM)'
                    : workspace === WA_WORKSPACE_BBA
                    ? 'Form conversion (BBA)'
                    : workspace === WA_WORKSPACE_BTECH
                    ? 'Form conversion (BTech)'
                    : 'Form conversion'
                }
                description={
                  workspace === WA_WORKSPACE_IHM
                    ? 'Clicked users who reached Submitted, SRF Paid, or Enrolled on IHM NPF apps — or Payment Approved on IHM payment webhooks — after first WA send and last click (ITM_IHM.npfApplicationsWebhookEvents + npfPaymentWebhookEvents).'
                    : workspace === WA_WORKSPACE_IDM
                    ? 'Clicked users with an IDM application (ITM_IDM.npfApplicationsWebhookEvents) after first WA send and last click, where NPF payment status is Complete (ITM_IDM.npfPaymentWebhookEvents).'
                    : workspace === WA_WORKSPACE_BBA
                    ? 'Clicked users who submitted a BBA application (ITM_ISU.npfApplicationsWebhookEventsBBA) after template send and last click'
                    : workspace === WA_WORKSPACE_BTECH
                    ? 'Clicked users with a BTech application (ITM_ISU.npfApplicationsWebhookEventsBTech) after first WA send and last click, where stage is Submitted, B.Tech Offer Letter with Scholarship, or Enrolled — or NPF payment is Payment Approved (npfPaymentWebhookEventsBTech).'
                    : 'Clicked users who submitted an MBA application after template send'
                }
                isDark={isDark}
              />
              <LazySection height="280px">
                <WAPaymentConversionServer
                  data={paymentConversionForDisplay ?? snapshot.paymentConversion}
                  theme={theme}
                  dataMasked={dataMasked}
                />
              </LazySection>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
