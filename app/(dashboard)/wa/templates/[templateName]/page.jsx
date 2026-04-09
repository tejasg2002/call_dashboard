'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { fetchWADashboard } from '../../../../../src/lib/waDashboardApi'
import { normalizeWAWorkspace, workspacePayloadMatchesExpected } from '../../../../../src/lib/waWorkspace'
import { useTheme } from '../../../../providers'

import WATemplatePreview from '../../../../../src/components/wa/WATemplatePreview'

export default function WATemplateTemplatePage() {
  const { templateName } = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const workspace = normalizeWAWorkspace(searchParams.get('workspace'))
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const ws = normalizeWAWorkspace(workspace)
        const snap = await fetchWADashboard({ mode: 'cached', workspace: ws })
        if (!mounted) return
        if (!workspacePayloadMatchesExpected(snap, ws)) {
          setError('Analytics did not match this workspace.')
          setSnapshot(null)
          return
        }
        setSnapshot(snap)
      } catch (err) {
        if (!mounted) return
        setError(err.message)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [workspace])

  const { row, btnStats } = useMemo(() => {
    if (!snapshot || !templateName) return { row: null, btnStats: [] }
    const tRow = (snapshot.templateRows || []).find((r) => r.template_name === templateName)
    const ctas = (snapshot.ctaRows || []).filter((c) =>
      c.template_used && c.template_used.split(', ').includes(templateName)
    )
    return { row: tRow || null, btnStats: ctas }
  }, [snapshot, templateName])

  return (
    <div className="p-4 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push(workspace === 'ihm' ? '/wa?workspace=ihm' : '/wa')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to WhatsApp
        </button>
        <h1 className={`text-lg sm:text-xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
          Template breakdown
        </h1>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 gap-3">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className={isDark ? 'text-slate-400 text-sm' : 'text-slate-600 text-sm'}>Loading template analytics…</span>
        </div>
      )}

      {error && !loading && (
        <p className={`text-sm ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{error}</p>
      )}

      {!loading && !error && !row && (
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          No analytics found for template <span className="font-mono font-semibold">{templateName}</span>.
        </p>
      )}

      {!loading && row && (
        <>
          {/* Centered preview on neutral backdrop */}
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <WATemplatePreview
                row={{ ...row, template_preview: row.template_preview || null }}
                buttonStats={btnStats}
                theme={theme}
                dataMasked={false}
                workspace={workspace}
                onClose={() => router.push(workspace === 'ihm' ? '/wa?workspace=ihm' : '/wa')}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

