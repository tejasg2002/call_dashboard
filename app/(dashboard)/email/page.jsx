'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { fetchEmailEvents, applyEmailFilters, getEmailFilterOptions } from '../../../src/lib/emailFirebase'
import { aggregateEmailWebhooks } from '../../../src/lib/emailAnalytics'
import { getCachedDocs, setCachedDocs, mergeCachedDocs, getLastFetchTime, setLastFetchTime } from '../../../src/lib/dataCache'
import { useAuth } from '../../providers'
import { useTheme } from '../../providers'
import EmailKpiCards from '../../../src/components/email/EmailKpiCards'
import EmailFilters from '../../../src/components/email/EmailFilters'
import EmailSubjectTable from '../../../src/components/email/EmailSubjectTable'
import EmailUserActivity from '../../../src/components/email/EmailUserActivity'
import LazySection from '../../../src/components/LazySection'

const POLL_INTERVAL = 60_000
const CHANNEL = 'email'

function getLatestTime(docs) {
  let latest = null
  for (const d of docs) {
    const t = d.time || d.createdAt
    if (t && (!latest || t > latest)) latest = t
  }
  return latest
}

function formatCount(n) {
  return n.toLocaleString('en-IN')
}

export default function EmailPage() {
  const { dataMasked } = useAuth()
  const { theme } = useTheme()
  const [rawDocs, setRawDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ subject: '', eventType: '', email: '', startDate: '', endDate: '' })
  const [cacheHit, setCacheHit] = useState(false)
  const [progress, setProgress] = useState(null)
  const lastFetch = useRef(null)
  const abortRef = useRef(null)

  const loadData = useCallback(async (forceFullRefresh) => {
    try {
      if (!forceFullRefresh) {
        const cached = await getCachedDocs(CHANNEL)
        if (cached.length > 0) {
          setRawDocs(cached)
          setLoading(false)
          setCacheHit(true)
        }
      }

      const since = forceFullRefresh ? null : await getLastFetchTime(CHANNEL)

      setSyncing(true)
      setProgress(since ? null : { loaded: 0, total: 0, done: false })

      const freshDocs = await fetchEmailEvents(since, (p) => {
        setProgress(p)
        if (!since && p.loaded > 0) {
          setRawDocs((prev) => (prev.length < p.loaded ? null : prev) || [])
        }
      })

      if (since && freshDocs.length > 0) {
        setRawDocs((prev) => {
          const idSet = new Set(freshDocs.map((d) => d._id))
          const merged = prev.filter((d) => !idSet.has(d._id)).concat(freshDocs)
          merged.sort((a, b) => (b.time || '').localeCompare(a.time || ''))
          return merged
        })
        await mergeCachedDocs(CHANNEL, freshDocs)
      } else if (!since) {
        setRawDocs(freshDocs)
        await setCachedDocs(CHANNEL, freshDocs)
      }

      const latestTime = getLatestTime(freshDocs.length > 0 ? freshDocs : rawDocs) || new Date().toISOString()
      await setLastFetchTime(CHANNEL, latestTime)
      lastFetch.current = new Date()

      setError(null)
    } catch (err) {
      console.error('[EmailPage] fetch error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
      setSyncing(false)
      setProgress(null)
    }
  }, [])

  useEffect(() => {
    loadData(false)
    const id = setInterval(() => loadData(false), POLL_INTERVAL)
    return () => clearInterval(id)
  }, [loadData])

  const filterOptions = useMemo(() => getEmailFilterOptions(rawDocs), [rawDocs])
  const docs = useMemo(() => applyEmailFilters(rawDocs, filters), [rawDocs, filters])
  const { kpi, templateRows, byEmail } = useMemo(() => aggregateEmailWebhooks(docs), [docs])

  const pct = progress && progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
          <span className={`w-1.5 h-1.5 rounded-full ${syncing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
          {syncing ? (progress ? 'Fetching' : 'Syncing') : 'Ready'}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {formatCount(rawDocs.length)} total events · {formatCount(docs.length)} filtered
          {cacheHit && !syncing && <> · from cache</>}
          {lastFetch.current && <> · updated {lastFetch.current.toLocaleTimeString()}</>}
        </span>
        <button
          onClick={() => loadData(true)}
          disabled={syncing}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-50 transition-colors"
        >
          <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Full Refresh
        </button>
      </div>

      {progress && progress.total > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Fetching all events from database...</span>
            <span>{formatCount(progress.loaded)} / {formatCount(progress.total)} ({pct}%)</span>
          </div>
          <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <EmailFilters filters={filters} setFilters={setFilters} options={filterOptions} theme={theme} />

      {error && (
        <div className="p-4 bg-rose-100 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700 rounded-xl text-rose-800 dark:text-rose-200 text-sm">{error}</div>
      )}

      {loading && rawDocs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {progress && progress.total > 0
              ? `Loading ${formatCount(progress.loaded)} of ${formatCount(progress.total)} events...`
              : 'Connecting to database...'}
          </p>
        </div>
      ) : (
        <>
          <EmailKpiCards kpi={kpi} theme={theme} />

          <LazySection height="300px">
            <EmailSubjectTable rows={templateRows} theme={theme} dataMasked={dataMasked} />
          </LazySection>

          <LazySection height="300px">
            <EmailUserActivity byEmail={byEmail} theme={theme} dataMasked={dataMasked} />
          </LazySection>
        </>
      )}
    </div>
  )
}
