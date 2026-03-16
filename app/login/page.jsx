'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { signInWithEmailAndPassword, auth } from '../../src/firebase'
import { useAuth } from '../providers'
import { cn } from '../../src/lib/utils'

export default function LoginPage() {
  const router = useRouter()
  const { user, checkingAuth } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!checkingAuth && user) router.replace('/')
  }, [user, checkingAuth, router])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email, password)
      router.replace('/')
    } catch (err) {
      console.error(err)
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth || user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-[3px] border-brand-200 border-t-brand-700 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] relative overflow-hidden bg-brand-700 flex-col justify-between p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-800/50 via-transparent to-brand-950/40" />
        <div className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="absolute -top-20 -left-20 w-60 h-60 rounded-full bg-brand-400/10 blur-3xl" />

        <div className="relative">
          <Image src="/itm-logo.png" alt="ITM Skills University" width={180} height={60} className="object-contain brightness-0 invert opacity-90" priority />
        </div>

        <div className="relative space-y-4">
          <h2 className="text-3xl font-bold text-white leading-tight">
            Analytics Dashboard
          </h2>
          <p className="text-brand-200 text-base leading-relaxed max-w-sm">
            Monitor calls, WhatsApp campaigns, and email performance — all in one place.
          </p>
        </div>

        <div className="relative">
          <p className="text-brand-300/60 text-xs">
            ITM Skills University &middot; Analytics Platform
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-[400px] space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden">
            <Image src="/itm-logo.png" alt="ITM Skills University" width={160} height={56} className="object-contain h-12" priority />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
            <p className="text-sm text-slate-500 mt-1">
              Sign in to access the analytics dashboard.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
              <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-900 text-sm placeholder-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all",
                "bg-brand-700 hover:bg-brand-800 active:bg-brand-900",
                "disabled:opacity-60 disabled:cursor-not-allowed",
                "shadow-sm shadow-brand-700/25 hover:shadow-md hover:shadow-brand-700/30"
              )}
            >
              {loading && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-[11px] text-slate-400 text-center">
            Secured by Firebase Authentication
          </p>
        </div>
      </div>
    </div>
  )
}
