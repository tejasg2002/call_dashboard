import { useEffect, useState } from 'react'
import Dashboard from './components/Dashboard'
import Analysis from './components/Analysis'
import Login from './components/Login'
import WhatsAppDashboard from './pages/dashboard'
import Settings, { ADMIN_EMAIL } from './components/Settings'
import { auth, db, onAuthStateChanged, signOut } from './firebase'
import { fetchUserPermissions } from './lib/userManagement'
import ItmLogo from '../ITM Skills University (1).png'

function App() {
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [navCollapsed, setNavCollapsed] = useState(true)
  const [theme, setTheme] = useState(() => (typeof localStorage !== 'undefined' && localStorage.getItem('theme') === 'dark' ? 'dark' : 'light'))
  // Permissions for non-admin users (null = loading, object = loaded)
  const [userPerms, setUserPerms] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setCheckingAuth(false)
      if (firebaseUser && firebaseUser.email !== ADMIN_EMAIL) {
        fetchUserPermissions(db, firebaseUser.uid).then(setUserPerms)
      } else {
        setUserPerms(null)
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
      try { localStorage.setItem('theme', 'dark') } catch (_) {}
    } else {
      root.classList.remove('dark')
      try { localStorage.setItem('theme', 'light') } catch (_) {}
    }
  }, [theme])

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
    setUserPerms(null)
  }

  const isAdmin = user?.email === ADMIN_EMAIL
  // Admins see everything; non-admins see tabs based on their permissions
  const canViewCallReview = isAdmin || (userPerms?.canViewCallReview === true)
  const canViewWhatsApp   = isAdmin || (userPerms?.canViewWhatsApp   !== false)  // default true
  // dataMasked: admin = never masked; non-admin = masked unless explicitly set false
  const dataMasked = !isAdmin && (userPerms?.dataMasked !== false)

  const allNavItems = [
    {
      id: 'overview',
      label: 'Overview',
      always: true,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      ),
    },
    {
      id: 'analysis',
      label: 'Call review',
      always: false,
      show: canViewCallReview,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      ),
    },
    {
      id: 'wa',
      label: 'WhatsApp Analytics',
      always: false,
      show: canViewWhatsApp,
      icon: (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      always: false,
      show: isAdmin,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ]

  const navItems = allNavItems.filter((item) => item.always || item.show)

  const isDark = theme === 'dark'
  const sidebarBg = isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
  const mainBg = isDark ? 'bg-slate-950' : 'bg-slate-50'

  const headerTitle = {
    overview: 'Call Analytics',
    analysis: 'Call Review',
    wa: 'WhatsApp Campaign Analytics',
    settings: 'Settings',
  }[activeTab] || 'Dashboard'

  return (
    <div className={`min-h-screen flex ${mainBg}`}>
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 flex flex-col border-r transition-all duration-300 ease-in-out overflow-hidden ${sidebarBg} ${navCollapsed ? 'w-16' : 'w-56'}`}>
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center justify-center overflow-hidden">
            {!navCollapsed && (
              <img src={ItmLogo} alt="ITM Skills University" className="object-contain h-14 transition-all duration-300 ease-in-out" />
            )}
          </div>
          <button
            onClick={() => setNavCollapsed((v) => !v)}
            className={`ml-2 inline-flex items-center justify-center w-7 h-7 rounded-full border ${
              isDark ? 'border-slate-600 bg-slate-800 text-slate-400' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500'
            }`}
            aria-label="Toggle sidebar"
          >
            {navCollapsed ? <span>&raquo;</span> : <span>&laquo;</span>}
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
                    title={navCollapsed ? item.label : undefined}
                    className={`w-full flex items-center ${
                      navCollapsed ? 'justify-center px-0' : 'justify-start px-3'
                    } py-2 rounded-xl text-sm font-medium transition-colors gap-2 ${
                      isActive
                        ? 'bg-slate-700 text-white'
                        : isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center justify-center">{item.icon}</span>
                    {!navCollapsed && <span>{item.label}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Bottom: user info + logout */}
        <div className={`px-3 py-3 border-t space-y-2 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          {!navCollapsed ? (
            <>
              <div className={`text-[11px] leading-tight`}>
                <p className="uppercase tracking-wide text-slate-400 mb-0.5">Signed in</p>
                <p className={`truncate font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{user.email}</p>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-500">
                    ⚡ Admin
                  </span>
                )}
              </div>
              <button
                onClick={handleLogout}
                className={`w-full inline-flex items-center justify-center px-3 py-1.5 rounded-xl text-[11px] font-medium border transition-colors ${
                  isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
              >
                Log out
              </button>
            </>
          ) : (
            <button onClick={handleLogout} title="Log out" className={`w-full flex items-center justify-center py-1.5 rounded-xl ${isDark ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          )}
        </div>
      </aside>

      <div className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${navCollapsed ? 'ml-16' : 'ml-56'}`}>
        <header className={`border-b ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-3 flex items-center justify-between">
            <span className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
              {headerTitle}
            </span>
            <button
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              className={`p-2 rounded-lg border ${isDark ? 'border-slate-600 bg-slate-800 text-amber-400 hover:bg-slate-700' : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              aria-label="Toggle dark mode"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          {activeTab === 'overview'  && <Dashboard />}
          {activeTab === 'analysis'  && canViewCallReview && <Analysis />}
          {activeTab === 'wa'        && canViewWhatsApp   && <WhatsAppDashboard theme={theme} isAdmin={isAdmin} dataMasked={dataMasked} />}
          {activeTab === 'settings'  && isAdmin           && <Settings theme={theme} setTheme={setTheme} user={user} isDark={isDark} isAdmin={isAdmin} />}
        </main>
      </div>
    </div>
  )
}

export default App
