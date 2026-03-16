'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '../../providers'
import { cn } from '../../../src/lib/utils'

export default function WALayout({ children }) {
  const pathname = usePathname()
  const { isDark } = useTheme()

  return (
    <>
      {/* Sub-tab bar */}
      <div className={cn(
        "border-b px-4 lg:px-8",
        isDark ? "bg-slate-900/50 border-slate-800" : "bg-white/60 border-slate-200/80"
      )}>
        <div className="max-w-[1600px] mx-auto flex items-center gap-1">
          <Link
            href="/wa"
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              pathname === '/wa'
                ? "border-brand-700 text-brand-700 dark:text-brand-400 dark:border-brand-400"
                : cn("border-transparent", isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-800")
            )}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
              API Messages
            </span>
          </Link>
          <Link
            href="/wa/campaigns"
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              pathname === '/wa/campaigns'
                ? "border-brand-700 text-brand-700 dark:text-brand-400 dark:border-brand-400"
                : cn("border-transparent", isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-800")
            )}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
              </svg>
              Campaigns
            </span>
          </Link>
        </div>
      </div>
      {children}
    </>
  )
}
