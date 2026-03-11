'use client'

import { useEffect, useState, useMemo } from 'react'
import { subscribeWhatsAppWebhooks, applyFilters } from '../../../src/lib/firebase'
import { aggregateWebhooks, aggregateByCampaign, getFilterOptions, eventSource } from '../../../src/lib/waAnalytics'
import { useAuth } from '../../providers'
import { useTheme } from '../../providers'
import WAKpiCards from '../../../src/components/wa/WAKpiCards'
import WATemplatePerformanceTable from '../../../src/components/wa/WATemplatePerformanceTable'
import WATemplatePerformanceChart from '../../../src/components/wa/WATemplatePerformanceChart'
import WAMessageFunnelChart from '../../../src/components/wa/WAMessageFunnelChart'
import WACTAPerformanceTable from '../../../src/components/wa/WACTAPerformanceTable'
import WACostAnalytics from '../../../src/components/wa/WACostAnalytics'
import WAUserActivityTimeline from '../../../src/components/wa/WAUserActivityTimeline'
import WAFilters from '../../../src/components/wa/WAFilters'
import WACampaignManager from '../../../src/components/wa/WACampaignManager'
import WACampaignAnalytics from '../../../src/components/wa/WACampaignAnalytics'
import WAEngagementSection from '../../../src/components/wa/WAEngagementSection'

function loadCampaigns() {
  try {
    const raw = localStorage.getItem('wa_campaigns')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}
function saveCampaigns(c) {
  try { localStorage.setItem('wa_campaigns', JSON.stringify(c)) } catch {}
}

export default function WAApiPage() {
  const { isAdmin, dataMasked } = useAuth()
  const { theme } = useTheme()
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

  useEffect(() => {
    const unsub = subscribeWhatsAppWebhooks((data, err) => {
      if (err) setError(err.message)
      else { setError(null); setRawDocs(data) }
    })
    return () => unsub()
  }, [])

  const apiDocs = useMemo(() => rawDocs.filter((d) => eventSource(d) === 'api'), [rawDocs])
  const filterOptions = useMemo(() => getFilterOptions(apiDocs), [apiDocs])
  const docs = useMemo(() => applyFilters(apiDocs, filters), [apiDocs, filters])
  const { kpi, funnel, templateRows, ctaRows, byPhone, engagementRows, costPerClick, totalCost } = useMemo(() => aggregateWebhooks(docs), [docs])
  const campaignData = useMemo(() => aggregateByCampaign(apiDocs, campaigns), [apiDocs, campaigns])

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">Real-time updates · {apiDocs.length} API events · {docs.length} filtered</span>
      </div>

      <WAFilters filters={filters} setFilters={setFilters} options={filterOptions} theme={theme} />

      {error && (
        <div className="p-4 bg-rose-100 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700 rounded-xl text-rose-800 dark:text-rose-200 text-sm">{error}</div>
      )}

      <WAKpiCards kpi={kpi} theme={theme} />
      <WATemplatePerformanceTable rows={templateRows} ctaRows={ctaRows} theme={theme} dataMasked={dataMasked} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WATemplatePerformanceChart rows={templateRows} theme={theme} />
        <WAMessageFunnelChart funnel={funnel} theme={theme} />
      </div>

      <WACTAPerformanceTable rows={ctaRows} theme={theme} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <WACampaignManager campaigns={campaigns} setCampaigns={setCampaigns} templateNames={filterOptions.templateNames} theme={theme} />
        </div>
        <div className="lg:col-span-2">
          <WACampaignAnalytics campaignData={campaignData} theme={theme} />
        </div>
      </div>

      <WACostAnalytics templateRows={templateRows} totalCost={totalCost} costPerClick={costPerClick} clicked={kpi.clicked} theme={theme} />
      <WAEngagementSection engagementRows={engagementRows} theme={theme} dataMasked={dataMasked} />
      <WAUserActivityTimeline byPhone={byPhone} theme={theme} isAdmin={isAdmin} dataMasked={dataMasked} />
    </div>
  )
}
