import { useState, useRef, useEffect, useMemo } from 'react'

const CallsTable = ({ calls, loading, onSelectCall, selectedCallId }) => {
  const formatDisposition = (disposition) => {
    if (!disposition?.counselor) return 'N/A'
    return disposition.counselor
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const getDispositionColor = (disposition) => {
    const status = disposition?.counselor?.toLowerCase()
    if (status === 'interested') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    if (status === 'not_interested') return 'bg-rose-500/20 text-rose-400 border-rose-500/30'
    if (status === 'callback') return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    return 'bg-slate-500/20 text-slate-400 border-slate-500/30'
  }

  const getScoreColor = (score) => {
    if (score >= 70) return 'text-emerald-600'
    if (score >= 40) return 'text-amber-600'
    return 'text-rose-600'
  }

  const [playingId, setPlayingId] = useState(null)
  const audioRefs = useRef({})

  const pageSize = 20
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(calls.length / pageSize))

  useEffect(() => {
    // Reset or clamp page when data changes
    const newTotalPages = Math.max(1, Math.ceil(calls.length / pageSize))
    if (page > newTotalPages) {
      setPage(newTotalPages)
    }
  }, [calls, page])

  const paginatedCalls = useMemo(() => {
    const startIndex = (page - 1) * pageSize
    const endIndex = startIndex + pageSize
    return calls.slice(startIndex, endIndex)
  }, [calls, page])

  const handleTogglePlay = (callId) => {
    const currentAudio = audioRefs.current[callId]
    if (!currentAudio) return

    // If this row is already playing, pause and reset
    if (playingId === callId && !currentAudio.paused) {
      currentAudio.pause()
      currentAudio.currentTime = 0
      setPlayingId(null)
      return
    }

    // Pause any previously playing audio
    if (playingId && audioRefs.current[playingId]) {
      audioRefs.current[playingId].pause()
      audioRefs.current[playingId].currentTime = 0
    }

    // Play this one
    currentAudio.play()
    setPlayingId(callId)

    // When it ends, reset state
    currentAudio.onended = () => {
      setPlayingId((current) => (current === callId ? null : current))
    }
  }

  if (loading && calls.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-8 flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-violet-300 rounded-full" />
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-t-violet-500 rounded-full animate-spin" />
          </div>
          <p className="text-slate-500 text-sm">Loading calls data...</p>
        </div>
      </div>
    )
  }

  if (calls.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-12 flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <p className="text-slate-500">No calls found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Table Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <h2 className="text-lg font-semibold text-slate-900">Recent Calls</h2>
        <div className="flex items-center space-x-2">
          {loading && (
            <span className="flex items-center space-x-2 text-xs text-violet-600">
              <div className="w-2 h-2 bg-violet-500 rounded-full animate-pulse" />
              <span>Syncing...</span>
            </span>
          )}
          <span className="text-sm text-slate-500">
            {calls.length} total
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Lead Name</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Lead Owner</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">City</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Course</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Disposition</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Duration</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Score</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Recording</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedCalls.map((call) => (
              <tr
                key={call.id}
                onClick={() => onSelectCall(call)}
                className={`table-row-hover cursor-pointer ${
                  selectedCallId === call.id ? 'bg-violet-50' : 'bg-white'
                }`}
              >
                <td className="px-6 py-4">
                  <span className="text-slate-900 font-medium capitalize">
                    {call.Name || 'N/A'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-slate-700">
                    {call.Lead_owner?.replace(/_/g, ' ') || 'N/A'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-slate-700">{call.City || 'N/A'}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 rounded-md">
                    {call.course || 'N/A'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded-md border ${getDispositionColor(call.Disposition)}`}>
                    {formatDisposition(call.Disposition)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-slate-700 font-mono text-sm">
                    {call.Duration?.seconds || 0}s
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`font-mono font-semibold ${getScoreColor(call.scores?.overall || 0)}`}>
                    {call.scores?.overall || 0}
                  </span>
                </td>
                <td
                  className="px-6 py-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  {call.Recording_Url ? (
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => handleTogglePlay(call.id)}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700 transition-colors"
                      >
                        {playingId === call.id ? (
                          <svg
                            className="w-4 h-4"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M6 4a1 1 0 011 1v10a1 1 0 11-2 0V5a1 1 0 011-1zm7 0a1 1 0 011 1v10a1 1 0 11-2 0V5a1 1 0 011-1z" />
                          </svg>
                        ) : (
                          <svg
                            className="w-4 h-4"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M6.5 4.5a1 1 0 00-1.5.866v9.268a1 1 0 001.5.866l8-4.634a1 1 0 000-1.732l-8-4.634z" />
                          </svg>
                        )}
                      </button>
                      <audio
                        ref={(el) => {
                          if (el) audioRefs.current[call.id] = el
                        }}
                        src={call.Recording_Url}
                        className="hidden"
                      />
                    </div>
                  ) : (
                    <span className="text-slate-400 text-sm">N/A</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      <div className="px-6 py-3 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-600">
        <span>
          Showing{' '}
          <span className="font-medium">
            {Math.min((page - 1) * pageSize + 1, calls.length)}
          </span>{' '}
          -{' '}
          <span className="font-medium">
            {Math.min(page * pageSize, calls.length)}
          </span>{' '}
          of <span className="font-medium">{calls.length}</span> calls
        </span>
        <div className="inline-flex items-center space-x-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="px-2">
            Page <span className="font-medium">{page}</span> of{' '}
            <span className="font-medium">{totalPages}</span>
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

export default CallsTable
