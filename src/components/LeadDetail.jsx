'use client'

import { useEffect, useState } from 'react'

const LeadDetail = ({ call, onClose }) => {
  const [recordingLoadErr, setRecordingLoadErr] = useState(false)

  useEffect(() => {
    setRecordingLoadErr(false)
  }, [call?.id, call?.Recording_Url])

  if (!call) return null

  const getScoreColor = (score) => {
    if (score >= 70) return 'text-brand-600 dark:text-brand-400'
    if (score >= 40) return 'text-amber-600 dark:text-amber-400'
    return 'text-rose-600 dark:text-rose-400'
  }

  const getConfidenceColor = (confidence) => {
    if (confidence === 'high') return 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 border-brand-200 dark:border-brand-700'
    if (confidence === 'medium') return 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700'
    return 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-700'
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
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden h-full flex flex-col shadow-sm sticky top-4 max-h-[calc(100vh-6rem)]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Lead Details</h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Lead Info */}
        <div className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-brand-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg uppercase shadow-sm">
              {call.Name?.charAt(0) || '?'}
            </div>
            <div className="space-y-1">
              <h3 className="text-slate-900 dark:text-slate-100 font-semibold capitalize">{call.Name || 'Unknown'}</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">{call.City}, {call.State}</p>
              {call.Lead_id && (
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                  <span className="uppercase tracking-wide text-slate-400 dark:text-slate-500">Lead ID:&nbsp;</span>
                  <span className="text-slate-700 dark:text-slate-300">{call.Lead_id}</span>
                </p>
              )}
              {callDateLabel && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <span className="uppercase tracking-wide text-slate-400 dark:text-slate-500">Call Date:&nbsp;</span>
                  <span className="text-slate-700 dark:text-slate-300">{callDateLabel}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Score Section */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-700 space-y-4">
          <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Score Details
          </h4>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 dark:text-slate-400 text-sm">Overall Score</p>
              <p className={`text-3xl font-bold font-mono ${getScoreColor(call.scores?.overall || 0)}`}>
                {call.scores?.overall || 0}
              </p>
            </div>
            <div className="text-right">
              <p className="text-slate-500 dark:text-slate-400 text-sm">Confidence</p>
              <span className={`inline-block mt-1 px-3 py-1 text-sm font-medium rounded-full border capitalize ${getConfidenceColor(call.scores?.confidence)}`}>
                {call.scores?.confidence || 'N/A'}
              </span>
            </div>
          </div>

          {call.scores && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 grid grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-400">
              {[
                ['opening', 'Opening'],
                ['feature_coverage', 'Feature coverage'],
                ['next_step', 'Next step'],
                ['persuasion', 'Persuasion'],
              ].map(([key, label]) => {
                if (call.scores[key] === undefined || call.scores[key] === null) return null
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2"
                  >
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {label}
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
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
          {[
            { label: 'Duration', value: formatDuration(call.Duration?.seconds || 0) },
            { label: 'Lead Stage', value: call.lead_stage || 'N/A' },
            { label: 'Call Type', value: call.Call_type?.replace(/_/g, ' ') || 'N/A', capitalize: true },
            { label: 'Course', value: call.course || 'N/A' },
          ].map(({ label, value, capitalize }) => (
            <div key={label} className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
              <p className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider mb-1">{label}</p>
              <p className={`text-slate-900 dark:text-slate-100 font-medium font-mono text-lg ${capitalize ? 'capitalize' : ''}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-700 space-y-4">
          <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Summary</h4>
          <p className="text-slate-800 dark:text-slate-200 leading-relaxed">
            {call.summary?.one_line ||
              (typeof call.summary === 'string' ? call.summary : null) ||
              'No summary available'}
          </p>

          {call.summary && (
            <div className="space-y-3">
              {normalizeSummaryList(call.summary.what_went_right || call.summary['What Went Right']).length > 0 && (
                <div className="bg-brand-50 dark:bg-brand-900/20 rounded-2xl border border-brand-200 dark:border-brand-800 p-3 text-xs space-y-2">
                  <p className="font-semibold text-brand-800 dark:text-brand-300">What went right</p>
                  <ul className="list-disc list-inside space-y-1 text-brand-700 dark:text-brand-400">
                    {normalizeSummaryList(call.summary.what_went_right || call.summary['What Went Right']).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {normalizeSummaryList(call.summary.what_went_wrong || call.summary['What Went Wrong']).length > 0 && (
                <div className="bg-rose-50 dark:bg-rose-900/20 rounded-2xl border border-rose-200 dark:border-rose-800 p-3 text-xs space-y-2">
                  <p className="font-semibold text-rose-800 dark:text-rose-300">What went wrong</p>
                  <ul className="list-disc list-inside space-y-1 text-rose-700 dark:text-rose-400">
                    {normalizeSummaryList(call.summary.what_went_wrong || call.summary['What Went Wrong']).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {normalizeSummaryList(call.summary.top_3_fixes_next_call || call.summary['Top 3 Fixes Next Call']).length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-600 p-3 text-xs space-y-2">
                  <p className="font-semibold text-slate-800 dark:text-slate-200">Top 3 fixes next call</p>
                  <ul className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300">
                    {normalizeSummaryList(call.summary.top_3_fixes_next_call || call.summary['Top 3 Fixes Next Call']).map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Transcript */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
          <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Transcript</h4>
          <div className="max-h-64 overflow-y-auto">
            <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-mono">
              {call.Transcript || call.transcript || 'No transcript available'}
            </p>
          </div>
        </div>

        {/* Recording */}
        {call.Recording_Url && (
          <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-700 space-y-2">
            <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Recording</h4>
            <audio
              controls
              src={call.Recording_Url}
              className="w-full"
              preload="metadata"
              onLoadedData={() => setRecordingLoadErr(false)}
              onError={() => setRecordingLoadErr(true)}
            />
            {recordingLoadErr && (
              <p className="text-xs text-amber-800 dark:text-amber-200/90 leading-relaxed">
                This URL did not load as playable audio (404, CORS, expired signed link, or non-audio file).{' '}
                <a
                  href={call.Recording_Url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-700 dark:text-brand-400 underline underline-offset-2"
                >
                  Open link in new tab
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default LeadDetail
