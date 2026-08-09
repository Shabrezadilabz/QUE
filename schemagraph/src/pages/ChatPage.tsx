import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { WarehouseRunsStrip } from '@/components/WarehouseRunsStrip'
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

type SpeechRecognitionLike = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort?: () => void
  onresult:
    | ((event: {
        results: {
          [i: number]: { [j: number]: { transcript: string } }
          length: number
        }
      }) => void)
    | null
  onerror: (() => void) | null
  onend: (() => void) | null
}
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
  const navigate = useNavigate()
  const { workspaceId, workspaces } = useAuth()
  const workspaceName =
    workspaces.find((w) => w.id === workspaceId)?.name || 'Workspace'
  const { pushToast } = useToast()
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [context, setContext] = useState<ContextPackSummary | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)
  const [focusTables, setFocusTables] = useState<ChatReferencedTable[]>([])
  const [contextRefreshing, setContextRefreshing] = useState(false)
  const [sidebarQuery, setSidebarQuery] = useState('')
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>(
    {},
  )
  const [composerDragOver, setComposerDragOver] = useState(false)
  const [attachments, setAttachments] = useState<
    { id: string; name: string; text: string }[]
  >([])
  const [listening, setListening] = useState(false)
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<{
    stop: () => void
    abort?: () => void
  } | null>(null)
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
    const tableName = token.replace(/^@/, '').split('.')[0]
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
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(nextCaret, nextCaret)
    })
  }

  function toggleTableExpand(key: string) {
    setExpandedTables((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function onMentionDragStart(e: ReactDragEvent, token: string) {
    e.dataTransfer.setData('text/plain', token)
    e.dataTransfer.setData('application/x-que-mention', token)
    e.dataTransfer.effectAllowed = 'copy'
  }

  function onComposerDragOver(e: ReactDragEvent) {
    if (
      e.dataTransfer.types.includes('application/x-que-mention') ||
      e.dataTransfer.types.includes('text/plain')
    ) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setComposerDragOver(true)
    }
  }

  function onComposerDragLeave(e: ReactDragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setComposerDragOver(false)
  }

  function onComposerDrop(e: ReactDragEvent) {
    e.preventDefault()
    setComposerDragOver(false)
    const token =
      e.dataTransfer.getData('application/x-que-mention') ||
      e.dataTransfer.getData('text/plain')
    if (!token?.startsWith('@') || !canWrite) return
    insertFromSidebar(token)
  }

  async function onPickAttachments(fileList: FileList | null) {
    if (!fileList?.length || !canWrite) return
    const next: { id: string; name: string; text: string }[] = []
    for (const file of [...fileList].slice(0, 4)) {
      if (file.size > 200_000) {
        pushToast(`${file.name} is too large (max 200KB)`, 'error')
        continue
      }
      const text = await file.text()
      next.push({
        id: `${file.name}-${file.size}-${Date.now()}`,
        name: file.name,
        text,
      })
    }
    if (next.length) {
      setAttachments((prev) => [...prev, ...next].slice(0, 6))
      pushToast(
        `Attached ${next.length} note(s) — schema-only context, not warehouse data`,
        'success',
      )
    }
  }

  function toggleVoiceInput() {
    if (!canWrite) return
    const SR =
      typeof window !== 'undefined'
        ? (
            window as unknown as {
              SpeechRecognition?: new () => SpeechRecognitionLike
              webkitSpeechRecognition?: new () => SpeechRecognitionLike
            }
          ).SpeechRecognition ||
          (
            window as unknown as {
              webkitSpeechRecognition?: new () => SpeechRecognitionLike
            }
          ).webkitSpeechRecognition
        : undefined

    if (!SR) {
      pushToast('Voice input is not supported in this browser', 'info')
      return
    }

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
      setListening(false)
      return
    }

    const recognition = new SR()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event: {
      results: { [i: number]: { [j: number]: { transcript: string } }; length: number }
    }) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0]?.transcript ?? ''
      }
      if (transcript.trim()) {
        setInput((prev) => {
          const needsSpace = prev.length > 0 && !/\s$/.test(prev) ? ' ' : ''
          return prev + needsSpace + transcript.trim()
        })
      }
    }
    recognition.onerror = () => {
      setListening(false)
      recognitionRef.current = null
    }
    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }
    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.()
      recognitionRef.current?.stop()
    }
  }, [])

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

    const attachmentBlock =
      attachments.length > 0
        ? attachments
            .map(
              (a) =>
                `Attached note (${a.name}):\n\`\`\`\n${a.text.slice(0, 8000)}\n\`\`\``,
            )
            .join('\n\n') + '\n\n'
        : ''

    const expanded = expandSkillInput(attachmentBlock + rawText, focusNames)
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
    setAttachments([])
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
      pushToast('Job saved — opening Jobs…', 'success')
      navigate(`/jobs/${encodeURIComponent(job.id)}/notebook`)
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

  return (
    <QueAppChrome eyebrow="SCHEMA-ONLY · MODEL ASSISTANT">
      <div className="flex min-h-0 flex-1 overflow-hidden bg-canvas">
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden px-md py-sm md:px-lg md:py-md">
          <WarehouseRunsStrip />
          <div className="mb-md flex shrink-0 items-end justify-between gap-md">
            <div>
              <h1 className="font-headline text-xl font-semibold text-primary sm:text-xl">
                Model Assistant
              </h1>
              <p className="font-body text-xs text-on-surface-variant">
                Intelligent schema design and query support
                {busy ? ' · thinking…' : ''}
              </p>
            </div>
            <div className="hidden flex-wrap items-center justify-end gap-sm sm:flex">
              <button
                type="button"
                className="flex items-center gap-xs rounded-md border border-outline-variant px-sm py-1 font-label text-[11px] text-on-surface-variant hover:bg-white"
                onClick={() => setShowSkills((v) => !v)}
              >
                Skills
              </button>
              <button
                type="button"
                className="flex items-center gap-xs rounded-md border border-outline-variant px-sm py-1 font-label text-[11px] text-on-surface-variant hover:bg-white disabled:opacity-40"
                disabled={!canWrite || reindexing}
                onClick={() => {
                  if (reindexing) return
                  void runReindex()
                }}
                title="Reindex schema embeddings"
              >
                {reindexing ? 'Indexing…' : 'Reindex'}
              </button>
              {busy ? (
                <button
                  type="button"
                  className="rounded-md border border-error/50 px-sm py-1 font-label text-[11px] text-error"
                  onClick={stopAsk}
                >
                  Stop
                </button>
              ) : null}
              <button
                type="button"
                className="rounded-md border border-outline-variant px-sm py-1 font-label text-[11px] text-on-surface-variant hover:bg-white"
                onClick={() => {
                  setMessages([])
                  setFocusTables([])
                  setActiveMentions([])
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {showSkills ? (
            <div className="mb-md shrink-0 rounded-xl border border-outline-variant/30 bg-white/70 p-md">
              <p className="mb-sm font-label text-[11px] text-on-surface-variant">
                Slash skills · type / or click · use @ for tables
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
                    className="rounded-full border border-outline-variant bg-white px-md py-sm text-left hover:bg-[#ffdbd2] disabled:opacity-40"
                  >
                    <span className="font-label text-[12px] text-primary">
                      {s.slash}
                    </span>
                    <span className="ml-sm font-body text-[12px] text-on-surface-variant">
                      {s.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 space-y-lg overflow-y-auto pr-sm">
            {messages.length === 0 ? (
              <div className="flex max-w-[56rem] gap-md">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container font-label text-sm font-bold text-on-primary">
                  AI
                </div>
                <div className="space-y-sm">
                  <div className="rounded-xl rounded-tl-none border border-sand/30 bg-white/80 p-md shadow-sm backdrop-blur-sm">
                    <p className="font-body text-[13px] leading-snug text-on-surface">
                      Hello! I am here to help you navigate your data mesh. I have
                      analyzed{' '}
                      <span className="font-semibold text-primary">{workspaceName}</span>
                      {context?.stats?.tableCount
                        ? ` — ${context.stats.tableCount} tables and ${context.stats.relationshipCount ?? 0} relationships ready for schema-only answers.`
                        : '. Sync a source or ask about tables with @mentions.'}
                    </p>
                  </div>
                  <span className="ml-1 font-label text-[12px] text-on-surface-variant/60">
                    Assistant · Ready
                  </span>
                  <div className="flex flex-wrap gap-sm pt-sm">
                    {CHAT_SKILLS.filter((s) =>
                      ['list', 'suggested', 'diff', 'help'].includes(s.id),
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        disabled={!canWrite}
                        onClick={() => void ask(s.buildPrompt([]))}
                        className="rounded-full border border-outline-variant bg-white/80 px-sm py-1 font-label text-[11px] text-primary hover:bg-[#ffdbd2] disabled:opacity-40"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  {!canWrite ? (
                    <p className="font-label text-[11px] text-on-surface-variant">
                      Read-only — viewer cannot chat
                    </p>
                  ) : null}
                </div>
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
              <div className="flex gap-md">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container/60 font-label text-sm text-on-primary">
                  …
                </div>
                <p className="rounded-xl rounded-tl-none border border-sand/30 bg-white/70 px-md py-sm font-label text-[12px] text-on-surface-variant">
                  Reading schema pack…
                </p>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <div className="mt-md shrink-0 space-y-md">
            {activeMentions.length > 0 ? (
              <div className="flex flex-wrap gap-xs">
                {activeMentions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="rounded-full border border-primary/30 bg-[#ffdbd2] px-sm py-xs font-label text-[11px] text-primary"
                    onClick={() =>
                      setActiveMentions((prev) =>
                        prev.filter((n) => n !== name),
                      )
                    }
                  >
                    @{name} ×
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-sm">
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => {
                  setInput('/sql ')
                  textareaRef.current?.focus()
                }}
                className="flex items-center gap-xs rounded-full border border-outline-variant bg-white/80 px-sm py-1 font-label text-[11px] text-primary hover:bg-[#ffdbd2] disabled:opacity-40"
              >
                Generate SQL
              </button>
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => {
                  setInput('/describe ')
                  textareaRef.current?.focus()
                }}
                className="flex items-center gap-xs rounded-full border border-outline-variant bg-white/80 px-sm py-1 font-label text-[11px] text-primary hover:bg-[#ffdbd2] disabled:opacity-40"
              >
                Explain table
              </button>
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => void ask('/suggested')}
                className="flex items-center gap-xs rounded-full border border-outline-variant bg-white/80 px-sm py-1 font-label text-[11px] text-primary hover:bg-[#ffdbd2] disabled:opacity-40"
              >
                Visualize joins
              </button>
              <button
                type="button"
                className="rounded-full border border-outline-variant bg-white/80 px-sm py-1 font-label text-[11px] text-on-surface-variant hover:bg-white"
                onClick={() => setShowSkills((v) => !v)}
              >
                ···
              </button>
              {canWrite && messages.some((m) => m.role === 'user') ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={regenerate}
                  className="rounded-full border border-outline-variant bg-white/80 px-sm py-1 font-label text-[11px] text-on-surface-variant hover:bg-white disabled:opacity-40"
                >
                  Regen
                </button>
              ) : null}
            </div>

            <div className="relative">
              {suggestOpen && suggestions.length > 0 ? (
                <div className="absolute bottom-full left-0 right-0 z-20 mb-xs max-h-56 overflow-y-auto rounded-xl border border-outline-variant/40 bg-white shadow-lg">
                  {suggestions.map((s, i) => {
                    const active = i === suggestIndex
                    if (s.kind === 'mention') {
                      return (
                        <button
                          key={s.item.id}
                          type="button"
                          className={`flex w-full items-center justify-between px-md py-sm text-left font-body text-xs ${
                            active
                              ? 'bg-[#ffdbd2]/50 text-on-surface'
                              : 'text-on-surface-variant hover:bg-surface-container-low'
                          }`}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            pickMention(s.item)
                          }}
                        >
                          <span>
                            <span className="font-label text-[10px] text-primary uppercase">
                              {s.item.kind}
                            </span>{' '}
                            {s.item.label}
                          </span>
                          <span className="font-label text-[10px] text-on-surface-variant">
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
                            ? 'bg-[#ffdbd2]/50 text-on-surface'
                            : 'text-on-surface-variant hover:bg-surface-container-low'
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          pickSkill(s.item)
                        }}
                      >
                        <span>
                          <span className="text-primary">{s.item.slash}</span>{' '}
                          {s.item.label}
                        </span>
                        <span className="max-w-[50%] truncate font-label text-[10px] text-on-surface-variant">
                          {s.item.description}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : null}

              <div
                className={[
                  'relative rounded-2xl border bg-white p-md shadow-sm transition-colors focus-within:border-primary focus-within:shadow-md',
                  composerDragOver
                    ? 'border-primary border-dashed bg-primary/5'
                    : 'border-outline-variant/60',
                ].join(' ')}
                onDragOver={onComposerDragOver}
                onDragLeave={onComposerDragLeave}
                onDrop={onComposerDrop}
              >
                {composerDragOver ? (
                  <p className="pointer-events-none absolute inset-x-0 top-2 z-10 text-center font-label text-[10px] font-bold tracking-wide text-primary">
                    Drop to mention @table or @table.column
                  </p>
                ) : null}

                {attachments.length > 0 ? (
                  <div className="mb-sm flex flex-wrap gap-xs">
                    {attachments.map((a) => (
                      <span
                        key={a.id}
                        className="inline-flex max-w-full items-center gap-xs rounded-full border border-outline-variant/40 bg-secondary-container/40 px-sm py-1 font-label text-[11px] text-on-surface"
                      >
                        <span className="truncate" title={a.name}>
                          📎 {a.name}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${a.name}`}
                          onClick={() =>
                            setAttachments((prev) =>
                              prev.filter((x) => x.id !== a.id),
                            )
                          }
                          className="rounded-full px-1 text-on-surface-variant hover:text-error"
                        >
                          ×
                        </button>
                      </span>
                    ))}
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
                  onDragOver={onComposerDragOver}
                  onDrop={onComposerDrop}
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
                        setSuggestIndex((i) => (i + 1) % suggestions.length)
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
                      if (
                        e.key === 'Tab' ||
                        (e.key === 'Enter' && !e.shiftKey)
                      ) {
                        const picked = suggestions[suggestIndex]
                        if (picked) {
                          e.preventDefault()
                          if (picked.kind === 'mention')
                            pickMention(picked.item)
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
                  rows={2}
                  disabled={!canWrite}
                  placeholder={
                    canWrite
                      ? 'Ask Que anything about your pipelines…  @table  /sql'
                      : 'Read-only — viewer cannot send chat'
                  }
                  className="max-h-32 min-h-[2.5rem] w-full resize-none border-none bg-transparent px-xs py-xs font-body text-[13px] leading-snug text-on-surface outline-none placeholder:text-on-surface-variant/40 disabled:opacity-50"
                />

                <div className="mt-sm flex flex-wrap items-center gap-xs border-t border-outline-variant/20 pt-sm">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".sql,.md,.txt,.json,.csv,.yml,.yaml"
                    className="hidden"
                    onChange={(e) => {
                      void onPickAttachments(e.target.files)
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    disabled={!canWrite}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-secondary-container disabled:opacity-40"
                    title="Attach schema note (.sql, .md, .txt…)"
                    aria-label="Attach file"
                  >
                    <PaperclipIcon />
                  </button>
                  <button
                    type="button"
                    disabled={!canWrite}
                    onClick={() => {
                      const el = textareaRef.current
                      const caret = el?.selectionStart ?? input.length
                      const before = input.slice(0, caret)
                      const after = input.slice(caret)
                      const needsSpace =
                        before.length > 0 && !/\s$/.test(before) ? ' ' : ''
                      const next = `${before}${needsSpace}@${after}`
                      const nextCaret = (before + needsSpace + '@').length
                      setInput(next)
                      syncTriggerFromCaret(next, nextCaret)
                      requestAnimationFrame(() => {
                        const ta = textareaRef.current
                        if (!ta) return
                        ta.focus()
                        ta.setSelectionRange(nextCaret, nextCaret)
                      })
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full font-label text-sm font-bold text-on-surface-variant transition-colors hover:bg-secondary-container disabled:opacity-40"
                    title="Mention a table"
                    aria-label="Mention table"
                  >
                    @
                  </button>
                  <button
                    type="button"
                    disabled={!canWrite}
                    onClick={() => {
                      setShowSkills(true)
                      setInput((prev) => (prev.startsWith('/') ? prev : '/'))
                      requestAnimationFrame(() => textareaRef.current?.focus())
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full font-label text-sm text-on-surface-variant transition-colors hover:bg-secondary-container disabled:opacity-40"
                    title="Skills / commands"
                    aria-label="Open skills"
                  >
                    /
                  </button>
                  <button
                    type="button"
                    disabled={!canWrite}
                    onClick={toggleVoiceInput}
                    className={[
                      'flex h-9 w-9 items-center justify-center rounded-full transition-colors disabled:opacity-40',
                      listening
                        ? 'bg-error/15 text-error'
                        : 'text-on-surface-variant hover:bg-secondary-container',
                    ].join(' ')}
                    title={listening ? 'Stop listening' : 'Voice input'}
                    aria-label={listening ? 'Stop voice input' : 'Voice input'}
                    aria-pressed={listening}
                  >
                    <MicIcon />
                  </button>

                  <div className="ml-auto flex items-center gap-sm">
                    <label className="flex max-w-[11rem] items-center gap-1 rounded-full border border-outline-variant/40 bg-surface-container-low px-sm py-1.5">
                      <span className="sr-only">Model</span>
                      <select
                        value={modelId}
                        onChange={(e) => setModelId(e.target.value)}
                        disabled={!canWrite || !aiStatus?.models?.length}
                        className="max-w-[9.5rem] truncate border-none bg-transparent font-label text-[12px] font-medium text-on-surface outline-none disabled:opacity-40"
                        title="Generation model"
                      >
                        {(aiStatus?.models?.length
                          ? aiStatus.models
                          : [{ id: '', label: 'heuristic' }]
                        ).map((m) => (
                          <option key={m.id || 'heuristic'} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {busy ? (
                      <button
                        type="button"
                        onClick={stopAsk}
                        className="flex h-10 items-center justify-center rounded-full border border-outline-variant px-md font-label text-xs font-bold text-on-surface-variant hover:bg-secondary-container"
                      >
                        Stop
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          !canWrite ||
                          (!input.trim() && attachments.length === 0)
                        }
                        onClick={() => void ask(input)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary font-label text-sm font-bold text-on-primary transition-transform hover:bg-primary-container active:scale-90 disabled:opacity-40"
                        aria-label="Send"
                      >
                        →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <p className="pb-sm text-center font-label text-[12px] text-on-surface-variant/40">
              AI can make mistakes. Verify critical schema changes.
              {contextError ? ` · Context error: ${contextError}` : ''}
            </p>
          </div>
        </main>

        <aside className="hidden w-80 shrink-0 flex-col gap-lg overflow-y-auto py-lg pr-lg pl-md xl:flex">
          <div className="space-y-md rounded-xl border border-sand/30 bg-white/80 p-lg shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-label text-sm font-bold tracking-widest text-on-surface uppercase">
                Active Context
              </h3>
              <button
                type="button"
                onClick={() => void reloadContext()}
                className="font-label text-[10px] tracking-wide text-on-surface-variant hover:text-primary"
              >
                {contextRefreshing ? '…' : 'Refresh'}
              </button>
            </div>
            <div className="space-y-sm">
              <div className="flex items-center justify-between gap-sm">
                <span className="font-label text-[12px] text-on-surface-variant">
                  Selected model
                </span>
                <span className="truncate font-label text-[12px] font-semibold text-primary underline">
                  {modelId || aiStatus?.models?.[0]?.label || 'heuristic'}
                </span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-secondary-container">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: aiStatus?.vectorReady ? '75%' : '40%',
                  }}
                />
              </div>
            </div>
            <div className="space-y-xs pt-sm">
              <p className="font-label text-[12px] font-semibold text-on-surface">
                Referenced tables
              </p>
              <input
                value={sidebarQuery}
                onChange={(e) => setSidebarQuery(e.target.value)}
                placeholder="Filter tables…"
                className="mb-sm w-full rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-sm py-xs font-body text-xs outline-none focus:border-primary"
              />
              <ul className="max-h-64 space-y-xs overflow-y-auto">
                {sidebarTables.slice(0, 24).map((t) => {
                  const key = `${t.connection}:${t.name}`
                  const open =
                    expandedTables[key] ||
                    (sidebarQuery.trim().length > 0 &&
                      t.columns.some((c) =>
                        c.name
                          .toLowerCase()
                          .includes(sidebarQuery.trim().toLowerCase()),
                      ))
                  return (
                    <li key={key} className="rounded-lg hover:bg-secondary-container/40">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={
                            open
                              ? `Collapse columns for ${t.name}`
                              : `Expand columns for ${t.name}`
                          }
                          onClick={() => toggleTableExpand(key)}
                          className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-on-surface-variant hover:bg-secondary-container hover:text-primary"
                        >
                          <span
                            className={`inline-block text-[10px] transition-transform ${open ? 'rotate-90' : ''}`}
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
                          onClick={() => insertFromSidebar(`@${t.name}`)}
                          title={
                            canWrite
                              ? `Click or drag @${t.name} into chat`
                              : t.name
                          }
                          className="flex min-w-0 flex-1 items-center gap-sm rounded-lg px-xs py-xs text-left text-[13px] text-on-surface-variant hover:text-primary disabled:cursor-default disabled:opacity-40"
                        >
                          <span className="text-tertiary" aria-hidden>
                            ▤
                          </span>
                          <span className="truncate font-medium">{t.name}</span>
                          <span className="ml-auto shrink-0 font-label text-[9px] text-on-surface-variant/50">
                            {t.columns.length}
                          </span>
                        </button>
                      </div>
                      {open ? (
                        <ul className="mb-xs ml-7 space-y-0.5 border-l border-outline-variant/30 pl-sm">
                          {t.columns.length === 0 ? (
                            <li className="py-xs font-body text-[11px] text-on-surface-variant">
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
                                    insertFromSidebar(`@${t.name}.${c.name}`)
                                  }
                                  title={
                                    canWrite
                                      ? `Click or drag @${t.name}.${c.name}`
                                      : c.name
                                  }
                                  className="flex w-full items-center gap-sm rounded-md px-xs py-1 text-left font-body text-[12px] text-on-surface-variant hover:bg-white hover:text-primary disabled:opacity-40"
                                >
                                  <span
                                    className="font-mono text-[10px] text-primary/70"
                                    aria-hidden
                                  >
                                    ·
                                  </span>
                                  <span className="truncate">{c.name}</span>
                                  <span className="ml-auto shrink-0 font-label text-[9px] uppercase tracking-wide text-on-surface-variant/45">
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
                  <li className="font-body text-xs text-on-surface-variant">
                    No tables yet — sync a source first.
                  </li>
                ) : null}
              </ul>
            </div>
            <div className="pt-md">
              <Link
                to="/workspace"
                className="block w-full rounded-lg border border-primary/20 py-sm text-center font-label text-[12px] text-primary transition-all hover:bg-[#ffdbd2]"
              >
                View Graph Representation
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-tertiary/10 bg-[#bbeed4]/30 p-lg">
            <div className="mb-sm flex items-center gap-sm text-tertiary">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full bg-tertiary text-[10px] font-bold text-on-tertiary"
                aria-hidden
              >
                ✓
              </span>
              <span className="font-label text-sm font-bold">
                Optimization Tip
              </span>
            </div>
            <p className="font-body text-sm leading-relaxed text-[#1f4f3c]">
              {context?.stats?.suggestedJoins
                ? `You have ${context.stats.suggestedJoins} suggested join(s) waiting for review. Promote accepted joins before shipping a dbt PR.`
                : 'Ask about joins with /suggested, or mention tables with @name for schema-only answers — never raw warehouse rows.'}
            </p>
          </div>
        </aside>
      </div>
    </QueAppChrome>
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
      <div className="ml-auto flex max-w-[56rem] flex-row-reverse gap-md">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary font-label text-sm font-bold text-on-secondary">
          You
        </div>
        <div className="space-y-sm text-right">
          <div className="rounded-xl rounded-tr-none bg-primary-container p-md text-left">
            <p className="font-body text-[13px] leading-snug whitespace-pre-wrap text-on-primary">
              {message.content}
            </p>
          </div>
          <span className="mr-1 font-label text-[12px] text-on-surface-variant/60">
            You · {message.at}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex max-w-[64rem] gap-md">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container font-label text-sm font-bold text-on-primary">
        AI
      </div>
      <div className="w-full min-w-0 space-y-sm">
        <div className="space-y-md rounded-xl rounded-tl-none border border-sand/30 bg-white/80 p-md shadow-sm backdrop-blur-sm">
          <div className="mb-xs flex flex-wrap items-center gap-sm">
            {onCopy ? (
              <button
                type="button"
                onClick={onCopy}
                className="rounded-lg border border-outline-variant px-sm py-px font-label text-[10px] text-on-surface-variant hover:border-primary"
              >
                Copy
              </button>
            ) : null}
            {onFeedback ? (
              <>
                <button
                  type="button"
                  disabled={message.feedback === 1}
                  onClick={() => onFeedback(1)}
                  className="rounded-lg border border-outline-variant px-sm py-px font-label text-[10px] text-on-surface-variant hover:border-primary disabled:border-primary disabled:text-primary"
                >
                  +1
                </button>
                <button
                  type="button"
                  disabled={message.feedback === -1}
                  onClick={() => onFeedback(-1)}
                  className="rounded-lg border border-outline-variant px-sm py-px font-label text-[10px] text-on-surface-variant hover:border-error disabled:border-error disabled:text-error"
                >
                  -1
                </button>
              </>
            ) : null}
          </div>
          <AssistantBody text={message.content} />
          {message.referencedTables && message.referencedTables.length > 0 ? (
            <div className="my-md flex flex-col items-stretch gap-lg rounded-lg border border-sand/30 bg-white/50 p-md md:flex-row md:items-center">
              <div className="flex w-full flex-col items-center gap-sm md:w-1/3">
                {message.referencedTables.slice(0, 2).map((t, i) => (
                  <div key={`${t.connection}-${t.name}`} className="w-full">
                    {i > 0 ? (
                      <p className="mb-sm text-center font-label text-primary">
                        ⟷
                      </p>
                    ) : null}
                    <div className="flex h-12 w-full items-center justify-center rounded-lg border border-secondary bg-secondary-container/50 px-sm font-label text-sm text-secondary">
                      {t.name}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex-1 space-y-sm">
                {message.referencedTables[0]?.columns
                  ?.filter((c) => c.keyKind === 'pk' || c.keyKind === 'fk')
                  .slice(0, 3)
                  .map((c) => (
                    <div key={c.name} className="flex items-center gap-sm">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          c.keyKind === 'pk' ? 'bg-primary' : 'bg-tertiary'
                        }`}
                      />
                      <p className="font-label text-[12px]">
                        {c.keyKind === 'pk' ? 'Primary Key' : 'Foreign Key'}:{' '}
                        <span className="font-bold">{c.name}</span>
                      </p>
                    </div>
                  ))}
                <div className="flex flex-wrap gap-xs pt-xs">
                  {message.referencedTables.slice(0, 6).map((t) => (
                    <button
                      key={`${t.connection}-${t.name}`}
                      type="button"
                      disabled={!onInsertMention}
                      onClick={() => onInsertMention?.(`@${t.name}`)}
                      className="rounded-full border border-outline-variant px-sm py-xs font-label text-[11px] text-primary hover:bg-[#ffdbd2] disabled:opacity-40"
                    >
                      @{t.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {message.samplePreviews && message.samplePreviews.length > 0
            ? message.samplePreviews.map((p) => (
                <SamplePreviewTable key={p.table} preview={p} />
              ))
            : null}
          {message.retrievedChunks && message.retrievedChunks.length > 0 ? (
            <div className="flex flex-wrap gap-xs">
              <span className="w-full font-label text-[10px] tracking-widest text-on-surface-variant">
                Retrieved
              </span>
              {message.retrievedChunks.slice(0, 8).map((c) => (
                <span
                  key={c.sourceRef}
                  className="rounded-full border border-outline-variant/80 px-sm py-xs font-label text-[11px] text-on-surface-variant"
                  title={`score ${c.score.toFixed(3)} · ${c.sourceKind}`}
                >
                  {c.title}
                </span>
              ))}
            </div>
          ) : null}
          {message.sql ? (
            <div className="relative overflow-hidden rounded-lg border border-sand/40 bg-surface-container-lowest p-md">
              <span className="absolute top-0 right-0 rounded-bl-lg bg-secondary-container px-sm py-xs font-label text-[10px] tracking-widest text-primary">
                SQL
              </span>
              <pre className="overflow-x-auto font-label text-xs whitespace-pre-wrap text-primary">
                {message.sql}
              </pre>
              <button
                type="button"
                className="mt-sm rounded-lg bg-secondary-container px-sm py-xs font-label text-[11px] text-on-secondary-container hover:bg-primary-container hover:text-on-primary"
                onClick={() => void navigator.clipboard.writeText(message.sql!)}
              >
                Copy SQL
              </button>
            </div>
          ) : null}
          {message.jobDraft ? (
            <div className="rounded-xl border border-primary/20 bg-surface-container-low p-md">
              <p className="font-label text-[11px] tracking-widest text-primary">
                Job draft · {message.jobDraft.status}
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
                    className="rounded-lg bg-secondary-container px-sm py-xs font-label text-[11px] text-on-secondary-container"
                  >
                    Open in Jobs
                  </Link>
                ) : onSaveJob ? (
                  <button
                    type="button"
                    onClick={onSaveJob}
                    className="rounded-lg bg-primary-container px-sm py-xs font-label text-[11px] text-on-primary"
                  >
                    Save to Jobs
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {message.citations && message.citations.length > 0 ? (
            <p className="font-label text-[11px] text-on-surface-variant/60">
              Cited: {message.citations.slice(0, 10).join(' · ')}
            </p>
          ) : null}
        </div>
        <span className="ml-1 font-label text-[12px] text-on-surface-variant/60">
          Assistant · {message.at}
          {message.mode ? ` · ${message.mode}` : ''}
          {message.model ? ` · ${message.model}` : ''}
        </span>
      </div>
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

function PaperclipIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21.44 11.05 12.1 20.4a5.5 5.5 0 0 1-7.78-7.78l9.9-9.9a3.5 3.5 0 0 1 4.95 4.95l-9.9 9.9a1.5 1.5 0 1 1-2.12-2.12l8.49-8.48" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v4" />
      <path d="M8 22h8" />
    </svg>
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
    <p className="font-body text-[13px] leading-snug text-on-surface whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="rounded bg-secondary-container px-1 text-[12px] text-primary">
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
