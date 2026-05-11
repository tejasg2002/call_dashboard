'use client'

import { useBuWorkspace } from '../../../../src/context/BuWorkspaceProvider'
import { useTheme } from '../../../providers'
import { normalizeWAWorkspace } from '../../../../src/lib/waWorkspace'
import WAUserJourney from '../../../../src/components/wa/WAUserJourney'

export default function WAUserJourneyPage() {
  const { workspace } = useBuWorkspace()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const ws = normalizeWAWorkspace(workspace)

  return (
    <div className="px-4 lg:px-8 py-6 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <h1 className={`text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
          User Journey
        </h1>
        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          Trace every WhatsApp interaction for a specific user — templates sent, delivery stages, reads, and button clicks.
        </p>
      </div>
      <WAUserJourney workspace={ws} isDark={isDark} />
    </div>
  )
}
