'use client'

import { cn } from '../../lib/utils'

const METRICS = [
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
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'brand',
  },
  {
    key: 'sdr',
    label: 'Delivery Rate',
    format: 'percent',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
      </svg>
    ),
    color: 'brand',
  },
  {
    key: 'read',
    label: 'Read',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    color: 'brand',
  },
  {
    key: 'readRate',
    label: 'Read Rate',
    format: 'percent',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
      </svg>
    ),
    color: 'brand',
  },
  {
    key: 'clicked',
    label: 'Clicked',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
      </svg>
    ),
    color: 'amber',
  },
  {
    key: 'formSubmitted',
    label: 'Form Submitted',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    color: 'amber',
  },
  {
    key: 'ctr',
    label: 'CTR',
    format: 'percent',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
      </svg>
    ),
    color: 'amber',
  },
  {
    key: 'failed',
    label: 'Failed',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
    color: 'red',
  },
  {
    key: 'failureRate',
    label: 'Failure Rate',
    format: 'percent',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    ),
    color: 'red',
  },
  {
    key: 'cost',
    label: 'Spend',
    format: 'currency',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'slate',
  },
  {
    key: 'costPerClick',
    label: 'Cost / Click',
    format: 'currency',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
    color: 'slate',
  },
]

const ICON_STYLES = {
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  red: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

const VALUE_STYLES = {
  brand: 'text-brand-700 dark:text-brand-400',
  blue: 'text-blue-600 dark:text-blue-400',
  amber: 'text-amber-600 dark:text-amber-400',
  red: 'text-red-500 dark:text-red-400',
  slate: 'text-slate-700 dark:text-slate-300',
}

function fmt(v, format) {
  if (format === 'currency') return typeof v === 'number' ? `₹${v.toFixed(2)}` : '₹0.00'
  if (format === 'percent') return typeof v === 'number' ? `${v.toFixed(1)}%` : '0.0%'
  return typeof v === 'number' ? v.toLocaleString('en-IN') : '0'
}

export default function WAKpiCards({ kpi, theme }) {
  const volumeMetrics = METRICS.filter((m) => !m.format)
  const rateMetrics = METRICS.filter((m) => m.format)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {volumeMetrics.map((m) => (
          <div
            key={m.key}
            className={cn(
              "rounded-xl border p-4 transition-all duration-200",
              "bg-white dark:bg-slate-900/60",
              "border-slate-200/80 dark:border-slate-800",
              "hover:shadow-card-hover hover:border-slate-300 dark:hover:border-slate-700"
            )}
          >
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-3", ICON_STYLES[m.color])}>
              {m.icon}
            </div>
            <p className={cn("text-xl font-bold font-mono tracking-tight", VALUE_STYLES[m.color])}>
              {fmt(kpi[m.key], m.format)}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium">{m.label}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {rateMetrics.map((m) => (
          <div
            key={m.key}
            className={cn(
              "rounded-xl border p-4 transition-all duration-200",
              "bg-white dark:bg-slate-900/60",
              "border-slate-200/80 dark:border-slate-800",
              "hover:shadow-card-hover hover:border-slate-300 dark:hover:border-slate-700"
            )}
          >
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-3", ICON_STYLES[m.color])}>
              {m.icon}
            </div>
            <p className={cn("text-xl font-bold font-mono tracking-tight", VALUE_STYLES[m.color])}>
              {fmt(kpi[m.key], m.format)}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
