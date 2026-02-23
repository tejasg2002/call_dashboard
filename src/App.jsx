import { useEffect, useState } from 'react'
import Dashboard from './components/Dashboard'
import Analysis from './components/Analysis'
import HotLeads from './components/HotLeads'
import Settings from './components/Settings'
import Login from './components/Login'
import { auth, onAuthStateChanged, signOut } from './firebase'
import { MaskedViewProvider } from './context/MaskedViewContext'

const ADMIN_EMAIL = 'server@letsupgrade.in'

function App() {
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [navCollapsed, setNavCollapsed] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setCheckingAuth(false)
    })
    return () => unsub()
  }, [])

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center space-y-3 text-slate-600">
          <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <p className="text-sm">Checking authentication...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Login onLogin={setUser} />
  }

  const handleLogout = async () => {
    await signOut(auth)
    setUser(null)
  }

  return (
    <MaskedViewProvider user={user}>
      <AppContent user={user} onLogout={handleLogout} activeTab={activeTab} setActiveTab={setActiveTab} navCollapsed={navCollapsed} setNavCollapsed={setNavCollapsed} isAdmin={user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()} />
    </MaskedViewProvider>
  )
}

function AppContent({ user, onLogout, activeTab, setActiveTab, navCollapsed, setNavCollapsed, isAdmin }) {
  const navItems = [
    {
      id: 'overview',
      label: 'Overview',
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h7V4H4v2zm9 0h7V4h-7v2zM4 13h7v-2H4v2zm9 0h7v-2h-7v2zM4 20h7v-2H4v2zm9 0h7v-2h-7v2z"
          />
        </svg>
      ),
    },
    {
      id: 'analysis',
      label: 'Call review',
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.05 5.05A7 7 0 1112 5v.01M15 3h6m0 0v6m0-6L15 9"
          />
        </svg>
      ),
    },
    {
      id: 'hotLeads',
      label: 'Hot & Warm Leads',
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"
          />
        </svg>
      ),
    },
    ...(isAdmin
      ? [
          {
            id: 'settings',
            label: 'Settings',
            icon: (
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar - fixed, non-scrolling */}
      <aside
        className={`fixed inset-y-0 left-0 flex flex-col bg-white border-r border-slate-200 transition-all duration-300 ease-in-out overflow-hidden ${
          navCollapsed ? 'w-16' : 'w-56'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center justify-center overflow-hidden">
            {!navCollapsed && (
              <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">
                ITM Skills University
              </span>
            )}
          </div>
          <button
            onClick={() => setNavCollapsed((v) => !v)}
            className="ml-2 inline-flex items-center justify-center w-7 h-7 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500"
            aria-label="Toggle sidebar"
          >
            {navCollapsed ? (
              <span>&raquo;</span>
            ) : (
              <span>&laquo;</span>
            )}
          </button>
        </div>

        <nav className="mt-6 flex-1">
          <ul className="space-y-2 px-2 w-full">
            {navItems.map((item) => {
              const isActive = activeTab === item.id
              return (
                <li key={item.id}>
                  <button
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center ${
                      navCollapsed ? 'justify-center px-0' : 'justify-start px-3'
                    } py-2 rounded-xl text-sm font-medium transition-colors gap-2 ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center justify-center">
                      {item.icon}
                    </span>
                    {!navCollapsed && <span>{item.label}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="px-3 py-3 border-t border-slate-200 space-y-2">
          {!navCollapsed && (
            <>
              <div className="text-[11px] text-slate-500 leading-tight">
                <p className="uppercase tracking-wide text-slate-400 mb-0.5">
                  Signed in
                </p>
                <p className="truncate text-slate-700">{user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full inline-flex items-center justify-center px-3 py-1.5 rounded-xl text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
              >
                Log out
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${
          navCollapsed ? 'ml-16' : 'ml-56'
        }`}
      >
        <header className="border-b border-slate-200 bg-white">
          <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900">
              Call Analytics
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          {activeTab === 'overview' && <Dashboard />}
          {activeTab === 'analysis' && <Analysis />}
          {activeTab === 'hotLeads' && <HotLeads />}
          {activeTab === 'settings' && isAdmin && <Settings />}
        </main>
      </div>
    </div>
  )
}

export default App
