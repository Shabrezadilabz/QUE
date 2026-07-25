import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import { useAuth } from '@/context/AuthContext'
import { getApiBase } from '@/services/stitchApi'
import {
  fetchWorkspaceSettings,
  reindexAi,
  updateWorkspaceLlmSecrets,
  updateWorkspaceSettings,
  type WorkspaceSecretSlot,
  type WorkspaceSettingsFlags,
  type WorkspaceSettingsPayload,
} from '@/services/stitchApi'

/**
 * Settings — workspace policy flags, capability status, about Que.
 */
export function SettingsPage() {
  const { canAdmin } = useWorkspaceRole()
  const { workspaceId } = useAuth()
  const [data, setData] = useState<WorkspaceSettingsPayload | null>(null)
  const [draft, setDraft] = useState<WorkspaceSettingsFlags | null>(null)
  const [busy, setBusy] = useState(false)
  const [secretsBusy, setSecretsBusy] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [openaiKeyDraft, setOpenaiKeyDraft] = useState('')
  const [anthropicKeyDraft, setAnthropicKeyDraft] = useState('')

  useEffect(() => {
    setData(null)
    setDraft(null)
    fetchWorkspaceSettings()
      .then((payload) => {
        setData(payload)
        setDraft({
          includeSamplesDefault: payload.settings.includeSamplesDefault,
          inferJoinsOnSync: payload.settings.inferJoinsOnSync,
          preferLlmChat: payload.settings.preferLlmChat,
          aiModelId: payload.settings.aiModelId ?? 'gpt-4o-mini',
          ragTopK: payload.settings.ragTopK ?? 8,
          ragIncludeDocs: payload.settings.ragIncludeDocs !== false,
          blockExportOnDrift: payload.settings.blockExportOnDrift !== false,
          emitContractEvents: payload.settings.emitContractEvents !== false,
          contractWebhookUrl: payload.settings.contractWebhookUrl ?? '',
          githubOwner: payload.settings.githubOwner ?? '',
          githubRepo: payload.settings.githubRepo ?? '',
          githubBaseBranch: payload.settings.githubBaseBranch ?? 'main',
          dbtModelsPath: payload.settings.dbtModelsPath ?? 'models/que',
        })
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
  }, [workspaceId])

  const dirty =
    draft &&
    data &&
    (draft.includeSamplesDefault !== data.settings.includeSamplesDefault ||
      draft.inferJoinsOnSync !== data.settings.inferJoinsOnSync ||
      draft.preferLlmChat !== data.settings.preferLlmChat ||
      draft.aiModelId !== (data.settings.aiModelId ?? 'gpt-4o-mini') ||
      draft.ragTopK !== (data.settings.ragTopK ?? 8) ||
      draft.ragIncludeDocs !== (data.settings.ragIncludeDocs !== false) ||
      draft.blockExportOnDrift !== (data.settings.blockExportOnDrift !== false) ||
      draft.emitContractEvents !== (data.settings.emitContractEvents !== false) ||
      draft.contractWebhookUrl !== (data.settings.contractWebhookUrl ?? '') ||
      draft.githubOwner !== data.settings.githubOwner ||
      draft.githubRepo !== data.settings.githubRepo ||
      draft.githubBaseBranch !== data.settings.githubBaseBranch ||
      draft.dbtModelsPath !== data.settings.dbtModelsPath)

  async function save() {
    if (!draft || !canAdmin) return
    setBusy(true)
    setError(null)
    try {
      const next = await updateWorkspaceSettings(draft)
      setData(next)
      setDraft(next.settings)
      setToast('Settings saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveLlmSecrets(patch: {
    openaiApiKey?: string | null
    anthropicApiKey?: string | null
  }) {
    if (!canAdmin) return
    setSecretsBusy(true)
    setError(null)
    try {
      const secrets = await updateWorkspaceLlmSecrets(patch)
      const next = await fetchWorkspaceSettings()
      setData({
        ...next,
        capabilities: { ...next.capabilities, secrets },
      })
      if ('openaiApiKey' in patch) setOpenaiKeyDraft('')
      if ('anthropicApiKey' in patch) setAnthropicKeyDraft('')
      setToast('API keys updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSecretsBusy(false)
    }
  }

  return (
    <QueAppChrome eyebrow="SETTINGS · WORKSPACE POLICY">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-lg p-md md:p-lg">
          <div>
            <h1 className="font-headline text-3xl font-semibold tracking-tight text-on-surface uppercase">
              System configuration
            </h1>
            <p className="mt-xs font-label text-[11px] tracking-widest text-on-surface-variant">
              WORKSPACE · AI · CONNECTORS
            </p>
          </div>

          {error ? (
            <p className="border border-error/40 bg-error/10 px-md py-sm font-body text-xs text-error">
              {error}
            </p>
          ) : null}
          {toast ? (
            <p className="border border-primary-fixed/30 bg-primary-container/10 px-md py-sm font-label text-[10px] tracking-widest text-primary-fixed">
              {toast}
              <button
                type="button"
                className="ml-md underline"
                onClick={() => setToast(null)}
              >
                dismiss
              </button>
            </p>
          ) : null}

          {!data || !draft ? (
            <p className="font-label text-[11px] tracking-widest text-on-surface-variant">
              LOADING…
            </p>
          ) : (
            <>
              <Section
                title="WORKSPACE"
                meta={`ID ${data.workspace.id.slice(0, 8)}…`}
              >
                <div className="grid gap-md md:grid-cols-2">
                  <Info label="Name" value={data.workspace.name} />
                  <Info label="Slug" value={data.workspace.slug} />
                  <Info
                    label="Created"
                    value={new Date(data.workspace.createdAt).toLocaleString()}
                  />
                  <Info label="API base" value={getApiBase()} />
                </div>
                <div className="mt-md grid grid-cols-2 gap-sm md:grid-cols-4">
                  <Stat label="Connections" value={data.stats.connections} />
                  <Stat label="Tables" value={data.stats.tables} />
                  <Stat label="Relations" value={data.stats.relationships} />
                  <Stat label="Jobs" value={data.stats.jobs} />
                </div>
              </Section>

              <Section title="POLICY_FLAGS" meta="APPLIED ON SYNC / CHAT">
                {!canAdmin ? (
                  <p className="mb-md font-label text-[10px] tracking-widest text-on-surface-variant">
                    READ-ONLY · REQUIRES ADMIN+
                  </p>
                ) : null}
                <Toggle
                  label="Include column samples on sync"
                  hint="Capped metadata samples only — never full tables"
                  checked={draft.includeSamplesDefault}
                  disabled={!canAdmin}
                  onChange={(v) =>
                    setDraft((d) =>
                      d ? { ...d, includeSamplesDefault: v } : d,
                    )
                  }
                />
                <Toggle
                  label="Infer cross-source joins on sync"
                  hint="Creates suggested edges for review (Promote / Reject)"
                  checked={draft.inferJoinsOnSync}
                  disabled={!canAdmin}
                  onChange={(v) =>
                    setDraft((d) => (d ? { ...d, inferJoinsOnSync: v } : d))
                  }
                />
                <Toggle
                  label="Prefer LLM for AI chat"
                  hint={
                    data.capabilities.llm.openaiConfigured ||
                    data.capabilities.llm.anthropicConfigured
                      ? `Uses RAG + key from ${
                          data.capabilities.secrets?.openai?.source ===
                            'workspace' ||
                          data.capabilities.secrets?.anthropic?.source ===
                            'workspace'
                            ? 'workspace BYOK'
                            : 'server env'
                        }`
                      : 'No LLM key — add BYOK below or set OPENAI_API_KEY / ANTHROPIC_API_KEY on the API'
                  }
                  checked={draft.preferLlmChat}
                  disabled={!canAdmin}
                  onChange={(v) =>
                    setDraft((d) => (d ? { ...d, preferLlmChat: v } : d))
                  }
                />
                <Toggle
                  label="Include Que product docs in RAG"
                  hint="Strategic + technical HTML docs indexed as global vector chunks"
                  checked={draft.ragIncludeDocs}
                  disabled={!canAdmin}
                  onChange={(v) =>
                    setDraft((d) => (d ? { ...d, ragIncludeDocs: v } : d))
                  }
                />
                <Toggle
                  label="Block export on high drift / broken contract"
                  hint="Export returns 409 until drift is acknowledged or contract is re-frozen"
                  checked={draft.blockExportOnDrift}
                  disabled={!canAdmin}
                  onChange={(v) =>
                    setDraft((d) => (d ? { ...d, blockExportOnDrift: v } : d))
                  }
                />
                <Toggle
                  label="Emit contract events (outbox + webhook)"
                  hint="Streaming-later adapter: freeze/export/drift → outbox for Kafka/Flink consumers"
                  checked={draft.emitContractEvents}
                  disabled={!canAdmin}
                  onChange={(v) =>
                    setDraft((d) => (d ? { ...d, emitContractEvents: v } : d))
                  }
                />
                <div className="pt-md">
                  <Field
                    label="Contract webhook URL"
                    value={draft.contractWebhookUrl ?? ''}
                    disabled={!canAdmin}
                    onChange={(v) =>
                      setDraft((d) =>
                        d ? { ...d, contractWebhookUrl: v } : d,
                      )
                    }
                    placeholder="https://hooks.example.com/que-contracts"
                  />
                </div>
                <div className="grid gap-md pt-md md:grid-cols-2">
                  <label className="block">
                    <span className="font-label text-[10px] tracking-widest text-on-surface-variant">
                      DEFAULT MODEL
                    </span>
                    <select
                      value={draft.aiModelId}
                      disabled={!canAdmin}
                      onChange={(e) =>
                        setDraft((d) =>
                          d ? { ...d, aiModelId: e.target.value } : d,
                        )
                      }
                      className="mt-xs w-full border border-outline-variant bg-surface-container px-sm py-sm font-body text-sm text-on-surface outline-none focus:border-primary-fixed disabled:opacity-40"
                    >
                      {(data.capabilities.ai?.models?.length
                        ? data.capabilities.ai.models
                        : [
                            {
                              id: 'gpt-4o-mini',
                              label: 'GPT-4o mini (needs key)',
                            },
                          ]
                      ).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="font-label text-[10px] tracking-widest text-on-surface-variant">
                      RAG TOP-K
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={draft.ragTopK}
                      disabled={!canAdmin}
                      onChange={(e) =>
                        setDraft((d) =>
                          d
                            ? {
                                ...d,
                                ragTopK: Number(e.target.value) || 8,
                              }
                            : d,
                        )
                      }
                      className="mt-xs w-full border border-outline-variant bg-surface-container px-sm py-sm font-body text-sm text-on-surface outline-none focus:border-primary-fixed disabled:opacity-40"
                    />
                  </label>
                </div>
                {canAdmin ? (
                  <div className="flex justify-end gap-sm pt-md">
                    <button
                      type="button"
                      disabled={!dirty || busy}
                      onClick={() =>
                        setDraft({
                          includeSamplesDefault:
                            data.settings.includeSamplesDefault,
                          inferJoinsOnSync: data.settings.inferJoinsOnSync,
                          preferLlmChat: data.settings.preferLlmChat,
                          aiModelId: data.settings.aiModelId ?? 'gpt-4o-mini',
                          ragTopK: data.settings.ragTopK ?? 8,
                          ragIncludeDocs:
                            data.settings.ragIncludeDocs !== false,
                          blockExportOnDrift:
                            data.settings.blockExportOnDrift !== false,
                          emitContractEvents:
                            data.settings.emitContractEvents !== false,
                          contractWebhookUrl:
                            data.settings.contractWebhookUrl ?? '',
                          githubOwner: data.settings.githubOwner ?? '',
                          githubRepo: data.settings.githubRepo ?? '',
                          githubBaseBranch:
                            data.settings.githubBaseBranch ?? 'main',
                          dbtModelsPath:
                            data.settings.dbtModelsPath ?? 'models/que',
                        })
                      }
                      className="border border-outline-variant px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-surface-variant disabled:opacity-40"
                    >
                      RESET
                    </button>
                    <button
                      type="button"
                      disabled={!dirty || busy}
                      onClick={() => void save()}
                      className="bg-primary-container px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-primary-fixed disabled:opacity-40"
                    >
                      SAVE
                    </button>
                  </div>
                ) : null}
              </Section>

              <Section
                title="BYOK_LLM_KEYS"
                meta="YOUR KEY · YOUR BILL · ENCRYPTED AT REST"
              >
                <p className="mb-md font-body text-xs text-on-surface-variant">
                  Bring your own OpenAI / Anthropic key for this workspace.
                  Que still proxies calls server-side with schema-only prompts —
                  plaintext is never returned to the browser. Env keys remain a
                  demo/ops fallback when no workspace key is set.
                </p>
                {!canAdmin ? (
                  <p className="mb-md font-label text-[10px] tracking-widest text-on-surface-variant">
                    READ-ONLY · REQUIRES ADMIN+
                  </p>
                ) : null}
                <div className="grid gap-md md:grid-cols-2">
                  <SecretKeyField
                    label="OpenAI API key"
                    status={data.capabilities.secrets?.openai}
                    value={openaiKeyDraft}
                    disabled={!canAdmin || secretsBusy}
                    onChange={setOpenaiKeyDraft}
                    onSave={() =>
                      void saveLlmSecrets({ openaiApiKey: openaiKeyDraft })
                    }
                    onClear={() =>
                      void saveLlmSecrets({ openaiApiKey: null })
                    }
                  />
                  <SecretKeyField
                    label="Anthropic API key"
                    status={data.capabilities.secrets?.anthropic}
                    value={anthropicKeyDraft}
                    disabled={!canAdmin || secretsBusy}
                    onChange={setAnthropicKeyDraft}
                    onSave={() =>
                      void saveLlmSecrets({
                        anthropicApiKey: anthropicKeyDraft,
                      })
                    }
                    onClear={() =>
                      void saveLlmSecrets({ anthropicApiKey: null })
                    }
                  />
                </div>
                {data.capabilities.secrets?.note ? (
                  <p className="mt-md font-body text-[11px] text-on-surface-variant">
                    {data.capabilities.secrets.note}
                  </p>
                ) : null}
              </Section>

              <Section title="AI_STACK" meta="RAG · VECTORS · FEEDBACK · PILLARS">
                <div className="grid gap-sm md:grid-cols-2">
                  <Info
                    label="Vector DB"
                    value={
                      data.capabilities.ai?.vectorReady
                        ? 'pgvector ready'
                        : 'not ready — apply 007 + pgvector image'
                    }
                  />
                  <Info
                    label="Embeddings"
                    value={data.capabilities.ai?.embeddingMode || '—'}
                  />
                  <Info
                    label="Workspace chunks"
                    value={String(
                      data.capabilities.ai?.chunkStats?.workspaceChunks ?? 0,
                    )}
                  />
                  <Info
                    label="Doc chunks"
                    value={String(
                      data.capabilities.ai?.chunkStats?.docChunks ?? 0,
                    )}
                  />
                  <Info
                    label="Feedback"
                    value={`+${data.capabilities.ai?.feedback?.up ?? 0} / -${data.capabilities.ai?.feedback?.down ?? 0}`}
                  />
                  <Info
                    label="OpenAI / Anthropic"
                    value={`${
                      data.capabilities.llm.openaiConfigured
                        ? `OpenAI (${data.capabilities.llm.openaiSource || data.capabilities.secrets?.openai?.source || '?'})`
                        : '—'
                    } · ${
                      data.capabilities.llm.anthropicConfigured
                        ? `Anthropic (${data.capabilities.llm.anthropicSource || data.capabilities.secrets?.anthropic?.source || '?'})`
                        : '—'
                    }`}
                  />
                </div>
                <p className="mt-md font-body text-xs text-on-surface-variant">
                  Que implements NLP chat, RAG retrieval, generative inference
                  via cloud APIs, agentic slash skills, join recommendations,
                  limited memory, and a feedback loop. Computer vision and
                  custom foundation-model training are out of product scope.
                </p>
                <div className="mt-md flex flex-wrap gap-xs">
                  {Object.entries(data.capabilities.ai?.pillars || {}).map(
                    ([k, v]) => (
                      <span
                        key={k}
                        className={`border px-sm py-xs font-label text-[9px] tracking-wider ${
                          v
                            ? 'border-primary-fixed/40 text-primary-fixed'
                            : 'border-outline-variant text-on-surface-variant/50'
                        }`}
                      >
                        {k} · {v ? 'ON' : 'N/A'}
                      </span>
                    ),
                  )}
                </div>
                <div className="mt-md flex justify-end">
                    <button
                      type="button"
                      disabled={reindexing}
                      onClick={() => {
                        setReindexing(true)
                        void reindexAi({ docs: true })
                          .then(async () => {
                            setToast('AI index rebuilt (schema + docs)')
                            const payload = await fetchWorkspaceSettings()
                            setData(payload)
                          })
                          .catch((err) =>
                            setError(
                              err instanceof Error ? err.message : String(err),
                            ),
                          )
                          .finally(() => setReindexing(false))
                      }}
                      className="bg-primary-container px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-primary-fixed disabled:opacity-40"
                    >
                      {reindexing ? 'REINDEXING…' : 'REINDEX SCHEMA + DOCS'}
                    </button>
                  </div>
              </Section>

              <Section
                title="DBT_GITHUB_EXPORT"
                meta="ADDITIVE LAYER · NO SECRETS HERE"
              >
                <p className="mb-md font-body text-xs text-on-surface-variant">
                  Optional defaults for the Jobs → dbt / GitHub PR export. Token
                  stays on the API as{' '}
                  <code className="text-primary-fixed">GITHUB_TOKEN</code> — never
                  in workspace settings. JSON/SQL exports are unchanged.
                </p>
                {!canAdmin ? (
                  <p className="mb-md font-label text-[10px] tracking-widest text-on-surface-variant">
                    READ-ONLY · REQUIRES ADMIN+
                  </p>
                ) : null}
                <div className="grid gap-md md:grid-cols-2">
                  <Field
                    label="GitHub owner"
                    value={draft.githubOwner ?? ''}
                    disabled={!canAdmin}
                    onChange={(v) =>
                      setDraft((d) => (d ? { ...d, githubOwner: v } : d))
                    }
                    placeholder="acme-corp"
                  />
                  <Field
                    label="GitHub repo"
                    value={draft.githubRepo ?? ''}
                    disabled={!canAdmin}
                    onChange={(v) =>
                      setDraft((d) => (d ? { ...d, githubRepo: v } : d))
                    }
                    placeholder="analytics-dbt"
                  />
                  <Field
                    label="Base branch"
                    value={draft.githubBaseBranch ?? 'main'}
                    disabled={!canAdmin}
                    onChange={(v) =>
                      setDraft((d) => (d ? { ...d, githubBaseBranch: v } : d))
                    }
                    placeholder="main"
                  />
                  <Field
                    label="dbt models path"
                    value={draft.dbtModelsPath ?? 'models/que'}
                    disabled={!canAdmin}
                    onChange={(v) =>
                      setDraft((d) => (d ? { ...d, dbtModelsPath: v } : d))
                    }
                    placeholder="models/que"
                  />
                </div>
                <p className="mt-md font-body text-xs text-on-surface-variant">
                  GitHub token:{' '}
                  <Flag on={Boolean(data.capabilities.github?.tokenConfigured)} />
                  {' · '}
                  dbt export layer:{' '}
                  <Flag on={Boolean(data.capabilities.github?.dbtExport)} />
                </p>
                {canAdmin ? (
                  <div className="flex justify-end gap-sm pt-md">
                    <button
                      type="button"
                      disabled={!dirty || busy}
                      onClick={() => void save()}
                      className="bg-primary-container px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-primary-fixed disabled:opacity-40"
                    >
                      SAVE
                    </button>
                  </div>
                ) : null}
              </Section>

              <Section title="CAPABILITIES" meta="READ-ONLY">
                <div className="space-y-sm">
                  <p className="font-body text-xs text-on-surface-variant">
                    Connectors:{' '}
                    <span className="text-on-surface">
                      {data.capabilities.connectors.join(' · ')}
                    </span>
                  </p>
                  <p className="font-body text-xs text-on-surface-variant">
                    OpenAI:{' '}
                    <Flag on={data.capabilities.llm.openaiConfigured} />
                    {' · '}
                    Anthropic:{' '}
                    <Flag on={data.capabilities.llm.anthropicConfigured} />
                  </p>
                  {data.latestSnapshot ? (
                    <p className="font-body text-xs text-on-surface-variant">
                      Latest snapshot:{' '}
                      <span className="text-primary-fixed">
                        {data.latestSnapshot.label}
                      </span>{' '}
                      (
                      {new Date(
                        data.latestSnapshot.createdAt,
                      ).toLocaleString()}
                      )
                    </p>
                  ) : (
                    <p className="font-body text-xs text-on-surface-variant">
                      No schema snapshots yet — sync a source to create one.
                    </p>
                  )}
                </div>
              </Section>

              <Section title="ABOUT_QUE" meta={data.capabilities.brand}>
                <p className="font-body text-sm text-on-surface">
                  {data.capabilities.wedge}
                </p>
                <p className="mt-sm font-body text-xs text-on-surface-variant">
                  AI and sync paths use schema metadata only. Raw warehouse
                  rows are never centralized into Que.
                </p>
                <div className="mt-md flex flex-wrap gap-sm">
                  <Link
                    to="/workspace"
                    className="border border-primary-fixed px-md py-sm font-label text-[11px] font-bold tracking-widest text-primary-fixed"
                  >
                    WORKSPACE
                  </Link>
                  <Link
                    to="/sources"
                    className="border border-outline-variant px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-surface-variant hover:border-primary-fixed"
                  >
                    SOURCES
                  </Link>
                  <Link
                    to="/chat"
                    className="border border-outline-variant px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-surface-variant hover:border-primary-fixed"
                  >
                    AI CHAT
                  </Link>
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </QueAppChrome>
  )
}

function Section({
  title,
  meta,
  children,
}: {
  title: string
  meta?: string
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden border border-outline-variant bg-surface-container-low">
      <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-high px-md py-sm">
        <span className="font-label text-[11px] font-bold tracking-widest text-primary-fixed">
          {title}
        </span>
        {meta ? (
          <span className="font-label text-[10px] tracking-wider text-on-surface-variant">
            {meta}
          </span>
        ) : null}
      </div>
      <div className="p-md">{children}</div>
    </section>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-label text-[10px] tracking-widest text-on-surface-variant">
        {label}
      </p>
      <p className="mt-xs break-all font-body text-xs text-on-surface">{value}</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-outline-variant bg-surface-container p-sm">
      <p className="font-label text-[9px] tracking-widest text-on-surface-variant">
        {label}
      </p>
      <p className="font-headline text-xl text-primary-fixed">{value}</p>
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={[
        'mb-md flex items-start justify-between gap-md border-b border-outline-variant pb-md last:mb-0 last:border-0 last:pb-0',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      ].join(' ')}
    >
      <span>
        <span className="block font-body text-sm text-on-surface">{label}</span>
        <span className="mt-xs block font-body text-xs text-on-surface-variant">
          {hint}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'mt-1 h-6 w-11 shrink-0 border transition-colors disabled:opacity-50',
          checked
            ? 'border-primary-fixed bg-primary-container'
            : 'border-outline-variant bg-surface-container',
        ].join(' ')}
      >
        <span
          className={[
            'block h-full w-5 transition-transform',
            checked
              ? 'translate-x-5 bg-on-primary-fixed'
              : 'translate-x-0 bg-on-surface-variant',
          ].join(' ')}
        />
      </button>
    </label>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <label className="block">
      <span className="font-label text-[10px] tracking-widest text-on-surface-variant">
        {label}
      </span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-xs w-full border border-outline-variant bg-surface-container px-sm py-xs font-body text-xs text-on-surface outline-none focus:border-primary-fixed disabled:opacity-50"
      />
    </label>
  )
}

function SecretKeyField({
  label,
  status,
  value,
  onChange,
  onSave,
  onClear,
  disabled = false,
}: {
  label: string
  status?: WorkspaceSecretSlot
  value: string
  onChange: (v: string) => void
  onSave: () => void
  onClear: () => void
  disabled?: boolean
}) {
  const source = status?.source ?? 'none'
  const hint = status?.hint
  return (
    <div className="border border-outline-variant bg-surface-container p-sm">
      <div className="flex items-center justify-between gap-sm">
        <span className="font-label text-[10px] tracking-widest text-on-surface-variant">
          {label}
        </span>
        <span className="font-label text-[9px] tracking-wider text-primary-fixed">
          {source === 'workspace'
            ? 'WORKSPACE'
            : source === 'env'
              ? 'ENV FALLBACK'
              : 'NONE'}
        </span>
      </div>
      {hint ? (
        <p className="mt-xs font-body text-[11px] text-on-surface-variant">
          Stored hint: {hint}
        </p>
      ) : (
        <p className="mt-xs font-body text-[11px] text-on-surface-variant">
          Not configured
        </p>
      )}
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        disabled={disabled}
        placeholder="Paste key to replace…"
        onChange={(e) => onChange(e.target.value)}
        className="mt-sm w-full border border-outline-variant bg-surface-container-low px-sm py-xs font-body text-xs text-on-surface outline-none focus:border-primary-fixed disabled:opacity-50"
      />
      <div className="mt-sm flex flex-wrap gap-sm">
        <button
          type="button"
          disabled={disabled || !value.trim()}
          onClick={onSave}
          className="bg-primary-container px-sm py-xs font-label text-[10px] font-bold tracking-widest text-on-primary-fixed disabled:opacity-40"
        >
          SAVE KEY
        </button>
        <button
          type="button"
          disabled={disabled || source !== 'workspace'}
          onClick={onClear}
          className="border border-outline-variant px-sm py-xs font-label text-[10px] font-bold tracking-widest text-on-surface-variant disabled:opacity-40"
        >
          CLEAR
        </button>
      </div>
    </div>
  )
}

function Flag({ on }: { on: boolean }) {
  return (
    <span className={on ? 'text-primary-fixed' : 'text-on-surface-variant'}>
      {on ? 'configured' : 'not set'}
    </span>
  )
}

export default SettingsPage
