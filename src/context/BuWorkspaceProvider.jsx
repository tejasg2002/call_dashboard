'use client'

import { Suspense, createContext, useCallback, useContext, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  WA_WORKSPACE_MBA,
  isNonMbaWaWorkspace,
  isRouteAllowedForBuWorkspace,
  nonMbaWaHomePath,
  normalizeWAWorkspace,
} from '../lib/waWorkspace'

const BU_WORKSPACE_STORAGE_KEY = 'bu_workspace'
const LEGACY_WA_WORKSPACE_STORAGE_KEY = 'wa_workspace'

const BuWorkspaceContext = createContext(null)

export function useBuWorkspace() {
  const ctx = useContext(BuWorkspaceContext)
  if (!ctx) throw new Error('useBuWorkspace must be used within BuWorkspaceProvider')
  return ctx
}

/** @deprecated Use useBuWorkspace — alias for WhatsApp pages. */
export const useWAWorkspace = useBuWorkspace

function readStoredBuWorkspace() {
  if (typeof window === 'undefined') return WA_WORKSPACE_MBA
  try {
    const next = localStorage.getItem(BU_WORKSPACE_STORAGE_KEY)
    if (next != null && String(next).trim() !== '') {
      return normalizeWAWorkspace(next)
    }
    const legacy = localStorage.getItem(LEGACY_WA_WORKSPACE_STORAGE_KEY)
    if (legacy != null && String(legacy).trim() !== '') {
      const w = normalizeWAWorkspace(legacy)
      try {
        localStorage.setItem(BU_WORKSPACE_STORAGE_KEY, w)
      } catch {}
      return w
    }
  } catch {}
  return WA_WORKSPACE_MBA
}

function syncUrlWorkspace(router, pathname, w) {
  const path = pathname.split('?')[0] || pathname
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  )
  if (w !== WA_WORKSPACE_MBA) {
    params.set('workspace', w)
  } else {
    params.delete('workspace')
  }
  const qs = params.toString()
  router.replace(qs ? `${path}?${qs}` : path, { scroll: false })
}

function BuWorkspaceProviderInner({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [workspace, setWorkspaceState] = useState(WA_WORKSPACE_MBA)

  useEffect(() => {
    const q = searchParams.get('workspace')
    if (q != null && String(q).trim() !== '') {
      setWorkspaceState(normalizeWAWorkspace(q))
      return
    }
    setWorkspaceState(readStoredBuWorkspace())
  }, [pathname, searchParams])

  useEffect(() => {
    const pathOnly = pathname.split('?')[0] || pathname
    if (!isRouteAllowedForBuWorkspace(pathOnly, workspace)) {
      router.replace(nonMbaWaHomePath(workspace), { scroll: false })
    }
  }, [workspace, pathname, router])

  const setWorkspace = useCallback(
    (next) => {
      const w = normalizeWAWorkspace(next)
      setWorkspaceState(w)
      try {
        localStorage.setItem(BU_WORKSPACE_STORAGE_KEY, w)
      } catch {}

      const pathOnly = pathname.split('?')[0] || pathname
      if (isNonMbaWaWorkspace(w) && !isRouteAllowedForBuWorkspace(pathOnly, w)) {
        router.replace(nonMbaWaHomePath(w), { scroll: false })
        return
      }
      syncUrlWorkspace(router, pathname, w)
    },
    [pathname, router],
  )

  return (
    <BuWorkspaceContext.Provider value={{ workspace, setWorkspace }}>
      {children}
    </BuWorkspaceContext.Provider>
  )
}

export function BuWorkspaceProvider({ children }) {
  return (
    <Suspense fallback={null}>
      <BuWorkspaceProviderInner>{children}</BuWorkspaceProviderInner>
    </Suspense>
  )
}
