// Row 1: counts  Row 2: rates
const countCards = [
  { key: 'sent',      label: 'Total Sent',      color: 'blue' },
  { key: 'delivered', label: 'Total Delivered',  color: 'emerald' },
  { key: 'read',      label: 'Total Read',       color: 'violet' },
  { key: 'clicked',   label: 'Total Clicked',    color: 'amber' },
  { key: 'failed',    label: 'Total Failed',     color: 'rose' },
  { key: 'cost',      label: 'Campaign Cost',    color: 'slate', format: 'currency' },
]

const rateCards = [
  { key: 'sdr',      label: 'STD (Sent → Delivered)',  color: 'emerald', format: 'percent', desc: 'Delivered / Sent' },
  { key: 'str',      label: 'STR (Sent → Read)',        color: 'violet',  format: 'percent', desc: 'Read / Sent' },
  { key: 'readRate', label: 'DTR (Delivered → Read)',   color: 'cyan',    format: 'percent', desc: 'Read / Delivered' },
  { key: 'ctr',      label: 'CTR (Click Through)',      color: 'indigo',  format: 'percent', desc: 'Clicked / Delivered' },
]

const colorMap = {
  blue:    { border: 'border-blue-500/40',    text: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-500/5 dark:bg-blue-500/10' },
  emerald: { border: 'border-emerald-500/40', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/5 dark:bg-emerald-500/10' },
  violet:  { border: 'border-violet-500/40',  text: 'text-violet-600 dark:text-violet-400',   bg: 'bg-violet-500/5 dark:bg-violet-500/10' },
  amber:   { border: 'border-amber-500/40',   text: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-500/5 dark:bg-amber-500/10' },
  rose:    { border: 'border-rose-500/40',    text: 'text-rose-600 dark:text-rose-400',       bg: 'bg-rose-500/5 dark:bg-rose-500/10' },
  slate:   { border: 'border-slate-400/40',   text: 'text-slate-600 dark:text-slate-300',     bg: 'bg-slate-500/5 dark:bg-slate-500/10' },
  indigo:  { border: 'border-indigo-500/40',  text: 'text-indigo-600 dark:text-indigo-400',   bg: 'bg-indigo-500/5 dark:bg-indigo-500/10' },
  cyan:    { border: 'border-cyan-500/40',    text: 'text-cyan-600 dark:text-cyan-400',       bg: 'bg-cyan-500/5 dark:bg-cyan-500/10' },
}

function fmt(kpi, key, format) {
  const v = kpi[key]
  if (format === 'currency') return typeof v === 'number' ? `₹${v.toFixed(2)}` : '₹0.00'
  if (format === 'percent')  return typeof v === 'number' ? `${v.toFixed(1)}%` : '0.0%'
  return typeof v === 'number' ? v.toLocaleString() : (v ?? '0')
}

function KpiCard({ label, value, color, desc, cardBg, isDark }) {
  const c = colorMap[color]
  return (
    <div className={`rounded-xl border-l-4 p-3 ${cardBg} ${c.border} ${c.bg}`}>
      <p className={`text-[11px] font-medium leading-tight ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
      <p className={`mt-1 text-xl font-bold ${c.text}`}>{value}</p>
      {desc && <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>{desc}</p>}
    </div>
  )
}

export default function WAKpiCards({ kpi, theme }) {
  const isDark = theme === 'dark'
  const cardBg = isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow-sm'

  return (
    <div className="space-y-3">
      {/* Row 1: counts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {countCards.map(({ key, label, color, format }) => (
          <KpiCard key={key} label={label} value={fmt(kpi, key, format)} color={color} cardBg={cardBg} isDark={isDark} />
        ))}
      </div>
      {/* Row 2: rates */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {rateCards.map(({ key, label, color, format, desc }) => (
          <KpiCard key={key} label={label} value={fmt(kpi, key, format)} color={color} desc={desc} cardBg={cardBg} isDark={isDark} />
        ))}
      </div>
    </div>
  )
}
