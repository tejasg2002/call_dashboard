'use client'

import { useState, useEffect, useCallback } from 'react'
import { auth, db } from '../firebase'
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { deleteField } from 'firebase/firestore'
import {
  createAppUser,
  listAppUsers,
  removeAppUser,
  sendResetEmail,
  updateUserPermissions,
  DEFAULT_PERMISSIONS,
} from '../lib/userManagement'
import {
  ALL_BU_WORKSPACE_SLUGS,
  ANALYTICS_WA_DEFINITIONS,
  buWorkspaceLabel,
  normalizeAllowedBuWorkspaces,
} from '../lib/waWorkspace'

export const ADMIN_EMAIL = 'server@letsupgrade.in'

/* ─── tiny helpers ────────────────────────────────────────────────── */
function Section({ title, description, children, isDark }) {
  return (
    <div className={`rounded-2xl border ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
      <div className={`px-6 py-4 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <h3 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{title}</h3>
        {description && <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{description}</p>}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  )
}

function ToggleRow({ label, description, checked, onChange, isDark }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className={`text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{label}</p>
        {description && <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-brand-600' : isDark ? 'bg-slate-600' : 'bg-slate-300'}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}

/* ─── Permission toggle row ───────────────────────────────────────── */
function PermToggle({ label, description, checked, onChange, isDark, color = 'brand' }) {
  const trackColor = {
    brand: checked ? 'bg-brand-600' : isDark ? 'bg-slate-600' : 'bg-slate-300',
    amber: checked ? 'bg-amber-500' : isDark ? 'bg-slate-600' : 'bg-slate-300',
  }[color]

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className={`text-xs font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{label}</p>
        {description && (
          <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${trackColor}`}
        role="switch"
        aria-checked={checked}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

/* ─── Per-user card with permissions ─────────────────────────────── */
function UserCard({ user: u, isDark, actionStatus, onResetPassword, onDelete, onPermissionChange, onBuWorkspacesUpdate }) {
  const [expanded, setExpanded] = useState(false)
  const canViewCallReview = u.canViewCallReview ?? DEFAULT_PERMISSIONS.canViewCallReview
  const canViewWhatsApp   = u.canViewWhatsApp   ?? DEFAULT_PERMISSIONS.canViewWhatsApp
  const canViewEmail      = u.canViewEmail      ?? DEFAULT_PERMISSIONS.canViewEmail
  const dataMasked        = u.dataMasked        ?? DEFAULT_PERMISSIONS.dataMasked

  const buAccessSet = (() => {
    const n = normalizeAllowedBuWorkspaces(u.allowedBuWorkspaces)
    if (n == null) return new Set(ALL_BU_WORKSPACE_SLUGS)
    return new Set(n)
  })()
  const buUnrestricted = normalizeAllowedBuWorkspaces(u.allowedBuWorkspaces) == null

  const handleBuToggle = async (slug, checked) => {
    const next = new Set(buAccessSet)
    if (checked) next.add(slug)
    else {
      if (next.size <= 1) return
      next.delete(slug)
    }
    const arr = [...next]
    if (arr.length >= ALL_BU_WORKSPACE_SLUGS.length) {
      await onBuWorkspacesUpdate(null)
    } else {
      await onBuWorkspacesUpdate(arr)
    }
  }

  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-700/40 border-slate-600' : 'bg-white border-slate-200'}`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${isDark ? 'bg-slate-600 text-slate-300' : 'bg-brand-100 text-brand-600'}`}>
          {u.email?.[0]?.toUpperCase() || 'U'}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{u.displayName || u.email}</p>
          <p className={`text-xs truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{u.email}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {actionStatus && (
            <span className={`text-xs ${actionStatus?.startsWith('✓') ? 'text-brand-500' : actionStatus?.startsWith('Error') ? 'text-rose-400' : isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {actionStatus}
            </span>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${isDark ? 'border-slate-600 text-slate-400 hover:bg-slate-600' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
          >
            {expanded ? 'Hide ▲' : 'Permissions ▼'}
          </button>
          <button
            onClick={onResetPassword}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${isDark ? 'border-slate-600 text-slate-400 hover:bg-slate-600 hover:text-slate-200' : 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            Reset pw
          </button>
          <button
            onClick={onDelete}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${isDark ? 'border-rose-700/50 text-rose-400 hover:bg-rose-900/30' : 'border-rose-200 text-rose-500 hover:bg-rose-50'}`}
          >
            Remove
          </button>
        </div>
      </div>

      {/* Permission panel */}
      {expanded && (
        <div className={`border-t ${isDark ? 'border-slate-600 bg-slate-800/40' : 'border-slate-100 bg-slate-50'}`}>
          {/* Access section */}
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center gap-2 mb-1">
              <svg className={`w-3 h-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Access</p>
            </div>
            <div className={`divide-y rounded-xl border overflow-hidden ${isDark ? 'divide-slate-700 border-slate-700 bg-slate-800/60' : 'divide-slate-100 border-slate-200 bg-white'}`}>
              <div className="px-3">
                <PermToggle
                  label="Call Review"
                  description="Call recordings and review"
                  checked={canViewCallReview}
                  onChange={(v) => onPermissionChange('canViewCallReview', v)}
                  isDark={isDark}
                  color="brand"
                />
              </div>
              <div className="px-3">
                <PermToggle
                  label="WhatsApp Analytics"
                  description="WhatsApp campaign dashboard"
                  checked={canViewWhatsApp}
                  onChange={(v) => onPermissionChange('canViewWhatsApp', v)}
                  isDark={isDark}
                  color="brand"
                />
              </div>
              <div className="px-3">
                <PermToggle
                  label="Email Analytics"
                  description="Email campaign dashboard"
                  checked={canViewEmail}
                  onChange={(v) => onPermissionChange('canViewEmail', v)}
                  isDark={isDark}
                  color="brand"
                />
              </div>
            </div>
          </div>

          {/* Per-user WhatsApp business units (header workspace switcher) */}
          <div className="px-4 pt-2 pb-2">
            <div className="flex items-center gap-2 mb-1">
              <svg className={`w-3 h-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Business units (WhatsApp)</p>
            </div>
            <p className={`text-[10px] mb-2 leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Choose which verticals this user may open in the top workspace menu. Examples: leave <strong>only MBA</strong> on for main marketing WA; leave <strong>only BBA</strong> on for BBA-only access; or enable several BUs.
              All toggles on means <strong>no restriction</strong> (same as legacy users). At least one BU must stay on.
              {buUnrestricted ? ' Status: unrestricted.' : ' Status: custom list.'}
            </p>
            <div className={`divide-y rounded-xl border overflow-hidden ${isDark ? 'divide-slate-700 border-slate-700 bg-slate-800/60' : 'divide-slate-100 border-slate-200 bg-white'}`}>
              {ALL_BU_WORKSPACE_SLUGS.map((slug) => (
                <div key={slug} className="px-3">
                  <PermToggle
                    label={buWorkspaceLabel(slug)}
                    description={
                      slug === 'mba'
                        ? 'itm.marketingwa'
                        : `analytics.${ANALYTICS_WA_DEFINITIONS.find((d) => d.workspace === slug)?.collection ?? ''}`
                    }
                    checked={buAccessSet.has(slug)}
                    onChange={(v) => { void handleBuToggle(slug, v) }}
                    isDark={isDark}
                    color="brand"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Data section */}
          <div className="px-4 pt-2 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <svg className={`w-3 h-3 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Data</p>
            </div>
            <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-slate-700 bg-slate-800/60' : 'border-slate-200 bg-white'}`}>
              <div className="px-3">
                <PermToggle
                  label="Data Visible"
                  description="Show phone numbers and emails unmasked"
                  checked={!dataMasked}
                  onChange={(v) => onPermissionChange('dataMasked', !v)}
                  isDark={isDark}
                  color="amber"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── User Management ─────────────────────────────────────────────── */
function UserManagement({ isDark }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ email: '', password: '', displayName: '' })
  const [createStatus, setCreateStatus] = useState(null)
  const [createLoading, setCreateLoading] = useState(false)
  const [actionStatus, setActionStatus] = useState({})

  const inputClass = `w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 ${
    isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
  }`

  const reload = useCallback(async () => {
    setLoading(true)
    try { setUsers(await listAppUsers(db)) } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { reload() }, [reload])

  const handleCreate = async (e) => {
    e.preventDefault()
    setCreateStatus(null)
    if (form.password.length < 6) { setCreateStatus({ type: 'error', msg: 'Password must be at least 6 characters.' }); return }
    setCreateLoading(true)
    try {
      await createAppUser({ email: form.email, password: form.password, displayName: form.displayName }, db)
      setCreateStatus({ type: 'success', msg: `User "${form.email}" created successfully.` })
      setForm({ email: '', password: '', displayName: '' })
      setShowCreate(false)
      reload()
    } catch (err) {
      const msg = err.code === 'auth/email-already-in-use'
        ? 'This email is already registered.'
        : err.code === 'auth/invalid-email'
          ? 'Invalid email address.'
          : err.message
      setCreateStatus({ type: 'error', msg })
    } finally {
      setCreateLoading(false)
    }
  }

  const handleDelete = async (uid, email) => {
    if (!window.confirm(`Remove access for ${email}? This removes their record but does not delete their Firebase Auth account.`)) return
    setActionStatus((s) => ({ ...s, [uid]: 'Removing...' }))
    try {
      await removeAppUser(db, uid)
      setActionStatus((s) => ({ ...s, [uid]: null }))
      reload()
    } catch (err) {
      setActionStatus((s) => ({ ...s, [uid]: `Error: ${err.message}` }))
    }
  }

  const handleResetPassword = async (uid, email) => {
    setActionStatus((s) => ({ ...s, [uid]: 'Sending...' }))
    try {
      await sendResetEmail(auth, email)
      setActionStatus((s) => ({ ...s, [uid]: '✓ Reset email sent' }))
      setTimeout(() => setActionStatus((s) => ({ ...s, [uid]: null })), 3000)
    } catch (err) {
      setActionStatus((s) => ({ ...s, [uid]: `Error: ${err.message}` }))
    }
  }

  return (
    <div className="space-y-4">
      {/* Create user */}
      <div className="flex items-center justify-between">
        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{users.length} user{users.length !== 1 ? 's' : ''} registered</p>
        <button
          onClick={() => { setShowCreate((v) => !v); setCreateStatus(null) }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add user
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className={`rounded-xl border p-4 space-y-3 ${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>New user</p>
          {createStatus && (
            <div className={`px-3 py-2 rounded-xl text-xs border ${
              createStatus.type === 'success'
                ? isDark ? 'bg-brand-900/30 border-brand-700 text-brand-300' : 'bg-brand-50 border-brand-200 text-brand-700'
                : isDark ? 'bg-rose-900/30 border-rose-700 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}>{createStatus.msg}</div>
          )}
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Display name</label>
            <input className={inputClass} placeholder="John Doe" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Email address</label>
            <input type="email" required className={inputClass} placeholder="user@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Password <span className={`font-normal ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>(min 6 chars — share this manually)</span></label>
            <input type="text" required className={inputClass} placeholder="Set a strong password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={createLoading} className="px-4 py-1.5 rounded-xl bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 disabled:opacity-60 transition-colors">
              {createLoading ? 'Creating...' : 'Create user'}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className={`px-4 py-1.5 rounded-xl text-xs font-medium border ${isDark ? 'border-slate-600 text-slate-400 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* User list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className={`py-8 text-center text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          No users added yet. Click "Add user" to create one.
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              isDark={isDark}
              actionStatus={actionStatus[u.id]}
              onResetPassword={() => handleResetPassword(u.id, u.email)}
              onDelete={() => handleDelete(u.id, u.email)}
              onPermissionChange={async (field, value) => {
                try {
                  await updateUserPermissions(db, u.id, { [field]: value })
                  setUsers((prev) => prev.map((p) => p.id === u.id ? { ...p, [field]: value } : p))
                } catch (err) {
                  setActionStatus((s) => ({ ...s, [u.id]: `Error: ${err.message}` }))
                }
              }}
              onBuWorkspacesUpdate={async (allowedArr) => {
                try {
                  if (allowedArr == null) {
                    await updateUserPermissions(db, u.id, { allowedBuWorkspaces: deleteField() })
                    setUsers((prev) =>
                      prev.map((p) => {
                        if (p.id !== u.id) return p
                        const next = { ...p }
                        delete next.allowedBuWorkspaces
                        return next
                      }),
                    )
                  } else {
                    await updateUserPermissions(db, u.id, { allowedBuWorkspaces: allowedArr })
                    setUsers((prev) =>
                      prev.map((p) => (p.id === u.id ? { ...p, allowedBuWorkspaces: allowedArr } : p)),
                    )
                  }
                } catch (err) {
                  setActionStatus((s) => ({ ...s, [u.id]: `Error: ${err.message}` }))
                }
              }}
            />
          ))}
        </div>
      )}

      <p className={`text-[11px] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
        * "Reset password" sends a reset link to the user's email. "Remove" revokes dashboard access. Tab permissions refresh on next login; WhatsApp BU access updates on the next page load or immediately when the user changes workspace.
      </p>
    </div>
  )
}

/* ─── Main Settings Page ──────────────────────────────────────────── */
export default function Settings({ theme, setTheme, user, isDark, isAdmin }) {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwStatus, setPwStatus] = useState(null)
  const [pwLoading, setPwLoading] = useState(false)
  const [notifDelivery, setNotifDelivery] = useState(false)
  const [notifFailed, setNotifFailed] = useState(false)

  const inputClass = `w-full px-3 py-2 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 ${
    isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
  }`

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwStatus(null)
    if (newPw !== confirmPw) { setPwStatus({ type: 'error', msg: 'New passwords do not match.' }); return }
    if (newPw.length < 6) { setPwStatus({ type: 'error', msg: 'Password must be at least 6 characters.' }); return }
    setPwLoading(true)
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPw)
      await reauthenticateWithCredential(auth.currentUser, credential)
      await updatePassword(auth.currentUser, newPw)
      setPwStatus({ type: 'success', msg: 'Password updated successfully.' })
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential')
        setPwStatus({ type: 'error', msg: 'Current password is incorrect.' })
      else setPwStatus({ type: 'error', msg: err.message })
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Settings</h1>
          <p className={`text-sm mt-1 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Manage your account and dashboard preferences.</p>
        </div>

        {/* Account */}
        <Section title="Account" description="Your login and profile details." isDark={isDark}>
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold ${isDark ? 'bg-slate-700 text-brand-400' : 'bg-brand-100 text-brand-600'}`}>
              {user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <p className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{user?.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${isDark ? 'bg-brand-900/40 text-brand-400' : 'bg-brand-50 text-brand-700'}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500" /> Active
                </span>
                {isAdmin && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${isDark ? 'bg-amber-900/40 text-amber-400' : 'bg-amber-50 text-amber-700'}`}>
                    ⚡ Admin
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className={`mt-4 pt-4 border-t text-[11px] ${isDark ? 'border-slate-700 text-slate-500' : 'border-slate-100 text-slate-400'}`}>
            UID: <span className="font-mono">{user?.uid}</span>
          </div>
        </Section>

        {/* Appearance */}
        <Section title="Appearance" description="Choose how the dashboard looks." isDark={isDark}>
          <div className={`divide-y ${isDark ? 'divide-slate-700' : 'divide-slate-100'}`}>
            <ToggleRow
              label="Dark mode"
              description="Switch between light and dark interface."
              checked={theme === 'dark'}
              onChange={(v) => setTheme(v ? 'dark' : 'light')}
              isDark={isDark}
            />
          </div>
        </Section>

        {/* Notifications */}
        <Section title="Notifications" description="Control which events trigger alerts." isDark={isDark}>
          <div className={`divide-y ${isDark ? 'divide-slate-700' : 'divide-slate-100'}`}>
            <ToggleRow label="Delivery drop alerts" description="Alert when delivery rate drops below 80%." checked={notifDelivery} onChange={setNotifDelivery} isDark={isDark} />
            <ToggleRow label="Failed message alerts" description="Alert when a campaign has failed messages." checked={notifFailed} onChange={setNotifFailed} isDark={isDark} />
          </div>
        </Section>

        {/* User Management — admin only */}
        {isAdmin && (
          <Section
            title="User Management"
            description="Create viewer accounts, tab access, and which WhatsApp business units (MBA, IHM, BBA, …) each user may open. Only you (admin) can see this section."
            isDark={isDark}
          >
            <div className={`flex items-start gap-3 mb-4 p-3 rounded-xl ${isDark ? 'bg-amber-900/20 border border-amber-800/40' : 'bg-amber-50 border border-amber-200'}`}>
              <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" /></svg>
              <p className={`text-xs ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
                Users you create will see analytics data with <strong>masked emails and phone numbers</strong> (only last 3 digits visible). They cannot access the Settings tab.
                Expand <strong>Permissions</strong> on a user to choose business units: e.g. <strong>MBA only</strong>, <strong>BBA only</strong>, or several BUs—the workspace switcher in the header will match what you allow.
              </p>
            </div>
            <UserManagement isDark={isDark} />
          </Section>
        )}

        {/* Change Password */}
        <Section title="Change Password" description="Update your login password." isDark={isDark}>
          <form onSubmit={handleChangePassword} className="space-y-4">
            {pwStatus && (
              <div className={`px-3 py-2 rounded-xl text-sm border ${
                pwStatus.type === 'success'
                  ? isDark ? 'bg-brand-900/30 border-brand-700 text-brand-300' : 'bg-brand-50 border-brand-200 text-brand-700'
                  : isDark ? 'bg-rose-900/30 border-rose-700 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}>{pwStatus.msg}</div>
            )}
            <div>
              <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Current password</label>
              <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required className={inputClass} placeholder="••••••••" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>New password</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required className={inputClass} placeholder="••••••••" />
              </div>
              <div>
                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Confirm new password</label>
                <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required className={inputClass} placeholder="••••••••" />
              </div>
            </div>
            <button type="submit" disabled={pwLoading} className="inline-flex items-center justify-center px-5 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60 transition-colors">
              {pwLoading ? 'Updating...' : 'Update password'}
            </button>
          </form>
        </Section>

        {/* About */}
        <Section title="About" isDark={isDark}>
          <div className={`space-y-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {[['App', 'ITM Call & WhatsApp Analytics'], ['Version', '1.0.0'], ['Database', 'Firebase Firestore']].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span>{k}</span>
                <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>{v}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
