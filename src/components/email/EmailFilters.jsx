export default function EmailFilters({ filters, setFilters, options, theme }) {
  const isDark = theme === 'dark'

  const inputCls = `w-full rounded-lg border px-3 py-2 text-sm ${
    isDark
      ? 'bg-slate-800 border-slate-600 text-slate-100 placeholder-slate-500'
      : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
  }`
  const labelCls = `block text-[11px] font-medium uppercase tracking-wide mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`

  function reset() {
    setFilters({ subject: '', eventType: '', email: '', startDate: '', endDate: '' })
  }

  const hasActive = Object.values(filters).some((v) => v !== '')

  return (
    <div className={`rounded-xl border p-4 ${isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Filters
        </h3>
        {hasActive && (
          <button
            onClick={reset}
            className={`text-[11px] font-medium px-2 py-1 rounded-lg transition-colors ${isDark ? 'text-rose-400 hover:bg-slate-700' : 'text-rose-500 hover:bg-rose-50'}`}
          >
            Clear all
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Subject / Campaign */}
        <div className="lg:col-span-2">
          <label className={labelCls}>Subject / Campaign</label>
          <select
            value={filters.subject}
            onChange={(e) => setFilters((f) => ({ ...f, subject: e.target.value }))}
            className={inputCls}
          >
            <option value="">All subjects</option>
            {options.subjects.map((s) => (
              <option key={s} value={s}>{s.length > 60 ? s.slice(0, 60) + '…' : s}</option>
            ))}
          </select>
        </div>

        {/* Event type */}
        <div>
          <label className={labelCls}>Event type</label>
          <select
            value={filters.eventType}
            onChange={(e) => setFilters((f) => ({ ...f, eventType: e.target.value }))}
            className={inputCls}
          >
            <option value="">All events</option>
            {options.eventTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Start date */}
        <div>
          <label className={labelCls}>From</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
            className={inputCls}
          />
        </div>

        {/* End date */}
        <div>
          <label className={labelCls}>To</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
            className={inputCls}
          />
        </div>
      </div>
    </div>
  )
}
