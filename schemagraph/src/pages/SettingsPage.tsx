import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import { useAuth } from '@/context/AuthContext'
import { getApiBase } from '@/services/stitchApi'
import {
  fetchWorkspaceSettings,
  reindexAi,
  runJoinInference,
  updateWorkspaceLlmSecrets,
  updateWorkspaceSettings,
  type WorkspaceSecretSlot,
  type WorkspaceSettingsFlags,
  type WorkspaceSettingsPayload,
} from '@/services/stitchApi'

type MemberRow = {
  id: string
  name: string
  email: string
  role: 'owner' | 'admin' | 'member' | 'viewer'
  lastActive: string
  you?: boolean
}

/**
 * Settings — Sunset Clay workspace settings shell + Que policy/BYOK controls.
 */
export function SettingsPage() {
  const { canAdmin, canWrite, role } = useWorkspaceRole()
  const { workspaceId, user } = useAuth()
  const [data, setData] = useState<WorkspaceSettingsPayload | null>(null)
  const [draft, setDraft] = useState<WorkspaceSettingsFlags | null>(null)
  const [busy, setBusy] = useState(false)
  const [secretsBusy, setSecretsBusy] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [inferring, setInferring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [openaiKeyDraft, setOpenaiKeyDraft] = useState('')
  const [anthropicKeyDraft, setAnthropicKeyDraft] = useState('')
  const [memberQuery, setMemberQuery] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    setData(null)
    setDraft(null)
    fetchWorkspaceSettings()
      .then((payload) => {
        setData(payload)
        setDraft({
          includeSamplesDefault: payload.settings.includeSamplesDefault,
          scrubSamples: payload.settings.scrubSamples !== false,
          inferJoinsOnSync: payload.settings.inferJoinsOnSync,
          preferLlmChat: payload.settings.preferLlmChat,
          aiModelId: payload.settings.aiModelId ?? 'gpt-4o-mini',
          ragTopK: payload.settings.ragTopK ?? 8,
          ragIncludeDocs: payload.settings.ragIncludeDocs !== false,
          blockExportOnDrift: payload.settings.blockExportOnDrift !== false,
          blockPrOnColumnDrift:
            payload.settings.blockPrOnColumnDrift !== false,
          blockExportOnUnreviewedJoins:
            payload.settings.blockExportOnUnreviewedJoins === true,
          databricksQueryJoinAssist:
            payload.settings.databricksQueryJoinAssist !== false,
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

  const members = useMemo(() => {
    const rows: MemberRow[] = []
    if (user) {
      const r =
        role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer'
          ? role
          : 'member'
      rows.push({
        id: user.id,
        name: user.displayName || user.email.split('@')[0] || 'You',
        email: user.email,
        role: r,
        lastActive: 'Just now',
        you: true,
      })
    }
    return rows
  }, [user, role])

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase()
    if (!q) return members
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.role.includes(q),
    )
  }, [members, memberQuery])

  const dirty =
    draft &&
    data &&
    (draft.includeSamplesDefault !== data.settings.includeSamplesDefault ||
      draft.scrubSamples !== (data.settings.scrubSamples !== false) ||
      draft.inferJoinsOnSync !== data.settings.inferJoinsOnSync ||
      draft.preferLlmChat !== data.settings.preferLlmChat ||
      draft.aiModelId !== (data.settings.aiModelId ?? 'gpt-4o-mini') ||
      draft.ragTopK !== (data.settings.ragTopK ?? 8) ||
      draft.ragIncludeDocs !== (data.settings.ragIncludeDocs !== false) ||
      draft.blockExportOnDrift !== (data.settings.blockExportOnDrift !== false) ||
      draft.blockPrOnColumnDrift !==
        (data.settings.blockPrOnColumnDrift !== false) ||
      draft.blockExportOnUnreviewedJoins !==
        (data.settings.blockExportOnUnreviewedJoins === true) ||
      draft.databricksQueryJoinAssist !==
        (data.settings.databricksQueryJoinAssist !== false) ||
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
    githubToken?: string | null
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

  const usagePct = data
    ? Math.min(
        100,
        Math.round(
          ((data.stats.tables + data.stats.connections * 10) /
            Math.max(data.stats.tables + 40, 80)) *
            100,
        ),
      )
    : 62

  return (
    <QueAppChrome eyebrow="SETTINGS · WORKSPACE POLICY">
      <div className="flex min-h-0 flex-1 overflow-hidden bg-canvas">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="min-h-0 flex-1 overflow-y-auto px-md py-lg pb-40 md:px-lg lg:px-margin-desktop">
            <div className="mb-xl flex flex-col justify-between gap-md sm:flex-row sm:items-end">
              <div>
                <h1 className="font-headline text-3xl font-semibold tracking-tight text-on-surface">
                  Workspace Settings
                </h1>
                <p className="mt-xs font-body text-base text-on-surface-variant">
                  Configure team permissions, security keys, and resource
                  allocation.
                </p>
              </div>
              <button
                type="button"
                disabled={!canAdmin}
                onClick={() =>
                  setToast(
                    canAdmin
                      ? 'Invite link flow coming soon — use demo accounts for now'
                      : 'Admin required to invite members',
                  )
                }
                className="inline-flex items-center justify-center gap-sm rounded-lg bg-primary px-lg py-sm font-label text-sm font-medium text-on-primary transition-all hover:shadow-md active:scale-95 disabled:opacity-40"
              >
                <span aria-hidden>+</span>
                Invite Member
              </button>
            </div>

            {error ? (
              <p className="mb-md rounded-xl border border-error/40 bg-error-container px-md py-sm font-body text-sm text-error">
                {error}
              </p>
            ) : null}
            {toast ? (
              <p className="mb-md rounded-xl border border-primary/20 bg-[#ffdbd2]/50 px-md py-sm font-label text-[12px] text-primary">
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
              <p className="font-label text-sm text-on-surface-variant">
                Loading…
              </p>
            ) : (
              <>
                <div className="grid grid-cols-12 gap-lg">
                  {/* Member Registry */}
                  <section className="col-span-12 rounded-xl border border-outline-variant/30 bg-white p-lg shadow-sm lg:col-span-8">
                    <div className="mb-md flex flex-col gap-md sm:flex-row sm:items-center sm:justify-between">
                      <h2 className="font-headline text-xl font-semibold text-on-surface-variant">
                        Member Registry
                      </h2>
                      <div className="relative">
                        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-on-surface-variant/50">
                          ⌕
                        </span>
                        <input
                          value={memberQuery}
                          onChange={(e) => setMemberQuery(e.target.value)}
                          placeholder="Search members…"
                          className="rounded-lg border border-outline-variant/20 bg-canvas py-2 pr-4 pl-10 font-body text-sm outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-outline-variant/10">
                            <th className="px-sm py-md font-label text-[11px] tracking-wider text-on-surface-variant/60 uppercase">
                              User
                            </th>
                            <th className="px-sm py-md font-label text-[11px] tracking-wider text-on-surface-variant/60 uppercase">
                              Role
                            </th>
                            <th className="px-sm py-md font-label text-[11px] tracking-wider text-on-surface-variant/60 uppercase">
                              Last Active
                            </th>
                            <th className="px-sm py-md text-right font-label text-[11px] tracking-wider text-on-surface-variant/60 uppercase">
                              Action
                            </th>
                          </tr>
                        </thead>
                        <tbody className="font-body text-sm text-on-surface">
                          {filteredMembers.map((m, i) => (
                            <tr
                              key={m.id}
                              className="border-b border-outline-variant/5 transition-colors hover:bg-surface-container-low"
                            >
                              <td className="px-sm py-md">
                                <div className="flex items-center gap-md">
                                  <div
                                    className={[
                                      'flex h-8 w-8 items-center justify-center rounded-full font-label text-xs font-bold',
                                      i % 3 === 0
                                        ? 'bg-[#bbeed4] text-[#1f4f3c]'
                                        : i % 3 === 1
                                          ? 'bg-secondary-container text-on-secondary-container'
                                          : 'bg-surface-container-highest text-on-surface-variant',
                                    ].join(' ')}
                                  >
                                    {initials(m.name)}
                                  </div>
                                  <div>
                                    <p className="font-medium">
                                      {m.name}
                                      {m.you ? (
                                        <span className="ml-xs font-label text-[10px] text-primary">
                                          (you)
                                        </span>
                                      ) : null}
                                    </p>
                                    <p className="text-xs text-on-surface-variant/70">
                                      {m.email}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-sm py-md">
                                <RoleBadge role={m.role} />
                              </td>
                              <td className="px-sm py-md text-on-surface-variant">
                                {m.lastActive}
                              </td>
                              <td className="px-sm py-md text-right">
                                <button
                                  type="button"
                                  className="rounded-lg px-sm py-xs font-label text-on-surface-variant hover:bg-secondary-container hover:text-primary"
                                  aria-label={`Actions for ${m.name}`}
                                  onClick={() =>
                                    setToast(`Member actions for ${m.email}`)
                                  }
                                >
                                  ···
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-md font-body text-xs text-on-surface-variant">
                      Showing your membership for this workspace. Admins can
                      invite users via{' '}
                      <code className="text-[11px]">POST /workspaces/:id/invites</code>
                      .
                    </p>
                  </section>

                  {/* Right column */}
                  <div className="col-span-12 flex flex-col gap-lg lg:col-span-4">
                    <section className="rounded-xl border border-outline-variant/30 bg-white p-lg shadow-sm">
                      <div className="mb-md flex items-center justify-between">
                        <h3 className="font-headline text-lg font-semibold text-on-surface-variant">
                          API Keys
                        </h3>
                        <button
                          type="button"
                          className="font-label text-[12px] text-primary hover:underline"
                          onClick={() => setShowAdvanced(true)}
                        >
                          View all
                        </button>
                      </div>
                      <div className="space-y-sm">
                        <KeyRow
                          name="OpenAI"
                          hint={
                            data.capabilities.secrets?.openai?.hint ||
                            (data.capabilities.secrets?.openai?.configured
                              ? 'sk_••••••••'
                              : 'Not configured')
                          }
                        />
                        <KeyRow
                          name="Anthropic"
                          hint={
                            data.capabilities.secrets?.anthropic?.hint ||
                            (data.capabilities.secrets?.anthropic?.configured
                              ? 'sk_••••••••'
                              : 'Not configured')
                          }
                        />
                        <button
                          type="button"
                          disabled={!canAdmin}
                          onClick={() => setShowAdvanced(true)}
                          className="mt-sm w-full rounded-lg border border-primary py-2 font-label text-sm text-primary transition-colors hover:bg-primary/5 disabled:opacity-40"
                        >
                          Generate New Key
                        </button>
                      </div>
                    </section>

                    <section className="rounded-xl border border-outline-variant/30 bg-white p-lg shadow-sm">
                      <div className="mb-md flex items-center justify-between">
                        <h3 className="font-headline text-lg font-semibold text-on-surface-variant">
                          Environment Variables
                        </h3>
                        <button
                          type="button"
                          className="font-label text-lg text-on-surface-variant hover:text-primary"
                          onClick={() => setShowAdvanced(true)}
                          aria-label="Edit environment"
                        >
                          +
                        </button>
                      </div>
                      <div className="space-y-xs">
                        <EnvRow
                          keyName="API_BASE"
                          value={maskMiddle(getApiBase())}
                        />
                        <EnvRow
                          keyName="GITHUB_REPO"
                          value={
                            draft.githubOwner && draft.githubRepo
                              ? `${draft.githubOwner}/${draft.githubRepo}`
                              : '••••••••••••'
                          }
                        />
                        <EnvRow
                          keyName="DBT_PATH"
                          value={draft.dbtModelsPath || 'models/que'}
                        />
                        <EnvRow
                          keyName="AI_MODEL"
                          value={draft.aiModelId || 'gpt-4o-mini'}
                        />
                      </div>
                    </section>
                  </div>
                </div>

                {/* Workspace snapshot strip */}
                <div className="mt-lg grid gap-sm sm:grid-cols-4">
                  <Stat label="Connections" value={data.stats.connections} />
                  <Stat label="Tables" value={data.stats.tables} />
                  <Stat label="Relations" value={data.stats.relationships} />
                  <Stat label="Jobs" value={data.stats.jobs} />
                </div>

                <div className="mt-lg">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="mb-md rounded-lg border border-outline-variant/40 bg-white px-md py-sm font-label text-sm text-on-surface-variant hover:border-primary hover:text-primary"
                  >
                    {showAdvanced
                      ? 'Hide policy & AI settings'
                      : 'Show policy, BYOK & AI settings'}
                  </button>

                  {showAdvanced ? (
                    <div className="space-y-lg pb-lg">
                      <Section
                        title="Workspace"
                        meta={`${data.workspace.name} · ${data.workspace.slug}`}
                      >
                        <div className="grid gap-md md:grid-cols-2">
                          <Info label="Name" value={data.workspace.name} />
                          <Info label="Slug" value={data.workspace.slug} />
                          <Info
                            label="Created"
                            value={new Date(
                              data.workspace.createdAt,
                            ).toLocaleString()}
                          />
                          <Info label="API base" value={getApiBase()} />
                        </div>
                      </Section>

                      {/* Existing policy / BYOK / AI / caps preserved below via include */}
                      <PolicyAndAiBlocks
                        data={data}
                        draft={draft}
                        setDraft={setDraft}
                        canAdmin={canAdmin}
                        canWrite={canWrite}
                        dirty={Boolean(dirty)}
                        busy={busy}
                        secretsBusy={secretsBusy}
                        inferring={inferring}
                        setInferring={setInferring}
                        setError={setError}
                        setToast={setToast}
                        openaiKeyDraft={openaiKeyDraft}
                        setOpenaiKeyDraft={setOpenaiKeyDraft}
                        anthropicKeyDraft={anthropicKeyDraft}
                        setAnthropicKeyDraft={setAnthropicKeyDraft}
                        save={save}
                        saveLlmSecrets={saveLlmSecrets}
                        reindexing={reindexing}
                        setReindexing={setReindexing}
                        setData={setData}
                      />
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </main>

          {/* Usage footer */}
          <div className="absolute right-0 bottom-0 left-0 z-40 border-t border-outline-variant/20 bg-background/95 p-lg shadow-lg backdrop-blur-md md:px-lg lg:px-margin-desktop">
            <div className="flex flex-col justify-between gap-lg md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <div className="mb-xs flex items-center justify-between gap-sm">
                  <div className="flex items-center gap-sm">
                    <span className="font-label text-sm font-bold text-on-surface">
                      Workspace Usage
                    </span>
                  </div>
                  <span className="font-label text-[12px] text-on-surface-variant">
                    {data
                      ? `${data.stats.tables} tables · ${data.stats.connections} sources`
                      : '—'}
                  </span>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary-container">
                  <div
                    className="h-full rounded-full bg-primary-container transition-all duration-1000 ease-out"
                    style={{ width: `${usagePct}%` }}
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-md">
                <button
                  type="button"
                  className="px-md py-2 font-label text-sm text-on-surface-variant hover:text-on-surface"
                  onClick={() =>
                    setToast('Billing is not enabled in this Que demo build')
                  }
                >
                  Manage Billing
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-primary px-lg py-2 font-label text-sm font-medium text-on-primary hover:shadow-md"
                  onClick={() =>
                    setToast('Upgrade plan — contact Que for production seats')
                  }
                >
                  Upgrade Plan
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </QueAppChrome>
  )
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function RoleBadge({ role }: { role: MemberRow['role'] }) {
  if (role === 'owner' || role === 'admin') {
    return (
      <span className="rounded-full bg-primary-container/10 px-2 py-0.5 font-label text-[12px] text-primary">
        {role === 'owner' ? 'Admin' : 'Admin'}
      </span>
    )
  }
  if (role === 'viewer') {
    return (
      <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-label text-[12px] text-on-surface-variant">
        Read-only
      </span>
    )
  }
  return (
    <span className="rounded-full bg-secondary-container px-2 py-0.5 font-label text-[12px] text-on-secondary-container">
      Member
    </span>
  )
}

function KeyRow({ name, hint }: { name: string; hint: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-outline-variant/10 bg-canvas p-sm">
      <div>
        <p className="font-label text-sm">{name}</p>
        <p className="font-label text-xs text-on-surface-variant/60">{hint}</p>
      </div>
      <button
        type="button"
        className="font-label text-xs text-on-surface-variant hover:text-primary"
        onClick={() => void navigator.clipboard.writeText(hint)}
        title="Copy hint"
      >
        Copy
      </button>
    </div>
  )
}

function EnvRow({ keyName, value }: { keyName: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-outline-variant/5 py-xs last:border-0">
      <span className="rounded bg-primary-container/10 px-xs font-label text-[12px] text-primary">
        {keyName}
      </span>
      <span className="max-w-[55%] truncate text-xs text-on-surface-variant">
        {value}
      </span>
    </div>
  )
}

function maskMiddle(s: string) {
  if (s.length <= 12) return '••••••••••••'
  return `${s.slice(0, 8)}••••${s.slice(-4)}`
}


function PolicyAndAiBlocks({
  data,
  draft,
  setDraft,
  canAdmin,
  canWrite,
  dirty,
  busy,
  secretsBusy,
  inferring,
  setInferring,
  setError,
  setToast,
  openaiKeyDraft,
  setOpenaiKeyDraft,
  anthropicKeyDraft,
  setAnthropicKeyDraft,
  save,
  saveLlmSecrets,
  reindexing,
  setReindexing,
  setData,
}: {
  data: WorkspaceSettingsPayload
  draft: WorkspaceSettingsFlags
  setDraft: Dispatch<SetStateAction<WorkspaceSettingsFlags | null>>
  canAdmin: boolean
  canWrite: boolean
  dirty: boolean
  busy: boolean
  secretsBusy: boolean
  inferring: boolean
  setInferring: (v: boolean) => void
  setError: (v: string | null) => void
  setToast: (v: string | null) => void
  openaiKeyDraft: string
  setOpenaiKeyDraft: (v: string) => void
  anthropicKeyDraft: string
  setAnthropicKeyDraft: (v: string) => void
  save: () => Promise<void>
  saveLlmSecrets: (patch: {
    openaiApiKey?: string | null
    anthropicApiKey?: string | null
    githubToken?: string | null
  }) => Promise<void>
  reindexing: boolean
  setReindexing: (v: boolean) => void
  setData: (v: WorkspaceSettingsPayload) => void
}) {
  return (
    <>
<Section title="POLICY_FLAGS" meta="APPLIED ON SYNC / CHAT">
  {!canAdmin ? (
    <p className="mb-md font-label text-[10px] tracking-widest text-on-surface-variant">
      READ-ONLY · REQUIRES ADMIN+
    </p>
  ) : null}
  <Toggle
    label="Include column samples on sync"
    hint="Off by default for schema-only. If on, samples are tokenized before storage."
    checked={draft.includeSamplesDefault}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) =>
        d ? { ...d, includeSamplesDefault: v } : d,
      )
    }
  />
  <Toggle
    label="Scrub / tokenize samples"
    hint="Hash emails, UUIDs, and free-text samples before metadata DB"
    checked={draft.scrubSamples !== false}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, scrubSamples: v } : d))
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
    label="Databricks query-history join assist"
    hint="On live DBX sync, parse recent SQL JOINs into suggested edges"
    checked={draft.databricksQueryJoinAssist !== false}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, databricksQueryJoinAssist: v } : d))
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
    label="Block dbt PR on column-level drift"
    hint="Stops Open dbt PR when column/type drift touches job tables"
    checked={draft.blockPrOnColumnDrift !== false}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, blockPrOnColumnDrift: v } : d))
    }
  />
  <Toggle
    label="Block export on unreviewed suggested joins"
    hint="Promote or reject suggested joins that touch job tables before export"
    checked={draft.blockExportOnUnreviewedJoins}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) =>
        d ? { ...d, blockExportOnUnreviewedJoins: v } : d,
      )
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
  <div className="flex flex-wrap items-center justify-between gap-sm border border-outline-variant bg-surface-container-low px-md py-sm mt-md">
    <div>
      <p className="font-label text-[10px] tracking-widest text-on-surface">
        JOIN INFERENCE
      </p>
      <p className="mt-xs font-body text-xs text-on-surface-variant">
        Re-score cross-source joins from metadata (no full sync). Uses
        promote/reject memory.
      </p>
    </div>
    <button
      type="button"
      disabled={!canWrite || inferring}
      onClick={() => {
        setInferring(true)
        setError(null)
        void runJoinInference()
          .then((r) => {
            setToast(
              `Join inference: ${r.created} new suggestion(s) · scanned ${r.scanned} · ${r.durationMs}ms`,
            )
          })
          .catch((err) =>
            setError(
              err instanceof Error ? err.message : String(err),
            ),
          )
          .finally(() => setInferring(false))
      }}
      className="border border-outline-variant bg-surface-container px-md py-sm font-label text-[10px] font-bold tracking-[0.14em] text-primary-fixed uppercase transition-colors hover:border-primary-fixed disabled:opacity-40"
    >
      {inferring ? 'RUNNING…' : 'RE-RUN JOIN INFERENCE'}
    </button>
  </div>
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
            scrubSamples: data.settings.scrubSamples !== false,
            inferJoinsOnSync: data.settings.inferJoinsOnSync,
            preferLlmChat: data.settings.preferLlmChat,
            aiModelId: data.settings.aiModelId ?? 'gpt-4o-mini',
            ragTopK: data.settings.ragTopK ?? 8,
            ragIncludeDocs:
              data.settings.ragIncludeDocs !== false,
            blockExportOnDrift:
              data.settings.blockExportOnDrift !== false,
            blockPrOnColumnDrift:
              data.settings.blockPrOnColumnDrift !== false,
            blockExportOnUnreviewedJoins:
              data.settings.blockExportOnUnreviewedJoins === true,
            databricksQueryJoinAssist:
              data.settings.databricksQueryJoinAssist !== false,
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
    Optional defaults for Jobs → dbt / GitHub PR export. Prefer a{' '}
    <strong>workspace GitHub token</strong> (below); falls back to API env{' '}
    <code className="text-primary-fixed">GITHUB_TOKEN</code>. JSON/SQL
    exports are unchanged.
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
    {data.capabilities.github?.tokenSource
      ? ` (${data.capabilities.github.tokenSource})`
      : ''}
    {' · '}
    dbt export layer:{' '}
    <Flag on={Boolean(data.capabilities.github?.dbtExport)} />
  </p>
  {canAdmin ? (
    <div className="mt-md space-y-sm">
      <label className="block font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
        Workspace GitHub token (preferred over env)
        <input
          type="password"
          className="mt-1 w-full rounded-lg border border-outline-variant/30 bg-white px-sm py-2 font-body text-sm"
          placeholder="ghp_… leave blank to keep"
          id="que-github-token"
        />
      </label>
      <button
        type="button"
        disabled={secretsBusy}
        onClick={() => {
          const el = document.getElementById(
            'que-github-token',
          ) as HTMLInputElement | null
          const v = el?.value?.trim()
          if (v) void saveLlmSecrets({ githubToken: v })
        }}
        className="rounded-lg border border-outline-variant px-md py-sm font-label text-[11px] disabled:opacity-40"
      >
        Save GitHub token
      </button>
    </div>
  ) : null}
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
    <section className="overflow-hidden rounded-xl border border-outline-variant/30 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-outline-variant/20 bg-surface-container-low px-md py-sm">
        <span className="font-label text-[11px] font-bold tracking-widest text-primary uppercase">
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
    <div className="rounded-xl border border-outline-variant/30 bg-white p-sm shadow-sm">
      <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
        {label}
      </p>
      <p className="font-headline text-xl font-semibold text-primary">{value}</p>
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
          'mt-1 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50',
          checked
            ? 'border-primary bg-primary-container'
            : 'border-outline-variant bg-surface-container',
        ].join(' ')}
      >
        <span
          className={[
            'mt-0.5 block h-4 w-4 rounded-full transition-transform',
            checked
              ? 'translate-x-6 bg-white'
              : 'translate-x-0.5 bg-on-surface-variant',
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
    <div className="rounded-xl border border-outline-variant/30 bg-canvas p-sm">
      <div className="flex items-center justify-between gap-sm">
        <span className="font-label text-[10px] tracking-widest text-on-surface-variant">
          {label}
        </span>
        <span className="font-label text-[9px] tracking-wider text-primary">
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
        className="mt-sm w-full rounded-lg border border-outline-variant/40 bg-white px-sm py-xs font-body text-xs text-on-surface outline-none focus:border-primary disabled:opacity-50"
      />
      <div className="mt-sm flex flex-wrap gap-sm">
        <button
          type="button"
          disabled={disabled || !value.trim()}
          onClick={onSave}
          className="rounded-lg bg-primary-container px-sm py-xs font-label text-[10px] font-bold tracking-widest text-on-primary disabled:opacity-40"
        >
          SAVE KEY
        </button>
        <button
          type="button"
          disabled={disabled || source !== 'workspace'}
          onClick={onClear}
          className="rounded-lg border border-outline-variant px-sm py-xs font-label text-[10px] font-bold tracking-widest text-on-surface-variant disabled:opacity-40"
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
