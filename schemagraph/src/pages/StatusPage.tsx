import { useEffect, useState } from 'react'
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

  return (
    <div className="min-h-screen bg-canvas px-md py-xl md:px-lg">
      <div className="mx-auto max-w-xl">
        <p className="font-label text-[11px] tracking-[0.2em] text-on-surface-variant uppercase">
          Que status
        </p>
        <h1 className="mt-sm font-headline text-2xl font-semibold">
          {error
            ? 'Unable to load status'
            : ok
              ? 'All systems operational'
              : 'Degraded'}
        </h1>
        {error ? (
          <p className="mt-md text-[13px] text-error">{error}</p>
        ) : null}
        {data ? (
          <div className="mt-lg space-y-sm rounded-xl border border-outline-variant/30 bg-white p-lg text-[13px]">
            <Row label="API" value={ok ? 'ok' : 'down'} />
            <Row
              label="DB latency"
              value={`${(data.db as { latencyMs?: number })?.latencyMs ?? '—'} ms`}
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
        ) : null}
        <p className="mt-lg text-[12px] text-on-surface-variant">
          Public endpoint: GET /status · metrics: GET /metrics?format=prom
        </p>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-md border-b border-outline-variant/10 py-sm last:border-0">
      <span className="text-on-surface-variant">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}

export default StatusPage
