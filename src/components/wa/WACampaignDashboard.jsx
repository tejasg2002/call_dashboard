'use client'

import { useState } from 'react'
import WAKpiCards from './WAKpiCards'
import WATemplatePerformanceTable from './WATemplatePerformanceTable'
import WAUserActivityTimeline from './WAUserActivityTimeline'

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  })
}

function StatPill({ label, value, color }) {
  const colors = {
    blue:    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700/50',
    brand: 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-900/30 dark:text-brand-300 dark:border-brand-700/50',
    brand:  'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-900/30 dark:text-brand-300 dark:border-brand-700/50',
    amber:   'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/50',
    rose:    'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700/50',
    indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700/50',
  }
  return (
    <span className={`inline-flex flex-col items-center px-3 py-1.5 rounded-xl border text-center min-w-[64px] ${colors[color] || colors.blue}`}>
      <span className="text-[11px] font-bold leading-tight">{value}</span>
      <span className="text-[10px] opacity-70 mt-0.5">{label}</span>
    </span>
  )
}

// ── Campaign row card ─────────────────────────────────────────────────────────
const CAMPAIGN_COLORS = [
  'bg-brand-500', 'bg-blue-500', 'bg-brand-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500',
]

function CampaignCard({ campaign, index, theme, dataMasked }) {
  const [expanded, setExpanded] = useState(false)
  const isDark = theme === 'dark'
  const { kpi } = campaign
  const barColor = CAMPAIGN_COLORS[index % CAMPAIGN_COLORS.length]

  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
      {/* Color bar + header */}
      <div className="flex items-stretch">
        <div className={`w-1.5 shrink-0 ${barColor}`} />
        <div className="flex-1 px-4 py-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            {/* Left: name + meta */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className={`text-sm font-bold truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {campaign.name}
                </p>
                {campaign.id && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                    {campaign.id}
                  </span>
                )}
              </div>
              <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {campaign.templateCount} template{campaign.templateCount !== 1 ? 's' : ''}
                {campaign.firstSent && ` · ${fmtDate(campaign.firstSent)} → ${fmtDate(campaign.lastEvent)}`}
              </p>
            </div>

            {/* Right: stat pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <StatPill label="Sent"      value={kpi.sent.toLocaleString()}      color="blue" />
              <StatPill label="Delivered" value={kpi.delivered.toLocaleString()} color="brand" />
              <StatPill label="Read"      value={kpi.read.toLocaleString()}       color="brand" />
              <StatPill label="Clicked"   value={kpi.clicked.toLocaleString()}    color="amber" />
              {kpi.failed > 0 && (
                <StatPill label="Failed" value={kpi.failed.toLocaleString()} color="rose" />
              )}
              <StatPill label="CTR"  value={`${kpi.ctr.toFixed(1)}%`}  color="indigo" />
              <StatPill label="Cost" value={`₹${kpi.cost.toFixed(2)}`} color="indigo" />
            </div>
          </div>

          {/* Rate bar */}
          <div className="mt-2.5 flex items-center gap-3 flex-wrap">
            {[
              { label: 'STD', value: kpi.sdr,      color: 'bg-brand-500' },
              { label: 'STR', value: kpi.str,       color: 'bg-brand-500' },
              { label: 'DTR', value: kpi.readRate,  color: 'bg-cyan-500' },
              { label: 'CTR', value: kpi.ctr,       color: 'bg-amber-500' },
            ].map((r) => (
              <div key={r.label} className="flex items-center gap-1.5 min-w-[100px]">
                <span className={`text-[10px] font-semibold w-7 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{r.label}</span>
                <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-100'}`}>
                  <div className={`h-full rounded-full ${r.color}`} style={{ width: `${Math.min(r.value, 100)}%` }} />
                </div>
                <span className={`text-[10px] w-8 text-right ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{r.value.toFixed(1)}%</span>
              </div>
            ))}
          </div>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className={`mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors
              ${isDark ? 'border-slate-600 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
          >
            {expanded ? 'Hide' : 'Show'} template breakdown
            <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded: template table + timeline */}
      {expanded && (
        <div className={`border-t px-4 py-4 space-y-4 ${isDark ? 'border-slate-700 bg-slate-900/40' : 'border-slate-100 bg-slate-50/60'}`}>
          <WATemplatePerformanceTable
            rows={campaign.templateRows}
            ctaRows={campaign.ctaRows}
            theme={theme}
            dataMasked={dataMasked}
          />
          {campaign.byPhone.length > 0 && (
            <WAUserActivityTimeline
              byPhone={campaign.byPhone}
              theme={theme}
              dataMasked={dataMasked}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ isDark }) {
  return (
    <div className={`rounded-xl border p-12 text-center ${isDark ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-white'}`}>
      <div className="text-4xl mb-3">📣</div>
      <p className={`text-sm font-semibold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>No campaign events yet</p>
      <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
        Campaign events (<code className="font-mono">message_campaign_*</code>) will appear here once Interakt sends them.
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WACampaignDashboard({ data, theme, isAdmin, dataMasked }) {
  const isDark = theme === 'dark'
  const { campaigns, totalKpi, allByPhone, campaignCount } = data

  return (
    <div className="space-y-6">
      {/* Overall KPIs */}
      {campaignCount > 0 && (
        <>
          {/* Summary header */}
          <div className={`rounded-xl border px-4 py-3 flex items-center justify-between flex-wrap gap-2 ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
            <div>
              <p className={`text-sm font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                {campaignCount} Campaign{campaignCount !== 1 ? 's' : ''}
              </p>
              <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                Combined stats across all campaigns
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <StatPill label="Total Sent"      value={totalKpi.sent.toLocaleString()}       color="blue" />
              <StatPill label="Total Delivered" value={totalKpi.delivered.toLocaleString()}  color="brand" />
              <StatPill label="Total Read"      value={totalKpi.read.toLocaleString()}        color="brand" />
              <StatPill label="Total Clicked"   value={totalKpi.clicked.toLocaleString()}     color="amber" />
              <StatPill label="Overall CTR"     value={`${totalKpi.ctr.toFixed(1)}%`}         color="indigo" />
              <StatPill label="Total Cost"      value={`₹${totalKpi.cost.toFixed(2)}`}        color="indigo" />
            </div>
          </div>

          {/* Per-campaign KPIs */}
          <WAKpiCards kpi={totalKpi} theme={theme} />
        </>
      )}

      {/* Campaign cards */}
      {campaignCount === 0 ? (
        <EmptyState isDark={isDark} />
      ) : (
        <div className="space-y-4">
          <p className={`text-xs font-semibold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Campaigns — click to expand template breakdown
          </p>
          {campaigns.map((c, i) => (
            <CampaignCard
              key={c.name}
              campaign={c}
              index={i}
              theme={theme}
              dataMasked={dataMasked}
            />
          ))}
        </div>
      )}

      {/* Combined user activity timeline */}
      {allByPhone.length > 0 && (
        <div className="space-y-2">
          <p className={`text-xs font-semibold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            All campaign user activity
          </p>
          <WAUserActivityTimeline
            byPhone={allByPhone}
            theme={theme}
            isAdmin={isAdmin}
            dataMasked={dataMasked}
          />
        </div>
      )}
    </div>
  )
}
