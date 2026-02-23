const LeadProfile = ({ lead, onClose }) => {
  if (!lead) return null

  const getTagStyles = (tag) => {
    if (tag === 'Hot') return 'bg-rose-100 text-rose-700 border-rose-200'
    if (tag === 'Warm') return 'bg-amber-100 text-amber-700 border-amber-200'
    return 'bg-slate-100 text-slate-700 border-slate-200'
  }

  const activities = Array.isArray(lead.activity_performed) ? lead.activity_performed : []

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden h-full flex flex-col shadow-sm sticky top-4 max-h-[calc(100vh-6rem)]">
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <h2 className="text-lg font-semibold text-slate-900">Lead Profile</h2>
        <button
          type="button"
          onClick={onClose}
          className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Profile info */}
        <div className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg uppercase shadow-sm">
              {(lead.name || '?').charAt(0)}
            </div>
            <div className="space-y-1 min-w-0">
              <h3 className="text-slate-900 font-semibold truncate">{lead.name || '—'}</h3>
              <p className="text-slate-500 text-sm truncate">{lead.email || '—'}</p>
              {lead.lead_id && (
                <p className="text-xs text-slate-500 font-mono truncate" title={lead.lead_id}>
                  <span className="uppercase tracking-wide text-slate-400">Lead ID: </span>
                  {lead.lead_id}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Mobile</span>
              <span className="text-slate-900 font-medium">{lead.mobile ?? '—'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">City</span>
              <span className="text-slate-900">{lead.city === 'City Not Available' ? '—' : (lead.city ?? '—')}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">State</span>
              <span className="text-slate-900">{lead.state ?? '—'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Tag</span>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-md border ${getTagStyles(lead.tag)}`}>
                {lead.tag ?? '—'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Lead Stage</span>
              <span className="text-slate-900">{lead.lead_stage ?? '—'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Publisher</span>
              <span className="text-slate-900">{lead.publishername ?? '—'}</span>
            </div>
          </div>
        </div>

        {/* Activities */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Activity</h4>
          {activities.length === 0 ? (
            <p className="text-slate-500 text-sm">No activity recorded.</p>
          ) : (
            <ul className="space-y-3 list-none p-0 m-0">
              {activities.map((entry, idx) => {
                const text = String(entry).trim()
                if (!text) return null
                return (
                  <li
                    key={idx}
                    className="flex gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 text-sm text-slate-700"
                  >
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-violet-400 mt-1.5" aria-hidden />
                    <span className="min-w-0">{text}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

export default LeadProfile
