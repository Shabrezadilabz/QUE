import { useEffect, useState } from 'react'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  closeBreakGlassApi,
  createApiKeyApi,
  createScimTokenApi,
  createAbacPolicyApi,
  disableCmkApi,
  enableCmkApi,
  exportSoc2EvidenceApi,
  fetchAbacPolicies,
  fetchApiKeys,
  fetchBreakGlass,
  fetchCmkStatus,
  fetchScimTokens,
  fetchSiemConfig,
  fetchWorkspaceSettings,
  openBreakGlassApi,
  pushSiemApi,
  revokeApiKeyApi,
  runIsolationTestApi,
  updateSiemConfigApi,
  updateWorkspaceSettings,
  type ApiKeyRow,
  type BreakGlassEvent,
  type CmkStatus,
  type ScimTokenRow,
  type WorkspaceSettingsFlags,
} from '@/services/stitchApi'

/**
 * Phase 5 — Enterprise control plane (SCIM, SSO enforce, CMK, SIEM, evidence).
 */
export function EnterpriseSettingsPage() {
  const { canAdmin, canOwner } = useWorkspaceRole()
  const [draft, setDraft] = useState<Partial<WorkspaceSettingsFlags> | null>(
    null,
  )
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [scim, setScim] = useState<ScimTokenRow[]>([])
  const [cmk, setCmk] = useState<CmkStatus | null>(null)
  const [glass, setGlass] = useState<BreakGlassEvent[]>([])
  const [siemUrl, setSiemUrl] = useState('')
  const [siemEnabled, setSiemEnabled] = useState(false)
  const [siemLastExported, setSiemLastExported] = useState<string | null>(null)
  const [siemPushResult, setSiemPushResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [secretOnce, setSecretOnce] = useState<string | null>(null)
  const [evidenceMd, setEvidenceMd] = useState<string | null>(null)
  const [glassReason, setGlassReason] = useState('')
  const [abacName, setAbacName] = useState('Deny export for viewers')

  async function reload() {
    const [settings, k, s, c, g, siem] = await Promise.all([
      fetchWorkspaceSettings(),
      fetchApiKeys(),
      fetchScimTokens(),
      fetchCmkStatus(),
      fetchBreakGlass(),
      fetchSiemConfig(),
    ])
    setDraft({
      enforceSso: settings.settings.enforceSso === true,
      dataRegion: settings.settings.dataRegion ?? '',
      dataResidency: settings.settings.dataResidency ?? '',
      slaUptimeTarget: settings.settings.slaUptimeTarget ?? '99.9%',
      slaRpoHours: settings.settings.slaRpoHours ?? 24,
      slaRtoHours: settings.settings.slaRtoHours ?? 4,
    })
    setKeys(k)
    setScim(s)
    setCmk(c)
    setGlass(g)
    setSiemUrl(siem.webhookUrl || '')
    setSiemEnabled(siem.enabled)
    setSiemLastExported(siem.lastExportedAt ?? null)
  }

  useEffect(() => {
    reload().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }, [])

  async function saveFlags() {
    if (!canAdmin || !draft) return
    setBusy(true)
    setError(null)
    try {
      await updateWorkspaceSettings(draft)
      setToast('Enterprise settings saved')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-md py-lg md:px-lg">
      <div className="mb-lg">
        <h1 className="font-headline text-xl font-semibold text-on-surface">
          Enterprise control plane
        </h1>
        <p className="mt-xs max-w-[42rem] font-body text-[13px] text-on-surface-variant">
          Phase 5 — SCIM, enforced SSO, CMK, ABAC, SIEM export, isolation tests,
          and a SOC 2 <em>evidence pack</em>. This is not Type II certification.
        </p>
      </div>

      {error ? (
        <p className="mb-md rounded-xl border border-error/40 bg-error/10 px-md py-sm font-body text-[13px] text-error">
          {error}
        </p>
      ) : null}
      {toast ? (
        <p className="mb-md rounded-xl border border-secondary/25 bg-secondary/5 px-md py-sm font-label text-[12px] text-secondary">
          {toast}
        </p>
      ) : null}
      {secretOnce ? (
        <p className="mb-md rounded-xl border border-secondary/40 bg-secondary/5 px-md py-sm font-mono text-[11px] text-secondary break-all">
          Copy now: {secretOnce}
        </p>
      ) : null}

      <section className="mb-lg rounded-xl border border-outline-variant/30 bg-surface-container-low p-lg">
        <h2 className="font-headline text-base font-semibold text-on-surface-variant">
          Identity &amp; residency
        </h2>
        <label className="mt-md flex items-center gap-2 font-label text-[13px]">
          <input
            type="checkbox"
            disabled={!canAdmin || busy}
            checked={draft?.enforceSso === true}
            onChange={(e) =>
              setDraft((d) => ({ ...d, enforceSso: e.target.checked }))
            }
          />
          Enforce SSO (block password login; break-glass excepted)
        </label>
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <label className="block">
            <span className="mb-xs block font-label text-[11px] uppercase tracking-widest text-on-surface-variant">
              Data region
            </span>
            <input
              value={draft?.dataRegion ?? ''}
              disabled={!canAdmin || busy}
              onChange={(e) =>
                setDraft((d) => ({ ...d, dataRegion: e.target.value }))
              }
              placeholder="us-east-1"
              className="w-full rounded-lg border border-outline-variant/40 px-md py-sm font-body text-[13px]"
            />
          </label>
          <label className="block">
            <span className="mb-xs block font-label text-[11px] uppercase tracking-widest text-on-surface-variant">
              Uptime target (non-contractual)
            </span>
            <input
              value={draft?.slaUptimeTarget ?? '99.9%'}
              disabled={!canAdmin || busy}
              onChange={(e) =>
                setDraft((d) => ({ ...d, slaUptimeTarget: e.target.value }))
              }
              className="w-full rounded-lg border border-outline-variant/40 px-md py-sm font-body text-[13px]"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={!canAdmin || busy}
          onClick={() => void saveFlags()}
          className="mt-md rounded bg-secondary px-md py-2 font-label text-[12px] text-on-secondary disabled:opacity-40"
        >
          Save
        </button>
      </section>

      <div className="grid gap-lg lg:grid-cols-2">
        <section className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-lg">
          <h2 className="font-headline text-base font-semibold text-on-surface-variant">
            API keys
          </h2>
          <button
            type="button"
            disabled={!canAdmin || busy}
            onClick={() => {
              setBusy(true)
              createApiKeyApi({ name: 'service', scopes: ['read', 'write'] })
                .then((k) => {
                  setSecretOnce(k.token || null)
                  setToast('API key created')
                  return reload()
                })
                .catch((err) =>
                  setError(err instanceof Error ? err.message : String(err)),
                )
                .finally(() => setBusy(false))
            }}
            className="mt-md rounded-lg border border-secondary px-md py-2 font-label text-[12px] text-secondary disabled:opacity-40"
          >
            Create scoped key
          </button>
          <ul className="mt-md space-y-sm">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex items-center justify-between gap-sm rounded-lg bg-surface-container-low px-md py-sm font-body text-[12px]"
              >
                <span>
                  {k.name} · {k.tokenPrefix}… · {(k.scopes || []).join(',')}
                  {k.revokedAt ? ' · revoked' : ''}
                </span>
                {!k.revokedAt ? (
                  <button
                    type="button"
                    disabled={!canAdmin || busy}
                    onClick={() =>
                      void revokeApiKeyApi(k.id)
                        .then(reload)
                        .catch((err) =>
                          setError(
                            err instanceof Error ? err.message : String(err),
                          ),
                        )
                    }
                    className="font-label text-[11px] text-error"
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-lg">
          <h2 className="font-headline text-base font-semibold text-on-surface-variant">
            SCIM 2.0
          </h2>
          <p className="mt-xs font-body text-[12px] text-on-surface-variant">
            IdP base URL:{' '}
            <code className="text-[11px]">/workspaces/:id/scim/v2</code>
          </p>
          <button
            type="button"
            disabled={!canAdmin || busy}
            onClick={() => {
              setBusy(true)
              createScimTokenApi()
                .then((t) => {
                  setSecretOnce(t.token || null)
                  setToast('SCIM token created')
                  return reload()
                })
                .catch((err) =>
                  setError(err instanceof Error ? err.message : String(err)),
                )
                .finally(() => setBusy(false))
            }}
            className="mt-md rounded-lg border border-secondary px-md py-2 font-label text-[12px] text-secondary disabled:opacity-40"
          >
            Mint SCIM bearer
          </button>
          <ul className="mt-md space-y-sm">
            {scim.map((t) => (
              <li
                key={t.id}
                className="rounded-lg bg-surface-container-low px-md py-sm font-body text-[12px]"
              >
                {t.name} · {t.tokenPrefix}…
                {t.revokedAt ? ' · revoked' : ''}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-lg">
          <h2 className="font-headline text-base font-semibold text-on-surface-variant">
            CMK
          </h2>
          <p className="mt-xs font-body text-[12px] text-on-surface-variant">
            {cmk?.enabled
              ? `Enabled · ${cmk.keyId}`
              : 'Disabled — platform key wraps secrets'}
          </p>
          <div className="mt-md flex flex-wrap gap-sm">
            <button
              type="button"
              disabled={!canOwner || busy}
              onClick={() =>
                void enableCmkApi()
                  .then((c) => {
                    setCmk(c)
                    setToast('CMK enabled')
                  })
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : String(err)),
                  )
              }
              className="rounded bg-secondary px-md py-2 font-label text-[12px] text-on-secondary disabled:opacity-40"
            >
              Enable CMK
            </button>
            <button
              type="button"
              disabled={!canOwner || busy || !cmk?.enabled}
              onClick={() =>
                void disableCmkApi()
                  .then(setCmk)
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : String(err)),
                  )
              }
              className="rounded-lg border border-outline-variant/40 px-md py-2 font-label text-[12px] disabled:opacity-40"
            >
              Disable
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-lg">
          <h2 className="font-headline text-base font-semibold text-on-surface-variant">
            Break-glass
          </h2>
          <input
            value={glassReason}
            onChange={(e) => setGlassReason(e.target.value)}
            placeholder="Incident reason (min 8 chars)"
            disabled={!canOwner || busy}
            className="mt-md w-full rounded-lg border border-outline-variant/40 px-md py-sm font-body text-[13px]"
          />
          <button
            type="button"
            disabled={!canOwner || busy || glassReason.trim().length < 8}
            onClick={() =>
              void openBreakGlassApi({ reason: glassReason, hours: 4 })
                .then(() => {
                  setGlassReason('')
                  setToast('Break-glass open for 4h')
                  return reload()
                })
                .catch((err) =>
                  setError(err instanceof Error ? err.message : String(err)),
                )
            }
            className="mt-sm rounded-lg border border-error/40 px-md py-2 font-label text-[12px] text-error disabled:opacity-40"
          >
            Open 4h window
          </button>
          <ul className="mt-md max-h-40 space-y-sm overflow-y-auto">
            {glass.slice(0, 8).map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-sm rounded-lg bg-surface-container-low px-md py-sm font-body text-[11px]"
              >
                <span>
                  {e.status} · {e.reason.slice(0, 60)}
                </span>
                {e.status === 'active' ? (
                  <button
                    type="button"
                    disabled={!canOwner}
                    onClick={() =>
                      void closeBreakGlassApi(e.id)
                        .then(reload)
                        .catch((err) =>
                          setError(
                            err instanceof Error ? err.message : String(err),
                          ),
                        )
                    }
                    className="text-secondary"
                  >
                    Close
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-lg">
          <h2 className="font-headline text-base font-semibold text-on-surface-variant">
            SIEM export
          </h2>
          <p className="mt-xs font-body text-[12px] text-on-surface-variant">
            Auto-push runs every ~10 minutes when enabled (server cron). Manual push
            below exports audit events as NDJSON.
          </p>
          {siemLastExported ? (
            <p className="mt-xs font-body text-[11px] text-on-surface-variant/80">
              Last export: {new Date(siemLastExported).toLocaleString()}
            </p>
          ) : (
            <p className="mt-xs font-body text-[11px] text-on-surface-variant/80">
              No exports yet — save webhook URL and enable, or push now.
            </p>
          )}
          <label className="mt-md flex items-center gap-2 font-label text-[13px]">
            <input
              type="checkbox"
              disabled={!canAdmin || busy}
              checked={siemEnabled}
              onChange={(e) => setSiemEnabled(e.target.checked)}
            />
            Enable scheduled SIEM export
          </label>
          <input
            value={siemUrl}
            onChange={(e) => setSiemUrl(e.target.value)}
            placeholder="https://siem.example/ingest"
            disabled={!canAdmin || busy}
            className="mt-md w-full rounded-lg border border-outline-variant/40 px-md py-sm font-body text-[13px]"
          />
          {siemPushResult ? (
            <p className="mt-sm font-body text-[11px] text-secondary">{siemPushResult}</p>
          ) : null}
          <div className="mt-sm flex flex-wrap gap-sm">
            <button
              type="button"
              disabled={!canAdmin || busy}
              onClick={() =>
                void updateSiemConfigApi({
                  enabled: siemEnabled,
                  webhookUrl: siemUrl,
                })
                  .then(async () => {
                    setToast('SIEM config saved')
                    setSiemPushResult(null)
                    await reload()
                  })
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : String(err)),
                  )
              }
              className="rounded-lg border border-secondary px-md py-2 font-label text-[12px] text-secondary disabled:opacity-40"
            >
              Save config
            </button>
            <button
              type="button"
              disabled={!canAdmin || busy || !siemUrl.trim()}
              onClick={() =>
                void pushSiemApi()
                  .then((o) => {
                    setSiemPushResult(`Pushed ${o.pushed} event(s) just now`)
                    setToast(`Pushed ${o.pushed} events`)
                    return reload()
                  })
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : String(err)),
                  )
              }
              className="rounded bg-secondary px-md py-2 font-label text-[12px] text-on-secondary disabled:opacity-40"
            >
              Push now
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-lg">
          <h2 className="font-headline text-base font-semibold text-on-surface-variant">
            Evidence &amp; isolation
          </h2>
          <div className="mt-md flex flex-wrap gap-sm">
            <button
              type="button"
              disabled={!canAdmin || busy}
              onClick={() =>
                void exportSoc2EvidenceApi()
                  .then((o) => {
                    setEvidenceMd(o.markdown)
                    setToast('Evidence pack generated')
                  })
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : String(err)),
                  )
              }
              className="rounded bg-secondary px-md py-2 font-label text-[12px] text-on-secondary disabled:opacity-40"
            >
              Generate SOC 2 evidence pack
            </button>
            <button
              type="button"
              disabled={!canAdmin || busy}
              onClick={() =>
                void runIsolationTestApi()
                  .then((r) => setToast(r.summary))
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : String(err)),
                  )
              }
              className="rounded-lg border border-secondary px-md py-2 font-label text-[12px] text-secondary disabled:opacity-40"
            >
              Run isolation tests
            </button>
            <button
              type="button"
              disabled={!canAdmin || busy}
              onClick={() =>
                void createAbacPolicyApi({
                  name: abacName,
                  effect: 'deny',
                  actions: ['export'],
                  resourceTypes: ['job'],
                  conditions: { minRole: 'member' },
                })
                  .then(() => {
                    setToast('ABAC deny-export policy added')
                    return fetchAbacPolicies()
                  })
                  .catch((err) =>
                    setError(err instanceof Error ? err.message : String(err)),
                  )
              }
              className="rounded-lg border border-outline-variant/40 px-md py-2 font-label text-[12px] disabled:opacity-40"
            >
              Add sample ABAC policy
            </button>
          </div>
          <input
            value={abacName}
            onChange={(e) => setAbacName(e.target.value)}
            className="mt-sm w-full rounded-lg border border-outline-variant/40 px-md py-sm font-body text-[12px]"
            disabled={!canAdmin}
          />
          {evidenceMd ? (
            <pre className="mt-md max-h-64 overflow-auto rounded-lg bg-surface-container-low p-md font-mono text-[10px] text-on-surface-variant">
              {evidenceMd}
            </pre>
          ) : null}
        </section>
      </div>
    </div>
  )
}
