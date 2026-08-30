import type { DataSource } from '@/types/dataSource'

/** How a connection was set up — drives Sources status + actions. */
export type SourceSetupMode = 'pending' | 'fixture' | 'live' | 'credentials'

export function readSourceSetupMode(
  source: Pick<DataSource, 'config' | 'type'>,
): SourceSetupMode {
  const mode = String(source.config?.mode ?? '').toLowerCase()
  if (mode === 'pending') return 'pending'
  if (mode === 'fixture') return 'fixture'
  if (mode === 'live') return 'live'
  // Postgres / Mongo / uploads have no mode — treat as credentials when present
  if (
    source.type === 'postgresql' ||
    source.type === 'mongodb' ||
    source.type === 'excel' ||
    source.type === 'csv'
  ) {
    return 'credentials'
  }
  return mode === 'credentials' ? 'credentials' : 'fixture'
}

export function isPendingSource(source: Pick<DataSource, 'config'>): boolean {
  return String(source.config?.mode ?? '').toLowerCase() === 'pending'
}

export function canSyncSource(source: DataSource): boolean {
  if (!source.syncable) return false
  if (isPendingSource(source)) return false
  return true
}

export type SourceStatusDisplay = {
  label: string
  dot: string
  pill: string
  kind: 'connected' | 'demo' | 'pending' | 'needs_sync' | 'error'
}

export function sourceStatusDisplay(source: DataSource): SourceStatusDisplay {
  const setup = readSourceSetupMode(source)
  if (source.status === 'error') {
    return {
      label: 'Error',
      kind: 'error',
      dot: 'bg-[#ff6b6b]',
      pill: 'border border-solid border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.1)] text-[#ff6b6b]',
    }
  }
  if (setup === 'pending') {
    return {
      label: 'Needs credentials',
      kind: 'pending',
      dot: 'bg-[#f0a020]',
      pill: 'border border-solid border-[rgba(240,160,32,0.35)] bg-[rgba(240,160,32,0.1)] text-[#f0a020]',
    }
  }
  if (source.status === 'active' && setup === 'fixture') {
    return {
      label: 'Demo data',
      kind: 'demo',
      dot: 'bg-[#7aa2c8]',
      pill: 'border border-solid border-[rgba(122,162,200,0.35)] bg-[rgba(122,162,200,0.1)] text-[#a8c5de]',
    }
  }
  if (source.status === 'active') {
    return {
      label: 'Connected',
      kind: 'connected',
      dot: 'bg-[#d0d8e0]',
      pill: 'pdf-shine text-[#d0d8e0]',
    }
  }
  if (setup === 'fixture') {
    return {
      label: 'Demo · needs sync',
      kind: 'needs_sync',
      dot: 'bg-[#f0a020]',
      pill: 'border border-solid border-[rgba(240,160,32,0.35)] bg-[rgba(240,160,32,0.1)] text-[#f0a020]',
    }
  }
  return {
    label: 'Needs sync',
    kind: 'needs_sync',
    dot: 'bg-[#f0a020]',
    pill: 'border border-solid border-[rgba(240,160,32,0.35)] bg-[rgba(240,160,32,0.1)] text-[#f0a020]',
  }
}

/** Last sync label — never use updatedAt (looks like synced when only edited). */
export function relativeLastSyncLabel(iso?: string | null): string {
  if (!iso) return 'Never synced'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'Never synced'
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (mins < 1) return 'Synced just now'
  if (mins < 60) return `Synced ${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `Synced ${hrs}h ago`
  return `Synced ${Math.round(hrs / 24)}d ago`
}

export function formatConnectorKeyLabel(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function pendingPackConfig(opts: {
  packId: string
  packKey: string
}): Record<string, unknown> {
  return {
    mode: 'pending',
    packId: opts.packId,
    packKey: opts.packKey,
  }
}

export function statusBadgeForSource(source: DataSource): {
  label: string
  className: string
} {
  const d = sourceStatusDisplay(source)
  if (d.kind === 'connected') {
    return { label: d.label, className: 'pdf-shine text-[#d0d8e0]' }
  }
  if (d.kind === 'error') {
    return { label: d.label, className: 'bg-error/10 text-error' }
  }
  if (d.kind === 'demo') {
    return {
      label: d.label,
      className: 'bg-[rgba(122,162,200,0.15)] text-[#a8c5de]',
    }
  }
  return { label: d.label, className: 'bg-amber-400/15 text-amber-300' }
}
