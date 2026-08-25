import {
  useEffect,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react'
import { Link } from 'react-router-dom'
import { CHAT } from '@/components/chat/chatUi'
import type { ChatAudience } from '@/components/chat/ChatAudienceSelect'
import type {
  AiStatus,
  ChatReferencedTable,
  ContextPackSummary,
} from '@/services/stitchApi'

const OPEN_KEY = 'que.chatContextSidebarOpen'
const INTRO_KEY = 'que.chatContextSidebarIntroDone'

export function loadChatContextSidebarOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveChatContextSidebarOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, open ? 'true' : 'false')
  } catch {
    /* ignore */
  }
}

function loadIntroPending(): boolean {
  try {
    return sessionStorage.getItem(INTRO_KEY) !== '1'
  } catch {
    return true
  }
}

function markIntroDone() {
  try {
    sessionStorage.setItem(INTRO_KEY, '1')
  } catch {
    /* ignore */
  }
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={
        direction === 'left'
          ? 'que-chat-context-sidebar__chevron'
          : 'que-chat-context-sidebar__chevron que-chat-context-sidebar__chevron--right'
      }
    >
      {direction === 'left' ? (
        <path d="M15 18l-6-6 6-6" />
      ) : (
        <path d="M9 18l6-6-6-6" />
      )}
    </svg>
  )
}

export interface ChatContextSidebarProps {
  contextRefreshing: boolean
  onRefreshContext: () => void
  modelId: string
  aiStatus: AiStatus | null
  sidebarQuery: string
  onSidebarQueryChange: (q: string) => void
  sidebarTables: ChatReferencedTable[]
  expandedTables: Record<string, boolean>
  onToggleTableExpand: (key: string) => void
  canWrite: boolean
  onMentionDragStart: (e: ReactDragEvent, token: string) => void
  onInsertFromSidebar: (token: string) => void
  context: ContextPackSummary | null
  onAskOutcome: () => void
  onAskAgent: () => void
  chatAudience: ChatAudience
}

export function ChatContextSidebar({
  contextRefreshing,
  onRefreshContext,
  modelId,
  aiStatus,
  sidebarQuery,
  onSidebarQueryChange,
  sidebarTables,
  expandedTables,
  onToggleTableExpand,
  canWrite,
  onMentionDragStart,
  onInsertFromSidebar,
  context,
  onAskOutcome,
  onAskAgent,
  chatAudience,
}: ChatContextSidebarProps) {
  const [open, setOpen] = useState(() => loadChatContextSidebarOpen())
  const [introHint, setIntroHint] = useState(() => loadIntroPending())
  const [toggleHovered, setToggleHovered] = useState(false)

  useEffect(() => {
    if (!introHint || open) return
    const t = window.setTimeout(() => {
      setIntroHint(false)
      markIntroDone()
    }, 60_000)
    return () => window.clearTimeout(t)
  }, [introHint, open])

  function setSidebarOpen(next: boolean) {
    setOpen(next)
    saveChatContextSidebarOpen(next)
    if (next) {
      setIntroHint(false)
      markIntroDone()
    }
  }

  function toggleSidebar() {
    setSidebarOpen(!open)
  }

  const showPullHint = !open && (introHint || toggleHovered)
  const showIntroAnim = !open && introHint

  return (
    <aside
      className={`que-chat-context-sidebar ${open ? 'is-open' : 'is-collapsed'}`}
      aria-label="Chat context sidebar"
    >
      <button
        type="button"
        className={`que-chat-context-sidebar__toggle${showIntroAnim ? ' is-intro' : ''}`}
        onClick={toggleSidebar}
        onMouseEnter={() => setToggleHovered(true)}
        onMouseLeave={() => setToggleHovered(false)}
        aria-expanded={open}
        aria-controls="que-chat-context-panel"
        title={open ? 'Hide context panel' : 'Pull to open'}
      >
        <ChevronIcon direction={open ? 'right' : 'left'} />
        {!open && showPullHint ? (
          <span
            className="que-chat-context-sidebar__pull-hint"
            role="tooltip"
          >
            Pull to open
          </span>
        ) : null}
      </button>

      <div
        id="que-chat-context-panel"
        className="que-chat-context-sidebar__panel"
        hidden={!open}
        aria-hidden={!open}
      >
        <div className="pdf-chat-scroll-region que-chat-context-sidebar__scroll min-h-0 flex-1 py-[12px] pr-[12px] pl-[2px]">
          <div className="flex flex-col gap-[12px]">
            <div className={`space-y-[12px] p-[12px] ${CHAT.panel}`}>
              <div className="flex items-center justify-between gap-[6px]">
                <h3 className="text-[10px] font-bold tracking-[0.8px] text-[#8a9099] uppercase">
                  Active Context
                </h3>
                <button
                  type="button"
                  onClick={() => void onRefreshContext()}
                  className="text-[10px] text-[#a3afbe] hover:text-[#d4dbe3]"
                >
                  {contextRefreshing ? '…' : 'Refresh'}
                </button>
              </div>
              <div className="space-y-[6px]">
                <div className="flex items-center justify-between gap-[6px]">
                  <span className="text-[11px] text-[#a3afbe]">Model</span>
                  <span className="truncate text-[11px] font-semibold text-[#7aecd0]">
                    {modelId || aiStatus?.models?.[0]?.label || 'heuristic'}
                  </span>
                </div>
                <div className="h-[3px] w-full overflow-hidden rounded-full bg-[#1e2328]">
                  <div
                    className="h-full rounded-full bg-[#7aecd0] transition-all"
                    style={{
                      width: aiStatus?.vectorReady ? '75%' : '40%',
                    }}
                  />
                </div>
              </div>
              <div className="space-y-[6px] pt-[2px]">
                <p className="text-[11px] font-semibold text-[#d4dbe3]">
                  Referenced tables
                </p>
                <input
                  value={sidebarQuery}
                  onChange={(e) => onSidebarQueryChange(e.target.value)}
                  placeholder="Filter tables…"
                  className="mb-[6px] w-full rounded-[4px] border border-solid border-[#424850] bg-[#121619] px-[8px] py-[6px] text-[11px] text-[#d4dbe3] outline-none placeholder:text-[#6b7380] focus:border-[#6b7380]"
                />
                <ul className="max-h-56 space-y-xs overflow-y-auto">
                  {sidebarTables.slice(0, 24).map((t) => {
                    const key = `${t.connection}:${t.name}`
                    const tableOpen =
                      expandedTables[key] ||
                      (sidebarQuery.trim().length > 0 &&
                        t.columns.some((c) =>
                          c.name
                            .toLowerCase()
                            .includes(sidebarQuery.trim().toLowerCase()),
                        ))
                    return (
                      <li key={key} className="rounded-[4px] hover:bg-[#1e2328]">
                        <div className="flex items-center gap-[2px]">
                          <button
                            type="button"
                            aria-expanded={tableOpen}
                            aria-label={
                              tableOpen
                                ? `Collapse columns for ${t.name}`
                                : `Expand columns for ${t.name}`
                            }
                            onClick={() => onToggleTableExpand(key)}
                            className="flex size-[28px] shrink-0 items-center justify-center rounded-[4px] text-[#8a9099] hover:bg-[#252a30] hover:text-[#d4dbe3]"
                          >
                            <span
                              className={`inline-block text-[10px] transition-transform ${tableOpen ? 'rotate-90' : ''}`}
                              aria-hidden
                            >
                              ▸
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={!canWrite}
                            draggable={canWrite}
                            onDragStart={(e) =>
                              onMentionDragStart(e, `@${t.name}`)
                            }
                            onClick={() => onInsertFromSidebar(`@${t.name}`)}
                            title={
                              canWrite
                                ? `Click or drag @${t.name} into chat`
                                : t.name
                            }
                            className="flex min-w-0 flex-1 items-center gap-[6px] rounded-[4px] px-[4px] py-[4px] text-left text-[12px] text-[#c8cdd3] hover:text-[#d4dbe3] disabled:cursor-default disabled:opacity-40"
                          >
                            <span className="text-[#7aecd0]" aria-hidden>
                              ▤
                            </span>
                            <span className="truncate font-medium">{t.name}</span>
                            <span className="ml-auto shrink-0 text-[9px] text-[#6b7380]">
                              {t.columns.length}
                            </span>
                          </button>
                        </div>
                        {tableOpen ? (
                          <ul className="mb-xs ml-6 space-y-0.5 border-l border-outline-variant/30 pl-sm">
                            {t.columns.length === 0 ? (
                              <li className="py-xs font-body text-[10px] text-on-surface-variant">
                                No columns in context pack
                              </li>
                            ) : (
                              t.columns.map((c) => (
                                <li key={`${key}:${c.name}`}>
                                  <button
                                    type="button"
                                    disabled={!canWrite}
                                    draggable={canWrite}
                                    onDragStart={(e) =>
                                      onMentionDragStart(
                                        e,
                                        `@${t.name}.${c.name}`,
                                      )
                                    }
                                    onClick={() =>
                                      onInsertFromSidebar(
                                        `@${t.name}.${c.name}`,
                                      )
                                    }
                                    title={
                                      canWrite
                                        ? `Click or drag @${t.name}.${c.name}`
                                        : c.name
                                    }
                                    className="flex w-full items-center gap-sm rounded-md px-xs py-1 text-left font-body text-[11px] text-on-surface-variant hover:bg-surface-container-highest hover:text-secondary disabled:opacity-40"
                                  >
                                    <span
                                      className="font-mono text-[9px] text-secondary/70"
                                      aria-hidden
                                    >
                                      ·
                                    </span>
                                    <span className="truncate">{c.name}</span>
                                    <span className="ml-auto shrink-0 font-label text-[8px] uppercase tracking-wide text-on-surface-variant/45">
                                      {c.keyKind && c.keyKind !== 'none'
                                        ? c.keyKind
                                        : c.dataType}
                                    </span>
                                  </button>
                                </li>
                              ))
                            )}
                          </ul>
                        ) : null}
                      </li>
                    )
                  })}
                  {sidebarTables.length === 0 ? (
                    <li className="font-body text-[11px] text-on-surface-variant">
                      No tables yet — sync a source first.
                    </li>
                  ) : null}
                </ul>
              </div>
              <div className="pt-[8px]">
                <Link
                  to="/workspace"
                  className="pdf-btn-ghost block w-full rounded-[4px] py-[8px] text-center text-[11px] font-semibold"
                >
                  View Graph
                </Link>
              </div>
            </div>

            {chatAudience === 'engineer' ? (
              <div className={`${CHAT.tipCard} p-[12px]`}>
                <div className="mb-[6px] flex items-center gap-[6px] text-[#7aecd0]">
                  <span
                    className="flex size-[18px] items-center justify-center rounded-full border border-solid border-[rgba(122,236,208,0.45)] bg-[rgba(122,236,208,0.12)] text-[9px] font-bold"
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className="text-[12px] font-semibold text-[#d4dbe3]">
                    Optimization Tip
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-[#c8cdd3]">
                  {context?.stats?.suggestedJoins
                    ? `You have ${context.stats.suggestedJoins} suggested join(s) waiting for review. Promote accepted joins before shipping a dbt PR.`
                    : 'Ask about your data — Que runs read-only warehouse queries and shows results in chat (never sent back to the AI).'}{' '}
                  Type{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={onAskOutcome}
                  >
                    /outcome …
                  </button>{' '}
                  for CEO-style plans → Ship to BI. Type{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={onAskAgent}
                  >
                    /agent …
                  </button>{' '}
                  for the multi-step HITL stitch pipeline.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  )
}
