import { useEffect, useState } from 'react'
import {
  fetchPrivateRunnerConfig,
  updatePrivateRunnerConfig,
  checkPrivateRunnerHealthApi,
  fetchPrivateRunnerInstallGuide,
  type PrivateRunnerConfig,
  type PrivateRunnerHealth,
} from '@/services/stitchApi'
import {
  SETTINGS_PANEL,
  SettingsPanelHeader,
} from '@/components/settings/SettingsPdfUi'

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
  const [health, setHealth] = useState<PrivateRunnerHealth | null>(null)
  const [healthBusy, setHealthBusy] = useState(false)

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

  async function testHealth() {
    if (!workspaceId) return
    setHealthBusy(true)
    setErr(null)
    try {
      setHealth(await checkPrivateRunnerHealthApi(workspaceId))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setHealthBusy(false)
    }
  }

  async function downloadGuide() {
    if (!workspaceId) return
    setBusy(true)
    try {
      const guide = await fetchPrivateRunnerInstallGuide(workspaceId)
      const blob = new Blob([guide.markdown], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'que-private-runner-install.md'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={SETTINGS_PANEL}>
      <SettingsPanelHeader
        title="Private runner"
        subtitle="S11 — signed work order to your VPC URL; health probe + job isolation per install guide."
      />
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
      {health ? (
        <p
          className={[
            'mt-sm font-body text-[11px]',
            health.ok ? 'text-tertiary' : 'text-error',
          ].join(' ')}
        >
          Health: {health.ok ? 'reachable' : health.error || health.message || 'failed'}
          {health.latencyMs != null ? ` · ${health.latencyMs}ms` : ''}
        </p>
      ) : null}
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
            disabled={healthBusy || !enabled}
            onClick={() => void testHealth()}
            className="rounded-lg border border-outline-variant/40 px-md py-1.5 font-label text-[12px] disabled:opacity-40"
          >
            {healthBusy ? 'Checking…' : 'Test health'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void downloadGuide()}
            className="rounded-lg border border-outline-variant/40 px-md py-1.5 font-label text-[12px] disabled:opacity-40"
          >
            Install guide
          </button>
        </div>
      ) : null}
    </section>
  )
}
