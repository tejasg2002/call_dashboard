const CARDS = [
  {
    key: 'sent',
    label: 'Sent',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    ),
    color:      'text-blue-500',
    lightBg:    'bg-blue-50 border-blue-200',
    darkBg:     'bg-blue-900/20 border-blue-800/50',
  },
  {
    key: 'delivered',
    label: 'Delivered',
    rateKey: 'deliveryRate',
    rateLabel: 'Delivery rate',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color:   'text-emerald-500',
    lightBg: 'bg-emerald-50 border-emerald-200',
    darkBg:  'bg-emerald-900/20 border-emerald-800/50',
  },
  {
    key: 'opened',
    label: 'Opened',
    rateKey: 'openRate',
    rateLabel: 'Open rate',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    color:   'text-violet-500',
    lightBg: 'bg-violet-50 border-violet-200',
    darkBg:  'bg-violet-900/20 border-violet-800/50',
  },
  {
    key: 'clicked',
    label: 'Clicked',
    rateKey: 'clickRate',
    rateLabel: 'Click rate',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
      </svg>
    ),
    color:   'text-amber-500',
    lightBg: 'bg-amber-50 border-amber-200',
    darkBg:  'bg-amber-900/20 border-amber-800/50',
  },
  {
    key: 'bounced',
    label: 'Bounced',
    rateKey: 'bounceRate',
    rateLabel: 'Bounce rate',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
      </svg>
    ),
    color:   'text-rose-500',
    lightBg: 'bg-rose-50 border-rose-200',
    darkBg:  'bg-rose-900/20 border-rose-800/50',
  },
  {
    key: 'complained',
    label: 'Complaints',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    color:   'text-orange-500',
    lightBg: 'bg-orange-50 border-orange-200',
    darkBg:  'bg-orange-900/20 border-orange-800/50',
  },
]

export default function EmailKpiCards({ kpi, theme }) {
  const isDark = theme === 'dark'
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {CARDS.map((c) => {
        const val  = kpi[c.key]  ?? 0
        const rate = c.rateKey ? (kpi[c.rateKey] ?? 0) : null
        return (
          <div
            key={c.key}
            className={`rounded-xl border p-4 ${isDark ? c.darkBg : c.lightBg}`}
          >
            <div className={`flex items-center justify-between mb-3 ${c.color}`}>
              {c.icon}
              {rate !== null && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-white/80 text-slate-600'}`}>
                  {rate.toFixed(1)}%
                </span>
              )}
            </div>
            <p className={`text-2xl font-bold tracking-tight ${c.color}`}>{val.toLocaleString()}</p>
            <p className={`text-xs mt-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{c.label}</p>
            {rate !== null && (
              <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>{c.rateLabel}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
