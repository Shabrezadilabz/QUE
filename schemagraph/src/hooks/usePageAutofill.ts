import { useEffect, useState } from 'react'
import {
  fetchPageAutofill,
  type AutofillPageInfo,
  type HealthScorecardData,
} from '@/services/stitchApi'

export function usePageAutofill(pageId?: string) {
  const [page, setPage] = useState<AutofillPageInfo | null>(null)
  const [global, setGlobal] = useState<Record<string, unknown> | null>(null)
  const [health, setHealth] = useState<HealthScorecardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchPageAutofill(pageId)
      .then((out) => {
        if (cancelled) return
        setPage(out.page || (pageId && out.pages?.[pageId]) || null)
        setGlobal(out.global || null)
        setHealth(out.health || null)
      })
      .catch(() => {
        if (!cancelled) {
          setPage(null)
          setGlobal(null)
          setHealth(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [pageId])

  return { page, global, health, loading }
}
