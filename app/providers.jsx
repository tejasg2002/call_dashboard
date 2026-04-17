'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { auth, db, onAuthStateChanged, signOut } from '../src/firebase'
import { fetchUserPermissions } from '../src/lib/userManagement'
import { normalizeAllowedBuWorkspaces } from '../src/lib/waWorkspace'

export const ADMIN_EMAIL = 'server@letsupgrade.in'

// ── Auth Context ─────────────────────────────────────────────────────────────
const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [userPerms, setUserPerms] = useState(null)
  const [userPermsLoading, setUserPermsLoading] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setCheckingAuth(false)
      if (!firebaseUser) {
        setUserPerms(null)
        setUserPermsLoading(false)
        return
      }
      if (firebaseUser.email === ADMIN_EMAIL) {
        setUserPerms(null)
        setUserPermsLoading(false)
        return
      }
      setUserPermsLoading(true)
      setUserPerms(null)
      fetchUserPermissions(db, firebaseUser.uid)
        .then(setUserPerms)
        .finally(() => setUserPermsLoading(false))
    })
    return () => unsub()
  }, [])

  const handleLogout = async () => {
    await signOut(auth)
    setUser(null)
    setUserPerms(null)
  }

  const isAdmin = user?.email === ADMIN_EMAIL
  const canViewCallReview = isAdmin || (userPerms?.canViewCallReview === true)
  const canViewWhatsApp   = isAdmin || (userPerms?.canViewWhatsApp   !== false)
  const canViewEmail      = isAdmin || (userPerms?.canViewEmail      !== false)
  const dataMasked = !isAdmin && (userPerms?.dataMasked !== false)
  /** null = all BUs; string[] = restricted; undefined = perms still loading (do not enforce yet). */
  const allowedBuWorkspaces =
    isAdmin || !user ? null : userPermsLoading ? undefined : normalizeAllowedBuWorkspaces(userPerms?.allowedBuWorkspaces)

  return (
    <AuthContext.Provider value={{
      user, checkingAuth, userPerms, userPermsLoading, isAdmin,
      canViewCallReview, canViewWhatsApp, canViewEmail,
      dataMasked, allowedBuWorkspaces, handleLogout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Theme Context ────────────────────────────────────────────────────────────
const ThemeContext = createContext(null)

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'dark') setTheme('dark')
  }, [])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
      try { localStorage.setItem('theme', 'dark') } catch {}
    } else {
      root.classList.remove('dark')
      try { localStorage.setItem('theme', 'light') } catch {}
    }
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  )
}

// ── Combined Providers ───────────────────────────────────────────────────────
export default function Providers({ children }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </AuthProvider>
  )
}
