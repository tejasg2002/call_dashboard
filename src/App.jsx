import { useEffect, useState } from 'react'
import Dashboard from './components/Dashboard'
import Analysis from './components/Analysis'
import Login from './components/Login'
import { auth, onAuthStateChanged, signOut } from './firebase'
import ItmLogo from '../ITM Skills University (1).png'

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
              <img
                src={ItmLogo}
                alt="ITM Skills University"
                className="object-contain h-14 transition-all duration-300 ease-in-out"
              />
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
          {activeTab === 'overview' ? <Dashboard /> : <Analysis />}
        </main>
      </div>
    </div>
  )
}

export default App
