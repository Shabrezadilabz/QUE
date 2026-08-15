import { Link } from 'react-router-dom'
import type { DataSource } from '@/types/dataSource'
import { sourceTypeLabel } from '@/components/sidebar/SourceTypeIcon'

const STATUS_DOT: Record<DataSource['status'], string> = {
  active: 'bg-tertiary',
  warning: 'bg-sand',
  error: 'bg-error',
}

function relativeSyncLabel(iso?: string | null): string {
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

function kindLabel(kind?: DataSource['lastSyncErrorKind']): string {
  if (kind === 'auth') return 'Auth'
  if (kind === 'network') return 'Network'
  if (kind === 'config') return 'Config'
  if (kind === 'unknown') return 'Error'
  return 'Attention'
}

/** Plain-language heal CTA for CEO / ops (no stack traces). */
function healMessage(s: DataSource): { title: string; detail: string; cta: string } {
  const name = s.name || 'This source'
  if (s.needsReauth || s.lastSyncErrorKind === 'auth') {
    return {
      title: `Reconnect ${name}`,
      detail:
        'Sign-in expired or was revoked. Update credentials — Que retries sync automatically after.',
      cta: 'Reconnect',
    }
  }
  if (s.lastSyncErrorKind === 'network') {
    return {
      title: `Can't reach ${name}`,
      detail:
        'Network or VPN issue. Check connectivity, then Sync now — Que already retries transient failures.',
      cta: 'Retry sync',
    }
  }
  if (s.lastSyncErrorKind === 'config') {
    return {
      title: `Fix settings for ${name}`,
      detail:
        'Warehouse, database, or schema name looks wrong. Update the connection form — no DE required for the edit.',
      cta: 'Fix settings',
    }
  }
  return {
    title: `${name} needs a check`,
    detail:
      s.lastSyncError?.slice(0, 160) ||
      'Last sync failed. Open the source, confirm credentials, then Sync now.',
    cta: 'Open & fix',
  }
}

type Props = {
  sources: DataSource[]
  onSelect: (id: string) => void
  onSync?: (id: string) => void
  canSync?: boolean
}

/**
 * Wave 1.3 — connection health strip + re-auth / sync CTAs.
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

  const needsAttention = sources.filter(
    (s) => s.status !== 'active' || s.needsReauth,
  )

  return (
    <div className="grid grid-cols-1 gap-lg lg:grid-cols-2">
      <div className="rounded-lg border border-outline-variant/10 bg-surface-container-low p-lg">
        <h4 className="mb-xs font-headline text-base font-semibold text-on-surface">
          Connection health
        </h4>
        <p className="mb-lg font-body text-[13px] text-on-surface-variant">
          Day-2 ops — last sync outcome and auth risk per connector.
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
            <span>
              <strong className="text-primary">
                {sources.filter((s) => s.syncSchedule && s.syncSchedule !== 'off')
                  .length}
              </strong>{' '}
              scheduled
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-primary-container/20 bg-secondary/10 p-lg">
        <h4 className="mb-xs font-headline text-base font-semibold text-secondary">
          {needsAttention.length ? 'Fix without a DE' : 'All clear'}
        </h4>
        <p className="mb-md font-body text-[12px] text-on-surface-variant">
          Que retries transient sync failures. Auth/config issues need one click
          below — schema-first, no lake copy.
        </p>
        {needsAttention.length ? (
          <ul className="mb-md space-y-sm">
            {needsAttention.slice(0, 5).map((s) => {
              const heal = healMessage(s)
              return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-sm rounded-lg bg-surface-container-low/70 px-md py-sm"
              >
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className="flex min-w-0 flex-1 items-center gap-sm text-left"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[s.status]}`}
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-label text-sm font-semibold text-on-surface">
                      {heal.title}
                    </span>
                    <span className="block truncate font-body text-[11px] text-on-surface-variant">
                      {heal.detail}
                    </span>
                    <span className="block truncate font-body text-[10px] text-on-surface-variant/80">
                      {sourceTypeLabel(s.type)} ·{' '}
                      {relativeSyncLabel(s.lastSyncAt || s.updatedAt)}
                      {s.lastSyncErrorKind
                        ? ` · ${kindLabel(s.lastSyncErrorKind)}`
                        : ''}
                    </span>
                  </span>
                </button>
                <div className="flex gap-sm">
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    className="rounded-md bg-error/10 px-sm py-1 font-label text-xs font-bold text-error"
                  >
                    {heal.cta}
                  </button>
                  {canSync && s.syncable && onSync ? (
                    <button
                      type="button"
                      onClick={() => onSync(s.id)}
                      className="rounded-md bg-secondary/10 px-sm py-1 font-label text-xs font-bold text-secondary"
                    >
                      Sync now
                    </button>
                  ) : null}
                </div>
              </li>
              )
            })}
          </ul>
        ) : (
          <p className="mb-md font-body text-[13px] text-on-surface-variant">
            All connectors look healthy. Next:{' '}
            <Link to="/outcome" className="font-semibold text-secondary hover:underline">
              Outcome
            </Link>{' '}
            or{' '}
            <Link to="/joins" className="font-semibold text-secondary hover:underline">
              Join Review
            </Link>{' '}
            — never auto-accept AI joins without the Green eval gate.
          </p>
        )}
        <Link
          to="/outcome"
          className="inline-flex items-center gap-xs font-label text-sm font-bold text-secondary hover:underline"
        >
          Open Outcome ↗
        </Link>
      </div>
    </div>
  )
}

export { relativeSyncLabel }
