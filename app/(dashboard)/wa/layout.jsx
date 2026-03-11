'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '../../providers'

export default function WALayout({ children }) {
  const pathname = usePathname()
  const { isDark } = useTheme()

  return (
    <>
      {/* Sub-tab bar */}
      <div className={`border-b px-4 lg:px-8 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="max-w-[1600px] mx-auto flex items-center gap-1">
          <Link
            href="/wa"
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              pathname === '/wa'
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : `border-transparent ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'}`
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              API Messages
            </span>
          </Link>
          <Link
            href="/wa/campaigns"
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              pathname === '/wa/campaigns'
                ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                : `border-transparent ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'}`
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
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
