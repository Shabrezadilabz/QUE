import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { PdfPageHeader, PdfPrimaryButton } from '@/components/pdf/PdfUi'
import {
  PackIndustryIcon,
  sourceBadgeLabel,
} from '@/components/marketplace/PackIndustryIcon'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  applyIndustryTemplateApi,
  fetchMarketplaceCatalog,
  installAndStartMonkApi,
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
  monkPackId?: string | null
  hasMonk?: boolean
  kind?: string
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

/** Marketplace — PDF page-03 Starter Packs grid (slate, no top chrome bar). */
export function MarketplacePage() {
  const { canWrite } = useWorkspaceRole()
  const navigate = useNavigate()
  const [packs, setPacks] = useState<Pack[]>([])
  const [industries, setIndustries] = useState<string[]>([])
  const [industry, setIndustry] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<InstallResult | null>(null)

  async function reload() {
    const cat = await fetchMarketplaceCatalog({
      industry: industry || undefined,
    })
    setPacks(cat.packs)
    setIndustries(cat.industries)
  }

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }, [industry])

  const filtered = packs

  async function installAndRunMonk(p: Pack) {
    if (!canWrite || busy) return
    setBusy(true)
    setError(null)
    try {
      const out = await installAndStartMonkApi(p.id)
      setToast(`Monk Mode started — ${out.monkPackId || p.title}`)
      if (out.href) {
        navigate(out.href)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

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
      setToast(`Installed “${p.title}” · ${playbook.length} steps`)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const filters = ['All Categories', ...industries.slice(0, 4)]

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
        <PdfPageHeader
          title="Starter Packs"
          subtitle="Accelerate your data pipelines with industry-specific schemas and logic."
          actions={
            <div className="flex flex-wrap justify-end gap-[8px]">
              <Link
                to="/monk"
                className="shrink-0 rounded-[12px] border border-solid border-[#5c6773] bg-[#2e343b] px-[13px] py-[6px] text-[12px] font-semibold tracking-[0.6px] text-[#e8edf2] hover:bg-[#3a424b]"
              >
                Monk Mode →
              </Link>
              {filters.map((f, i) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setIndustry(i === 0 ? '' : f)}
                  className={[
                    'shrink-0 rounded-[12px] border border-solid px-[13px] py-[6px] text-[12px] font-semibold tracking-[0.6px]',
                    (i === 0 && !industry) || industry === f
                      ? 'border-[#424850] bg-[#2e343b] text-[#d4dbe3]'
                      : 'border-[#424850] bg-[#0f1215] text-[#c8cdd3] hover:bg-[#15191e]',
                  ].join(' ')}
                >
                  {f}
                </button>
              ))}
            </div>
          }
        />

        <div className="min-h-0 flex-1 overflow-y-auto p-[24px]">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-[24px]">
            {error ? (
              <p className="rounded-[4px] border border-solid border-[#ff6b6b]/40 bg-[rgba(255,107,107,0.13)] px-[12px] py-[8px] text-[13px] text-[#ff6b6b]">
                {error}
              </p>
            ) : null}
            {toast ? (
              <p className="text-[12px] text-[#d0d8e0]">{toast}</p>
            ) : null}

            {result ? (
              <section className="pdf-shine rounded-[8px] p-[16px]">
                <div className="flex items-start justify-between gap-[12px]">
                  <div>
                    <p className="text-[10px] font-bold tracking-[1px] text-[#a3afbe] uppercase">
                      Install playbook
                    </p>
                    <h2 className="mt-[4px] text-[16px] font-semibold text-[#d4dbe3]">
                      {result.packTitle}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setResult(null)}
                    className="text-[11px] text-[#a3afbe] hover:text-[#d0d8e0]"
                  >
                    Dismiss
                  </button>
                </div>
                <ol className="mt-[12px] space-y-[8px]">
                  {result.playbook.map((s, i) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between rounded-[6px] border border-solid border-[#424850] bg-[#0f1215] px-[12px] py-[8px]"
                    >
                      <span className="text-[12px] text-[#d4dbe3]">
                        {i + 1}. {s.title}
                      </span>
                      <Link
                        to={s.href}
                        className="text-[11px] text-[#d0d8e0] hover:underline"
                      >
                        Open
                      </Link>
                    </li>
                  ))}
                </ol>
                {result.nextHref ? (
                  <PdfPrimaryButton
                    type="button"
                    onClick={() => navigate(result.nextHref!)}
                    className="mt-[12px] w-full"
                  >
                    Continue
                  </PdfPrimaryButton>
                ) : null}
              </section>
            ) : null}

            <div className="grid gap-[16px] sm:grid-cols-2 xl:grid-cols-4">
              {filtered.map((pack) => (
                <MarketplacePackCard
                  key={pack.id}
                  pack={pack}
                  canWrite={canWrite}
                  busy={busy}
                  onInstall={() => void install(pack)}
                  onRunMonk={
                    pack.hasMonk || pack.monkPackId
                      ? () => void installAndRunMonk(pack)
                      : undefined
                  }
                />
              ))}
            </div>

            {!filtered.length ? (
              <p className="py-[32px] text-center text-[13px] text-[#a3afbe]">
                No starter packs match this category.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </QueAppChrome>
  )
}

function MarketplacePackCard({
  pack,
  canWrite,
  busy,
  onInstall,
  onRunMonk,
}: {
  pack: Pack
  canWrite: boolean
  busy: boolean
  onInstall: () => void
  onRunMonk?: () => void
}) {
  return (
    <article className="pdf-panel flex flex-col overflow-hidden rounded-[4px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
      <div className="flex items-start justify-between border-b border-solid border-[var(--pdf-border)] bg-[var(--pdf-table-head-bg)] px-[16px] pb-[17px] pt-[16px]">
        <PackIndustryIcon industry={pack.industry} />
        <span className="pdf-badge-neutral px-[9px] py-[3px] text-[10px] tracking-[1px]">
          {pack.industry}
        </span>
      </div>
      <div className="flex flex-1 flex-col justify-between p-[16px]">
        <div>
          <h3 className="text-[16px] font-semibold leading-[24px] text-[var(--pdf-text-primary)]">
            {pack.title}
          </h3>
          <p className="mt-[8px] text-[12px] leading-[18px] text-[var(--pdf-text-secondary)]">
            {pack.description}
          </p>
        </div>
        <div className="mt-[16px] flex flex-wrap items-center justify-between gap-[8px]">
          <div className="flex gap-[4px]">
            {(pack.tablesHint || []).slice(0, 3).map((t) => (
              <span
                key={t}
                title={t}
                className="flex size-[24px] items-center justify-center rounded-full border border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-elevated)] text-[9px] font-semibold uppercase tracking-[0.02em] text-[var(--pdf-text-secondary)]"
              >
                {sourceBadgeLabel(t)}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-[6px]">
            {onRunMonk ? (
              <button
                type="button"
                disabled={!canWrite || busy}
                onClick={onRunMonk}
                className="rounded-[2px] border border-solid border-[#5c6773] bg-[#2e343b] px-[10px] py-[6px] text-[11px] font-semibold text-[#e8edf2] hover:bg-[#3a424b] disabled:opacity-40"
              >
                {busy ? '…' : 'Run Monk'}
              </button>
            ) : null}
            <button
              type="button"
              disabled={!canWrite || busy}
              onClick={onInstall}
              className="pdf-btn-ghost rounded-[2px] px-[12px] py-[6px] text-[12px] font-semibold disabled:opacity-40"
            >
              {busy ? '…' : 'Install'}
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

export default MarketplacePage
