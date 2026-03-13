'use client'

const METRICS = [
  {
    key: 'sent',
    label: 'Sent',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
      </svg>
    ),
    accent: { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400', icon: 'text-blue-500 dark:text-blue-400', ring: 'ring-blue-500/20' },
  },
  {
    key: 'delivered',
    label: 'Delivered',
    rateKey: 'sdr',
    rateLabel: 'of sent',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    accent: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', icon: 'text-emerald-500 dark:text-emerald-400', ring: 'ring-emerald-500/20' },
  },
  {
    key: 'read',
    label: 'Read',
    rateKey: 'readRate',
    rateLabel: 'of delivered',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    accent: { bg: 'bg-violet-50 dark:bg-violet-500/10', text: 'text-violet-600 dark:text-violet-400', icon: 'text-violet-500 dark:text-violet-400', ring: 'ring-violet-500/20' },
  },
  {
    key: 'clicked',
    label: 'Clicked',
    rateKey: 'ctr',
    rateLabel: 'CTR',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
      </svg>
    ),
    accent: { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', icon: 'text-amber-500 dark:text-amber-400', ring: 'ring-amber-500/20' },
  },
  {
    key: 'failed',
    label: 'Failed',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
    accent: { bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400', icon: 'text-rose-500 dark:text-rose-400', ring: 'ring-rose-500/20' },
  },
  {
    key: 'cost',
    label: 'Spend',
    format: 'currency',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    accent: { bg: 'bg-slate-50 dark:bg-slate-500/10', text: 'text-slate-700 dark:text-slate-300', icon: 'text-slate-500 dark:text-slate-400', ring: 'ring-slate-500/20' },
  },
]

function fmt(v, format) {
  if (format === 'currency') return typeof v === 'number' ? `₹${v.toFixed(2)}` : '₹0.00'
  return typeof v === 'number' ? v.toLocaleString('en-IN') : '0'
}

export default function WAKpiCards({ kpi, theme }) {
  const isDark = theme === 'dark'

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {METRICS.map((m) => {
        const val = kpi[m.key]
        const rate = m.rateKey ? kpi[m.rateKey] : null

        return (
          <div
            key={m.key}
            className={`relative rounded-2xl p-4 ring-1 transition-shadow hover:shadow-md ${m.accent.bg} ${m.accent.ring} ${isDark ? 'ring-white/5' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className={`${m.accent.icon}`}>{m.icon}</span>
              {rate != null && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${m.accent.bg} ${m.accent.text}`}>
                  {typeof rate === 'number' ? rate.toFixed(1) : '0.0'}%
                </span>
              )}
            </div>
            <p className={`text-2xl font-bold tracking-tight ${m.accent.text}`}>
              {fmt(val, m.format)}
            </p>
            <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
              {m.label}
              {rate != null && m.rateLabel && (
                <span className="opacity-60"> · {m.rateLabel}</span>
              )}
            </p>
          </div>
        )
      })}
    </div>
  )
}
