'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '../../providers'
import { useBuWorkspace } from '../../../src/context/BuWorkspaceProvider'
import { cn } from '../../../src/lib/utils'
import { isNonMbaWaWorkspace, withWorkspaceQuery } from '../../../src/lib/waWorkspace'

export default function WALayout({ children }) {
  const pathname = usePathname()
  const { isDark } = useTheme()
  const { workspace } = useBuWorkspace()
  const limitedWaNav = isNonMbaWaWorkspace(workspace)
  const waHref = withWorkspaceQuery('/wa', workspace)

  return (
    <>
      {/* Sub-tab bar */}
      <div className={cn(
        "border-b px-4 lg:px-8",
        isDark ? "bg-slate-900/50 border-slate-800" : "bg-white/60 border-slate-200/80"
      )}>
        <div className="max-w-[1600px] mx-auto flex items-center gap-1">
          <Link
            href={waHref}
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
            href={withWorkspaceQuery('/wa/application-form', workspace)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              pathname === '/wa/application-form' || pathname === '/wa/user-journey'
                ? "border-brand-700 text-brand-700 dark:text-brand-400 dark:border-brand-400"
                : cn("border-transparent", isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-800")
            )}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Applications
            </span>
          </Link>
          {!limitedWaNav && (
            <>
              <Link
                href={withWorkspaceQuery('/wa/chat', workspace)}
                className={cn(
                  "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                  pathname === '/wa/chat'
                    ? "border-brand-700 text-brand-700 dark:text-brand-400 dark:border-brand-400"
                    : cn("border-transparent", isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-800")
                )}
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                  </svg>
                  WhatsApp Chat
                </span>
              </Link>
            </>
          )}
        </div>
      </div>
      <Suspense fallback={null}>{children}</Suspense>
    </>
  )
}
