import { useEffect, useState, useMemo } from 'react'
import { subscribeEmailWebhooks, applyEmailFilters, getEmailFilterOptions } from '../../lib/emailFirebase'
import { aggregateEmailWebhooks } from '../../lib/emailAnalytics'
import EmailKpiCards    from '../../components/email/EmailKpiCards'
import EmailFilters     from '../../components/email/EmailFilters'
import EmailSubjectTable from '../../components/email/EmailSubjectTable'
import EmailUserActivity from '../../components/email/EmailUserActivity'

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EmailDashboard({ theme, dataMasked }) {
  const [rawDocs, setRawDocs] = useState([])
  const [error, setError]     = useState(null)
  const [filters, setFilters] = useState({ subject: '', eventType: '', email: '', startDate: '', endDate: '' })

  useEffect(() => {
    const unsub = subscribeEmailWebhooks((data, err) => {
      if (err) setError(err.message)
      else { setError(null); setRawDocs(data) }
    })
    return () => unsub()
  }, [])

  const filterOptions = useMemo(() => getEmailFilterOptions(rawDocs), [rawDocs])
  const docs          = useMemo(() => applyEmailFilters(rawDocs, filters), [rawDocs, filters])
  const { kpi, templateRows, byEmail } = useMemo(() => aggregateEmailWebhooks(docs), [docs])

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Live badge */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Real-time updates · {rawDocs.length} total events · {docs.length} filtered
        </span>
      </div>

      {/* Filters */}
      <EmailFilters filters={filters} setFilters={setFilters} options={filterOptions} theme={theme} />

      {/* Error */}
      {error && (
        <div className="p-4 bg-rose-100 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700 rounded-xl text-rose-800 dark:text-rose-200 text-sm">
          {error}
        </div>
      )}

      {/* KPI cards */}
      <EmailKpiCards kpi={kpi} theme={theme} />

      {/* Subject / campaign performance table */}
      <EmailSubjectTable rows={templateRows} theme={theme} dataMasked={dataMasked} />

      {/* Recipient activity timeline */}
      <EmailUserActivity byEmail={byEmail} theme={theme} dataMasked={dataMasked} />
    </div>
  )
}
