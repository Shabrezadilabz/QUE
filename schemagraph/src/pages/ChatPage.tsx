import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import {
  CHAT_SKILLS,
  expandSkillInput,
  filterSkills,
  type ChatSkill,
} from '@/chat/skills'
import {
  applySuggestion,
  buildAtSuggestions,
  extractMentions,
  getTriggerAtCaret,
  type MentionSuggestion,
} from '@/chat/mentions'
import {
  createJobFromDraft,
  fetchAiStatus,
  fetchSchemaContext,
  reindexAi,
  sendChatFeedback,
  sendChatMessage,
  type AiStatus,
  type ChatJobDraft,
  type ChatMessage,
  type ChatReferencedTable,
  type ContextPackSummary,
  type RetrievedChunk,
  type SamplePreview,
} from '@/services/stitchApi'
import { subscribeSchemaChanged } from '@/utils/schemaChangeBus'

interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sql?: string | null
  jobDraft?: ChatJobDraft | null
  citations?: string[]
  referencedTables?: ChatReferencedTable[]
  samplePreviews?: SamplePreview[]
  retrievedChunks?: RetrievedChunk[]
  mode?: string
  model?: string | null
  at: string
  savedJobId?: string
  feedback?: 1 | -1 | null
}

/**
 * Schema-only AI chat — @mentions, slash skills, sidebar pick, copy/retry/stop.
 */
export function ChatPage() {
  const { canWrite } = useWorkspaceRole()
  const { workspaceId } = useAuth()
  const { pushToast } = useToast()
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [context, setContext] = useState<ContextPackSummary | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)
  const [focusTables, setFocusTables] = useState<ChatReferencedTable[]>([])
  const [contextRefreshing, setContextRefreshing] = useState(false)
  const [sidebarQuery, setSidebarQuery] = useState('')
  const [showSkills, setShowSkills] = useState(false)
  const [activeMentions, setActiveMentions] = useState<string[]>([])
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestIndex, setSuggestIndex] = useState(0)
  const [trigger, setTrigger] = useState<{
    type: '@' | '/' | null
    start: number
    query: string
  }>({ type: null, start: -1, query: '' })
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const [modelId, setModelId] = useState<string>('')
  const [reindexing, setReindexing] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const allTables = context?.tables ?? []

  const reloadAiStatus = useCallback(async () => {
    try {
      const s = await fetchAiStatus()
      setAiStatus(s)
      setModelId((prev) => {
        if (prev && s.models.some((m) => m.id === prev)) return prev
        return s.models[0]?.id || ''
      })
    } catch {
      setAiStatus(null)
    }
  }, [])

  const reloadContext = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setContextRefreshing(true)
    try {
      const c = await fetchSchemaContext()
      setContext(c)
      setContextError(null)
      setFocusTables((prev) => {
        if (prev.length === 0) return prev
        const byName = new Map(
          (c.tables ?? []).map((t) => [t.name.toLowerCase(), t]),
        )
        return prev
          .map((t) => byName.get(t.name.toLowerCase()))
          .filter(Boolean) as ChatReferencedTable[]
      })
    } catch (err) {
      setContext(null)
      setContextError(
        err instanceof Error ? err.message : 'Could not load schema context',
      )
    } finally {
      setContextRefreshing(false)
    }
  }, [])

  useEffect(() => {
    setMessages([])
    setFocusTables([])
    setActiveMentions([])
    setInput('')
    void reloadContext()
    void reloadAiStatus()
  }, [workspaceId, reloadContext, reloadAiStatus])

  useEffect(() => {
    const onFocus = () => void reloadContext({ quiet: true })
    const onVis = () => {
      if (document.visibilityState === 'visible')
        void reloadContext({ quiet: true })
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reloadContext])

  useEffect(() => {
    return subscribeSchemaChanged(() => {
      void reloadContext({ quiet: true })
    })
  }, [reloadContext])

  useEffect(() => {
    const id = window.setInterval(() => {
      void reloadContext({ quiet: true })
    }, 20_000)
    return () => window.clearInterval(id)
  }, [reloadContext])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const atSuggestions = useMemo(
    () =>
      trigger.type === '@'
        ? buildAtSuggestions(allTables, trigger.query)
        : [],
    [allTables, trigger],
  )

  const skillSuggestions = useMemo(
    () => (trigger.type === '/' ? filterSkills(trigger.query) : []),
    [trigger],
  )

  const suggestions: Array<
    | { kind: 'mention'; item: MentionSuggestion }
    | { kind: 'skill'; item: ChatSkill }
  > = useMemo(() => {
    if (trigger.type === '@') {
      return atSuggestions.map((item) => ({ kind: 'mention' as const, item }))
    }
    if (trigger.type === '/') {
      return skillSuggestions.map((item) => ({ kind: 'skill' as const, item }))
    }
    return []
  }, [trigger.type, atSuggestions, skillSuggestions])

  useEffect(() => {
    setSuggestOpen(suggestions.length > 0)
    setSuggestIndex(0)
  }, [suggestions])

  function syncTriggerFromCaret(value: string, caret: number) {
    const t = getTriggerAtCaret(value, caret)
    setTrigger(t)
  }

  function insertToken(token: string) {
    const el = textareaRef.current
    const caret = el?.selectionStart ?? input.length
    const start =
      trigger.type && trigger.start >= 0 ? trigger.start : caret
    const { next, caret: nextCaret } = applySuggestion(
      input,
      caret,
      start,
      token,
    )
    setInput(next)
    const ment = extractMentions(next)
    setActiveMentions(ment.tables)
    setTrigger({ type: null, start: -1, query: '' })
    setSuggestOpen(false)
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(nextCaret, nextCaret)
    })
  }

  function pickMention(s: MentionSuggestion) {
    insertToken(s.insert)
    if (s.kind === 'table' || s.kind === 'column') {
      const tableName = s.insert.replace(/^@/, '').split('.')[0]
      const t = allTables.find(
        (x) => x.name.toLowerCase() === tableName.toLowerCase(),
      )
      if (t) {
        setFocusTables((prev) => {
          if (prev.some((p) => p.name === t.name && p.connection === t.connection))
            return prev
          return [t, ...prev].slice(0, 12)
        })
      }
    }
  }

  function pickSkill(skill: ChatSkill) {
    // Replace /query with skill slash; leave rest for user to add tables
    const el = textareaRef.current
    const caret = el?.selectionStart ?? input.length
    const start = trigger.start >= 0 ? trigger.start : 0
    const after = input.slice(caret)
    const next = `${skill.slash} ${after}`.replace(/\s+$/, ' ')
    // If trigger mid-string, replace from start
    const rebuilt =
      trigger.start >= 0
        ? input.slice(0, start) + skill.slash + (after.startsWith(' ') ? after : ` ${after}`)
        : next
    setInput(rebuilt.trimStart())
    setTrigger({ type: null, start: -1, query: '' })
    setSuggestOpen(false)
    setShowSkills(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function insertFromSidebar(token: string) {
    const el = textareaRef.current
    const caret = el?.selectionStart ?? input.length
    const before = input.slice(0, caret)
    const after = input.slice(caret)
    const needsSpace =
      before.length > 0 && !/\s$/.test(before) ? ' ' : ''
    const spacer = after.startsWith(' ') || after.length === 0 ? '' : ' '
    const next = before + needsSpace + token + spacer + after
    const nextCaret = (before + needsSpace + token + spacer).length
    setInput(next)
    const ment = extractMentions(next)
    setActiveMentions(ment.tables)
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(nextCaret, nextCaret)
    })
  }

  function stopAsk() {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
  }

  async function ask(rawText: string, opts?: { replaceLastUser?: boolean }) {
    if (busy || !canWrite) return

    const focusNames =
      activeMentions.length > 0
        ? activeMentions
        : extractMentions(rawText).tables

    const expanded = expandSkillInput(rawText, focusNames)
    const message = expanded.trim()
    if (!message) return

    await reloadContext({ quiet: true })

    const userMsg: UiMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: message,
      at: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }

    setMessages((prev) => {
      if (opts?.replaceLastUser) {
        const withoutLastUser = [...prev]
        while (
          withoutLastUser.length &&
          withoutLastUser[withoutLastUser.length - 1].role === 'assistant'
        ) {
          withoutLastUser.pop()
        }
        if (
          withoutLastUser.length &&
          withoutLastUser[withoutLastUser.length - 1].role === 'user'
        ) {
          withoutLastUser.pop()
        }
        return [...withoutLastUser, userMsg]
      }
      return [...prev, userMsg]
    })
    setInput('')
    setActiveMentions([])
    setBusy(true)

    const historyBase = opts?.replaceLastUser
      ? (() => {
          const lastUserIdx = [...messages]
            .map((x, idx) => (x.role === 'user' ? idx : -1))
            .filter((x) => x >= 0)
            .pop()
          if (lastUserIdx === undefined) return messages
          return messages.slice(0, lastUserIdx)
        })()
      : messages

    const history: ChatMessage[] = historyBase.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    const mentions = extractMentions(message)
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await sendChatMessage(message, history, workspaceId, {
        signal: ctrl.signal,
        mentions,
        modelId: modelId || undefined,
        sessionId: `ws-${workspaceId}`,
      })
      const assistant: UiMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: res.reply,
        sql: res.sql,
        jobDraft: res.jobDraft
          ? { ...res.jobDraft, sqlText: res.jobDraft.sqlText ?? res.sql }
          : null,
        citations: res.citations,
        referencedTables: res.referencedTables,
        samplePreviews: res.samplePreviews,
        retrievedChunks: res.retrievedChunks,
        mode: res.mode,
        model: res.model,
        feedback: null,
        at: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }
      setMessages((prev) => [...prev, assistant])
      if (res.referencedTables?.length) {
        setFocusTables(res.referencedTables)
      }
      await reloadContext({ quiet: true })
      void reloadAiStatus()
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            content: '_Stopped._',
            at: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            mode: 'stopped',
          },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            content: `Chat failed: ${err instanceof Error ? err.message : String(err)}. Is que-api running on :8787?`,
            at: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          },
        ])
      }
    } finally {
      abortRef.current = null
      setBusy(false)
    }
  }

  function regenerate() {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser || busy) return
    void ask(lastUser.content, { replaceLastUser: true })
  }

  async function saveJob(messageId: string, draft: ChatJobDraft) {
    if (!canWrite) return
    try {
      const job = await createJobFromDraft({
        ...draft,
        sqlText: draft.sqlText ?? null,
      })
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, savedJobId: job.id } : m,
        ),
      )
      pushToast('Job saved', 'success')
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Save job failed',
        'error',
      )
    }
  }

  async function rateMessage(message: UiMessage, rating: 1 | -1) {
    if (!canWrite || message.role !== 'assistant') return
    try {
      await sendChatFeedback({
        rating,
        messageId: message.id,
        content: message.content,
        modelId: message.model || modelId || undefined,
        sourceRefs: (message.retrievedChunks || []).map((c) => c.sourceRef),
      })
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? { ...m, feedback: rating } : m)),
      )
      pushToast(rating === 1 ? 'Thanks — feedback recorded' : 'Feedback recorded', 'success')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Feedback failed', 'error')
    }
  }

  async function runReindex() {
    if (!canWrite || reindexing) return
    setReindexing(true)
    try {
      const r = await reindexAi({ docs: true })
      if (!r.ok) throw new Error(r.error || 'reindex failed')
      pushToast('Vector index refreshed', 'success')
      await reloadAiStatus()
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Reindex failed', 'error')
    } finally {
      setReindexing(false)
    }
  }

  const sidebarTables = useMemo(() => {
    const q = sidebarQuery.trim().toLowerCase()
    const base =
      focusTables.length > 0
        ? focusTables
        : allTables
    if (!q) return base
    return base.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.columns.some((c) => c.name.toLowerCase().includes(q)) ||
        t.sourceType.toLowerCase().includes(q),
    )
  }, [focusTables, allTables, sidebarQuery])

  const catalogTables = useMemo(() => {
    const q = sidebarQuery.trim().toLowerCase()
    const list = allTables
    if (!q) return list
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.columns.some((c) => c.name.toLowerCase().includes(q)),
    )
  }, [allTables, sidebarQuery])

  return (
    <QueAppChrome>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between gap-sm border-b border-outline-variant px-md">
            <div className="flex min-w-0 items-center gap-sm">
              <span className="font-label text-[11px] font-bold tracking-widest text-primary-fixed">
                QUE AI
              </span>
              <span className="h-2 w-2 animate-pulse bg-primary-container" />
              <span className="font-label text-[10px] tracking-wider text-on-surface-variant">
                {busy ? 'THINKING' : 'READY'}
              </span>
              {aiStatus ? (
                <span className="hidden font-label text-[9px] tracking-widest text-on-surface-variant/70 sm:inline">
                  {aiStatus.vectorReady ? 'RAG ON' : 'RAG OFF'} ·{' '}
                  {aiStatus.embeddingMode.toUpperCase()} · CHUNKS{' '}
                  {(aiStatus.stats?.workspaceChunks || 0) +
                    (aiStatus.stats?.docChunks || 0)}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-sm">
              {aiStatus?.models?.length ? (
                <select
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  disabled={!canWrite}
                  className="max-w-[9rem] border border-outline-variant bg-surface-container px-sm py-xs font-label text-[10px] tracking-wider text-on-surface outline-none focus:border-primary-fixed disabled:opacity-40"
                  title="Generation model"
                >
                  {aiStatus.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-label text-[9px] tracking-widest text-on-surface-variant">
                  HEURISTIC
                </span>
              )}
              <button
                type="button"
                className="border border-outline-variant px-sm py-xs font-label text-[10px] tracking-widest text-on-surface-variant hover:border-primary-fixed disabled:opacity-40"
                disabled={!canWrite || reindexing}
                onClick={() => void runReindex()}
              >
                {reindexing ? 'INDEX…' : 'REINDEX'}
              </button>
              <button
                type="button"
                className="border border-outline-variant px-sm py-xs font-label text-[10px] tracking-widest text-on-surface-variant hover:border-primary-fixed"
                onClick={() => setShowSkills((v) => !v)}
              >
                SKILLS
              </button>
              {busy ? (
                <button
                  type="button"
                  className="border border-error/50 px-sm py-xs font-label text-[10px] tracking-widest text-error hover:border-error"
                  onClick={stopAsk}
                >
                  STOP
                </button>
              ) : null}
              <button
                type="button"
                className="border border-outline-variant px-sm py-xs font-label text-[10px] tracking-widest text-on-surface-variant hover:border-primary-fixed"
                disabled={busy || !messages.some((m) => m.role === 'user')}
                onClick={regenerate}
              >
                REGEN
              </button>
              <button
                type="button"
                className="border border-outline-variant px-sm py-xs font-label text-[10px] tracking-widest text-on-surface-variant hover:border-primary-fixed"
                onClick={() => {
                  setMessages([])
                  setFocusTables([])
                  setActiveMentions([])
                }}
              >
                CLEAR
              </button>
            </div>
          </div>

          {showSkills ? (
            <div className="shrink-0 border-b border-outline-variant bg-surface-container-low px-md py-sm">
              <p className="mb-sm font-label text-[9px] tracking-widest text-on-surface-variant">
                SLASH SKILLS · TYPE / OR CLICK · USE @ FOR TABLES
              </p>
              <div className="flex flex-wrap gap-sm">
                {CHAT_SKILLS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!canWrite}
                    title={s.description}
                    onClick={() => {
                      setInput(`${s.slash} `)
                      setShowSkills(false)
                      textareaRef.current?.focus()
                    }}
                    className="border border-outline-variant bg-surface-container px-sm py-xs text-left hover:border-primary-fixed disabled:opacity-40"
                  >
                    <span className="font-label text-[10px] tracking-wider text-primary-fixed">
                      {s.slash}
                    </span>
                    <span className="ml-sm font-body text-[11px] text-on-surface-variant">
                      {s.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 space-y-lg overflow-y-auto p-md">
            {messages.length === 0 ? (
              <div className="mx-auto flex max-w-2xl flex-col gap-md pt-xl">
                <h1 className="font-headline text-2xl font-semibold text-on-surface">
                  Ask about your schema
                </h1>
                <p className="font-body text-sm text-on-surface-variant">
                  Type <code className="text-primary-fixed">@</code> to mention
                  tables/columns, <code className="text-primary-fixed">/</code>{' '}
                  for skills, or pick from the sidebar. Answers use Que metadata
                  only — never raw warehouse rows.
                </p>
                <div className="flex flex-wrap gap-sm pt-sm">
                  {CHAT_SKILLS.filter((s) =>
                    ['list', 'suggested', 'diff', 'help'].includes(s.id),
                  ).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={!canWrite}
                      onClick={() => void ask(s.buildPrompt([]))}
                      className="border border-outline-variant bg-surface-container px-md py-sm text-left font-body text-xs text-on-surface transition-colors hover:border-primary-fixed disabled:opacity-40"
                    >
                      <span className="text-primary-fixed">{s.slash}</span>{' '}
                      {s.label}
                    </button>
                  ))}
                </div>
                {!canWrite ? (
                  <p className="font-label text-[10px] tracking-widest text-on-surface-variant">
                    READ-ONLY · VIEWER CANNOT CHAT
                  </p>
                ) : null}
              </div>
            ) : (
              messages.map((m) => (
                <ChatBubble
                  key={m.id}
                  message={m}
                  onSaveJob={
                    canWrite && m.jobDraft && !m.savedJobId
                      ? () => void saveJob(m.id, m.jobDraft!)
                      : undefined
                  }
                  onCopy={() => {
                    void navigator.clipboard.writeText(m.content)
                    pushToast('Copied', 'success')
                  }}
                  onInsertMention={
                    canWrite
                      ? (token) => insertFromSidebar(token)
                      : undefined
                  }
                  onFeedback={
                    canWrite && m.role === 'assistant'
                      ? (rating) => void rateMessage(m, rating)
                      : undefined
                  }
                />
              ))
            )}
            {busy ? (
              <p className="font-label text-[10px] tracking-widest text-on-surface-variant">
                READING SCHEMA PACK…
              </p>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <div className="shrink-0 border-t border-outline-variant p-md">
            {activeMentions.length > 0 ? (
              <div className="mx-auto mb-sm flex max-w-4xl flex-wrap gap-xs">
                {activeMentions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="border border-primary-fixed/40 bg-surface-container-high px-sm py-xs font-label text-[10px] tracking-wider text-primary-fixed"
                    onClick={() =>
                      setActiveMentions((prev) =>
                        prev.filter((n) => n !== name),
                      )
                    }
                    title="Remove focus"
                  >
                    @{name} ×
                  </button>
                ))}
              </div>
            ) : null}
            <div className="relative mx-auto max-w-4xl">
              {suggestOpen && suggestions.length > 0 ? (
                <div className="absolute bottom-full left-0 right-0 z-20 mb-xs max-h-56 overflow-y-auto border border-outline-variant bg-surface-container-high shadow-lg">
                  {suggestions.map((s, i) => {
                    const active = i === suggestIndex
                    if (s.kind === 'mention') {
                      return (
                        <button
                          key={s.item.id}
                          type="button"
                          className={`flex w-full items-center justify-between px-md py-sm text-left font-body text-xs ${
                            active
                              ? 'bg-primary-container/20 text-on-surface'
                              : 'text-on-surface-variant hover:bg-surface-container'
                          }`}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            pickMention(s.item)
                          }}
                        >
                          <span>
                            <span className="font-label text-[9px] tracking-wider text-primary-fixed uppercase">
                              {s.item.kind}
                            </span>{' '}
                            {s.item.label}
                          </span>
                          <span className="font-label text-[9px] text-on-surface-variant">
                            {s.item.detail}
                          </span>
                        </button>
                      )
                    }
                    return (
                      <button
                        key={s.item.id}
                        type="button"
                        className={`flex w-full items-center justify-between px-md py-sm text-left font-body text-xs ${
                          active
                            ? 'bg-primary-container/20 text-on-surface'
                            : 'text-on-surface-variant hover:bg-surface-container'
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          pickSkill(s.item)
                        }}
                      >
                        <span>
                          <span className="text-primary-fixed">
                            {s.item.slash}
                          </span>{' '}
                          {s.item.label}
                        </span>
                        <span className="max-w-[50%] truncate font-label text-[9px] text-on-surface-variant">
                          {s.item.description}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  const v = e.target.value
                  setInput(v)
                  setActiveMentions(extractMentions(v).tables)
                  syncTriggerFromCaret(v, e.target.selectionStart ?? v.length)
                }}
                onClick={(e) => {
                  const t = e.currentTarget
                  syncTriggerFromCaret(t.value, t.selectionStart ?? 0)
                }}
                onKeyUp={(e) => {
                  const t = e.currentTarget
                  syncTriggerFromCaret(t.value, t.selectionStart ?? 0)
                }}
                onKeyDown={(e) => {
                  if (suggestOpen && suggestions.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setSuggestIndex(
                        (i) => (i + 1) % suggestions.length,
                      )
                      return
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setSuggestIndex(
                        (i) =>
                          (i - 1 + suggestions.length) % suggestions.length,
                      )
                      return
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      setSuggestOpen(false)
                      setTrigger({ type: null, start: -1, query: '' })
                      return
                    }
                    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                      const picked = suggestions[suggestIndex]
                      if (picked) {
                        e.preventDefault()
                        if (picked.kind === 'mention') pickMention(picked.item)
                        else pickSkill(picked.item)
                        return
                      }
                    }
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void ask(input)
                  }
                }}
                rows={3}
                disabled={!canWrite}
                placeholder={
                  canWrite
                    ? 'Ask about schema…  @table  @table.column  /list  /sql  /job'
                    : 'Read-only — viewer cannot send chat'
                }
                className="w-full resize-none border border-outline-variant bg-surface-container p-md pr-16 font-body text-sm text-on-surface outline-none placeholder:text-on-surface-variant/40 focus:border-primary-fixed disabled:opacity-50"
              />
              <button
                type="button"
                disabled={!canWrite || busy || !input.trim()}
                onClick={() => void ask(input)}
                className="absolute bottom-md right-md bg-primary-container px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-primary-fixed disabled:opacity-40"
              >
                SEND
              </button>
            </div>
            <p className="mt-sm text-center font-label text-[9px] tracking-widest text-on-surface-variant/50">
              {contextError
                ? `CONTEXT ERROR · ${contextError}`
                : `TABLES ${context?.stats?.tableCount ?? '—'} · RELS ${context?.stats?.relationshipCount ?? '—'} · SUGGESTED ${context?.stats?.suggestedJoins ?? '—'} · @ MENTION · / SKILLS · RAG ${aiStatus?.vectorReady ? 'ON' : 'OFF'}`}
            </p>
          </div>
        </main>

        <aside className="hidden w-80 shrink-0 flex-col border-l border-outline-variant bg-surface-container lg:flex">
          <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-high p-md">
            <h2 className="flex items-center gap-sm font-label text-[11px] font-bold tracking-widest text-primary-fixed">
              TABLES
              {contextRefreshing ? (
                <span className="font-label text-[9px] tracking-widest text-on-surface-variant">
                  REFRESHING
                </span>
              ) : null}
            </h2>
            <button
              type="button"
              onClick={() => void reloadContext()}
              className="border border-outline-variant px-sm py-xs font-label text-[9px] tracking-widest text-on-surface-variant hover:border-primary-fixed"
            >
              REFRESH
            </button>
          </div>
          <div className="border-b border-outline-variant p-sm">
            <input
              value={sidebarQuery}
              onChange={(e) => setSidebarQuery(e.target.value)}
              placeholder="Filter tables / columns…"
              className="w-full border border-outline-variant bg-surface-container-lowest px-sm py-xs font-body text-xs text-on-surface outline-none placeholder:text-on-surface-variant/40 focus:border-primary-fixed"
            />
            <p className="mt-xs font-label text-[8px] tracking-widest text-on-surface-variant/60">
              CLICK TABLE OR COLUMN TO PASTE INTO CHAT
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {focusTables.length > 0 ? (
              <div className="border-b border-outline-variant bg-surface-container-low px-md py-xs">
                <span className="font-label text-[9px] tracking-widest text-primary-fixed">
                  PINNED FROM CHAT
                </span>
              </div>
            ) : null}
            {(focusTables.length > 0 ? sidebarTables : []).map((t) => (
              <SidebarTableCard
                key={`focus-${t.connection}-${t.name}`}
                table={t}
                canWrite={canWrite}
                onPickTable={() => insertFromSidebar(`@${t.name}`)}
                onPickColumn={(col) =>
                  insertFromSidebar(`@${t.name}.${col}`)
                }
                onDescribe={() => void ask(`/describe @${t.name}`)}
              />
            ))}
            <div className="border-b border-outline-variant bg-surface-container-low px-md py-xs">
              <span className="font-label text-[9px] tracking-widest text-on-surface-variant">
                WORKSPACE CATALOG · {catalogTables.length}
              </span>
            </div>
            {catalogTables.length === 0 ? (
              <p className="p-md font-body text-xs text-on-surface-variant">
                No tables yet — sync a source first.
              </p>
            ) : (
              catalogTables.map((t) => (
                <SidebarTableCard
                  key={`cat-${t.connection}-${t.name}`}
                  table={t}
                  canWrite={canWrite}
                  onPickTable={() => insertFromSidebar(`@${t.name}`)}
                  onPickColumn={(col) =>
                    insertFromSidebar(`@${t.name}.${col}`)
                  }
                  onDescribe={() => void ask(`/describe @${t.name}`)}
                />
              ))
            )}
          </div>
        </aside>
      </div>
    </QueAppChrome>
  )
}

function SidebarTableCard({
  table: t,
  canWrite,
  onPickTable,
  onPickColumn,
  onDescribe,
}: {
  table: ChatReferencedTable
  canWrite: boolean
  onPickTable: () => void
  onPickColumn: (col: string) => void
  onDescribe: () => void
}) {
  return (
    <div className="border-b border-outline-variant">
      <div className="flex items-center justify-between gap-xs p-md pb-sm">
        <button
          type="button"
          disabled={!canWrite}
          onClick={onPickTable}
          className="min-w-0 text-left font-body text-xs font-bold text-on-surface hover:text-primary-fixed disabled:opacity-40"
          title="Insert @table into chat"
        >
          @{t.name}
        </button>
        <div className="flex shrink-0 items-center gap-xs">
          <span className="font-label text-[9px] tracking-wider text-on-surface-variant uppercase">
            {t.sourceType}
          </span>
          <button
            type="button"
            disabled={!canWrite}
            onClick={onDescribe}
            className="border border-outline-variant px-xs py-px font-label text-[8px] tracking-widest text-on-surface-variant hover:border-primary-fixed disabled:opacity-40"
            title="Describe this table"
          >
            DESC
          </button>
        </div>
      </div>
      <div className="space-y-xs px-md pb-md">
        {t.columns.map((c) => (
          <button
            key={c.name}
            type="button"
            disabled={!canWrite}
            onClick={() => onPickColumn(c.name)}
            className="flex w-full justify-between font-label text-[10px] tracking-wide hover:text-primary-fixed disabled:opacity-40"
            title={`Insert @${t.name}.${c.name}`}
          >
            <span className="text-primary-fixed">{c.name}</span>
            <span className="text-on-surface-variant">
              {c.dataType}
              {c.keyKind && c.keyKind !== 'none'
                ? ` ${c.keyKind.toUpperCase()}`
                : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ChatBubble({
  message,
  onSaveJob,
  onCopy,
  onInsertMention,
  onFeedback,
}: {
  message: UiMessage
  onSaveJob?: () => void
  onCopy?: () => void
  onInsertMention?: (token: string) => void
  onFeedback?: (rating: 1 | -1) => void
}) {
  if (message.role === 'user') {
    return (
      <div className="ml-auto flex max-w-2xl flex-col items-end gap-xs">
        <div className="border border-outline-variant bg-secondary-container p-md text-on-surface-variant">
          <p className="font-body text-sm whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
        <span className="font-label text-[9px] tracking-widest text-on-surface-variant/50 uppercase">
          User · {message.at}
        </span>
      </div>
    )
  }

  return (
    <div className="flex max-w-4xl flex-col items-start gap-xs">
      <div className="mb-xs flex flex-wrap items-center gap-sm">
        <div className="flex h-6 w-6 items-center justify-center bg-primary-container font-label text-[10px] font-bold text-on-primary-fixed">
          AI
        </div>
        <span className="font-label text-[11px] font-bold tracking-widest text-primary-fixed">
          QUE AI
        </span>
        {onCopy ? (
          <button
            type="button"
            onClick={onCopy}
            className="border border-outline-variant px-sm py-px font-label text-[8px] tracking-widest text-on-surface-variant hover:border-primary-fixed"
          >
            COPY
          </button>
        ) : null}
        {onFeedback ? (
          <>
            <button
              type="button"
              disabled={message.feedback === 1}
              onClick={() => onFeedback(1)}
              className="border border-outline-variant px-sm py-px font-label text-[8px] tracking-widest text-on-surface-variant hover:border-primary-fixed disabled:border-primary-fixed disabled:text-primary-fixed"
            >
              +1
            </button>
            <button
              type="button"
              disabled={message.feedback === -1}
              onClick={() => onFeedback(-1)}
              className="border border-outline-variant px-sm py-px font-label text-[8px] tracking-widest text-on-surface-variant hover:border-primary-fixed disabled:border-error disabled:text-error"
            >
              -1
            </button>
          </>
        ) : null}
      </div>
      <div className="w-full space-y-md border border-outline-variant bg-surface-container p-md">
        <AssistantBody text={message.content} />
        {message.samplePreviews && message.samplePreviews.length > 0
          ? message.samplePreviews.map((p) => (
              <SamplePreviewTable key={p.table} preview={p} />
            ))
          : null}
        {message.retrievedChunks && message.retrievedChunks.length > 0 ? (
          <div className="flex flex-wrap gap-xs">
            <span className="w-full font-label text-[8px] tracking-widest text-on-surface-variant">
              RETRIEVED
            </span>
            {message.retrievedChunks.slice(0, 8).map((c) => (
              <span
                key={c.sourceRef}
                className="border border-outline-variant/80 px-sm py-xs font-label text-[9px] tracking-wider text-on-surface-variant"
                title={`score ${c.score.toFixed(3)} · ${c.sourceKind}`}
              >
                {c.title}
              </span>
            ))}
          </div>
        ) : null}
        {message.referencedTables && message.referencedTables.length > 0 ? (
          <div className="flex flex-wrap gap-xs">
            {message.referencedTables.slice(0, 8).map((t) => (
              <button
                key={`${t.connection}-${t.name}`}
                type="button"
                disabled={!onInsertMention}
                onClick={() => onInsertMention?.(`@${t.name}`)}
                className="border border-outline-variant px-sm py-xs font-label text-[9px] tracking-wider text-primary-fixed hover:border-primary-fixed disabled:opacity-40"
              >
                @{t.name}
              </button>
            ))}
          </div>
        ) : null}
        {message.sql ? (
          <div className="relative border-l-2 border-primary-fixed bg-surface-container-lowest p-md">
            <span className="absolute top-0 right-0 bg-outline-variant px-sm py-xs font-label text-[10px] tracking-widest text-primary-fixed">
              SQL
            </span>
            <pre className="overflow-x-auto font-body text-xs text-primary-fixed whitespace-pre-wrap">
              {message.sql}
            </pre>
            <button
              type="button"
              className="mt-sm bg-outline-variant px-sm py-xs font-label text-[10px] tracking-widest text-on-background hover:bg-primary-container hover:text-on-primary-fixed"
              onClick={() => void navigator.clipboard.writeText(message.sql!)}
            >
              COPY
            </button>
          </div>
        ) : null}
        {message.jobDraft ? (
          <div className="border border-primary-fixed/40 bg-surface-container-low p-md">
            <p className="font-label text-[10px] tracking-widest text-primary-fixed">
              JOB DRAFT · {message.jobDraft.status.toUpperCase()}
            </p>
            <p className="mt-xs font-body text-sm font-bold text-on-surface">
              {message.jobDraft.title}
            </p>
            <ol className="mt-sm list-decimal space-y-xs pl-md font-body text-xs text-on-surface-variant">
              {message.jobDraft.steps.map((s) => (
                <li key={s.id}>
                  <span className="text-on-surface">{s.action}</span> —{' '}
                  {s.detail}
                </li>
              ))}
            </ol>
            <div className="mt-md flex gap-sm">
              {message.savedJobId ? (
                <Link
                  to="/jobs"
                  className="bg-outline-variant px-sm py-xs font-label text-[10px] tracking-widest text-on-background"
                >
                  OPEN IN JOBS
                </Link>
              ) : onSaveJob ? (
                <button
                  type="button"
                  onClick={onSaveJob}
                  className="bg-primary-container px-sm py-xs font-label text-[10px] tracking-widest text-on-primary-fixed"
                >
                  SAVE TO JOBS
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {message.citations && message.citations.length > 0 ? (
          <p className="font-label text-[9px] tracking-wider text-on-surface-variant/60">
            CITED: {message.citations.slice(0, 10).join(' · ')}
          </p>
        ) : null}
      </div>
      <span className="font-label text-[9px] tracking-widest text-on-surface-variant/50 uppercase">
        AI · {message.at}
        {message.mode ? ` · ${message.mode}` : ''}
        {message.model ? ` · ${message.model}` : ''}
      </span>
    </div>
  )
}

function SamplePreviewTable({ preview }: { preview: SamplePreview }) {
  const cols = preview.columns
  return (
    <div className="overflow-hidden border border-outline-variant bg-surface-container-lowest">
      <div className="flex flex-wrap items-center justify-between gap-sm border-b border-outline-variant bg-surface-container px-md py-sm">
        <div>
          <span className="font-label text-[10px] font-bold tracking-widest text-primary-fixed">
            SAMPLE · {preview.table}
          </span>
          {preview.sourceType ? (
            <span className="ml-sm font-label text-[9px] tracking-wider text-on-surface-variant uppercase">
              {preview.sourceType}
            </span>
          ) : null}
        </div>
        <span className="font-label text-[8px] tracking-widest text-on-surface-variant/70">
          {preview.rowCount} ROW{preview.rowCount === 1 ? '' : 'S'} · SCHEMA
          SAMPLES ONLY
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[20rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-outline-variant">
              {cols.map((c) => (
                <th
                  key={c.name}
                  className="px-md py-sm font-label text-[9px] font-bold tracking-wider text-primary-fixed"
                >
                  {c.name}
                  <span className="mt-px block font-normal tracking-wide text-on-surface-variant/60 normal-case">
                    {c.dataType}
                    {c.keyKind && c.keyKind !== 'none'
                      ? ` · ${c.keyKind}`
                      : ''}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-outline-variant/50 last:border-0"
              >
                {cols.map((c) => (
                  <td
                    key={c.name}
                    className="max-w-[12rem] truncate px-md py-sm font-body text-xs text-on-surface"
                    title={formatCell(row[c.name])}
                  >
                    {formatCell(row[c.name])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-outline-variant px-md py-xs font-label text-[8px] tracking-wider text-on-surface-variant/60">
        {preview.note}
      </p>
    </div>
  )
}

function formatCell(value: unknown): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function AssistantBody({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return (
    <p className="font-body text-sm text-on-surface whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="text-primary-fixed">
              {part.slice(1, -1)}
            </code>
          )
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-bold text-on-surface">
              {part.slice(2, -2)}
            </strong>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </p>
  )
}

export default ChatPage
