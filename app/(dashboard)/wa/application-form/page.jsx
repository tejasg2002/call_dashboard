'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { fetchWADashboard } from '../../../../src/lib/waDashboardApi'
import {
  normalizeWAWorkspace,
  workspacePayloadMatchesExpected,
} from '../../../../src/lib/waWorkspace'
import { useAuth, useTheme } from '../../../providers'
import { useBuWorkspace } from '../../../../src/context/BuWorkspaceProvider'
import WAApplicationFormSection from '../../../../src/components/wa/WAApplicationFormSection'

export default function WAApplicationFormPage() {
  const { isAdmin, dataMasked } = useAuth()
  const { theme } = useTheme()
  const { workspace } = useBuWorkspace()
  const workspaceRef = useRef(workspace)
  workspaceRef.current = workspace
  const isDark = theme === 'dark'

  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  const finishFetch = useCallback((requestedWs, data) => {
    const ws = normalizeWAWorkspace(requestedWs)
    if (normalizeWAWorkspace(workspaceRef.current) !== ws) return false
    if (!workspacePayloadMatchesExpected(data, ws)) {
      setError(
        'Analytics did not match the selected workspace. Pick the correct BU workspace again or refresh.',
      )
      setSnapshot(null)
      return false
    }
    setSnapshot(data)
    setError(null)
    return true
  }, [])

  const loadData = useCallback(async () => {
    const ws = normalizeWAWorkspace(workspace)
    try {
      setLoading(true)
      const data = await fetchWADashboard({ mode: 'cached', workspace: ws })
      finishFetch(ws, data)
    } catch (err) {
      console.error('[WAApplicationForm]', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [workspace, finishFetch])

  const handleRefresh = useCallback(async () => {
    const ws = normalizeWAWorkspace(workspace)
    try {
      setFetching(true)
      setToast(null)
      const data = await fetchWADashboard({ mode: 'cached', workspace: ws })
      if (data.pending) {
        setToast('No snapshot yet. Open API Messages, run Recompute all, then refresh here.')
        setTimeout(() => setToast(null), 8000)
        return
      }
      if (finishFetch(ws, data)) {
        const n = data.paymentConversion?.formSubmittedDetails?.length ?? 0
        setToast(`Loaded snapshot · ${n.toLocaleString('en-IN')} application rows`)
        setTimeout(() => setToast(null), 4000)
      }
    } catch (err) {
      console.error('[WAApplicationForm] refresh', err)
      setError(err.message)
    } finally {
      setFetching(false)
    }
  }, [workspace, finishFetch])

  useEffect(() => {
    setSnapshot(null)
    setError(null)
  }, [workspace])

  useEffect(() => {
    loadData()
  }, [loadData])

  const pc = snapshot?.paymentConversion

  return (
    <div className="px-4 lg:px-8 py-6 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            Application form
          </h1>
          <p className={`text-sm mt-1 max-w-2xl ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Lead ID, name, application number, templates sent (sent/delivered), course and email where
            available — same cohort as Form conversion on API Messages (cached snapshot).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                const ws = normalizeWAWorkspace(workspace)
                fetch(`/api/wa-dashboard/recompute?workspace=${ws}`, { method: 'POST' }).catch(() => {})
                setToast('Recompute started — refresh in ~1–2 min.')
                setTimeout(() => setToast(null), 8000)
              }}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${
                isDark
                  ? 'border-slate-600 text-slate-300 hover:bg-slate-800'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Recompute
            </button>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={fetching}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border ${
              isDark
                ? 'border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50'
            }`}
          >
            {fetching ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {toast && (
        <div
          className={`mb-4 px-4 py-2 rounded-lg text-sm ${
            isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-800'
          }`}
        >
          {toast}
        </div>
      )}

      {loading ? (
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Loading snapshot…</p>
      ) : error ? (
        <div
          className={`p-4 rounded-xl border text-sm ${
            isDark ? 'bg-red-950/40 border-red-900/50 text-red-200' : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {error}
        </div>
      ) : snapshot?.pending ? (
        <div
          className={`p-6 rounded-xl text-center ${
            isDark ? 'bg-amber-900/20 border border-amber-700/40 text-amber-300' : 'bg-amber-50 border border-amber-200 text-amber-800'
          }`}
        >
          <p className="text-sm font-semibold">Snapshot not ready</p>
          <p className={`text-xs mt-1 ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
            Use <strong>API Messages</strong> → Recompute all, then <strong>Refresh</strong> here.
          </p>
        </div>
      ) : !pc ? (
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          No form / payment conversion data for this workspace in the current snapshot.
        </p>
      ) : !(pc.formSubmittedDetails?.length > 0) ? (
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          No submitted applications in this snapshot yet. After users convert from clicks, rows will appear
          here — or widen the date range from <strong>API Messages</strong> if you use a custom range.
        </p>
      ) : (
        <WAApplicationFormSection paymentConversion={pc} theme={theme} dataMasked={dataMasked} />
      )}
    </div>
  )
}
