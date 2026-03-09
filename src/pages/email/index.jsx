import { useEffect, useState, useMemo } from 'react'
import { subscribeEmailWebhooks, applyEmailFilters, getEmailFilterOptions } from '../../lib/emailFirebase'
import { aggregateEmailWebhooks } from '../../lib/emailAnalytics'
import EmailKpiCards    from '../../components/email/EmailKpiCards'
import EmailFilters     from '../../components/email/EmailFilters'
import EmailSubjectTable from '../../components/email/EmailSubjectTable'
import EmailUserActivity from '../../components/email/EmailUserActivity'

// ── Funnel chart (horizontal bars) ───────────────────────────────────────────
function EmailFunnelChart({ funnel, theme }) {
  const isDark = theme === 'dark'
  const max = Math.max(...funnel.map((f) => f.value), 1)
  const COLORS = {
    Sent:      'bg-blue-500',
    Delivered: 'bg-emerald-500',
    Opened:    'bg-violet-500',
    Clicked:   'bg-amber-500',
    Bounced:   'bg-rose-500',
  }
  return (
    <div className={`rounded-xl border p-5 ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow'}`}>
      <h3 className={`text-sm font-semibold mb-4 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Email Funnel</h3>
      <div className="space-y-3">
        {funnel.map((f) => {
          const pct = max > 0 ? (f.value / max) * 100 : 0
          const color = COLORS[f.label] || 'bg-slate-400'
          return (
            <div key={f.label} className="flex items-center gap-3">
              <span className={`text-[11px] w-16 text-right font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{f.label}</span>
              <div className={`flex-1 h-5 rounded-lg overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                <div
                  className={`h-full rounded-lg ${color} transition-all duration-500 flex items-center px-2`}
                  style={{ width: `${pct}%` }}
                >
                  {pct > 15 && (
                    <span className="text-white text-[10px] font-bold">{f.value.toLocaleString()}</span>
                  )}
                </div>
              </div>
              <span className={`text-xs font-semibold w-16 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {f.value.toLocaleString()}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
  const { kpi, templateRows, byEmail, funnel } = useMemo(() => aggregateEmailWebhooks(docs), [docs])

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

      {/* Funnel chart */}
      <EmailFunnelChart funnel={funnel} theme={theme} />

      {/* Subject / campaign performance table */}
      <EmailSubjectTable rows={templateRows} theme={theme} dataMasked={dataMasked} />

      {/* Recipient activity timeline */}
      <EmailUserActivity byEmail={byEmail} theme={theme} dataMasked={dataMasked} />
    </div>
  )
}
