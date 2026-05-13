'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/** User journey is merged into Applications; keep this route for bookmarks. */
export default function WAUserJourneyRedirectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const qs = searchParams.toString()
    router.replace(qs ? `/wa/application-form?${qs}` : '/wa/application-form')
  }, [router, searchParams])

  return (
    <div className="px-4 lg:px-8 py-12 max-w-[1600px] mx-auto text-center text-sm text-slate-500">
      Redirecting to Applications…
    </div>
  )
}
