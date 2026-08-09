import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  agentCheckpointApi,
  createAgentSessionApi,
  fetchAgentSessions,
  fetchWorkspaceSettings,
  type AgentSession,
} from '@/services/stitchApi'

/**
 * Phase 1+3 — Stitch Agent: NL intent → multi-step tools → HITL checkpoints.
 */
export function AgentPage() {
  const { canWrite } = useWorkspaceRole()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [active, setActive] = useState<AgentSession | null>(null)
  const [goal, setGoal] = useState(
    'Build trusted customer 360 from connected sources, then draft a stitch job',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  async function reload() {
    const list = await fetchAgentSessions()
    setSessions(list)
    setActive((prev) => {
      if (!prev) return list[0] || null
      return list.find((s) => s.id === prev.id) || list[0] || null
    })
  }

  useEffect(() => {
    fetchWorkspaceSettings()
      .then((s) => setEnabled(s.settings.enableStitchAgent === true))
      .catch(() => setEnabled(false))
    reload().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }, [])

  async function start() {
    if (!canWrite) return
    setBusy(true)
    setError(null)
    try {
      const session = await createAgentSessionApi({ goal, title: goal.slice(0, 80) })
      setActive(session)
      setToast('Plan created — approve the checkpoint to continue')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function resolve(action: string) {
    if (!active || !canWrite) return
    setBusy(true)
    setError(null)
    try {
      const open = active.checkpoints.find((c) => c.status === 'open')
      const session = await agentCheckpointApi(active.id, {
        action,
        checkpointId: open?.id,
      })
      setActive(session)
      setToast(`Checkpoint ${action}`)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const openCheckpoint = active?.checkpoints.find((c) => c.status === 'open')

  return (
    <QueAppChrome eyebrow="AGENT · HITL CHECKPOINTS">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
        <main className="min-h-0 flex-1 overflow-y-auto px-md py-lg md:px-lg lg:px-margin-desktop">
          <div className="mb-xl flex flex-col justify-between gap-md sm:flex-row sm:items-end">
            <div>
              <h1 className="font-headline text-xl font-semibold tracking-tight text-on-surface">
                Stitch Agent
              </h1>
              <p className="mt-xs max-w-[42rem] font-body text-[13px] text-on-surface-variant">
                NL intent → tool plan → human approve → infer / validate / drift
                tools → you Promote → draft job. Auto-promote only if policy is
                on (default off).
              </p>
            </div>
            <div className="flex flex-wrap gap-md">
              <Link
                to="/validation"
                className="font-label text-[12px] text-primary hover:underline"
              >
                Validation suite
              </Link>
              <Link
                to="/drift-agent"
                className="font-label text-[12px] text-primary hover:underline"
              >
                Drift agent
              </Link>
              <Link
                to="/settings/ai-policy"
                className="font-label text-[12px] text-primary hover:underline"
              >
                AI & Policy
              </Link>
            </div>
          </div>

          {enabled === false ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-lg">
              <p className="font-body text-[13px] text-on-surface">
                Stitch Agent is off for this workspace. An admin can enable{' '}
                <strong>enableStitchAgent</strong> under Settings → AI & Policy.
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="mb-md rounded-xl border border-error/40 bg-error/10 px-md py-sm font-body text-[13px] text-error">
              {error}
            </p>
          ) : null}
          {toast ? (
            <p className="mb-md rounded-xl border border-primary/20 bg-primary/5 px-md py-sm font-label text-[12px] text-primary">
              {toast}
            </p>
          ) : null}

          {enabled !== false ? (
            <div className="grid gap-lg lg:grid-cols-12">
              <section className="rounded-xl border border-outline-variant/30 bg-white p-lg shadow-sm lg:col-span-5">
                <h2 className="font-headline text-base font-semibold text-on-surface-variant">
                  New plan
                </h2>
                <label className="mt-md block">
                  <span className="mb-xs block font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                    Goal
                  </span>
                  <textarea
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-outline-variant/40 bg-canvas px-md py-sm font-body text-[13px]"
                    disabled={!canWrite || busy}
                  />
                </label>
                <button
                  type="button"
                  disabled={!canWrite || busy || enabled == null}
                  onClick={() => void start()}
                  className="mt-md rounded-lg bg-primary px-lg py-2 font-label text-[12px] font-semibold text-on-primary disabled:opacity-40"
                >
                  {busy ? 'Working…' : 'Start agent plan'}
                </button>
                <ul className="mt-lg space-y-sm">
                  {sessions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setActive(s)}
                        className={[
                          'w-full rounded-lg border px-md py-sm text-left font-body text-[12px]',
                          active?.id === s.id
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-outline-variant/30 text-on-surface',
                        ].join(' ')}
                      >
                        <span className="font-medium">{s.title}</span>
                        <span className="mt-0.5 block text-on-surface-variant">
                          {s.status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-xl border border-outline-variant/30 bg-white p-lg shadow-sm lg:col-span-7">
                {!active ? (
                  <p className="font-body text-[13px] text-on-surface-variant">
                    Start a plan or select a session.
                  </p>
                ) : (
                  <div className="space-y-lg">
                    <div>
                      <p className="font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                        {active.status}
                      </p>
                      <h2 className="mt-xs font-headline text-lg font-semibold text-on-surface">
                        {active.title}
                      </h2>
                      <p className="mt-1 font-body text-[13px] text-on-surface-variant">
                        {active.plan?.goal}
                      </p>
                      {active.plan?.intent ? (
                        <p className="mt-xs font-label text-[11px] uppercase tracking-widest text-primary">
                          Intent · {active.plan.intent}
                          {(active.plan.tools || []).length
                            ? ` · ${(active.plan.tools || []).map((t) => t.id).join(' → ')}`
                            : ''}
                        </p>
                      ) : null}
                    </div>

                    <ol className="space-y-sm">
                      {(active.plan?.steps || []).map((step) => (
                        <li
                          key={step.id}
                          className="flex items-center justify-between rounded-lg bg-surface-container-low px-md py-sm font-body text-[13px]"
                        >
                          <span>{step.label}</span>
                          <span className="font-label text-[11px] uppercase text-on-surface-variant">
                            {step.status}
                          </span>
                        </li>
                      ))}
                    </ol>

                    {openCheckpoint ? (
                      <div className="rounded-xl border border-primary/30 bg-primary/5 p-md">
                        <p className="font-label text-[11px] tracking-widest text-primary uppercase">
                          Checkpoint · {openCheckpoint.type}
                        </p>
                        <p className="mt-sm font-body text-[13px] text-on-surface">
                          {openCheckpoint.message}
                        </p>
                        <div className="mt-md flex flex-wrap gap-sm">
                          {openCheckpoint.type === 'promote_joins' ? (
                            <>
                              <Link
                                to="/joins"
                                className="rounded-lg border border-primary px-md py-2 font-label text-[12px] text-primary"
                              >
                                Open Join Review
                              </Link>
                              <button
                                type="button"
                                disabled={!canWrite || busy}
                                onClick={() =>
                                  void resolve('continue_after_promote')
                                }
                                className="rounded-lg bg-primary px-md py-2 font-label text-[12px] text-on-primary disabled:opacity-40"
                              >
                                Continues after Promote
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={!canWrite || busy}
                                onClick={() => void resolve('approve')}
                                className="rounded-lg bg-primary px-md py-2 font-label text-[12px] text-on-primary disabled:opacity-40"
                              >
                                Approve plan
                              </button>
                              <button
                                type="button"
                                disabled={!canWrite || busy}
                                onClick={() => void resolve('reject')}
                                className="rounded-lg border border-error/40 px-md py-2 font-label text-[12px] text-error disabled:opacity-40"
                              >
                                Reject
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : null}

                    {(active.toolCalls || []).length ? (
                      <div>
                        <p className="mb-sm font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                          Tool transcript
                        </p>
                        <ul className="space-y-xs">
                          {(active.toolCalls || []).map((t) => (
                            <li
                              key={t.id}
                              className="rounded-lg border border-outline-variant/20 px-md py-sm font-mono text-[11px] text-on-surface-variant"
                            >
                              <span className={t.ok === false ? 'text-error' : 'text-primary'}>
                                {t.tool}
                              </span>
                              {t.output?.error
                                ? ` · ${String(t.output.error)}`
                                : t.output?.created != null
                                  ? ` · created ${String(t.output.created)}`
                                  : t.output?.jobId
                                    ? ` · job ${String(t.output.jobId)}`
                                    : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {active.result?.jobId ? (
                      <div className="flex flex-wrap gap-sm">
                        <Link
                          to={`/jobs/${String(active.result.jobId)}/notebook`}
                          className="inline-flex rounded-lg bg-primary-container px-md py-2 font-label text-[12px] font-semibold text-on-primary-fixed"
                        >
                          Open drafted job
                        </Link>
                        <Link
                          to="/validation"
                          className="inline-flex rounded-lg border border-primary px-md py-2 font-label text-[12px] text-primary"
                        >
                          Validation suite
                        </Link>
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </main>
      </div>
    </QueAppChrome>
  )
}
