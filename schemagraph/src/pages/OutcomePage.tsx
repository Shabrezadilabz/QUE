import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { SchemaCustodyBanner } from '@/components/SchemaCustodyBanner'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  createOutcomeApi,
  createShipDraftApi,
  fetchOutcomes,
  refreshOutcomeApi,
  type OutcomeRecord,
} from '@/services/stitchApi'

/**
 * CEO P0 — Natural-language Outcome mode.
 * Prompt → multi-step plan (sources → joins → metrics → Ship to BI).
 */
export function OutcomePage() {
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
    <QueAppChrome eyebrow="OUTCOME · CEO MODE">
      <div className="mx-auto min-h-0 flex-1 overflow-y-auto px-md py-lg md:max-w-3xl md:px-lg">
        <h1 className="font-headline text-xl font-semibold">Outcome</h1>
        <p className="mt-xs text-[13px] text-on-surface-variant">
          Describe the business result. Que proposes sources → joins → metrics →
          BI. HITL Promote stays on Yellow/Red joins.
        </p>
        <SchemaCustodyBanner className="mt-md" />

        {error ? (
          <p className="mt-md text-[13px] text-error">{error}</p>
        ) : null}
        {toast ? (
          <p className="mt-md text-[12px] text-secondary">{toast}</p>
        ) : null}

        <div className="mt-lg space-y-sm rounded-xl border border-outline-variant/30 bg-surface-container-low p-md">
          <label className="block text-[11px] uppercase tracking-wide text-on-surface-variant">
            What do you want?
          </label>
          <textarea
            className="min-h-[88px] w-full rounded-lg border border-outline-variant/40 bg-surface px-sm py-sm text-[13px]"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Revenue by region from Stripe + Salesforce + Postgres"
            disabled={!canWrite}
          />
          <div className="flex flex-wrap gap-sm">
            <button
              type="button"
              className="rounded-lg bg-secondary px-md py-sm text-[13px] font-medium text-on-secondary disabled:opacity-50"
              disabled={!canWrite || busy || !prompt.trim()}
              onClick={() => void create()}
            >
              {busy ? 'Planning…' : 'Build plan'}
            </button>
            <Link
              to="/chat"
              className="rounded-lg border border-outline-variant/40 px-md py-sm text-[13px] text-on-surface-variant"
            >
              Power chat
            </Link>
          </div>
        </div>

        {active ? (
          <div className="mt-lg space-y-md">
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <h2 className="font-headline text-base font-semibold">
                Plan · {active.status}
              </h2>
              <div className="flex flex-wrap gap-sm">
                <button
                  type="button"
                  className="rounded-lg border border-outline-variant/40 px-sm py-xs text-[12px]"
                  disabled={busy}
                  onClick={() => void refresh()}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-primary px-sm py-xs text-[12px] font-medium text-on-primary disabled:opacity-50"
                  disabled={busy || !canWrite}
                  onClick={() => void shipFromPlan()}
                >
                  Ship to BI →
                </button>
              </div>
            </div>
            <p className="text-[12px] text-on-surface-variant">{active.prompt}</p>
            <ol className="space-y-sm">
              {steps.map((s, i) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-outline-variant/30 bg-surface p-md"
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
                      {(s.joins as { id: string; tier?: string; from?: string; to?: string; rationale?: string }[])
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
        ) : null}

        {items.length ? (
          <div className="mt-xl">
            <h3 className="text-[11px] uppercase tracking-wide text-on-surface-variant">
              Recent outcomes
            </h3>
            <ul className="mt-sm space-y-xs">
              {items.slice(0, 8).map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg border border-outline-variant/20 px-sm py-sm text-left text-[12px] hover:bg-surface-container-low"
                    onClick={() => setActive(o)}
                  >
                    <span className="text-on-surface-variant">{o.status}</span>
                    {' · '}
                    {o.prompt.slice(0, 90)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </QueAppChrome>
  )
}
