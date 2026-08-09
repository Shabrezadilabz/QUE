import { useEffect, useState } from 'react'
import {
  fetchPrivateRunnerConfig,
  updatePrivateRunnerConfig,
  type PrivateRunnerConfig,
} from '@/services/stitchApi'

/** Wave 4.5 — private runner callback MVP settings. */
export function PrivateRunnerPanel({
  workspaceId,
  canAdmin,
}: {
  workspaceId: string | null
  canAdmin: boolean
}) {
  const [config, setConfig] = useState<PrivateRunnerConfig | null>(null)
  const [url, setUrl] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [secretOnce, setSecretOnce] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    if (!workspaceId) return
    try {
      const c = await fetchPrivateRunnerConfig(workspaceId)
      setConfig(c)
      setUrl(c.runnerUrl || '')
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
      const c = await updatePrivateRunnerConfig(
        { enabled, runnerUrl: url, ...extra },
        workspaceId,
      )
      setConfig(c)
      if (c.runnerSecret) setSecretOnce(c.runnerSecret)
      setMsg('Saved private runner config.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-lg rounded-xl border border-outline-variant/30 bg-white p-lg shadow-sm">
      <h2 className="font-headline text-base font-semibold text-on-surface-variant">
        Private runner
      </h2>
      <p className="mt-xs max-w-[36rem] font-body text-[12px] text-on-surface-variant">
        Phase 3 — signed work order (schema v2, idempotency key, one retry) to
        your URL; runner callbacks{' '}
        <code className="text-[11px]">/runner/callback</code> (incl. heartbeat{' '}
        <code className="text-[11px]">running</code>). VPC agent image still
        optional later.
      </p>
      {err ? (
        <p className="mt-sm font-body text-[12px] text-error">{err}</p>
      ) : null}
      {msg ? (
        <p className="mt-sm font-body text-[12px] text-tertiary">{msg}</p>
      ) : null}
      {secretOnce ? (
        <p className="mt-sm rounded-lg bg-primary/5 px-md py-sm font-mono text-[11px] text-primary">
          New secret (copy now): {secretOnce}
        </p>
      ) : null}
      <label className="mt-md flex flex-col gap-1 font-label text-[11px] text-on-surface-variant">
        Runner URL
        <input
          disabled={!canAdmin || busy}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://runner.example/que"
          className="rounded-lg border border-outline-variant/40 px-sm py-1.5 text-[12px]"
        />
      </label>
      <label className="mt-sm flex items-center gap-2 font-label text-[12px]">
        <input
          type="checkbox"
          disabled={!canAdmin || busy}
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enabled
      </label>
      <p className="mt-sm font-body text-[11px] text-on-surface-variant">
        Secret configured: {config?.secretConfigured ? 'yes' : 'no'}
      </p>
      {canAdmin ? (
        <div className="mt-md flex flex-wrap gap-sm">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-lg border border-primary/30 bg-primary/5 px-md py-1.5 font-label text-[12px] text-primary disabled:opacity-40"
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
        </div>
      ) : null}
    </section>
  )
}
