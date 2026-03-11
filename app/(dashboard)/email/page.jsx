'use client'

import { useEffect, useState, useMemo } from 'react'
import { subscribeEmailWebhooks, applyEmailFilters, getEmailFilterOptions } from '../../../src/lib/emailFirebase'
import { aggregateEmailWebhooks } from '../../../src/lib/emailAnalytics'
import { useAuth } from '../../providers'
import { useTheme } from '../../providers'
import EmailKpiCards from '../../../src/components/email/EmailKpiCards'
import EmailFilters from '../../../src/components/email/EmailFilters'
import EmailSubjectTable from '../../../src/components/email/EmailSubjectTable'
import EmailUserActivity from '../../../src/components/email/EmailUserActivity'

export default function EmailPage() {
  const { dataMasked } = useAuth()
  const { theme } = useTheme()
  const [rawDocs, setRawDocs] = useState([])
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ subject: '', eventType: '', email: '', startDate: '', endDate: '' })

  useEffect(() => {
    const unsub = subscribeEmailWebhooks((data, err) => {
      if (err) setError(err.message)
      else { setError(null); setRawDocs(data) }
    })
    return () => unsub()
  }, [])

  const filterOptions = useMemo(() => getEmailFilterOptions(rawDocs), [rawDocs])
  const docs = useMemo(() => applyEmailFilters(rawDocs, filters), [rawDocs, filters])
  const { kpi, templateRows, byEmail } = useMemo(() => aggregateEmailWebhooks(docs), [docs])

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Real-time updates · {rawDocs.length} total events · {docs.length} filtered
        </span>
      </div>

      <EmailFilters filters={filters} setFilters={setFilters} options={filterOptions} theme={theme} />

      {error && (
        <div className="p-4 bg-rose-100 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700 rounded-xl text-rose-800 dark:text-rose-200 text-sm">{error}</div>
      )}

      <EmailKpiCards kpi={kpi} theme={theme} />
      <EmailSubjectTable rows={templateRows} theme={theme} dataMasked={dataMasked} />
      <EmailUserActivity byEmail={byEmail} theme={theme} dataMasked={dataMasked} />
    </div>
  )
}
