import { createContext, useContext, useMemo, useState, useEffect } from 'react'
import { getAccessUsers } from '../firebase'

const MaskedViewContext = createContext(null)

export function useMaskedView() {
  const ctx = useContext(MaskedViewContext)
  return ctx || { shouldMask: false, maskPhone: (v) => v ?? '—', maskEmail: (v) => v ?? '—', maskText: (v) => v ?? '' }
}

/**
 * Masks phone so only last 3 digits are visible. Handles +91-xxx, 91xxxxxxxxxx, etc.
 * e.g. 917535834008 -> *******4008, +91-7376677667 -> *******667
 */
export function maskPhoneValue(phone) {
  if (phone == null || String(phone).trim() === '') return '—'
  const s = String(phone).replace(/\s/g, '')
  const digits = s.replace(/\D/g, '')
  if (digits.length < 4) return '***'
  const last3 = digits.slice(-3)
  return '*'.repeat(Math.min(digits.length - 3, 8)) + last3
}

/**
 * Masks email: first 2 chars + *** + @domain. e.g. adhikari@gmail.com -> ad***@gmail.com
 * If email is short, first char + *** + @domain.
 */
export function maskEmailValue(email) {
  if (email == null || String(email).trim() === '') return '—'
  const e = String(email).trim()
  const at = e.indexOf('@')
  if (at <= 0) return '***@***'
  const local = e.slice(0, at)
  const domain = e.slice(at)
  const visible = local.length <= 2 ? local.charAt(0) : local.slice(0, 2)
  return visible + '***' + domain
}

/**
 * Replaces email and phone patterns in a string with masked versions (for activity text).
 */
export function maskPiiInText(text) {
  if (text == null || typeof text !== 'string') return ''
  let out = text
  const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
  out = out.replace(emailRe, (match) => maskEmailValue(match))
  const phoneRe = /(\+?\d[\d\s-]{8,}\d|\d{10,})/g
  out = out.replace(phoneRe, (match) => maskPhoneValue(match))
  return out
}

export function MaskedViewProvider({ user, children }) {
  const [accessUsers, setAccessUsers] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!user) {
      setAccessUsers([])
      setLoaded(true)
      return
    }
    let cancelled = false
    getAccessUsers()
      .then((list) => {
        if (!cancelled) setAccessUsers(list)
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => { cancelled = true }
  }, [user])

  const shouldMask = useMemo(() => {
    if (!user?.email || !loaded) return false
    const entry = accessUsers.find((u) => u.email.toLowerCase() === user.email.toLowerCase())
    return entry ? !!entry.masked : false
  }, [user?.email, accessUsers, loaded])

  const value = useMemo(
    () => ({
      shouldMask,
      maskPhone: (v) => (shouldMask ? maskPhoneValue(v) : (v ?? '—')),
      maskEmail: (v) => (shouldMask ? maskEmailValue(v) : (v ?? '—')),
      maskText: (v) => (shouldMask ? maskPiiInText(v) : (v ?? '')),
      refreshRestrictedList: () => getAccessUsers().then(setAccessUsers),
    }),
    [shouldMask]
  )

  return (
    <MaskedViewContext.Provider value={value}>
      {children}
    </MaskedViewContext.Provider>
  )
}
