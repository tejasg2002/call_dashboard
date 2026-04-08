'use client'

import { useState, useMemo, useEffect, useRef } from 'react'

export const DEFAULT_TABLE_PAGE_SIZE = 25

/**
 * Slice a list for table UI — only the current page is rendered (lighter DOM).
 * Initial data load is unchanged (same as WA cached snapshot pattern).
 */
export function useClientPagination(items, pageSize = DEFAULT_TABLE_PAGE_SIZE) {
  const list = Array.isArray(items) ? items : []
  const len = list.length
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(len / pageSize) || 1)

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize
    return list.slice(start, start + pageSize)
  }, [list, page, pageSize])

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages))
  }, [totalPages])

  const prevLenRef = useRef(len)
  useEffect(() => {
    if (prevLenRef.current !== len) {
      prevLenRef.current = len
      setPage(1)
    }
  }, [len])

  return { page, setPage, pageSize, total: len, totalPages, paginated }
}
