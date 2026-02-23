import { useState, useEffect } from 'react'
import {
  getRestrictedViewEmails,
  setRestrictedViewEmails,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  auth,
} from '../firebase'
import { maskEmailValue, maskPhoneValue } from '../context/MaskedViewContext'

const Settings = () => {
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [yourPassword, setYourPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [existingEmail, setExistingEmail] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      const list = await getRestrictedViewEmails()
      setEmails(list)
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
    if (emails.some((e) => e.toLowerCase() === email)) {
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
      // 1) Add to restricted list (while still signed in as admin)
      await setRestrictedViewEmails([...emails, email])
      setEmails((prev) => [...prev, email])
      // 2) Create the new user (this signs us in as the new user)
      await createUserWithEmailAndPassword(auth, email, newPassword)
      // 3) Sign back in as admin
      await signInWithEmailAndPassword(auth, adminEmail, yourPassword)
      setNewEmail('')
      setNewPassword('')
      setYourPassword('')
    } catch (err) {
      const msg = err?.message || 'Failed to add user'
      // Revert restricted list (we had already added the email)
      try {
        await setRestrictedViewEmails(emails)
        setEmails(emails)
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
    if (emails.some((e) => e.toLowerCase() === email)) {
      setError('This user is already in the list.')
      return
    }
    try {
      setSaving(true)
      setError(null)
      await setRestrictedViewEmails([...emails, email])
      setEmails((prev) => [...prev, email])
      setExistingEmail('')
    } catch (err) {
      setError(err?.message || 'Failed to add user')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (emailToRemove) => {
    try {
      setSaving(true)
      setError(null)
      const next = emails.filter((e) => e.toLowerCase() !== emailToRemove.toLowerCase())
      await setRestrictedViewEmails(next)
      setEmails(next)
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

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <h2 className="text-lg font-semibold text-slate-900">Restricted view users</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Create a login for them and add to the list. They will see masked data. Share the password with them manually.
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
                placeholder="Password for new user (min 6 characters) — share this with them manually"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300 text-sm"
              />
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
              <p className="text-xs text-slate-500 mb-2">User already has an account? Add them to the restricted list only.</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Existing user email"
                  value={existingEmail}
                  onChange={(e) => setExistingEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddExisting()}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-300 text-sm"
                />
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
            ) : emails.length === 0 ? (
              <p className="text-slate-500 text-sm">No restricted users yet. Add an email above.</p>
            ) : (
              <ul className="space-y-2">
                {emails.map((email) => (
                  <li
                    key={email}
                    className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-50 border border-slate-100"
                  >
                    <span className="text-slate-900 text-sm font-medium">{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemove(email)}
                      disabled={saving}
                      className="text-slate-500 hover:text-rose-600 text-xs font-medium disabled:opacity-50"
                    >
                      Remove
                    </button>
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
