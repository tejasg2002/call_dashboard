'use client'

import { cn } from '../../lib/utils'

const CARDS = [
  {
    key: 'sent',
    label: 'Sent',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
      </svg>
    ),
    color: 'blue',
  },
  {
    key: 'delivered',
    label: 'Delivered',
    rateKey: 'deliveryRate',
    rateLabel: 'Delivery rate',
    color: 'brand',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: 'opened',
    label: 'Opened',
    rateKey: 'openRate',
    rateLabel: 'Open rate',
    color: 'brand',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
  },
  {
    key: 'clicked',
    label: 'Clicked',
    rateKey: 'clickRate',
    rateLabel: 'Click rate',
    color: 'amber',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
      </svg>
    ),
  },
  {
    key: 'bounced',
    label: 'Bounced',
    rateKey: 'bounceRate',
    rateLabel: 'Bounce rate',
    color: 'red',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
      </svg>
    ),
  },
  {
    key: 'complained',
    label: 'Complaints',
    color: 'red',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
]

const ICON_STYLES = {
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  red: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400',
}

const VALUE_STYLES = {
  brand: 'text-brand-700 dark:text-brand-400',
  blue: 'text-blue-600 dark:text-blue-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-500 dark:text-red-400',
}

export default function EmailKpiCards({ kpi, theme, uniqueClicked }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
      {CARDS.map((c) => {
        const val = kpi[c.key] ?? 0
        const rate = c.rateKey ? (kpi[c.rateKey] ?? 0) : null

        return (
          <div
            key={c.key}
            className={cn(
              "rounded-xl border p-4 transition-all duration-200",
              "bg-white dark:bg-slate-900/60",
              "border-slate-200/80 dark:border-slate-800",
              "hover:shadow-card-hover hover:border-slate-300 dark:hover:border-slate-700"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", ICON_STYLES[c.color])}>
                {c.icon}
              </div>
              {rate !== null && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {rate.toFixed(1)}%
                </span>
              )}
            </div>
            <p className={cn("text-xl font-bold font-mono tracking-tight", VALUE_STYLES[c.color])}>
              {val.toLocaleString('en-IN')}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium">{c.label}</p>
            {c.key === 'clicked' && uniqueClicked > 0 && (
              <p className="text-[10px] text-amber-500/80 dark:text-amber-400/70 mt-0.5 font-medium">
                {uniqueClicked.toLocaleString('en-IN')} unique users
              </p>
            )}
            {rate !== null && (
              <p className="text-[10px] text-slate-400/70 dark:text-slate-600 mt-0.5">{c.rateLabel}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
