import { useEffect, useState } from 'react'
import {
  fetchOrchestratorConfig,
  updateOrchestratorConfig,
  testOrchestrator,
  type OrchestratorConfig,
} from '@/services/stitchApi'

/** Wave 4.3 — Airflow/Dagster/generic webhook trigger settings. */
export function OrchestratorPanel({
  workspaceId,
  canAdmin,
}: {
  workspaceId: string | null
  canAdmin: boolean
}) {
  const [config, setConfig] = useState<OrchestratorConfig | null>(null)
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<'generic' | 'airflow' | 'dagster'>('generic')
  const [enabled, setEnabled] = useState(false)
  const [secretOnce, setSecretOnce] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    if (!workspaceId) return
    setErr(null)
    try {
      const c = await fetchOrchestratorConfig(workspaceId)
      setConfig(c)
      setUrl(c.webhookUrl || '')
      setKind(c.kind)
      setEnabled(c.enabled)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  async function save(extra: Record<string, unknown> = {}) {
    if (!workspaceId || !canAdmin) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    setSecretOnce(null)
    try {
      const c = await updateOrchestratorConfig(
        {
          enabled,
          kind,
          webhookUrl: url,
          ...extra,
        },
        workspaceId,
      )
      setConfig(c)
      if (c.webhookSecret) setSecretOnce(c.webhookSecret)
      setMsg('Saved orchestrator config.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function onTest() {
    if (!workspaceId || !canAdmin) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const r = await testOrchestrator(workspaceId)
      setMsg(
        r.skipped
          ? `Skipped: ${r.reason}`
          : r.ok
            ? `Ping ok (HTTP ${r.status})`
            : `Ping soft-fail: ${r.error || 'HTTP ' + r.status}`,
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-lg rounded-xl border border-outline-variant/30 bg-surface-container-low p-lg">
      <h2 className="font-headline text-base font-semibold text-on-surface-variant">
        External orchestrator
      </h2>
      <p className="mt-xs max-w-[36rem] font-body text-[12px] text-on-surface-variant">
        Wave 4.3 — HMAC POST to Airflow/Dagster/generic webhook after Que runs.
        Que does not rebuild Airflow.
      </p>
      {err ? (
        <p className="mt-sm font-body text-[12px] text-error">{err}</p>
      ) : null}
      {msg ? (
        <p className="mt-sm font-body text-[12px] text-tertiary">{msg}</p>
      ) : null}
      {secretOnce ? (
        <p className="mt-sm rounded-lg bg-secondary/5 px-md py-sm font-mono text-[11px] text-secondary">
          New secret (copy now): {secretOnce}
        </p>
      ) : null}
      <div className="mt-md grid gap-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1 font-label text-[11px] text-on-surface-variant sm:col-span-2">
          Webhook URL
          <input
            disabled={!canAdmin || busy}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="rounded-lg border border-outline-variant/40 px-sm py-1.5 text-[12px]"
          />
        </label>
        <label className="flex flex-col gap-1 font-label text-[11px] text-on-surface-variant">
          Kind
          <select
            disabled={!canAdmin || busy}
            value={kind}
            onChange={(e) =>
              setKind(e.target.value as 'generic' | 'airflow' | 'dagster')
            }
            className="rounded-lg border border-outline-variant/40 px-sm py-1.5 text-[12px]"
          >
            <option value="generic">Generic</option>
            <option value="airflow">Airflow</option>
            <option value="dagster">Dagster</option>
          </select>
        </label>
        <label className="flex items-center gap-2 font-label text-[12px] text-on-surface">
          <input
            type="checkbox"
            disabled={!canAdmin || busy}
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enabled
        </label>
      </div>
      <p className="mt-sm font-body text-[11px] text-on-surface-variant">
        Secret configured: {config?.secretConfigured ? 'yes' : 'no'}
      </p>
      {canAdmin ? (
        <div className="mt-md flex flex-wrap gap-sm">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-lg border border-secondary/40 bg-secondary/5 px-md py-1.5 font-label text-[12px] text-secondary disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save({ rotateSecret: true })}
            className="rounded-lg border border-outline-variant/40 px-md py-1.5 font-label text-[12px] disabled:opacity-40"
          >
            Rotate secret
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onTest()}
            className="rounded-lg border border-outline-variant/40 px-md py-1.5 font-label text-[12px] disabled:opacity-40"
          >
            Test ping
          </button>
        </div>
      ) : null}
    </section>
  )
}
