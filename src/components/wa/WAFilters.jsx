const EVENT_LABELS = {
  message_api_sent:      'Message Sent',
  message_api_delivered: 'Message Delivered',
  message_api_read:      'Message Read',
  message_api_clicked:   'Message Clicked',
  message_api_failed:    'Message Failed',
  message_status_sent:      'Message Sent',
  message_status_delivered: 'Message Delivered',
  message_status_read:      'Message Read',
  message_status_clicked:   'Message Clicked',
  message_status_failed:    'Message Failed',
}

function friendlyEvent(raw) {
  if (!raw) return raw
  if (EVENT_LABELS[raw]) return EVENT_LABELS[raw]
  // fallback: turn underscores to spaces + title-case
  return raw
    .replace(/^message_(api|status)_/, 'Message ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function WAFilters({ filters, setFilters, options, theme }) {
  const isDark = theme === 'dark'
  const inputClass = `w-full rounded-lg border px-3 py-2 text-sm ${
    isDark ? 'bg-slate-800 border-slate-600 text-slate-100 placeholder-slate-400' : 'bg-white border-slate-200 text-slate-900'
  }`
  const labelClass = 'block text-xs font-medium mb-1 ' + (isDark ? 'text-slate-400' : 'text-slate-500')

  return (
    <div className={`rounded-xl border p-4 ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
      <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Filters</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className={labelClass}>Template name</label>
          <select
            value={filters.templateName}
            onChange={(e) => setFilters((f) => ({ ...f, templateName: e.target.value }))}
            className={inputClass}
          >
            <option value="">All templates</option>
            {options.templateNames?.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Event type</label>
          <select
            value={filters.eventType}
            onChange={(e) => setFilters((f) => ({ ...f, eventType: e.target.value }))}
            className={inputClass}
          >
            <option value="">All events</option>
            {options.eventTypes?.map((e) => (
              <option key={e} value={e}>{friendlyEvent(e)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Start date</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>End date</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  )
}
