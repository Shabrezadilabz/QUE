import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  applyIndustryTemplateApi,
  fetchMarketplaceCatalog,
  fetchMarketplaceInstalls,
} from '@/services/stitchApi'

type Pack = {
  id: string
  industry: string
  title: string
  description: string
  tablesHint: string[]
  tags: string[]
  difficulty: string
  featured: boolean
  ceoReady?: boolean
  hasOutcome?: boolean
  seedRuleCount?: number
}

type PlaybookStep = {
  id: string
  title: string
  status: string
  detail: string
  href: string
}

type InstallResult = {
  packTitle: string
  playbook: PlaybookStep[]
  nextHref?: string
  nextHint?: string
  joinsCreated?: number
  matched?: number
  missing?: number
}

/**
 * Industry pack marketplace — full end-to-end install playbook.
 */
export function MarketplacePage() {
  const { canWrite } = useWorkspaceRole()
  const navigate = useNavigate()
  const [packs, setPacks] = useState<Pack[]>([])
  const [industries, setIndustries] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [installs, setInstalls] = useState<
    { id: string; packId: string; jobId: string; createdAt: string }[]
  >([])
  const [industry, setIndustry] = useState('')
  const [tag, setTag] = useState('')
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<InstallResult | null>(null)

  async function reload() {
    const [cat, inst] = await Promise.all([
      fetchMarketplaceCatalog({
        industry: industry || undefined,
        tag: tag || undefined,
        q: q || undefined,
      }),
      fetchMarketplaceInstalls(),
    ])
    setPacks(cat.packs)
    setIndustries(cat.industries)
    setTags(cat.tags)
    setInstalls(inst)
  }

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }, [industry, tag])

  const featured = useMemo(() => packs.filter((p) => p.featured), [packs])

  async function install(p: Pack) {
    if (!canWrite || busy) return
    setBusy(true)
    setError(null)
    try {
      const out = await applyIndustryTemplateApi(p.id)
      const playbook = out.playbook || []
      setResult({
        packTitle: p.title,
        playbook,
        nextHref: out.next?.href,
        nextHint: out.next?.hint,
        joinsCreated: out.joins?.created,
        matched: out.tableMatch?.matched?.length,
        missing: out.tableMatch?.missing?.length,
      })
      setToast(
        `Installed “${p.title}” end-to-end · ${playbook.length} playbook steps`,
      )
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <QueAppChrome eyebrow="MARKETPLACE · INDUSTRY PACKS">
      <div className="mx-auto min-h-0 flex-1 overflow-y-auto px-md py-lg md:max-w-4xl md:px-lg">
        <h1 className="font-headline text-xl font-semibold">Marketplace</h1>
        <p className="mt-xs text-[13px] text-on-surface-variant">
          Apply installs a full HITL playbook: match schema → seed rules →
          suggest joins → draft job → Outcome in Assistant → Ship draft → Report
          Studio when managed data is ready. Never auto-Promotes or copies the
          lake.
        </p>
        {error ? (
          <p className="mt-md text-[13px] text-error">{error}</p>
        ) : null}
        {toast ? (
          <p className="mt-md text-[12px] text-secondary">{toast}</p>
        ) : null}

        {result ? (
          <section className="mt-lg rounded-xl border border-secondary/35 bg-secondary/10 p-md">
            <div className="flex flex-wrap items-start justify-between gap-sm">
              <div>
                <p className="font-label text-[10px] font-bold tracking-widest text-secondary uppercase">
                  Install playbook
                </p>
                <h2 className="mt-1 font-headline text-base font-semibold">
                  {result.packTitle}
                </h2>
                <p className="mt-1 text-[12px] text-on-surface-variant">
                  Matched tables: {result.matched ?? 0}
                  {result.missing ? ` · missing hints: ${result.missing}` : ''}
                  {result.joinsCreated != null
                    ? ` · join suggestions: ${result.joinsCreated}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                className="rounded border border-outline-variant px-sm py-1 text-[11px]"
                onClick={() => setResult(null)}
              >
                Dismiss
              </button>
            </div>
            <ol className="mt-md space-y-sm">
              {result.playbook.map((s, i) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-outline-variant/25 bg-surface px-md py-sm"
                >
                  <div>
                    <p className="font-label text-[12px] font-semibold">
                      {i + 1}. {s.title}{' '}
                      <span className="ml-sm font-normal uppercase text-on-surface-variant">
                        {s.status}
                      </span>
                    </p>
                    <p className="text-[11px] text-on-surface-variant">
                      {s.detail}
                    </p>
                  </div>
                  <Link
                    to={s.href}
                    className="rounded-lg border border-secondary/40 px-md py-1 text-[11px] text-secondary"
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ol>
            {result.nextHref ? (
              <button
                type="button"
                className="mt-md w-full rounded bg-secondary px-md py-2 text-[12px] font-semibold text-on-secondary"
                onClick={() => navigate(result.nextHref!)}
              >
                Continue · {result.nextHint || 'Next step'}
              </button>
            ) : null}
          </section>
        ) : null}

        <div className="mt-lg flex flex-wrap gap-sm">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void reload()
            }}
            placeholder="Search packs…"
            className="min-w-[12rem] flex-1 rounded-lg border border-outline-variant/40 px-md py-1.5 text-[13px]"
          />
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="rounded-lg border border-outline-variant/40 px-md py-1.5 text-[13px]"
          >
            <option value="">All industries</option>
            {industries.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="rounded-lg border border-outline-variant/40 px-md py-1.5 text-[13px]"
          >
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void reload()}
            className="rounded-lg border border-outline-variant px-md py-1.5 text-[12px]"
          >
            Search
          </button>
        </div>

        {featured.length > 0 && !industry && !tag && !q ? (
          <section className="mt-xl">
            <h2 className="font-headline text-base font-semibold">Featured</h2>
            <div className="mt-md grid gap-md sm:grid-cols-2">
              {featured.map((p) => (
                <PackCard
                  key={p.id}
                  pack={p}
                  canWrite={canWrite}
                  busy={busy}
                  onInstall={() => void install(p)}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-xl">
          <h2 className="font-headline text-base font-semibold">
            All packs ({packs.length})
          </h2>
          <ul className="mt-md space-y-sm">
            {packs.map((p) => (
              <li key={p.id}>
                <PackCard
                  pack={p}
                  canWrite={canWrite}
                  busy={busy}
                  onInstall={() => void install(p)}
                />
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-xl">
          <h2 className="font-headline text-base font-semibold">
            Recent installs
          </h2>
          <ul className="mt-md space-y-sm text-[13px]">
            {installs.length === 0 ? (
              <li className="text-on-surface-variant">No installs yet.</li>
            ) : (
              installs.map((i) => (
                <li
                  key={i.id}
                  className="flex flex-wrap justify-between gap-sm rounded-lg border border-outline-variant/20 px-md py-sm"
                >
                  <span>
                    {i.packId}
                    {i.jobId ? (
                      <>
                        {' · '}
                        <Link
                          to={`/jobs/${i.jobId}/notebook`}
                          className="text-secondary underline"
                        >
                          open job
                        </Link>
                      </>
                    ) : null}
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    {new Date(i.createdAt).toLocaleString()}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </QueAppChrome>
  )
}

function PackCard({
  pack,
  canWrite,
  busy,
  onInstall,
}: {
  pack: Pack
  canWrite: boolean
  busy: boolean
  onInstall: () => void
}) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-md">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div className="min-w-0 flex-1">
          <p className="font-label text-[13px] font-semibold">
            {pack.industry} · {pack.title}
            {pack.ceoReady ? (
              <span className="ml-sm rounded bg-secondary/20 px-sm py-px text-[9px] text-secondary uppercase">
                CEO
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-[12px] text-on-surface-variant">
            {pack.description}
          </p>
          <p className="mt-sm font-mono text-[10px] text-on-surface-variant/80">
            {(pack.tablesHint || []).join(' · ') || 'no table hints'}
          </p>
        </div>
        <button
          type="button"
          disabled={!canWrite || busy}
          onClick={onInstall}
          className="shrink-0 rounded bg-secondary px-md py-1.5 text-[12px] font-semibold text-on-secondary disabled:opacity-40"
        >
          {busy ? 'Applying…' : 'Apply end-to-end'}
        </button>
      </div>
    </div>
  )
}

export default MarketplacePage
