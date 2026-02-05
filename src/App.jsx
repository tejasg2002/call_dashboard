import { useEffect, useState } from 'react'
import Dashboard from './components/Dashboard'
import Login from './components/Login'
import { auth, onAuthStateChanged, signOut } from './firebase'

function App() {
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

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
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-3 flex items-center justify-between">
          <span className="text-sm text-slate-600">
            Signed in as <span className="font-medium text-slate-900">{user.email}</span>
          </span>
          <button
            onClick={handleLogout}
            className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
      <Dashboard />
    </div>
  )
}

export default App
