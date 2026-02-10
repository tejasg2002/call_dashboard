const LeadDetail = ({ call, onClose }) => {
  if (!call) return null

  const getScoreColor = (score) => {
    if (score >= 70) return 'text-emerald-600'
    if (score >= 40) return 'text-amber-600'
    return 'text-rose-600'
  }

  const getConfidenceColor = (confidence) => {
    if (confidence === 'high') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    if (confidence === 'medium') return 'bg-amber-50 text-amber-700 border-amber-200'
    return 'bg-rose-50 text-rose-700 border-rose-200'
  }

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  const getCallDateLabel = () => {
    const raw =
      call.Date ||
      call.date ||
      call.call_timestamp ||
      call.created_at ||
      call.createdAt ||
      call.call_date ||
      call.callDate ||
      null
    if (!raw) return null
    const date = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    })
  }

  const callDateLabel = getCallDateLabel()

  const normalizeSummaryList = (value) => {
    if (!value) return []
    if (Array.isArray(value)) return value
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden h-full flex flex-col shadow-sm sticky top-4 max-h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <h2 className="text-lg font-semibold text-slate-900">Lead Details</h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Lead Info */}
        <div className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg uppercase shadow-sm">
              {call.Name?.charAt(0) || '?'}
            </div>
            <div className="space-y-1">
              <h3 className="text-slate-900 font-semibold capitalize">{call.Name || 'Unknown'}</h3>
              <p className="text-slate-500 text-sm">{call.City}, {call.State}</p>
              {call.Lead_id && (
                <p className="text-xs text-slate-500 font-mono">
                  <span className="uppercase tracking-wide text-slate-400">Lead ID:&nbsp;</span>
                  <span className="text-slate-700">{call.Lead_id}</span>
                </p>
              )}
              {callDateLabel && (
                <p className="text-xs text-slate-500">
                  <span className="uppercase tracking-wide text-slate-400">
                    Call Date:&nbsp;
                  </span>
                  <span className="text-slate-700">{callDateLabel}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Score Section */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4">
          <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Score Details
          </h4>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm">Overall Score</p>
              <p
                className={`text-3xl font-bold font-mono ${getScoreColor(
                  call.scores?.overall || 0
                )}`}
              >
                {call.scores?.overall || 0}
              </p>
            </div>
            <div className="text-right">
              <p className="text-slate-500 text-sm">Confidence</p>
              <span
                className={`inline-block mt-1 px-3 py-1 text-sm font-medium rounded-full border capitalize ${getConfidenceColor(
                  call.scores?.confidence
                )}`}
              >
                {call.scores?.confidence || 'N/A'}
              </span>
            </div>
          </div>

          {call.scores && (
            <div className="pt-3 border-t border-slate-200 grid grid-cols-2 gap-3 text-xs text-slate-600">
              {[
                ['opening', 'Opening'],
                ['feature_coverage', 'Feature coverage'],
                ['next_step', 'Next step'],
                ['persuasion', 'Persuasion'],
              ].map(([key, label]) => {
                if (call.scores[key] === undefined || call.scores[key] === null) {
                  return null
                }
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-3 py-2"
                  >
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      {label}
                    </span>
                    <span className="font-mono font-semibold text-slate-900">
                      {call.scores[key]}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Call Info Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Duration</p>
            <p className="text-slate-900 font-mono text-lg">
              {formatDuration(call.Duration?.seconds || 0)}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Lead Stage</p>
            <p className="text-slate-900 font-medium">{call.lead_stage || 'N/A'}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Call Type</p>
            <p className="text-slate-900 font-medium capitalize">{call.Call_type?.replace(/_/g, ' ') || 'N/A'}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Course</p>
            <p className="text-slate-900 font-medium">{call.course || 'N/A'}</p>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4">
          <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Summary</h4>
          <p className="text-slate-800 leading-relaxed">
            {call.summary?.one_line || 'No summary available'}
          </p>

          {/* Structured summary cards if available */}
          {call.summary && (
            <div className="space-y-3">
              {/* What went right – green */}
              {normalizeSummaryList(
                call.summary.what_went_right || call.summary['What Went Right']
              ).length > 0 && (
                <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-3 text-xs space-y-2">
                  <p className="font-semibold text-emerald-800">What went right</p>
                  <ul className="list-disc list-inside space-y-1 text-emerald-700">
                    {normalizeSummaryList(
                      call.summary.what_went_right || call.summary['What Went Right']
                    ).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* What went wrong – red */}
              {normalizeSummaryList(
                call.summary.what_went_wrong || call.summary['What Went Wrong']
              ).length > 0 && (
                <div className="bg-rose-50 rounded-2xl border border-rose-200 p-3 text-xs space-y-2">
                  <p className="font-semibold text-rose-800">What went wrong</p>
                  <ul className="list-disc list-inside space-y-1 text-rose-700">
                    {normalizeSummaryList(
                      call.summary.what_went_wrong || call.summary['What Went Wrong']
                    ).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Top 3 fixes – grey */}
              {normalizeSummaryList(
                call.summary.top_3_fixes_next_call ||
                  call.summary['Top 3 Fixes Next Call']
              ).length > 0 && (
                <div className="bg-slate-50 rounded-2xl border border-slate-300 p-3 text-xs space-y-2">
                  <p className="font-semibold text-slate-800">Top 3 fixes next call</p>
                  <ul className="list-disc list-inside space-y-1 text-slate-700">
                    {normalizeSummaryList(
                      call.summary.top_3_fixes_next_call ||
                        call.summary['Top 3 Fixes Next Call']
                    ).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Transcript */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Transcript</h4>
          <div className="max-h-64 overflow-y-auto">
            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap font-mono">
              {call.Transcript || 'No transcript available'}
            </p>
          </div>
        </div>

        {/* Recording */}
        {call.Recording_Url && (
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Recording</h4>
            <audio
              controls
              src={call.Recording_Url}
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default LeadDetail
