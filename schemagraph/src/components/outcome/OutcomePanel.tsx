import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SchemaCustodyBanner } from '@/components/SchemaCustodyBanner'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  createOutcomeApi,
  createShipDraftApi,
  fetchOutcomes,
  refreshOutcomeApi,
  runOutcomeStepApi,
  advanceOutcomeAgentApi,
  type OutcomeRecord,
} from '@/services/stitchApi'

/**
 * Outcome mode body — Chat-style thread chrome (no QueAppChrome).
 * Used inside unified Assistant (/chat?mode=outcome).
 */
export function OutcomePanel({ isCeo = false }: { isCeo?: boolean }) {
  const { canWrite } = useWorkspaceRole()
  const [params] = useSearchParams()
  const [prompt, setPrompt] = useState(
    params.get('q') ||
      'I want revenue by region from Salesforce + Postgres',
  )
  const [items, setItems] = useState<OutcomeRecord[]>([])
  const [active, setActive] = useState<OutcomeRecord | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  async function reload() {
    const list = await fetchOutcomes()
    setItems(list)
    if (active) {
      const next = list.find((o) => o.id === active.id)
      if (next) setActive(next)
    }
  }

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount load
  }, [])

  async function create() {
    if (!canWrite || !prompt.trim()) return
    setBusy(true)
    setError(null)
    try {
      const outcome = await createOutcomeApi(prompt.trim())
      setActive(outcome)
      setToast('Outcome plan ready — review steps, then Ship to BI')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function refresh() {
    if (!active || !canWrite) return
    setBusy(true)
    try {
      const outcome = await refreshOutcomeApi(active.id)
      setActive(outcome)
      setToast('Plan refreshed from live schema')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runNext(opts?: { inferJoins?: boolean; stepId?: string }) {
    if (!active || !canWrite) return
    setBusy(true)
    setError(null)
    try {
      const out = await runOutcomeStepApi(active.id, {
        stepId: opts?.stepId || 'auto',
        inferJoins: opts?.inferJoins,
      })
      if (out.outcome) setActive(out.outcome)
      const n = Array.isArray(out.actions) ? out.actions.length : 0
      setToast(`Ran step “${out.stepId}” · ${n} tool action(s)`)
      const shipAction = (out.actions || []).find(
        (a) =>
          a &&
          typeof a === 'object' &&
          (a as { tool?: string }).tool === 'ship_draft' &&
          (a as { href?: string }).href,
      ) as { href?: string } | undefined
      if (shipAction?.href) {
        window.location.href = shipAction.href
        return
      }
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function advanceAgent(opts?: { approvePlan?: boolean }) {
    if (!active || !canWrite) return
    setBusy(true)
    setError(null)
    try {
      const out = await advanceOutcomeAgentApi(active.id, {
        approvePlan: opts?.approvePlan === true,
      })
      if (out.outcome) setActive(out.outcome)
      const hint =
        (out.actions || [])
          .map((a) =>
            a && typeof a === 'object'
              ? String(
                  (a as { hint?: string; tool?: string }).hint ||
                    (a as { tool?: string }).tool ||
                    '',
                )
              : '',
          )
          .filter(Boolean)
          .join(' · ') || 'Agent advanced'
      setToast(
        out.needsHitl
          ? `HITL · ${hint}`
          : `Agent · ${out.session?.status || 'ok'} · ${hint}`,
      )
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function shipFromPlan() {
    if (!active || !canWrite) return
    const hint = active.plan?.steps?.find((s) => s.kind === 'chart')?.chartHint
    setBusy(true)
    try {
      const ship = await createShipDraftApi({
        title: hint?.title || active.prompt.slice(0, 80),
        outcomeId: active.id,
        chartType: hint?.chartType || 'bar',
        description: active.prompt,
      })
      setToast(`Ship draft created — open Ship to approve`)
      window.location.href = `/ship?id=${ship.id}`
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const steps = active?.plan?.steps || []

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-lg overflow-y-auto pr-sm">
        {/* Welcome bubble — same pattern as Explore chat */}
        <div className="flex max-w-[56rem] gap-md">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-secondary/40 bg-secondary/15 font-label text-sm font-bold text-secondary">
            AI
          </div>
          <div className="min-w-0 flex-1 space-y-sm">
            <div className="rounded-lg rounded-tl-none border border-outline-variant bg-surface-container-low/80 p-md">
              <p className="font-body text-[13px] leading-snug text-on-surface">
                {isCeo ? (
                  <>
                    <span className="font-semibold text-secondary">CEO mode</span>
                    {' — '}
                  </>
                ) : null}
                Describe the business result. I will propose sources → joins →
                metrics → BI. HITL Promote stays on Yellow/Red joins.
              </p>
              <SchemaCustodyBanner className="mt-md" />
            </div>
            <span className="ml-1 font-label text-[12px] text-on-surface-variant/60">
              Outcome · Ready
            </span>
          </div>
        </div>

        {error ? (
          <p className="text-[13px] text-error">{error}</p>
        ) : null}
        {toast ? (
          <p className="text-[12px] text-secondary">{toast}</p>
        ) : null}

        {active ? (
          <div className="flex max-w-[56rem] gap-md">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-secondary/40 bg-secondary/15 font-label text-sm font-bold text-secondary">
              AI
            </div>
            <div className="min-w-0 flex-1 space-y-md">
              <div className="rounded-lg rounded-tl-none border border-outline-variant bg-surface-container-low/80 p-md">
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <h2 className="font-headline text-base font-semibold text-on-surface">
                    Plan · {active.status}
                  </h2>
                  <div className="flex flex-wrap gap-sm">
                    <button
                      type="button"
                      className="rounded-md border border-outline-variant px-sm py-1 font-label text-[11px] text-on-surface-variant"
                      disabled={busy}
                      onClick={() => void refresh()}
                    >
                      Refresh
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-secondary/50 px-sm py-1 font-label text-[11px] text-secondary"
                      disabled={busy || !canWrite}
                      onClick={() =>
                        void runNext({ inferJoins: true, stepId: 'joins' })
                      }
                    >
                      Infer joins
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-secondary/50 px-sm py-1 font-label text-[11px] text-secondary"
                      disabled={busy || !canWrite}
                      onClick={() => void runNext({ stepId: 'auto' })}
                    >
                      Run next step
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-outline-variant px-sm py-1 font-label text-[11px]"
                      disabled={busy || !canWrite}
                      onClick={() => void advanceAgent({ approvePlan: true })}
                    >
                      Approve agent
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-primary px-sm py-1 font-label text-[11px] font-medium text-on-primary"
                      disabled={busy || !canWrite}
                      onClick={() => void shipFromPlan()}
                    >
                      Ship to BI →
                    </button>
                  </div>
                </div>
                {active.plan?.agentSessionId ? (
                  <p className="mt-sm text-[12px] text-on-surface-variant">
                    Linked agent —{' '}
                    <Link to="/agent" className="text-secondary underline">
                      open /agent
                    </Link>
                  </p>
                ) : null}
                <p className="mt-sm text-[12px] text-on-surface-variant">
                  {active.prompt}
                </p>
                <ol className="mt-md space-y-sm">
                  {steps.map((s, i) => (
                    <li
                      key={s.id}
                      className="rounded-lg border border-outline-variant/30 bg-surface p-md"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-sm">
                        <span className="text-[13px] font-medium">
                          {i + 1}. {s.title}
                        </span>
                        <span className="rounded-full bg-surface-container-high px-sm py-px text-[10px] uppercase tracking-wide text-on-surface-variant">
                          {s.status}
                        </span>
                      </div>
                      <p className="mt-xs text-[12px] text-on-surface-variant">
                        {s.detail}
                      </p>
                      {s.href ? (
                        <Link
                          to={s.href}
                          className="mt-sm inline-block text-[12px] text-secondary underline"
                        >
                          Open {s.kind}
                        </Link>
                      ) : null}
                      {s.kind === 'joins' && Array.isArray(s.joins) ? (
                        <ul className="mt-sm space-y-xs text-[11px] text-on-surface-variant">
                          {(
                            s.joins as {
                              id: string
                              tier?: string
                              from?: string
                              to?: string
                              rationale?: string
                            }[]
                          )
                            .slice(0, 5)
                            .map((j) => (
                              <li key={j.id}>
                                <span
                                  className={
                                    j.tier === 'green'
                                      ? 'text-emerald-400'
                                      : j.tier === 'red'
                                        ? 'text-error'
                                        : 'text-amber-300'
                                  }
                                >
                                  {(j.tier || 'yellow').toUpperCase()}
                                </span>{' '}
                                {j.from} → {j.to}
                                {j.rationale ? ` — ${j.rationale}` : ''}
                              </li>
                            ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Composer — mirrors Explore chat input stack */}
      <div className="shrink-0 border-t border-outline-variant/20 pt-md">
        <label className="mb-xs block font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
          What do you want?
        </label>
        <textarea
          className="min-h-[72px] w-full rounded-xl border border-outline-variant bg-surface-container-low px-md py-sm font-body text-[13px] text-on-surface outline-none focus:border-secondary"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Revenue by region from Stripe + Salesforce + Postgres"
          disabled={!canWrite}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void create()
            }
          }}
        />
        <div className="mt-sm flex flex-wrap items-center gap-sm">
          <button
            type="button"
            className="rounded-lg bg-secondary px-md py-sm text-[13px] font-medium text-on-secondary disabled:opacity-50"
            disabled={!canWrite || busy || !prompt.trim()}
            onClick={() => void create()}
          >
            {busy ? 'Planning…' : 'Build plan'}
          </button>
          {items.length ? (
            <span className="font-label text-[11px] text-on-surface-variant">
              Recent:
            </span>
          ) : null}
          {items.slice(0, 3).map((o) => (
            <button
              key={o.id}
              type="button"
              className="max-w-[12rem] truncate rounded-full border border-outline-variant px-sm py-1 font-label text-[11px] text-on-surface-variant hover:border-secondary hover:text-secondary"
              onClick={() => setActive(o)}
              title={o.prompt}
            >
              {o.status} · {o.prompt.slice(0, 28)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
