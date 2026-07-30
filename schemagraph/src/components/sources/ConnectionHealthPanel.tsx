import { Link } from 'react-router-dom'
import type { DataSource } from '@/types/dataSource'
import { sourceTypeLabel } from '@/components/sidebar/SourceTypeIcon'

const STATUS_DOT: Record<DataSource['status'], string> = {
  active: 'bg-tertiary',
  warning: 'bg-sand',
  error: 'bg-error',
}

function relativeSyncLabel(iso?: string): string {
  if (!iso) return 'Never synced'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'Unknown'
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 1) return 'Synced just now'
  if (mins < 60) return `Synced ${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `Synced ${hrs}h ago`
  return `Synced ${Math.round(hrs / 24)}d ago`
}

type Props = {
  sources: DataSource[]
  onSelect: (id: string) => void
  onSync?: (id: string) => void
  canSync?: boolean
}

/**
 * First-class connection health — last sync, auth risk, re-auth / sync CTAs.
 */
export function ConnectionHealthPanel({
  sources,
  onSelect,
  onSync,
  canSync,
}: Props) {
  const active = sources.filter((s) => s.status === 'active').length
  const warning = sources.filter((s) => s.status === 'warning').length
  const error = sources.filter((s) => s.status === 'error').length
  const healthPct =
    sources.length === 0
      ? 100
      : Math.round((active / sources.length) * 10000) / 100

  const needsAttention = sources.filter((s) => s.status !== 'active')

  return (
    <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
      <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-lg">
        <h4 className="mb-xs font-headline text-lg font-semibold text-on-surface">
          Connection health
        </h4>
        <p className="mb-lg font-body text-[13px] text-on-surface-variant">
          Live status for every connector — sync early when auth looks stale.
        </p>
        <div className="space-y-md">
          <div className="flex items-center justify-between">
            <span className="font-body text-[13px] text-on-surface">
              Healthy sources
            </span>
            <span className="font-label text-base font-bold text-tertiary">
              {sources.length ? `${healthPct}%` : '—'}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-outline-variant/20">
            <div
              className="h-full bg-tertiary transition-all"
              style={{
                width: `${sources.length ? Math.min(100, healthPct) : 0}%`,
              }}
            />
          </div>
          <div className="flex flex-wrap gap-md font-body text-sm text-on-surface-variant">
            <span>
              <strong className="text-tertiary">{active}</strong> active
            </span>
            <span>
              <strong className="text-[#8a5a00]">{warning}</strong> warming
            </span>
            <span>
              <strong className="text-error">{error}</strong> attention
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-primary-container/20 bg-primary-container/10 p-lg">
        <h4 className="mb-xs font-headline text-lg font-semibold text-primary">
          {needsAttention.length
            ? 'Needs attention'
            : 'Demo path'}
        </h4>
        {needsAttention.length ? (
          <ul className="mb-md space-y-sm">
            {needsAttention.slice(0, 4).map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-sm rounded-lg bg-white/70 px-md py-sm"
              >
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className="flex min-w-0 items-center gap-sm text-left"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[s.status]}`}
                  />
                  <span className="truncate font-label text-sm font-semibold text-on-surface">
                    {s.name}
                  </span>
                  <span className="font-body text-sm text-on-surface-variant">
                    {sourceTypeLabel(s.type)} · {relativeSyncLabel(s.updatedAt)}
                  </span>
                </button>
                <div className="flex gap-sm">
                  {s.status === 'error' ? (
                    <button
                      type="button"
                      onClick={() => onSelect(s.id)}
                      className="rounded-md bg-error/10 px-sm py-1 font-label text-xs font-bold text-error"
                    >
                      Re-auth
                    </button>
                  ) : null}
                  {canSync && s.syncable && onSync ? (
                    <button
                      type="button"
                      onClick={() => onSync(s.id)}
                      className="rounded-md bg-primary/10 px-sm py-1 font-label text-xs font-bold text-primary"
                    >
                      Sync now
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-md font-body text-[13px] text-on-surface-variant">
            All connectors look healthy. Next: open Workspace, Promote a suggested
            join, then save a job — never auto-accept AI joins.
          </p>
        )}
        <Link
          to="/workspace"
          className="inline-flex items-center gap-xs font-label text-base font-bold text-primary hover:underline"
        >
          Open Workspace ↗
        </Link>
      </div>
    </div>
  )
}

export { relativeSyncLabel }
