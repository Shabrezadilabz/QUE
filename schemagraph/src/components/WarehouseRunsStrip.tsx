import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  buildWarehouseDigestApi,
  fetchWarehouseDigests,
} from '@/services/stitchApi'

/**
 * Offer A run feedback strip for chat — Databricks/Snowflake digests.
 */
export function WarehouseRunsStrip() {
  const [summary, setSummary] = useState<string | null>(null)
  const [failed, setFailed] = useState<number | null>(null)

  useEffect(() => {
    void fetchWarehouseDigests()
      .then((items) => {
        const latest = items[0]
        if (latest) {
          setSummary(latest.summary)
          setFailed(latest.failedCount)
        }
      })
      .catch(() => undefined)
  }, [])

  return (
    <div className="mb-sm flex flex-wrap items-center gap-sm rounded-lg border border-outline-variant/25 bg-white/80 px-md py-sm text-[11px] text-on-surface-variant">
      <span className="font-label tracking-widest uppercase">Offer A runs</span>
      <span className="min-w-0 flex-1 truncate">
        {summary
          ? summary
          : 'No warehouse digests yet — build from recent external job runs.'}
        {failed != null && failed > 0 ? (
          <span className="ml-1 text-error">({failed} failed)</span>
        ) : null}
      </span>
      <button
        type="button"
        className="rounded border border-primary/40 px-sm py-0.5 text-primary"
        onClick={() =>
          void buildWarehouseDigestApi()
            .then((d) => {
              setSummary(d.summary)
              setFailed(d.failedCount)
            })
            .catch(() => undefined)
        }
      >
        Refresh digest
      </button>
      <Link to="/compliance" className="text-primary underline">
        Compliance
      </Link>
    </div>
  )
}
