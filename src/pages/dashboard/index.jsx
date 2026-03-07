import { useEffect, useState, useMemo } from 'react'
import { subscribeWhatsAppWebhooks, applyFilters } from '../../lib/firebase'
import { aggregateWebhooks, aggregateByCampaign, getFilterOptions } from '../../lib/waAnalytics'
import WAKpiCards from '../../components/wa/WAKpiCards'
import WATemplatePerformanceTable from '../../components/wa/WATemplatePerformanceTable'
import WATemplatePerformanceChart from '../../components/wa/WATemplatePerformanceChart'
import WAMessageFunnelChart from '../../components/wa/WAMessageFunnelChart'
import WACTAPerformanceTable from '../../components/wa/WACTAPerformanceTable'
import WACostAnalytics from '../../components/wa/WACostAnalytics'
import WAUserActivityTimeline from '../../components/wa/WAUserActivityTimeline'
import WAFilters from '../../components/wa/WAFilters'
import WACampaignManager from '../../components/wa/WACampaignManager'
import WACampaignAnalytics from '../../components/wa/WACampaignAnalytics'
import WAEngagementSection from '../../components/wa/WAEngagementSection'

function loadCampaigns() {
  try {
    const raw = localStorage.getItem('wa_campaigns')
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}
function saveCampaigns(c) {
  try { localStorage.setItem('wa_campaigns', JSON.stringify(c)) } catch {}
}

export default function WhatsAppDashboard({ theme, isAdmin, dataMasked }) {
  const [rawDocs, setRawDocs] = useState([])
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ templateName: '', eventType: '', startDate: '', endDate: '' })
  const [campaigns, _setCampaigns] = useState(loadCampaigns)

  function setCampaigns(updater) {
    _setCampaigns((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveCampaigns(next)
      return next
    })
  }

  // Single subscription — no Firestore filters; all filtering done in-memory below
  useEffect(() => {
    const unsub = subscribeWhatsAppWebhooks((data, err) => {
      if (err) setError(err.message)
      else { setError(null); setRawDocs(data) }
    })
    return () => unsub()
  }, [])

  // Filter options always come from the full unfiltered dataset → dropdown never loses options
  const filterOptions = useMemo(() => getFilterOptions(rawDocs), [rawDocs])

  // Active filters applied in-memory
  const docs = useMemo(() => applyFilters(rawDocs, filters), [rawDocs, filters])

  const { kpi, funnel, templateRows, ctaRows, byPhone, engagementRows, costPerClick, totalCost } = useMemo(
    () => aggregateWebhooks(docs), [docs]
  )
  const campaignData = useMemo(
    () => aggregateByCampaign(rawDocs, campaigns), [rawDocs, campaigns]
  )

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Live badge */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">Real-time updates from Firestore · {rawDocs.length} total · {docs.length} filtered</span>
      </div>

      <WAFilters filters={filters} setFilters={setFilters} options={filterOptions} theme={theme} />

      {error && (
        <div className="p-4 bg-rose-100 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700 rounded-xl text-rose-800 dark:text-rose-200 text-sm">
          {error}
        </div>
      )}

      {/* KPI */}
      <WAKpiCards kpi={kpi} theme={theme} />

      {/* Template performance + preview */}
      <WATemplatePerformanceTable rows={templateRows} ctaRows={ctaRows} theme={theme} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WATemplatePerformanceChart rows={templateRows} theme={theme} />
        <WAMessageFunnelChart funnel={funnel} theme={theme} />
      </div>

      {/* Button / CTA performance (expandable per-link) */}
      <WACTAPerformanceTable rows={ctaRows} theme={theme} />

      {/* Campaign grouping */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <WACampaignManager
            campaigns={campaigns}
            setCampaigns={setCampaigns}
            templateNames={filterOptions.templateNames}
            theme={theme}
          />
        </div>
        <div className="lg:col-span-2">
          <WACampaignAnalytics campaignData={campaignData} theme={theme} />
        </div>
      </div>

      {/* Cost analytics */}
      <WACostAnalytics
        templateRows={templateRows}
        totalCost={totalCost}
        costPerClick={costPerClick}
        clicked={kpi.clicked}
        theme={theme}
      />

      {/* User Engagement */}
      <WAEngagementSection engagementRows={engagementRows} theme={theme} dataMasked={dataMasked} />

      {/* User activity timeline */}
      <WAUserActivityTimeline byPhone={byPhone} theme={theme} isAdmin={isAdmin} dataMasked={dataMasked} />
    </div>
  )
}
