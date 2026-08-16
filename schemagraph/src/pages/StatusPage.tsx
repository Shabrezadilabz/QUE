import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPublicStatus } from '@/services/stitchApi'

/** Public status page (no auth) — ops transparency for clients. */
export function StatusPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchPublicStatus()
      .then((d) => setData(d as Record<string, unknown>))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const ok = Boolean(data?.ok)
  const inv = (data?.inventory || {}) as Record<string, number>
  const latency =
    (data?.db as { latencyMs?: number } | undefined)?.latencyMs ?? null

  return (
    <div className="min-h-full overflow-y-auto bg-canvas px-6 py-12 text-on-surface">
      <div className="mx-auto w-full max-w-[36rem]">
        <p className="font-label text-[11px] tracking-[0.2em] text-on-surface-variant uppercase">
          Que status
        </p>
        <h1 className="mt-2 font-headline text-3xl font-semibold tracking-tight">
          {error
            ? 'Unable to load status'
            : ok
              ? 'All systems operational'
              : 'Degraded'}
        </h1>
        <p className="mt-2 font-body text-[13px] text-on-surface-variant">
          Live health for the Que API and workspace inventory.
        </p>

        {error ? (
          <p className="mt-6 rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-[13px] text-error">
            {error}
          </p>
        ) : null}

        {data ? (
          <div className="mt-8 overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-low">
            <div
              className={[
                'border-b border-outline-variant/20 px-5 py-3 font-label text-[11px] tracking-widest uppercase',
                ok ? 'bg-tertiary/10 text-tertiary' : 'bg-error/10 text-error',
              ].join(' ')}
            >
              {ok ? 'Operational' : 'Attention needed'}
            </div>
            <div className="divide-y divide-outline-variant/15 px-5 py-1 text-[13px]">
              <Row label="API" value={ok ? 'ok' : 'down'} good={ok} />
              <Row
                label="DB latency"
                value={latency != null ? `${latency} ms` : '—'}
              />
              <Row label="Workspaces" value={String(inv.workspaces ?? '—')} />
              <Row label="Connections" value={String(inv.connections ?? '—')} />
              <Row label="Jobs" value={String(inv.jobs ?? '—')} />
              <Row
                label="Managed datasets"
                value={String(inv.managedDatasets ?? '—')}
              />
              <Row
                label="Region"
                value={String(data.region || 'unspecified')}
              />
              <Row
                label="Generated"
                value={String(data.generatedAt || '')}
              />
            </div>
          </div>
        ) : !error ? (
          <p className="mt-8 font-body text-[13px] text-on-surface-variant">
            Loading status…
          </p>
        ) : null}

        <p className="mt-8 font-body text-[12px] text-on-surface-variant">
          Public endpoint:{' '}
          <span className="font-mono text-secondary">GET /status</span>
          {' · '}
          metrics:{' '}
          <span className="font-mono text-secondary">
            GET /metrics?format=prom
          </span>
        </p>
        <Link
          to="/chat"
          className="mt-4 inline-block font-label text-[12px] text-secondary hover:underline"
        >
          ← Back to Assistant
        </Link>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  good,
}: {
  label: string
  value: string
  good?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3">
      <span className="shrink-0 text-on-surface-variant">{label}</span>
      <span
        className={[
          'max-w-[60%] break-all text-right font-mono text-[12px]',
          good === true
            ? 'text-tertiary'
            : good === false
              ? 'text-error'
              : 'text-on-surface',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  )
}

export default StatusPage
