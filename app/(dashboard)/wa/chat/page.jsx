'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../providers'
import { useTheme } from '../../../providers'
import { fetchWaChatSheet } from '../../../../src/lib/waChatSheetApi'
import WAChatLeadsTable from '../../../../src/components/wa/WAChatLeadsTable'
import WAChatKpiCards from '../../../../src/components/wa/WAChatKpiCards'

export default function WAChatPage() {
  const { dataMasked } = useAuth()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const [rows, setRows] = useState([])
  const [fetchedAt, setFetchedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState(null)
  const [shareWithEmail, setShareWithEmail] = useState(null)
  const [stats, setStats] = useState(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setShareWithEmail(null)
      const data = await fetchWaChatSheet()
      setRows(data.rows || [])
      setFetchedAt(data.fetchedAt || null)
      setStats(data.stats || null)
    } catch (e) {
      console.error('[WAChatPage]', e)
      setError(e.message || 'Could not load sheet')
      setShareWithEmail(e.shareWithEmail || null)
      setRows([])
      setStats(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        setError(null)
        setShareWithEmail(null)
        const data = await fetchWaChatSheet()
        if (cancelled) return
        setRows(data.rows || [])
        setFetchedAt(data.fetchedAt || null)
        setStats(data.stats || null)
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Could not load sheet')
          setShareWithEmail(e.shareWithEmail || null)
          setRows([])
          setStats(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const handleRefresh = async () => {
    setFetching(true)
    await load()
    setFetching(false)
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            WhatsApp Chat
          </h1>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={fetching || loading}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 ${
            isDark
              ? 'bg-brand-600 hover:bg-brand-500 text-white'
              : 'bg-brand-600 hover:bg-brand-700 text-white'
          }`}
        >
          <svg className={`w-3.5 h-3.5 ${fetching ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {fetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {!loading && !error && <WAChatKpiCards stats={stats} theme={theme} />}

      <WAChatLeadsTable
        rows={rows}
        theme={theme}
        dataMasked={dataMasked}
        fetchedAt={fetchedAt}
        loading={loading}
        error={error}
        shareWithEmail={shareWithEmail}
      />
    </div>
  )
}
