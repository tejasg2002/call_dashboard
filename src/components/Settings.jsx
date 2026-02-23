import { useState, useEffect } from 'react'
import {
  getAccessUsers,
  setAccessUsers,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendUserPasswordResetEmail,
  auth,
} from '../firebase'
import { maskEmailValue, maskPhoneValue } from '../context/MaskedViewContext'

const Settings = () => {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [yourPassword, setYourPassword] = useState('')
  const [newUserMasked, setNewUserMasked] = useState(true)
  const [existingEmail, setExistingEmail] = useState('')
  const [existingMasked, setExistingMasked] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resettingEmail, setResettingEmail] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      const list = await getAccessUsers()
      setUsers(list)
      setError(null)
    } catch (err) {
      setError(err?.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!email) return
    if (!email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    if (newPassword.length < 6) {
      setError('Password for the new user must be at least 6 characters.')
      return
    }
    if (!yourPassword) {
      setError('Enter your password so you can stay signed in after creating the user.')
      return
    }
    if (users.some((u) => u.email.toLowerCase() === email)) {
      setError('This user is already in the list.')
      return
    }
    const adminEmail = auth.currentUser?.email
    if (!adminEmail) {
      setError('You must be signed in to add users.')
      return
    }
    try {
      setSaving(true)
      setError(null)
      setSuccessMsg(null)
      const next = [...users, { email, masked: newUserMasked }]
      await setAccessUsers(next)
      setUsers(next)
      await createUserWithEmailAndPassword(auth, email, newPassword)
      await signInWithEmailAndPassword(auth, adminEmail, yourPassword)
      setNewEmail('')
      setNewPassword('')
      setYourPassword('')
      setSuccessMsg('User created and added to list.')
    } catch (err) {
      const msg = err?.message || 'Failed to add user'
      try {
        await setAccessUsers(users)
        setUsers(users)
      } catch (_) {}
      if (msg.includes('email-already-in-use')) {
        setError('This email is already registered. Use "Add existing user" below to add them to the restricted list only (they sign in with their existing password).')
      } else if (msg.includes('invalid-credential') || msg.includes('wrong-password')) {
        setError('Your password was incorrect. Try again with the correct password.')
      } else {
        setError(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleAddExisting = async () => {
    const email = existingEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    if (users.some((u) => u.email.toLowerCase() === email)) {
      setError('This user is already in the list.')
      return
    }
    try {
      setSaving(true)
      setError(null)
      setSuccessMsg(null)
      const next = [...users, { email, masked: existingMasked }]
      await setAccessUsers(next)
      setUsers(next)
      setExistingEmail('')
      setSuccessMsg('User added to list.')
    } catch (err) {
      setError(err?.message || 'Failed to add user')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleMask = async (emailKey, masked) => {
    const next = users.map((u) => (u.email.toLowerCase() === emailKey.toLowerCase() ? { ...u, masked } : u))
    try {
      setSaving(true)
      setError(null)
      await setAccessUsers(next)
      setUsers(next)
      setSuccessMsg(masked ? 'User will see masked data.' : 'User will see full data.')
    } catch (err) {
      setError(err?.message || 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  const handleResetPassword = async (emailKey) => {
    try {
      setResettingEmail(emailKey)
      setError(null)
      await sendUserPasswordResetEmail(emailKey)
      setSuccessMsg(`Password reset email sent to ${emailKey}.`)
    } catch (err) {
      setError(err?.message || 'Failed to send reset email')
    } finally {
      setResettingEmail(null)
    }
  }

  const handleRemove = async (emailToRemove) => {
    try {
      setSaving(true)
      setError(null)
      setSuccessMsg(null)
      const next = users.filter((u) => u.email.toLowerCase() !== emailToRemove.toLowerCase())
      await setAccessUsers(next)
      setUsers(next)
    } catch (err) {
      setError(err?.message || 'Failed to remove user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen p-4 lg:p-8 bg-[#f5f3f7]">
      <div className="max-w-[640px] mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Settings</h1>
          <p className="text-slate-600 text-sm">
            Add users who should see masked data (phone and email). When they sign in, only the last 3 digits of phone numbers and a masked email are visible.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
            {successMsg}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-lg font-semibold text-slate-900">Users & access</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Create logins or add existing users. Choose whether each user sees masked or full phone/email. Reset password sends them an email to set a new one.
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-3">
              <input
                type="email"
                placeholder="New user email (e.g. user@example.com)"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300 text-sm"
              />
              <input
                type="password"
                placeholder="Password for new user (min 6 characters) — share manually"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300 text-sm"
              />
              <div className="flex items-center gap-2">
                <span className="text-slate-600 text-sm">Data access:</span>
                <select
                  value={newUserMasked ? 'masked' : 'unmasked'}
                  onChange={(e) => setNewUserMasked(e.target.value === 'masked')}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm"
                >
                  <option value="masked">Masked (phone/email hidden)</option>
                  <option value="unmasked">Unmasked (full access)</option>
                </select>
              </div>
              <input
                type="password"
                placeholder="Your password (to stay signed in after creating the user)"
                value={yourPassword}
                onChange={(e) => setYourPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300 text-sm"
              />
              <button
                type="button"
                onClick={handleAdd}
                disabled={saving || !newEmail.trim() || newPassword.length < 6 || !yourPassword}
                className="w-full px-4 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-xl hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Creating user…' : 'Create user & add to list'}
              </button>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <p className="text-xs text-slate-500 mb-2">User already has an account? Add them and set access.</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="email"
                  placeholder="Existing user email"
                  value={existingEmail}
                  onChange={(e) => setExistingEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddExisting()}
                  className="flex-1 min-w-[180px] px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300 text-sm"
                />
                <select
                  value={existingMasked ? 'masked' : 'unmasked'}
                  onChange={(e) => setExistingMasked(e.target.value === 'masked')}
                  className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm"
                >
                  <option value="masked">Masked</option>
                  <option value="unmasked">Unmasked</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddExisting}
                  disabled={saving || !existingEmail.trim()}
                  className="px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 disabled:opacity-50"
                >
                  Add existing user
                </button>
              </div>
            </div>

            {loading ? (
              <p className="text-slate-500 text-sm">Loading...</p>
            ) : users.length === 0 ? (
              <p className="text-slate-500 text-sm">No users in the list yet. Create or add one above.</p>
            ) : (
              <ul className="space-y-2">
                {users.map((u) => (
                  <li
                    key={u.email}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 px-3 rounded-xl bg-slate-50 border border-slate-100"
                  >
                    <span className="text-slate-900 text-sm font-medium shrink-0">{u.email}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={u.masked ? 'masked' : 'unmasked'}
                        onChange={(e) => handleToggleMask(u.email, e.target.value === 'masked')}
                        disabled={saving}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-900 text-xs"
                      >
                        <option value="masked">Masked</option>
                        <option value="unmasked">Unmasked</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleResetPassword(u.email)}
                        disabled={saving || resettingEmail !== null}
                        className="text-xs font-medium text-slate-600 hover:text-violet-600 disabled:opacity-50"
                      >
                        {resettingEmail === u.email ? 'Sending…' : 'Reset password'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(u.email)}
                        disabled={saving}
                        className="text-slate-500 hover:text-rose-600 text-xs font-medium disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-6 p-4 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-600">
          <p className="font-medium text-slate-700 mb-2">Masked data preview</p>
          <p className="mb-1">Phone: 917535834008 → <span className="font-mono text-slate-900">{maskPhoneValue('917535834008')}</span></p>
          <p>Email: user@example.com → <span className="font-mono text-slate-900">{maskEmailValue('user@example.com')}</span></p>
        </div>
      </div>
    </div>
  )
}

export default Settings
