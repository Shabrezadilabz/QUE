import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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

/**
 * Industry pack marketplace — browse, filter, install → job.
 */
export function MarketplacePage() {
  const { canWrite } = useWorkspaceRole()
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

  return (
    <QueAppChrome eyebrow="MARKETPLACE · INDUSTRY PACKS">
      <div className="mx-auto min-h-0 flex-1 overflow-y-auto px-md py-lg md:max-w-4xl md:px-lg">
        <h1 className="font-headline text-xl font-semibold">Marketplace</h1>
        <p className="mt-xs text-[13px] text-on-surface-variant">
          Install industry packs — CEO packs seed Rules + an Outcome plan
          (schema-first; no lake copy). Review joins before Ship to BI.
        </p>
        {error ? (
          <p className="mt-md text-[13px] text-error">{error}</p>
        ) : null}
        {toast ? (
          <p className="mt-md text-[12px] text-secondary">{toast}</p>
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
            className="rounded-lg border border-secondary px-md py-1.5 text-[12px] text-secondary"
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
                  onInstall={() => {
                    setBusy(true)
                    void applyIndustryTemplateApi(p.id)
                      .then((out) => {
                        const parts = [`Installed “${p.title}”`]
                        if (out.seededRules?.length)
                          parts.push(`${out.seededRules.length} rules`)
                        if (out.outcome?.id) parts.push('Outcome plan')
                        setToast(parts.join(' · '))
                        if (out.outcome?.id) {
                          window.location.href = '/outcome'
                          return
                        }
                        return reload()
                      })
                      .catch((e) =>
                        setError(e instanceof Error ? e.message : String(e)),
                      )
                      .finally(() => setBusy(false))
                  }}
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
                  onInstall={() => {
                    setBusy(true)
                    void applyIndustryTemplateApi(p.id)
                      .then((out) => {
                        const parts = [`Installed “${p.title}”`]
                        if (out.seededRules?.length)
                          parts.push(`${out.seededRules.length} rules`)
                        if (out.outcome?.id) parts.push('Outcome → opening')
                        setToast(parts.join(' · '))
                        if (out.outcome?.id) {
                          window.location.href = '/outcome'
                          return
                        }
                        return reload()
                      })
                      .catch((e) =>
                        setError(e instanceof Error ? e.message : String(e)),
                      )
                      .finally(() => setBusy(false))
                  }}
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
                    {i.createdAt
                      ? new Date(i.createdAt).toLocaleString()
                      : ''}
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
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-md py-md">
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
            {pack.industry} · {pack.difficulty}
            {pack.featured ? ' · featured' : ''}
            {pack.ceoReady ? ' · CEO' : ''}
          </p>
          <p className="mt-1 font-label text-[14px] font-semibold">
            {pack.title}
          </p>
          <p className="mt-1 text-[12px] text-on-surface-variant">
            {pack.description}
          </p>
          <p className="mt-sm text-[11px] text-on-surface-variant">
            {(pack.tags || []).join(' · ')}
            {pack.hasOutcome ? ' · seeds Outcome' : ''}
            {pack.seedRuleCount
              ? ` · ${pack.seedRuleCount} rules`
              : ''}
          </p>
        </div>
        {canWrite ? (
          <button
            type="button"
            disabled={busy}
            onClick={onInstall}
            className="shrink-0 rounded bg-secondary px-md py-1.5 text-[12px] font-semibold text-on-secondary disabled:opacity-40"
          >
            {pack.ceoReady ? 'Install CEO pack' : 'Install'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default MarketplacePage
