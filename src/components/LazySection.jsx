'use client'

import { useRef, useState, useEffect } from 'react'

/**
 * Renders children only once the wrapper scrolls into (or near) the viewport.
 * Shows a skeleton placeholder until then, with a fade-in on reveal.
 *
 * @param {string}  height     – min-height for the placeholder (e.g. "200px")
 * @param {number}  rootMargin – px before the viewport edge to trigger (default 200)
 * @param {string}  className  – extra classes on the outer wrapper
 */
export default function LazySection({
  children,
  height = '180px',
  rootMargin = 200,
  className = '',
}) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: `${rootMargin}px` },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin])

  return (
    <div ref={ref} className={className}>
      {visible ? (
        <div className="animate-[fadeSlideIn_0.45s_ease-out_both]">
          {children}
        </div>
      ) : (
        <Skeleton height={height} />
      )}
    </div>
  )
}

function Skeleton({ height }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ minHeight: height }}
    >
      <div className="animate-pulse space-y-4 p-6">
        <div className="h-4 w-1/3 rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800/60"
            />
          ))}
        </div>
        <div className="h-3 w-2/3 rounded-lg bg-slate-100 dark:bg-slate-800/40" />
        <div className="h-3 w-1/2 rounded-lg bg-slate-100 dark:bg-slate-800/40" />
      </div>
    </div>
  )
}
