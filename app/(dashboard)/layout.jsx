'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '../providers'
import { useTheme } from '../providers'
import { cn } from '../../src/lib/utils'

const NAV_SECTIONS = [
  {
    title: 'Analytics',
    items: [
      {
        href: '/',
        match: (p) => p === '/' || p === '/call-review',
        label: 'Calls',
        perm: 'always',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        ),
      },
      {
        href: '/wa',
        match: (p) => p.startsWith('/wa'),
        label: 'WhatsApp',
        perm: 'canViewWhatsApp',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        ),
      },
      {
        href: '/email',
        match: (p) => p.startsWith('/email'),
        label: 'Email',
        perm: 'canViewEmail',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'System',
    items: [
      {
        href: '/settings',
        match: (p) => p.startsWith('/settings'),
        label: 'Settings',
        perm: 'isAdmin',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
    ],
  },
]

const HEADER_TITLES = {
  '/': 'Call Analytics',
  '/call-review': 'Call Review',
  '/wa': 'WhatsApp Analytics',
  '/wa/campaigns': 'Campaign Analytics',
  '/email': 'Email Analytics',
  '/settings': 'Settings',
}

function getBreadcrumb(pathname) {
  const map = {
    '/': [{ label: 'Analytics' }, { label: 'Calls' }],
    '/call-review': [{ label: 'Analytics' }, { label: 'Calls' }, { label: 'Review' }],
    '/wa': [{ label: 'Analytics' }, { label: 'WhatsApp' }],
    '/wa/campaigns': [{ label: 'Analytics' }, { label: 'WhatsApp' }, { label: 'Campaigns' }],
    '/email': [{ label: 'Analytics' }, { label: 'Email' }],
    '/settings': [{ label: 'System' }, { label: 'Settings' }],
  }
  return map[pathname] || [{ label: 'Dashboard' }]
}

export default function DashboardLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, checkingAuth, isAdmin, canViewCallReview, canViewWhatsApp, canViewEmail, handleLogout } = useAuth()
  const { toggleTheme, isDark } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!checkingAuth && !user) router.replace('/login')
  }, [user, checkingAuth, router])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  if (checkingAuth) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center", isDark ? "bg-slate-950" : "bg-slate-50")}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-[3px] border-brand-200 border-t-brand-700 rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  const permCheck = { always: true, isAdmin, canViewCallReview, canViewWhatsApp, canViewEmail }
  const headerTitle = HEADER_TITLES[pathname] || 'Dashboard'
  const breadcrumb = getBreadcrumb(pathname)

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className={cn(
        "flex items-center h-16 border-b px-4 shrink-0",
        isDark ? "border-slate-800" : "border-slate-100"
      )}>
        {sidebarOpen ? (
          <Image src="/itm-logo.png" alt="ITM Skills University" width={140} height={48} className="object-contain h-10" priority />
        ) : (
          <Image src="/itm-logo.png" alt="ITM" width={32} height={32} className="object-contain h-8 mx-auto" priority />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) => permCheck[item.perm])
          if (visibleItems.length === 0) return null
          return (
            <div key={section.title}>
              {sidebarOpen && (
                <p className={cn(
                  "text-[10px] font-semibold uppercase tracking-wider px-3 mb-2",
                  isDark ? "text-slate-600" : "text-slate-400"
                )}>
                  {section.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = item.match(pathname)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={!sidebarOpen ? item.label : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all duration-150",
                          sidebarOpen ? "px-3 py-2.5" : "px-0 py-2.5 justify-center",
                          isActive && (isDark
                            ? "bg-brand-700/15 text-brand-400"
                            : "bg-brand-50 text-brand-700"
                          ),
                          isActive && "shadow-sm",
                          !isActive && (isDark
                            ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                            : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                          ),
                        )}
                      >
                        <span className={cn(
                          "shrink-0 flex items-center justify-center",
                          isActive ? "" : "opacity-70"
                        )}>
                          {item.icon}
                        </span>
                        {sidebarOpen && <span>{item.label}</span>}
                        {sidebarOpen && isActive && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-700" />
                        )}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      {/* User section */}
      <div className={cn(
        "shrink-0 border-t p-3",
        isDark ? "border-slate-800" : "border-slate-100"
      )}>
        {sidebarOpen ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                isDark ? "bg-brand-900/40 text-brand-400" : "bg-brand-50 text-brand-700"
              )}>
                {user.email?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  "text-xs font-medium truncate",
                  isDark ? "text-slate-300" : "text-slate-700"
                )}>
                  {user.email}
                </p>
                {isAdmin && (
                  <span className="inline-flex items-center mt-0.5 px-1.5 py-px rounded text-[10px] font-semibold bg-brand-700/15 text-brand-600">
                    Admin
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                isDark
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700"
              )}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            title="Sign out"
            className={cn(
              "w-full flex items-center justify-center py-2 rounded-lg transition-colors",
              isDark ? "text-slate-500 hover:text-slate-300 hover:bg-slate-800" : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
            )}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
          </button>
        )}
      </div>
    </>
  )

  return (
    <div className={cn("min-h-screen", isDark ? "bg-slate-950" : "bg-slate-50")}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — desktop */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-30 hidden lg:flex flex-col transition-all duration-200 ease-out",
        isDark
          ? "bg-slate-900/95 backdrop-blur-sm border-r border-slate-800"
          : "bg-white border-r border-slate-200/80 shadow-sidebar",
        sidebarOpen ? "w-[240px]" : "w-[68px]"
      )}>
        {sidebarContent}
      </aside>

      {/* Sidebar — mobile */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col w-[260px] lg:hidden transition-transform duration-200 ease-out",
        isDark
          ? "bg-slate-900 border-r border-slate-800"
          : "bg-white border-r border-slate-200 shadow-xl",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {sidebarContent}
      </aside>

      {/* Main area */}
      <div className={cn(
        "flex flex-col min-h-screen transition-all duration-200 ease-out",
        sidebarOpen ? "lg:pl-[240px]" : "lg:pl-[68px]"
      )}>
        {/* Top header */}
        <header className={cn(
          "sticky top-0 z-20 h-16 flex items-center justify-between px-4 lg:px-8 border-b backdrop-blur-md",
          isDark
            ? "bg-slate-950/80 border-slate-800"
            : "bg-white/80 border-slate-200/80"
        )}>
          <div className="flex items-center gap-4">
            {/* Mobile hamburger */}
            <button
              className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => setMobileOpen(true)}
            >
              <svg className="w-5 h-5 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>

            {/* Sidebar toggle — desktop */}
            <button
              className={cn(
                "hidden lg:flex items-center justify-center w-8 h-8 rounded-lg transition-colors",
                isDark ? "hover:bg-slate-800 text-slate-500" : "hover:bg-slate-100 text-slate-400"
              )}
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Toggle sidebar"
            >
              <svg className={cn("w-4 h-4 transition-transform", !sidebarOpen && "rotate-180")} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              </svg>
            </button>

            {/* Breadcrumb + title */}
            <div>
              <div className="flex items-center gap-1.5 text-[11px]">
                {breadcrumb.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && (
                      <svg className={cn("w-3 h-3", isDark ? "text-slate-700" : "text-slate-300")} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    )}
                    <span className={cn(
                      i === breadcrumb.length - 1
                        ? (isDark ? "text-slate-200 font-medium" : "text-slate-700 font-medium")
                        : (isDark ? "text-slate-600" : "text-slate-400")
                    )}>
                      {crumb.label}
                    </span>
                  </span>
                ))}
              </div>
              <h1 className={cn(
                "text-base font-semibold -mt-0.5 leading-tight",
                isDark ? "text-white" : "text-slate-900"
              )}>
                {headerTitle}
              </h1>
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className={cn(
                "flex items-center justify-center w-9 h-9 rounded-lg transition-colors",
                isDark
                  ? "hover:bg-slate-800 text-amber-400"
                  : "hover:bg-slate-100 text-slate-500"
              )}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? (
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              ) : (
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              )}
            </button>

            {/* User avatar (mobile) */}
            <div className={cn(
              "lg:hidden w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
              isDark ? "bg-brand-900/40 text-brand-400" : "bg-brand-50 text-brand-700"
            )}>
              {user.email?.[0]?.toUpperCase() || '?'}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
