import { useEffect, useState, useMemo } from 'react'
import { subscribeWhatsAppWebhooks, applyFilters } from '../../lib/firebase'
import { aggregateCampaignEvents, getFilterOptions, eventSource } from '../../lib/waAnalytics'
import WACampaignDashboard from '../../components/wa/WACampaignDashboard'
import WAFilters from '../../components/wa/WAFilters'

export default function CampaignAnalyticsPage({ theme, isAdmin, dataMasked }) {
  const [rawDocs, setRawDocs]   = useState([])
  const [error, setError]       = useState(null)
  const [filters, setFilters]   = useState({ templateName: '', eventType: '', startDate: '', endDate: '' })

  useEffect(() => {
    const unsub = subscribeWhatsAppWebhooks((data, err) => {
      if (err) setError(err.message)
      else { setError(null); setRawDocs(data) }
    })
    return () => unsub()
  }, [])

  // Only campaign events on this page
  const campaignDocs = useMemo(() => rawDocs.filter((d) => eventSource(d) === 'campaign'), [rawDocs])

  const filterOptions = useMemo(() => getFilterOptions(campaignDocs), [campaignDocs])
  const docs          = useMemo(() => applyFilters(campaignDocs, filters), [campaignDocs, filters])
  const data          = useMemo(() => aggregateCampaignEvents(docs), [docs])

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Live badge */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Real-time updates · {campaignDocs.length} campaign events · {data.campaignCount} campaigns
        </span>
      </div>

      <WAFilters filters={filters} setFilters={setFilters} options={filterOptions} theme={theme} />

      {error && (
        <div className="p-4 bg-rose-100 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700 rounded-xl text-rose-800 dark:text-rose-200 text-sm">
          {error}
        </div>
      )}

      <WACampaignDashboard data={data} theme={theme} isAdmin={isAdmin} dataMasked={dataMasked} />
    </div>
  )
}
