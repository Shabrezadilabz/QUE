import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import { FIGMA_NAV } from '@/components/figma/figmaNavAssets'
import {
  fetchProposals,
  fetchTransforms,
  reviewProposalApi,
  reviewTransformApi,
} from '@/services/stitchApi'

type ProposalItem = {
  id: string
  kind: string
  title: string
  summary: string
  before: Record<string, unknown>
  after: Record<string, unknown>
  unifiedDiff?: string
  status: string
}

type TransformItem = {
  id: string
  title: string
  prompt: string
  sqlText: string
  status: string
  createdByName?: string | null
  createdByEmail?: string | null
  createdAt?: string
}

type InboxItem =
  | { type: 'proposal'; data: ProposalItem }
  | { type: 'transform'; data: TransformItem }

function kindStyle(item: InboxItem): { bg: string; text: string; label: string } {
  if (item.type === 'transform') {
    return {
      bg: 'bg-[rgba(177,152,255,0.13)]',
      text: 'text-[#b198ff]',
      label: 'TRANSFORM',
    }
  }
  const k = item.data.kind.toLowerCase()
  if (k.includes('join')) {
    return {
      bg: 'bg-[rgba(104,206,175,0.13)]',
      text: 'text-[#68ceaf]',
      label: 'JOIN SUGGESTION',
    }
  }
  if (k.includes('schema') || k.includes('map')) {
    return {
      bg: 'bg-[rgba(255,176,107,0.13)]',
      text: 'text-[#ffb06b]',
      label: 'SCHEMA MAPPING',
    }
  }
  return {
    bg: 'bg-[rgba(104,206,175,0.13)]',
    text: 'text-[#68ceaf]',
    label: item.data.kind.toUpperCase(),
  }
}

function relativeTime(iso?: string): string {
  if (!iso) return 'Recently'
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function FigmaDiffLine({ line, index }: { line: string; index: number }) {
  const isAdd = line.startsWith('+') && !line.startsWith('+++')
  const isDel = line.startsWith('-') && !line.startsWith('---')
  const content = isAdd || isDel ? line.slice(1) : line

  if (isDel) {
    return (
      <div className="flex w-full gap-[16px] bg-[rgba(255,107,107,0.13)] px-[16px] py-[4px] text-[12px] text-[#ff6b6b]">
        <p className="w-[30px] shrink-0">- {index}</p>
        <p className="whitespace-pre">{content}</p>
      </div>
    )
  }
  if (isAdd) {
    return (
      <div className="pdf-shine flex w-full gap-[16px] px-[16px] py-[4px] text-[12px] text-[#7aecd0]">
        <p className="w-[30px] shrink-0">+ {index}</p>
        <p className="whitespace-pre">{content}</p>
      </div>
    )
  }
  return (
    <div className="flex w-full gap-[16px] px-[16px] py-[4px] text-[12px]">
      <p className="w-[30px] shrink-0 text-[#a3afbe]">{index}</p>
      <p className="whitespace-pre text-[#d4dbe3]">{content}</p>
    </div>
  )
}

/** Proposals — pixel-faithful Figma v2 frame (2:833). */
export function ProposalsPage() {
  const { canWrite } = useWorkspaceRole()
  const [proposals, setProposals] = useState<ProposalItem[]>([])
  const [transforms, setTransforms] = useState<TransformItem[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function reload() {
    const [p, t] = await Promise.all([
      fetchProposals({ status: 'open' }),
      fetchTransforms(),
    ])
    setProposals(p)
    setTransforms(t.filter((d) => d.status === 'proposed' || d.status === 'approved'))
  }

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }, [])

  const inbox: InboxItem[] = useMemo(
    () => [
      ...proposals.map((p) => ({ type: 'proposal' as const, data: p })),
      ...transforms.map((t) => ({ type: 'transform' as const, data: t })),
    ],
    [proposals, transforms],
  )

  const selected = useMemo(() => {
    if (!selectedKey) return inbox[0] ?? null
    return inbox.find((i) => `${i.type}-${i.data.id}` === selectedKey) ?? inbox[0] ?? null
  }, [inbox, selectedKey])

  useEffect(() => {
    if (!selectedKey && inbox[0]) {
      setSelectedKey(`${inbox[0].type}-${inbox[0].data.id}`)
    }
  }, [inbox, selectedKey])

  async function actProposal(id: string, action: 'approve' | 'reject') {
    setBusy(true)
    setError(null)
    try {
      await reviewProposalApi(id, action)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function actTransform(id: string, action: 'approve' | 'reject' | 'apply') {
    setBusy(true)
    setError(null)
    try {
      await reviewTransformApi(id, action)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const diffLines =
    selected?.type === 'proposal'
      ? (selected.data.unifiedDiff || '').split('\n')
      : selected?.type === 'transform'
        ? selected.data.sqlText.split('\n').map((l) => `  ${l}`)
        : []

  const adds = diffLines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length
  const dels = diffLines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length

  const pendingCount = inbox.length

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 items-start">
        {/* InboxList — exact Figma 384px */}
        <aside className="flex h-full w-[384px] shrink-0 flex-col border-r border-solid border-[#2a313c] bg-[#0f1216]">
          <div className="flex shrink-0 items-center justify-between border-b border-solid border-[#2a313c] bg-[#1e2328] p-[16px]">
            <div className="flex flex-col gap-[4px]">
              <p className="text-[16px] font-bold text-[#ecf0f4]">Proposals</p>
              <p className="text-[12px] font-normal text-[#a3afbe]">
                {pendingCount} pending review{pendingCount === 1 ? '' : 's'}
              </p>
            </div>
            <div className="relative size-[18px] shrink-0">
              <img alt="" className="absolute inset-0 block size-full max-w-none" src={FIGMA_NAV.search} />
            </div>
          </div>
          <ul className="flex min-h-0 flex-1 flex-col gap-[8px] overflow-y-auto p-[8px]">
            {inbox.length === 0 ? (
              <li className="p-[12px] text-[11px] text-[#a3afbe]">
                Nothing open.{' '}
                <Link to="/chat" className="text-[#68ceaf] underline">
                  Chat
                </Link>
              </li>
            ) : null}
            {inbox.map((item) => {
              const key = `${item.type}-${item.data.id}`
              const active = selectedKey === key
              const style = kindStyle(item)
              const title = item.data.title
              const meta =
                item.type === 'transform'
                  ? `Proposed by ${item.data.createdByName || item.data.createdByEmail || 'User'} · ${relativeTime(item.data.createdAt)}`
                  : item.data.summary
              const timeLabel =
                item.type === 'transform'
                  ? relativeTime(item.data.createdAt)
                  : active
                    ? 'Active'
                    : 'Open'

              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={[
                      'flex w-full flex-col gap-[8px] rounded-[6px] border border-solid p-[12px] text-left',
                      active
                        ? 'border-[#d0d8e0] bg-[#252a30]'
                        : 'border-[#2a313c] bg-[#15191e]',
                    ].join(' ')}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span
                        className={[
                          'rounded-[4px] px-[6px] py-[2px] text-[9px] font-bold',
                          style.bg,
                          style.text,
                        ].join(' ')}
                      >
                        {style.label}
                      </span>
                      <span className="text-[11px] text-[#a3afbe]">{timeLabel}</span>
                    </div>
                    <p className="text-[14px] font-bold text-[#d4dbe3]">{title}</p>
                    <p className="text-[11px] text-[#a3afbe]">{meta}</p>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        {/* DiffView */}
        <div className="flex h-full min-w-0 flex-1 flex-col bg-[#0b0e11]">
          {error ? (
            <p className="border-b border-[#ff6b6b]/30 bg-[rgba(255,107,107,0.13)] px-[24px] py-[8px] text-[12px] text-[#ff6b6b]">
              {error}
            </p>
          ) : null}

          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-[13px] text-[#a3afbe]">
              Select a proposal to review
            </div>
          ) : (
            <>
              <header className="flex shrink-0 flex-col gap-[12px] border-b border-solid border-[#2a313c] bg-[#0f1216] px-[24px] py-[16px]">
                <div className="flex w-full items-center justify-between">
                  <div className="flex flex-col gap-[4px]">
                    <p className="text-[20px] font-bold text-[#ecf0f4]">{selected.data.title}</p>
                    <p className="text-[13px] text-[#a3afbe]">
                      {selected.type === 'transform'
                        ? `Prompt: ${selected.data.prompt.slice(0, 120)}`
                        : selected.data.summary}
                    </p>
                  </div>
                  {canWrite ? (
                    <div className="flex gap-[8px]">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void (selected.type === 'proposal'
                            ? actProposal(selected.data.id, 'reject')
                            : actTransform(selected.data.id, 'reject'))
                        }
                        className="rounded-[4px] border border-solid border-[#ff6b6b] bg-[rgba(255,107,107,0.13)] px-[12px] py-[6px] text-[13px] font-semibold text-[#ff6b6b] disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void (selected.type === 'proposal'
                            ? actProposal(selected.data.id, 'approve')
                            : actTransform(selected.data.id, 'approve'))
                        }
                        className="pdf-btn-primary rounded-[4px] px-[12px] py-[6px] text-[13px] font-bold disabled:opacity-50"
                      >
                        Approve
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-[16px] text-[12px]">
                  <Link to="/chat?agent=1" className="text-[#68ceaf]">
                    View Agent Context
                  </Link>
                  {dels > 0 || adds > 0 ? (
                    <>
                      <span className="text-[#a3afbe]">|</span>
                      {dels > 0 ? (
                        <span className="text-[#ff6b6b]">-{dels} deletions</span>
                      ) : null}
                      {adds > 0 ? (
                        <span className="text-[#68ceaf]">+{adds} additions</span>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto p-[24px]">
                <div className="w-full overflow-hidden rounded-[6px] border border-solid border-[#2a313c] bg-[#15191e]">
                  <div className="border-b border-solid border-[#2a313c] bg-[#0f1216] p-[12px]">
                    <p className="text-[12px] text-[#a3afbe]">
                      {selected.type === 'transform' ? 'SQL draft' : 'SQL Unified Diff View'}
                    </p>
                  </div>
                  <div className="py-[12px]">
                    {diffLines.length === 0 ? (
                      <p className="px-[16px] text-[12px] text-[#a3afbe]">No diff body.</p>
                    ) : (
                      diffLines.map((line, i) => (
                        <FigmaDiffLine key={i} line={line} index={i + 1} />
                      ))
                    )}
                  </div>
                </div>

                {selected.type === 'transform' &&
                canWrite &&
                selected.data.status === 'approved' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void actTransform(selected.data.id, 'apply')}
                    className="pdf-btn-primary mt-[16px] rounded-[4px] px-[16px] py-[8px] text-[13px] font-bold disabled:opacity-50"
                  >
                    Apply to job
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </QueAppChrome>
  )
}

export default ProposalsPage
