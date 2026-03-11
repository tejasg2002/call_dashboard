'use client'

import { useAuth } from '../../providers'
import { useTheme } from '../../providers'
import Settings from '../../../src/components/Settings'

export default function SettingsPage() {
  const { user, isAdmin } = useAuth()
  const { theme, setTheme, isDark } = useTheme()

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          You do not have permission to access settings.
        </p>
      </div>
    )
  }

  return <Settings theme={theme} setTheme={setTheme} user={user} isDark={isDark} isAdmin={isAdmin} />
}
