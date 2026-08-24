import { useEffect, useState } from 'react'
import { fetchWorkspaceSettings } from '@/services/stitchApi'

/** Whether Offer B managed plane is enabled for the active workspace. */
export function useManagedPlaneGate() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void fetchWorkspaceSettings()
      .then((payload) => {
        if (!cancelled) {
          setEnabled(payload.settings.enableManagedDataPlane === true)
        }
      })
      .catch(() => {
        if (!cancelled) setEnabled(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { enabled, loading }
}
