import { useEffect, useState } from 'react'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  applyIndustryTemplateApi,
  fetchEvalDashboard,
  fetchGoldenEvalSchedule,
  fetchIndustryTemplates,
  runGoldenEvalScheduleApi,
  upsertGoldenEvalScheduleApi,
} from '@/services/stitchApi'

type GoldenSchedule = {
  enabled: boolean
  intervalHours: number
  pairs: unknown[]
  lastRunAt?: string | null
  lastRecall?: number | null
  nextRunAt?: string | null
}

/** Eval harness + industry templates + scheduled golden eval. */
export function EvalPage() {
  const { canAdmin } = useWorkspaceRole()
  const [dash, setDash] = useState<Record<string, unknown> | null>(null)
  const [templates, setTemplates] = useState<
    { id: string; industry: string; title: string; description: string }[]
  >([])
  const [schedule, setSchedule] = useState<GoldenSchedule | null>(null)
  const [pairsText, setPairsText] = useState('[]')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  async function reload() {
    const [d, t, s] = await Promise.all([
      fetchEvalDashboard(),
      fetchIndustryTemplates(),
      fetchGoldenEvalSchedule(),
    ])
    setDash(d)
    setTemplates(t)
    setSchedule(s)
    setPairsText(JSON.stringify(s.pairs || [], null, 2))
  }

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }, [])

  const joins = (dash?.joins || {}) as Record<string, unknown>
  const jobs = (dash?.jobs || {}) as Record<string, unknown>
  const rules = (dash?.rules || {}) as Record<string, unknown>

  return (
    <QueAppChrome eyebrow="EVAL · QUALITY">
      <div className="mx-auto min-h-0 flex-1 overflow-y-auto px-md py-lg md:max-w-4xl md:px-lg">
        <h1 className="font-headline text-xl font-semibold">Eval dashboard</h1>
        <p className="mt-xs text-[13px] text-on-surface-variant">
          Join promote rates, job success, rules coverage — continuous quality
          for AI-assisted DE/DA work.
        </p>
        {error ? (
          <p className="mt-md text-[13px] text-error">{error}</p>
        ) : null}
        {toast ? (
          <p className="mt-md text-[12px] text-secondary">{toast}</p>
        ) : null}

        {(() => {
          const board = (dash?.scoreboard || {}) as Record<string, unknown>
          const tiers = (joins.pendingByTier || {}) as Record<string, number>
          return (
            <section className="mt-lg rounded-xl border border-secondary/30 bg-secondary/10 p-md">
              <h2 className="font-headline text-base font-semibold">
                Green eligibility scoreboard
              </h2>
              <p className="mt-xs text-[13px] text-on-surface">
                {String(board.headline || '—')}
              </p>
              <div className="mt-md grid gap-md sm:grid-cols-4 text-[13px]">
                <Card
                  label="Golden recall"
                  value={
                    board.lastGoldenRecall != null
                      ? `${(Number(board.lastGoldenRecall) * 100).toFixed(1)}%`
                      : '—'
                  }
                />
                <Card
                  label="Min recall gate"
                  value={
                    board.autoPromoteMinRecall != null
                      ? `${(Number(board.autoPromoteMinRecall) * 100).toFixed(0)}%`
                      : '—'
                  }
                />
                <Card
                  label="Green eligible"
                  value={board.greenEligible ? 'yes' : 'no'}
                />
                <Card
                  label="Pending G/Y/R"
                  value={`${tiers.green ?? 0}/${tiers.yellow ?? 0}/${tiers.red ?? 0}`}
                />
              </div>
            </section>
          )
        })()}

        <div className="mt-lg grid gap-md sm:grid-cols-3">
          <Card
            label="Suggested joins"
            value={String(joins.suggested ?? '—')}
          />
          <Card
            label="Promote rate"
            value={
              joins.promoteRatePct != null
                ? `${joins.promoteRatePct}%`
                : '—'
            }
          />
          <Card
            label="Job success (30d)"
            value={
              jobs.successRatePct != null ? `${jobs.successRatePct}%` : '—'
            }
          />
          <Card label="Rules enabled" value={String(rules.enabled ?? '—')} />
          <Card
            label="Join rules"
            value={String(rules.joinRules ?? '—')}
          />
          <Card
            label="Promotes (30d)"
            value={String(joins.promotesLast30d ?? '—')}
          />
        </div>

        <section className="mt-xl rounded-xl border border-outline-variant/30 bg-surface-container-low p-md">
          <h2 className="font-headline text-base font-semibold">
            Scheduled golden eval
          </h2>
          <p className="mt-xs text-[12px] text-on-surface-variant">
            Continuous join quality. Recall drops are audited for alerts.
          </p>
          {schedule ? (
            <div className="mt-md grid gap-md sm:grid-cols-3 text-[13px]">
              <Info
                label="Enabled"
                value={schedule.enabled ? 'yes' : 'no'}
              />
              <Info
                label="Last recall"
                value={
                  schedule.lastRecall != null
                    ? `${(schedule.lastRecall * 100).toFixed(1)}%`
                    : '—'
                }
              />
              <Info
                label="Next run"
                value={
                  schedule.nextRunAt
                    ? new Date(schedule.nextRunAt).toLocaleString()
                    : '—'
                }
              />
            </div>
          ) : null}
          {canAdmin ? (
            <div className="mt-md space-y-sm">
              <label className="block text-[11px] font-label uppercase text-on-surface-variant">
                Golden pairs JSON
              </label>
              <textarea
                value={pairsText}
                onChange={(e) => setPairsText(e.target.value)}
                rows={6}
                className="w-full rounded-lg border border-outline-variant/40 px-md py-sm font-mono text-[12px]"
              />
              <div className="flex flex-wrap gap-sm">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const pairs = JSON.parse(pairsText || '[]')
                      void upsertGoldenEvalScheduleApi({
                        enabled: true,
                        intervalHours: schedule?.intervalHours || 24,
                        pairs,
                      })
                        .then((s) => {
                          setSchedule(s)
                          setToast('Golden schedule saved & enabled')
                        })
                        .catch((e) =>
                          setError(
                            e instanceof Error ? e.message : String(e),
                          ),
                        )
                    } catch {
                      setError('Pairs must be valid JSON array')
                    }
                  }}
                  className="rounded bg-secondary px-md py-1.5 text-[12px] font-semibold text-on-secondary"
                >
                  Save & enable
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void runGoldenEvalScheduleApi()
                      .then((out) => {
                        setToast(
                          `Recall ${((out.recall || 0) * 100).toFixed(1)}%`,
                        )
                        return reload()
                      })
                      .catch((e) =>
                        setError(e instanceof Error ? e.message : String(e)),
                      )
                  }
                  className="rounded-lg border border-secondary px-md py-1.5 text-[12px] text-secondary"
                >
                  Run now
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-md text-[12px] text-on-surface-variant">
              Admin required to edit schedule.
            </p>
          )}
        </section>

        <section className="mt-xl">
          <h2 className="font-headline text-base font-semibold">
            Industry templates
          </h2>
          <p className="mt-xs text-[12px] text-on-surface-variant">
            One-click job packs — browse the full catalog on{' '}
            <a href="/marketplace" className="text-secondary underline">
              Marketplace
            </a>
            .
          </p>
          <ul className="mt-md space-y-sm">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-md rounded-xl border border-outline-variant/30 bg-surface-container-low px-md py-md"
              >
                <div>
                  <p className="font-label text-[13px] font-semibold">
                    {t.industry} · {t.title}
                  </p>
                  <p className="text-[12px] text-on-surface-variant">
                    {t.description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void applyIndustryTemplateApi(t.id)
                      .then((out) =>
                        setToast(
                          `Created job “${out.job?.title || t.title}”${
                            out.outcome?.id ? ' · Outcome seeded' : ''
                          } → /jobs`,
                        ),
                      )
                      .catch((e) =>
                        setError(e instanceof Error ? e.message : String(e)),
                      )
                  }
                  className="rounded-lg border border-secondary px-md py-1.5 text-[12px] text-secondary"
                >
                  Apply
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </QueAppChrome>
  )
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-md py-md">
      <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
        {label}
      </p>
      <p className="mt-1 font-headline text-2xl font-semibold">{value}</p>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
        {label}
      </p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  )
}

export default EvalPage
