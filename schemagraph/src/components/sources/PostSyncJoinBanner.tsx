/**
 * S2.4 — Top join suggestions banner after sync (Sources + Joins).
 */
import { Link } from 'react-router-dom'

export interface PostSyncJoinSummary {
  id: string
  label: string
  confidence?: number | null
  fromTable?: string
  toTable?: string
  crossSource?: boolean
}

interface PostSyncJoinBannerProps {
  joins: PostSyncJoinSummary[]
  suggestedCount?: number
  monkQueued?: boolean
  onDismiss?: () => void
}

export function PostSyncJoinBanner({
  joins,
  suggestedCount,
  monkQueued,
  onDismiss,
}: PostSyncJoinBannerProps) {
  if (!joins.length && !(suggestedCount && suggestedCount > 0)) return null

  return (
    <div className="border-b border-primary/30 bg-primary-container/15 px-md py-md">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <p className="font-label text-[11px] font-bold uppercase tracking-wider text-primary">
            Post-sync intelligence
          </p>
          <p className="mt-xs font-body text-[14px] text-on-surface">
            {suggestedCount ?? joins.length} join
            {(suggestedCount ?? joins.length) === 1 ? '' : 's'} inferred — review before modeling.
            {monkQueued ? ' Monk run queued.' : null}
          </p>
          {joins.length ? (
            <ul className="mt-sm space-y-xs text-[13px] text-on-surface-variant">
              {joins.slice(0, 5).map((j) => (
                <li key={j.id}>
                  • {j.label}
                  {j.confidence != null
                    ? ` (${Math.round(Number(j.confidence) * 100)}%)`
                    : null}
                  {j.crossSource ? ' · cross-source' : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-sm">
          <Link
            to="/joins"
            className="rounded bg-primary px-md py-2 font-label text-[12px] font-semibold text-on-primary"
          >
            Review joins
          </Link>
          {monkQueued ? (
            <Link
              to="/monk"
              className="rounded-lg border border-outline-variant px-md py-2 font-label text-[12px] font-semibold text-on-surface"
            >
              Open Monk
            </Link>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg px-md py-2 font-label text-[12px] text-on-surface-variant"
            >
              Dismiss
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default PostSyncJoinBanner
