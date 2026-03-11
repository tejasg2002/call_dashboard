'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '../../providers'
import { useTheme } from '../../providers'
import Analysis from '../../../src/components/Analysis'

export default function CallReviewPage() {
  const pathname = usePathname()
  const { canViewCallReview } = useAuth()
  const { isDark } = useTheme()

  return (
    <>
      {/* Sub-tab bar */}
      <div className={`border-b px-4 lg:px-8 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
        <div className="max-w-[1600px] mx-auto flex items-center gap-1">
          <Link
            href="/"
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors border-transparent ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Analytics
            </span>
          </Link>
          {canViewCallReview && (
            <Link
              href="/call-review"
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                pathname === '/call-review'
                  ? 'border-violet-500 text-violet-600 dark:text-violet-400'
                  : `border-transparent ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'}`
              }`}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call Review
              </span>
            </Link>
          )}
        </div>
      </div>
      <Analysis />
    </>
  )
}
