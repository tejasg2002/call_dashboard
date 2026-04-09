'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchWADashboard } from '../../../../src/lib/waDashboardApi'
import { useBuWorkspace } from '../../../../src/context/BuWorkspaceProvider'
import { WA_WORKSPACE_IHM, normalizeWAWorkspace } from '../../../../src/lib/waWorkspace'
import { useAuth } from '../../../providers'
import { useTheme } from '../../../providers'
import WAKpiCards from '../../../../src/components/wa/WAKpiCards'
import WATemplatePerformanceTable from '../../../../src/components/wa/WATemplatePerformanceTable'
import LazySection from '../../../../src/components/LazySection'

function formatCount(n) {
  return (n || 0).toLocaleString('en-IN')
}

export default function WACampaignsPage() {
  const router = useRouter()
  const { workspace } = useBuWorkspace()
  const ws = normalizeWAWorkspace(workspace)
  const { isAdmin, dataMasked } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  useEffect(() => {
    if (ws === WA_WORKSPACE_IHM) {
      router.replace('/wa?workspace=ihm')
    }
  }, [ws, router])
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [elapsed, setElapsed] = useState(null)

  const loadData = useCallback(async () => {
    if (ws === WA_WORKSPACE_IHM) return
    try {
      setLoading(true)
      const data = await fetchWADashboard({ mode: 'cached', workspace: ws })
      setSnapshot(data)
      setElapsed(data.elapsed)
      setError(null)
    } catch (err) {
      console.error('[WACampaigns] load error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [ws])

  const handleRecomputeAll = useCallback(async () => {
    try {
      setFetching(true)
      setToast(null)
      const data = await fetchWADashboard({ mode: 'full', workspace: ws })
      setSnapshot(data)
      setElapsed(data.elapsed)
      setToast(`Recomputed in ${(data.elapsed / 1000).toFixed(1)}s`)
      setTimeout(() => setToast(null), 4000)
      setError(null)
    } catch (err) {
      console.error('[WACampaigns] recompute error:', err)
      setError(err.message)
    } finally {
      setFetching(false)
    }
  }, [ws])

  const handleRefresh = useCallback(async () => {
    try {
      setFetching(true)
      setToast(null)
      const data = await fetchWADashboard({ mode: 'full', workspace: ws })
      setSnapshot(data)
      setElapsed(data.elapsed)
      setToast(`Loaded in ${(data.elapsed / 1000).toFixed(1)}s`)
      setTimeout(() => setToast(null), 4000)
      setError(null)
    } catch (err) {
      console.error('[WACampaigns] refresh error:', err)
      setError(err.message)
    } finally {
      setFetching(false)
    }
  }, [ws])

  useEffect(() => { loadData() }, [loadData])

  const campaignTemplateRows = useMemo(
    () => (snapshot?.templateRows || []).filter((r) => r.source === 'campaign'),
    [snapshot]
  )

  const campaignKpi = useMemo(() => {
    const rows = campaignTemplateRows
    const k = { sent: 0, delivered: 0, read: 0, clicked: 0, failed: 0, cost: 0 }
    rows.forEach((r) => { k.sent += r.sent; k.delivered += r.delivered; k.read += r.read; k.clicked += r.clicked; k.failed += r.failed; k.cost += r.total_cost || 0 })
    const p = (n, d) => (d > 0 ? Math.min((n / d) * 100, 100) : 0)
    k.ctr = p(k.clicked, k.delivered)
    k.readRate = p(k.read, k.delivered)
    k.sdr = p(k.delivered, k.sent)
    k.str = p(k.read, k.sent)
    return k
  }, [campaignTemplateRows])

  const totalEvents = campaignTemplateRows.reduce((s, r) => s + r.sent + r.delivered + r.read + r.clicked + r.failed, 0)

  const lastUpdated = snapshot?.computedAt
    ? new Date(snapshot.computedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="p-4 lg:p-8 space-y-8 max-w-[1600px] mx-auto">

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Campaign Analytics
          </h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className={`inline-flex items-center gap-1.5 text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${fetching ? 'bg-amber-400 animate-pulse' : 'bg-brand-500'}`} />
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

      {toast && (
        <div className={`px-4 py-2.5 rounded-xl text-sm text-center font-medium ${isDark ? 'bg-brand-900/40 border border-brand-700 text-brand-300' : 'bg-brand-50 border border-brand-200 text-brand-700'}`}>
          {toast}
        </div>
      )}

      {error && (
        <div className={`p-4 rounded-xl text-sm ${isDark ? 'bg-rose-900/30 border border-rose-700 text-rose-200' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? 'bg-brand-900/30' : 'bg-brand-50'}`}>
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <p className={`text-sm font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Loading campaign analytics</p>
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
            <WATemplatePerformanceTable rows={campaignTemplateRows} ctaRows={[]} theme={theme} dataMasked={dataMasked} workspace={ws} />
          </LazySection>
        </div>
      )}
    </div>
  )
}
