const DB_NAME = 'dashboard_cache'
const DB_VERSION = 1

const STORES = {
  email: 'email_events',
  wa: 'wa_events',
}

const META_STORE = 'meta'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORES.email)) {
        db.createObjectStore(STORES.email, { keyPath: '_cacheKey' })
      }
      if (!db.objectStoreNames.contains(STORES.wa)) {
        db.createObjectStore(STORES.wa, { keyPath: '_cacheKey' })
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' })
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx(db, storeName, mode = 'readonly') {
  const transaction = db.transaction(storeName, mode)
  return transaction.objectStore(storeName)
}

export async function getCachedDocs(channel) {
  try {
    const db = await openDB()
    const store = tx(db, STORES[channel])
    return new Promise((resolve) => {
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

export async function setCachedDocs(channel, docs) {
  try {
    const db = await openDB()
    const transaction = db.transaction(STORES[channel], 'readwrite')
    const store = transaction.objectStore(STORES[channel])
    store.clear()
    for (const doc of docs) {
      const key = doc._id || doc.id || doc._cacheKey || Math.random().toString(36)
      store.put({ ...doc, _cacheKey: key })
    }
    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
    })
  } catch {}
}

export async function mergeCachedDocs(channel, newDocs) {
  try {
    const db = await openDB()
    const transaction = db.transaction(STORES[channel], 'readwrite')
    const store = transaction.objectStore(STORES[channel])
    for (const doc of newDocs) {
      const key = doc._id || doc.id || doc._cacheKey || Math.random().toString(36)
      store.put({ ...doc, _cacheKey: key })
    }
    return new Promise((resolve) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
    })
  } catch {}
}

export async function getLastFetchTime(channel) {
  try {
    const db = await openDB()
    const store = tx(db, META_STORE)
    return new Promise((resolve) => {
      const req = store.get(channel)
      req.onsuccess = () => resolve(req.result?.timestamp || null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function setLastFetchTime(channel, timestamp) {
  try {
    const db = await openDB()
    const store = tx(db, META_STORE, 'readwrite')
    store.put({ key: channel, timestamp })
  } catch {}
}
