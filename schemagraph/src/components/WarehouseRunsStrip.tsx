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
    <div className="mb-[12px] flex flex-wrap items-center gap-[8px] rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] px-[12px] py-[8px] text-[11px] text-[#a3afbe]">
      <span className="font-semibold tracking-[0.6px] text-[#8a9099] uppercase">Offer A runs</span>
      <span className="min-w-0 flex-1 truncate">
        {summary
          ? summary
          : 'No warehouse digests yet — build from recent external job runs.'}
        {failed != null && failed > 0 ? (
          <span className="ml-1 text-[#ff6b6b]">({failed} failed)</span>
        ) : null}
      </span>
      <button
        type="button"
        className="pdf-btn-ghost rounded-[4px] px-[10px] py-[4px] text-[11px]"
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
      <Link to="/compliance" className="text-[#d0d8e0] hover:underline">
        Compliance
      </Link>
    </div>
  )
}
