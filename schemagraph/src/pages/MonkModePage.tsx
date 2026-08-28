import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { PdfPageHeader, PdfPrimaryButton } from '@/components/pdf/PdfUi'
import { PackIndustryIcon } from '@/components/marketplace/PackIndustryIcon'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  fetchMonkEvents,
  fetchMonkPreview,
  fetchMonkPacks,
  fetchMonkRun,
  fetchMonkRuns,
  startMonkModeApi,
  monkRunControlApi,
  streamMonkEvents,
  fetchMonkCertification,
  certifyMonkRunApi,
  shipCertifiedPackToBiApi,
  type IndustryPackMeta,
  type MonkCapabilityMap,
  type MonkEvent,
  type MonkPhase,
  type MonkRun,
  type RankedIndustryPack,
  type CertChecklist,
  type MultiSourceMonkAnalysis,
} from '@/services/stitchApi'
import { PageAutofillBanner } from '@/components/autofill/PageAutofill'
import { usePageAutofill } from '@/hooks/usePageAutofill'
import { CertChecklistPanel } from '@/components/monk/CertChecklistPanel'

const PHASES: { id: MonkPhase; label: string; hint: string }[] = [
  { id: 'discover', label: 'Discover', hint: 'Scan schema & live warehouse' },
  { id: 'map', label: 'Map', hint: 'Match industry ontology' },
  { id: 'clean', label: 'Clean', hint: 'Profile & queue quality issues' },
  { id: 'build', label: 'Build', hint: 'Jobs, joins, KPIs' },
  { id: 'certify', label: 'Certify', hint: 'Ready gates for CEO chat' },
  { id: 'done', label: 'Done', hint: 'Review capability map' },
]

function phaseIndex(phase: string) {
  const i = PHASES.findIndex((p) => p.id === phase)
  return i >= 0 ? i : 0
}

function levelDot(level: MonkEvent['level']) {
  if (level === 'success') return 'bg-emerald-400'
  if (level === 'warn') return 'bg-amber-400'
  if (level === 'error') return 'bg-rose-400'
  return 'bg-sky-400'
}

function packPolicyBadges(policies?: IndustryPackMeta['policies']) {
  const badges: { label: string; className: string }[] = []
  if (policies?.hipaaStrict) {
    badges.push({ label: 'HIPAA strict', className: 'bg-rose-500/15 text-rose-300' })
  }
  if (policies?.noAutoMaterialize) {
    badges.push({ label: 'Plan-only marts', className: 'bg-amber-500/15 text-amber-300' })
  }
  if (policies?.immutableMonkLog) {
    badges.push({ label: 'SOX evidence', className: 'bg-sky-500/15 text-sky-300' })
  }
  return badges
}

function CapabilitySection({
  title,
  items,
  tone,
}: {
  title: string
  items: { id: string; label: string; href?: string; reason?: string }[]
  tone: 'ready' | 'review' | 'unavailable'
}) {
  if (!items.length) return null
  const border =
    tone === 'ready'
      ? 'border-emerald-500/30'
      : tone === 'review'
        ? 'border-amber-500/30'
        : 'border-[#424850]'
  const badge =
    tone === 'ready'
      ? 'bg-emerald-500/15 text-emerald-300'
      : tone === 'review'
        ? 'bg-amber-500/15 text-amber-300'
        : 'bg-[#2e343b] text-[#9aa3ad]'

  return (
    <section className={`rounded-[14px] border border-solid ${border} bg-[#15191e] p-[16px]`}>
      <div className="mb-[12px] flex items-center justify-between gap-[8px]">
        <h3 className="text-[13px] font-semibold tracking-[0.4px] text-[#d4dbe3]">
          {title}
        </h3>
        <span className={`rounded-full px-[10px] py-[2px] text-[11px] font-semibold ${badge}`}>
          {items.length}
        </span>
      </div>
      <ul className="space-y-[8px]">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start justify-between gap-[12px] rounded-[10px] border border-solid border-[#2a3038] bg-[#0f1215] px-[12px] py-[10px]"
          >
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#e8edf2]">{item.label}</p>
              {item.reason ? (
                <p className="mt-[2px] text-[11px] leading-snug text-[#8b949e]">
                  {item.reason}
                </p>
              ) : null}
            </div>
            {item.href ? (
              <Link
                to={item.href}
                className="shrink-0 rounded-[8px] border border-solid border-[#424850] px-[10px] py-[4px] text-[11px] font-semibold text-[#c8cdd3] hover:bg-[#1a1f24]"
              >
                Open
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function CapabilityMapPanel({ capability }: { capability: MonkCapabilityMap }) {
  return (
    <div className="grid gap-[14px] lg:grid-cols-3">
      <CapabilitySection title="Ready now" items={capability.ready || []} tone="ready" />
      <CapabilitySection title="Needs review" items={capability.review || []} tone="review" />
      <CapabilitySection
        title="Not yet available"
        items={capability.unavailable || []}
        tone="unavailable"
      />
    </div>
  )
}

/** Monk Mode — industry template onboarding with live progress feed. */
export function MonkModePage() {
  const { canWrite } = useWorkspaceRole()
  const [searchParams] = useSearchParams()
  const packFromUrl = searchParams.get('pack') || ''
  const runFromUrl = searchParams.get('run') || ''
  const [packs, setPacks] = useState<IndustryPackMeta[]>([])
  const [selectedPack, setSelectedPack] = useState('ecommerce-v1')
  const [rankedPacks, setRankedPacks] = useState<RankedIndustryPack[]>([])
  const [preview, setPreview] = useState<{
    capability?: MonkCapabilityMap
    matchPct?: number
    canRun?: boolean
    missing?: string[]
    multiSource?: MultiSourceMonkAnalysis | null
  } | null>(null)
  const [runs, setRuns] = useState<MonkRun[]>([])
  const [activeRun, setActiveRun] = useState<MonkRun | null>(null)
  const [events, setEvents] = useState<MonkEvent[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [certStatus, setCertStatus] = useState<string | null>(null)
  const [certChecklist, setCertChecklist] = useState<CertChecklist | null>(null)
  const [shipBusy, setShipBusy] = useState(false)
  const [runControl, setRunControl] = useState<'running' | 'paused'>('running')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamAbortRef = useRef<AbortController | null>(null)
  const lastEventAt = useRef<string | null>(null)
  const { page: autofillPage } = usePageAutofill('monk')

  const reloadCertState = useCallback(async (packId: string) => {
    try {
      const out = await fetchMonkCertification(packId)
      setCertStatus(out.certification?.status ?? null)
      setCertChecklist(out.checklist ?? null)
    } catch {
      /* optional */
    }
  }, [])

  useEffect(() => {
    void reloadCertState(selectedPack)
  }, [selectedPack, activeRun?.status, reloadCertState])

  async function reCertify() {
    if (!activeRun || busy) return
    if (certChecklist && !certChecklist.allGreen) {
      setToast('Complete the steward checklist before re-certifying (promote joins, approve transforms).')
      return
    }
    setBusy(true)
    try {
      const out = await certifyMonkRunApi(activeRun.id, selectedPack)
      setCertStatus(out.passed ? 'passed' : 'failed')
      if (out.checklist) setCertChecklist(out.checklist)
      setToast(
        out.passed
          ? `Certified — recall ${((out.report?.recall ?? 0) * 100).toFixed(1)}%`
          : `Not yet certified — recall ${((out.report?.recall ?? 0) * 100).toFixed(1)}%. Promote joins first.`,
      )
      const { run } = await fetchMonkRun(activeRun.id)
      setActiveRun(run)
      await reloadCertState(selectedPack)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function shipToBi() {
    if (!canWrite || shipBusy || !certChecklist?.canShipToBi) return
    setShipBusy(true)
    setError(null)
    try {
      const out = await shipCertifiedPackToBiApi(selectedPack)
      setToast(
        out.ship?.id
          ? `Shipped to BI — embed draft ${out.ship.id.slice(0, 8)} ready`
          : 'Looker + Metabase export bundle generated',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setShipBusy(false)
    }
  }

  const reloadPreview = useCallback(async (packId: string) => {
    const out = await fetchMonkPreview(packId)
    if (out.ranked?.length) setRankedPacks(out.ranked)
    const ranked = out.ranked?.find((r) => r.pack.id === packId)
    setPreview({
      capability: out.capability,
      matchPct: ranked?.scorePct ?? out.capability?.matchScorePct,
      canRun: ranked?.canRunMonk,
      missing: ranked?.missing,
      multiSource: out.multiSource ?? null,
    })
  }, [])

  const reloadRuns = useCallback(async () => {
    const items = await fetchMonkRuns(undefined, 8)
    setRuns(items)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const p = await fetchMonkPacks()
        setPacks(p)
        const initialPack =
          packFromUrl && p.some((x) => x.id === packFromUrl)
            ? packFromUrl
            : p.find((x) => x.featured)?.id || p[0]?.id || 'ecommerce-v1'
        setSelectedPack(initialPack)
        const previewOut = await fetchMonkPreview(initialPack)
        const ranked = previewOut.ranked || []
        if (ranked.length) {
          setRankedPacks(ranked)
          if (!packFromUrl) {
            const top = ranked[0]
            if (top?.pack?.id) setSelectedPack(top.pack.id)
          }
        }
        if (runFromUrl) {
          try {
            const { run } = await fetchMonkRun(runFromUrl)
            if (run) setActiveRun(run)
          } catch {
            /* optional deep link */
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [packFromUrl, runFromUrl])

  useEffect(() => {
    if (!selectedPack) return
    void reloadPreview(selectedPack).catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
    void reloadRuns().catch(() => {})
  }, [selectedPack, reloadPreview, reloadRuns])

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    streamAbortRef.current?.abort()
    streamAbortRef.current = null

    if (!activeRun || activeRun.status === 'completed' || activeRun.status === 'failed') {
      return
    }

    const runId = activeRun.id
    const ac = new AbortController()
    streamAbortRef.current = ac

    const pollOnce = async () => {
      try {
        const since = lastEventAt.current || undefined
        const newEvents = await fetchMonkEvents(runId, since)
        if (newEvents.length) {
          lastEventAt.current = newEvents[newEvents.length - 1]!.createdAt
          setEvents((prev) => [...prev, ...newEvents])
        }
        const { run } = await fetchMonkRun(runId)
        setActiveRun(run)
        if (run.status === 'completed' || run.status === 'failed') {
          setToast(
            run.status === 'completed'
              ? 'Monk Mode complete — review your capability map'
              : 'Monk Mode failed — see events for details',
          )
          await reloadPreview(selectedPack)
          await reloadRuns()
        }
      } catch {
        /* keep polling */
      }
    }

    void streamMonkEvents(
      runId,
      {
        onEvent: (ev) => {
          lastEventAt.current = ev.createdAt
          setEvents((prev) => [...prev, ev])
        },
        onRun: (run) => {
          setActiveRun(run)
          if (run.status === 'completed' || run.status === 'failed') {
            setRunControl('running')
          }
        },
        onDone: (run) => {
          setActiveRun(run)
          setRunControl('running')
          setToast(
            run.status === 'completed'
              ? 'Monk Mode complete — review your capability map'
              : 'Monk Mode failed — see events for details',
          )
          void reloadPreview(selectedPack)
          void reloadRuns()
        },
        onError: () => {
          if (!pollRef.current) {
            pollRef.current = setInterval(() => void pollOnce(), 1500)
          }
        },
      },
      { since: lastEventAt.current || undefined, signal: ac.signal },
    ).catch(() => {
      pollRef.current = setInterval(() => void pollOnce(), 1500)
    })

    return () => {
      ac.abort()
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [activeRun?.id, activeRun?.status, selectedPack, reloadPreview, reloadRuns])

  async function startMonk() {
    if (!canWrite || busy) return
    setBusy(true)
    setError(null)
    setEvents([])
    lastEventAt.current = null
    try {
      const run = await startMonkModeApi(selectedPack)
      setActiveRun(run)
      setRunControl('running')
      setToast('Monk Mode started — live feed streaming below')
      await reloadRuns()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function openRun(run: MonkRun) {
    setActiveRun(run)
    setEvents([])
    lastEventAt.current = null
    try {
      const full = await fetchMonkRun(run.id)
      setActiveRun(full.run)
      setEvents(full.events)
      if (full.events.length) {
        lastEventAt.current = full.events[full.events.length - 1]!.createdAt
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const currentPhaseIdx = useMemo(
    () => phaseIndex(activeRun?.phase || 'discover'),
    [activeRun?.phase],
  )

  const matchPct =
    activeRun?.matchScore ??
    preview?.matchPct ??
    preview?.capability?.matchScorePct ??
    null

  async function controlMonk(action: 'pause' | 'resume' | 'skip') {
    if (!activeRun || !canWrite) return
    try {
      const apiAction =
        action === 'skip' ? ('skip_current' as const) : action
      const out = await monkRunControlApi(activeRun.id, apiAction, {
        phase: activeRun.phase,
      })
      if (out.control?.state === 'paused' || action === 'pause') {
        setRunControl('paused')
      }
      if (action === 'resume') setRunControl('running')
      if (out.run) setActiveRun(out.run)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const recommendedPackId = rankedPacks[0]?.pack?.id ?? null
  const selectedPackMeta = packs.find((p) => p.id === selectedPack)

  return (
    <QueAppChrome flush>
      <div className="monk-mode-page flex h-full min-h-0 flex-col bg-[#111416]">
        <PdfPageHeader
          title="Monk Mode"
          subtitle="Pick your industry, map your schema, and let Que set up joins, jobs, and quality gates — step by step."
          actions={
            <div className="flex flex-wrap justify-end gap-[8px]">
              <Link
                to="/pack-studio"
                className="rounded-[12px] border border-solid border-[#424850] bg-[#0f1215] px-[13px] py-[6px] text-[12px] font-semibold text-[#c8cdd3] hover:bg-[#15191e]"
              >
                Pack Studio →
              </Link>
              <Link
                to="/steward"
                className="rounded-[12px] border border-solid border-[#424850] bg-[#0f1215] px-[13px] py-[6px] text-[12px] font-semibold text-[#c8cdd3] hover:bg-[#15191e]"
              >
                Steward inbox
              </Link>
              <Link
                to="/marketplace"
                className="rounded-[12px] border border-solid border-[#424850] bg-[#0f1215] px-[13px] py-[6px] text-[12px] font-semibold text-[#c8cdd3] hover:bg-[#15191e]"
              >
                Starter packs
              </Link>
            </div>
          }
        />

        <main className="min-h-0 flex-1 overflow-y-auto px-[20px] pb-[28px] pt-[8px] md:px-[28px]">
          {error ? (
            <p className="mb-[14px] rounded-[12px] border border-solid border-rose-500/40 bg-rose-500/10 px-[14px] py-[10px] text-[13px] text-rose-200">
              {error}
            </p>
          ) : null}
          {toast ? (
            <p className="mb-[14px] rounded-[12px] border border-solid border-emerald-500/30 bg-emerald-500/10 px-[14px] py-[10px] text-[12px] font-medium text-emerald-200">
              {toast}
            </p>
          ) : null}

          <PageAutofillBanner page={autofillPage} compact />

          <div className="grid gap-[18px] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            {/* Left — pack picker + preview */}
            <div className="space-y-[16px]">
              <section className="rounded-[16px] border border-solid border-[#2a3038] bg-[#15191e] p-[18px]">
                <h2 className="text-[14px] font-semibold tracking-[0.3px] text-[#e8edf2]">
                  Industry template
                </h2>
                <p className="mt-[6px] text-[12px] leading-relaxed text-[#8b949e]">
                  Que scores your synced schema against Ecommerce, Finance, Healthcare, and Audit
                  templates — pick the best match or override manually.
                </p>

                {recommendedPackId && recommendedPackId !== selectedPack ? (
                  <p className="mt-[10px] rounded-[10px] border border-solid border-sky-500/30 bg-sky-500/10 px-[12px] py-[8px] text-[11px] text-sky-200">
                    Recommended:{' '}
                    <button
                      type="button"
                      className="font-semibold underline hover:text-sky-100"
                      onClick={() => setSelectedPack(recommendedPackId)}
                    >
                      {rankedPacks[0]?.pack.displayName}
                    </button>{' '}
                    ({rankedPacks[0]?.scorePct}% match)
                  </p>
                ) : null}

                <div className="mt-[16px] space-y-[10px]">
                  {packs.map((p) => {
                    const selected = p.id === selectedPack
                    const rank = rankedPacks.find((r) => r.pack.id === p.id)
                    const badges = packPolicyBadges(p.policies)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPack(p.id)}
                        className={[
                          'flex w-full items-start gap-[12px] rounded-[14px] border border-solid px-[14px] py-[12px] text-left transition-colors',
                          selected
                            ? 'border-[#5c6773] bg-[#1e242b] ring-1 ring-[#5c6773]/40'
                            : 'border-[#2a3038] bg-[#0f1215] hover:border-[#424850]',
                        ].join(' ')}
                      >
                        <div className="mt-[2px] shrink-0">
                          <PackIndustryIcon industry={p.industry} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-[6px]">
                            <p className="text-[13px] font-semibold text-[#e8edf2]">
                              {p.displayName}
                            </p>
                            {p.id === recommendedPackId ? (
                              <span className="rounded-full bg-sky-500/15 px-[8px] py-[1px] text-[10px] font-bold uppercase tracking-wide text-sky-300">
                                Best match
                              </span>
                            ) : null}
                            {p.featured ? (
                              <span className="rounded-full bg-[#2e343b] px-[8px] py-[1px] text-[10px] font-semibold text-[#9aa3ad]">
                                Featured
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-[4px] text-[11px] leading-snug text-[#8b949e]">
                            {p.description}
                          </p>
                          {badges.length ? (
                            <div className="mt-[8px] flex flex-wrap gap-[6px]">
                              {badges.map((b) => (
                                <span
                                  key={b.label}
                                  className={`rounded-full px-[8px] py-[2px] text-[10px] font-semibold ${b.className}`}
                                >
                                  {b.label}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {rank && !selected ? (
                            <p className="mt-[6px] text-[10px] text-[#9aa3ad]">
                              Schema match {rank.scorePct}%
                            </p>
                          ) : null}
                          {selected && matchPct != null ? (
                            <div className="mt-[10px]">
                              <div className="flex items-center justify-between text-[11px] text-[#9aa3ad]">
                                <span>Schema match</span>
                                <span className="font-semibold text-[#d4dbe3]">{matchPct}%</span>
                              </div>
                              <div className="mt-[6px] h-[6px] overflow-hidden rounded-full bg-[#0f1215]">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-500"
                                  style={{ width: `${Math.min(100, matchPct)}%` }}
                                />
                              </div>
                              {preview?.missing?.length ? (
                                <p className="mt-[8px] text-[11px] text-amber-300/90">
                                  Missing: {preview.missing.join(', ')}
                                </p>
                              ) : null}
                              {preview?.multiSource?.ready ? (
                                <p
                                  className={`mt-[8px] text-[11px] ${
                                    preview.multiSource.canCertMultiSource
                                      ? 'text-emerald-300/90'
                                      : 'text-sky-300/90'
                                  }`}
                                >
                                  {preview.multiSource.label}
                                  {preview.multiSource.canCertMultiSource
                                    ? ' — multi-source cert ready'
                                    : ` — ${preview.multiSource.message}`}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-[18px] flex flex-wrap items-center gap-[10px]">
                  <PdfPrimaryButton
                    type="button"
                    disabled={!canWrite || busy || preview?.canRun === false}
                    onClick={() => void startMonk()}
                  >
                    {busy ? 'Running Monk Mode…' : 'Start Monk Mode'}
                  </PdfPrimaryButton>
                  {!canWrite ? (
                    <span className="text-[11px] text-[#8b949e]">Member role required</span>
                  ) : preview?.canRun === false ? (
                    <span className="text-[11px] text-amber-300/90">
                      {selectedPackMeta?.policies?.noAutoMaterialize
                        ? 'Sync ledger & bank feed first, then re-run'
                        : selectedPackMeta?.policies?.hipaaStrict
                          ? 'Sync claims & members — all joins require steward review'
                          : 'Sync required tables first, then re-run'}
                    </span>
                  ) : null}
                </div>
              </section>

              {preview?.capability && !activeRun ? (
                <section className="rounded-[16px] border border-solid border-[#2a3038] bg-[#15191e] p-[18px]">
                  <h2 className="mb-[12px] text-[14px] font-semibold text-[#e8edf2]">
                    Capability preview
                  </h2>
                  <CapabilityMapPanel capability={preview.capability} />
                </section>
              ) : null}

              {runs.length ? (
                <section className="rounded-[16px] border border-solid border-[#2a3038] bg-[#15191e] p-[18px]">
                  <h2 className="text-[14px] font-semibold text-[#e8edf2]">Recent runs</h2>
                  <ul className="mt-[12px] space-y-[8px]">
                    {runs.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => void openRun(r)}
                          className={[
                            'flex w-full items-center justify-between rounded-[10px] border border-solid px-[12px] py-[10px] text-left',
                            activeRun?.id === r.id
                              ? 'border-[#5c6773] bg-[#1e242b]'
                              : 'border-[#2a3038] bg-[#0f1215] hover:border-[#424850]',
                          ].join(' ')}
                        >
                          <div>
                            <p className="text-[12px] font-medium text-[#e8edf2]">
                              {r.industry} · {r.phase}
                            </p>
                            <p className="text-[10px] text-[#8b949e]">
                              {new Date(r.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <span
                            className={[
                              'rounded-full px-[8px] py-[2px] text-[10px] font-semibold uppercase tracking-wide',
                              r.status === 'completed'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : r.status === 'failed'
                                  ? 'bg-rose-500/15 text-rose-300'
                                  : 'bg-sky-500/15 text-sky-300',
                            ].join(' ')}
                          >
                            {r.status}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>

            {/* Right — stepper + live feed + results */}
            <div className="space-y-[16px]">
              <section className="rounded-[16px] border border-solid border-[#2a3038] bg-[#15191e] p-[18px]">
                <div className="flex flex-wrap items-center justify-between gap-[10px]">
                  <h2 className="text-[14px] font-semibold text-[#e8edf2]">Progress</h2>
                  {activeRun &&
                  activeRun.status === 'running' &&
                  canWrite ? (
                    <div className="flex flex-wrap gap-[6px]">
                      {runControl === 'paused' ? (
                        <button
                          type="button"
                          className="rounded-[8px] border border-solid border-emerald-500/40 px-[10px] py-[4px] text-[11px] font-semibold text-emerald-300"
                          onClick={() => void controlMonk('resume')}
                        >
                          Resume
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="rounded-[8px] border border-solid border-[#424850] px-[10px] py-[4px] text-[11px] font-semibold text-[#c8cdd3]"
                          onClick={() => void controlMonk('pause')}
                        >
                          Pause
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded-[8px] border border-solid border-amber-500/40 px-[10px] py-[4px] text-[11px] font-semibold text-amber-300"
                        onClick={() => void controlMonk('skip')}
                      >
                        Skip phase
                      </button>
                    </div>
                  ) : null}
                </div>
                <ol className="monk-phase-stepper mt-[16px] flex flex-wrap gap-[6px]">
                  {PHASES.map((p, i) => {
                    const done = activeRun && i < currentPhaseIdx
                    const active = activeRun && i === currentPhaseIdx
                    return (
                      <li
                        key={p.id}
                        className={[
                          'flex min-w-[88px] flex-1 flex-col rounded-[12px] border border-solid px-[10px] py-[10px]',
                          active
                            ? 'border-sky-500/50 bg-sky-500/10'
                            : done
                              ? 'border-emerald-500/30 bg-emerald-500/5'
                              : 'border-[#2a3038] bg-[#0f1215]',
                        ].join(' ')}
                        title={p.hint}
                      >
                        <span
                          className={[
                            'text-[10px] font-bold uppercase tracking-[0.8px]',
                            active
                              ? 'text-sky-300'
                              : done
                                ? 'text-emerald-400'
                                : 'text-[#6b7280]',
                          ].join(' ')}
                        >
                          {i + 1}. {p.label}
                        </span>
                        <span className="mt-[4px] text-[10px] leading-tight text-[#8b949e]">
                          {p.hint}
                        </span>
                      </li>
                    )
                  })}
                </ol>

                {!activeRun ? (
                  <p className="mt-[18px] rounded-[10px] border border-dashed border-[#424850] bg-[#0f1215] px-[14px] py-[20px] text-center text-[12px] text-[#8b949e]">
                    Start Monk Mode to see a live event feed — schema discovery, table mapping,
                    profiling, job creation, and certification gates.
                  </p>
                ) : (
                  <div className="mt-[16px]">
                    <div className="mb-[10px] flex items-center justify-between">
                      <p className="text-[12px] text-[#9aa3ad]">
                        Run{' '}
                        <span className="font-mono text-[11px] text-[#c8cdd3]">
                          {activeRun.id.slice(0, 8)}
                        </span>
                        {activeRun.matchScore != null ? (
                          <> · match {activeRun.matchScore}%</>
                        ) : null}
                      </p>
                      {activeRun.status === 'running' ? (
                        <span className="flex items-center gap-[6px] text-[11px] text-sky-300">
                          <span className="inline-block h-[8px] w-[8px] animate-pulse rounded-full bg-sky-400" />
                          Live
                        </span>
                      ) : null}
                    </div>

                    <ul className="max-h-[320px] space-y-[6px] overflow-y-auto rounded-[12px] border border-solid border-[#2a3038] bg-[#0f1215] p-[10px]">
                      {events.map((ev) => (
                        <li
                          key={ev.id}
                          className="flex gap-[10px] rounded-[8px] px-[8px] py-[6px] hover:bg-[#15191e]"
                        >
                          <span
                            className={`mt-[5px] h-[8px] w-[8px] shrink-0 rounded-full ${levelDot(ev.level)}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] leading-snug text-[#e8edf2]">{ev.message}</p>
                            <p className="mt-[2px] text-[10px] uppercase tracking-wide text-[#6b7280]">
                              {ev.phase} · {new Date(ev.createdAt).toLocaleTimeString()}
                            </p>
                          </div>
                        </li>
                      ))}
                      {!events.length ? (
                        <li className="px-[8px] py-[12px] text-[12px] text-[#8b949e]">
                          Waiting for events…
                        </li>
                      ) : null}
                    </ul>
                  </div>
                )}
              </section>

              {activeRun?.capability &&
              (activeRun.status === 'completed' || activeRun.phase === 'done') ? (
                <section className="rounded-[16px] border border-solid border-emerald-500/25 bg-[#15191e] p-[18px]">
                  <div className="mb-[12px] flex flex-wrap items-center justify-between gap-[8px]">
                    <h2 className="text-[14px] font-semibold text-[#e8edf2]">Capability map</h2>
                    <div className="flex flex-wrap gap-[8px]">
                      {certStatus ? (
                        <span
                          className={[
                            'rounded-full px-[10px] py-[4px] text-[10px] font-bold uppercase',
                            certStatus === 'passed'
                              ? 'bg-emerald-500/20 text-emerald-200'
                              : 'bg-amber-500/20 text-amber-200',
                          ].join(' ')}
                        >
                          Cert: {certStatus}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        disabled={!canWrite || busy}
                        onClick={() => void reCertify()}
                        className="rounded-[10px] border border-solid border-[#424850] px-[12px] py-[6px] text-[11px] font-semibold text-[#c8cdd3] hover:bg-[#1a1f24] disabled:opacity-40"
                      >
                        Re-run certify
                      </button>
                      <Link
                        to="/chat"
                        className="rounded-[10px] bg-emerald-500/20 px-[12px] py-[6px] text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/30"
                      >
                        Try CEO chat →
                      </Link>
                      <Link
                        to="/metrics"
                        className="rounded-[10px] bg-sky-500/20 px-[12px] py-[6px] text-[11px] font-semibold text-sky-200 hover:bg-sky-500/30"
                      >
                        View KPIs →
                      </Link>
                      {selectedPackMeta?.policies?.immutableMonkLog ? (
                        <Link
                          to="/compliance"
                          className="rounded-[10px] bg-violet-500/20 px-[12px] py-[6px] text-[11px] font-semibold text-violet-200 hover:bg-violet-500/30"
                        >
                          Export SOX evidence →
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <CapabilityMapPanel capability={activeRun.capability} />
                  {activeRun.summary && typeof activeRun.summary === 'object' &&
                  'dashboards' in activeRun.summary &&
                  activeRun.summary.dashboards &&
                  typeof activeRun.summary.dashboards === 'object' &&
                  'created' in (activeRun.summary.dashboards as object) ? (
                    <p className="mt-[14px] text-[12px] text-[#9aa3ad]">
                      CEO dashboard —{' '}
                      <Link
                        to="/bi?report=ceo-revenue"
                        className="font-semibold text-sky-300 hover:underline"
                      >
                        open revenue dashboard
                      </Link>
                    </p>
                  ) : null}
                  {activeRun.summary && typeof activeRun.summary === 'object' &&
                  'jobId' in activeRun.summary &&
                  activeRun.summary.jobId ? (
                    <p className="mt-[14px] text-[12px] text-[#9aa3ad]">
                      Job created —{' '}
                      <Link
                        to={`/jobs/${String(activeRun.summary.jobId)}/notebook`}
                        className="font-semibold text-sky-300 hover:underline"
                      >
                        open notebook
                      </Link>
                    </p>
                  ) : null}
                </section>
              ) : null}

              {certChecklist &&
              (activeRun?.status === 'completed' || certStatus === 'passed') ? (
                <CertChecklistPanel
                  checklist={certChecklist}
                  onShip={canWrite ? () => void shipToBi() : undefined}
                  shipBusy={shipBusy}
                />
              ) : null}
            </div>
          </div>
        </main>
      </div>
    </QueAppChrome>
  )
}
