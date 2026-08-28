import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import {
  AssistantLandingLayout,
} from '@/components/assistant/AssistantLandingLayout'
import { LandingComposer } from '@/components/assistant/LandingComposer'
import { PdfPageHeader, PdfGhostButton } from '@/components/pdf/PdfUi'
import { ChatLiveResults } from '@/components/chat/ChatLiveResults'
import { ChatContextSidebar } from '@/components/chat/ChatContextSidebar'
import { ChatSsmRouteChip } from '@/components/chat/ChatSsmRouteChip'
import { ChatHistorySidebar } from '@/components/chat/ChatHistorySidebar'
import {
  ChatAudienceSelect,
  loadChatAudience,
  saveChatAudience,
  type ChatAudience,
} from '@/components/chat/ChatAudienceSelect'
import { CHAT } from '@/components/chat/chatUi'
import { SqlHighlight } from '@/components/code/SqlHighlight'
import { OpenInManagedPlaneButton } from '@/components/plane/OpenInManagedPlaneButton'
import { RunInWarehouseButton } from '@/components/warehouse/RunInWarehouseButton'
import { ChatPlaneBoundaryCard } from '@/components/chat/ChatPlaneBoundaryCard'
import {
  OutcomePlanCard,
  detectOutcomeFollowUp,
  looksLikeOutcomePrompt,
  stripOutcomeSlash,
} from '@/components/outcome/OutcomePlanCard'
import {
  AgentPlanCard,
  detectAgentFollowUp,
} from '@/components/agent/AgentPlanCard'
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
  createOutcomeApi,
  createShipDraftApi,
  fetchAgentSessions,
  agentCheckpointApi,
  fetchAiStatus,
  fetchSchemaContext,
  reindexAi,
  refreshOutcomeApi,
  runOutcomeStepApi,
  advanceOutcomeAgentApi,
  sendChatFeedback,
  sendChatMessage,
  createChatSessionApi,
  fetchChatSessions,
  fetchChatSessionTurns,
  updateChatSessionApi,
  deleteChatSessionApi,
  type ChatSessionRecord,
  type ChatSessionTurn,
  type AiStatus,
  type AgentSession,
  type ChatJobDraft,
  type ChatMessage,
  type ChatPlaneScope,
  type ChatLiveQueryResult,
  type ChatReferencedTable,
  type ContextPackSummary,
  type ChatGraphContext,
  type OutcomeRecord,
  type RetrievedChunk,
  type SamplePreview,
} from '@/services/stitchApi'
import { useQueAgentOptional } from '@/context/QueAgentContext'
import { subscribeSchemaChanged } from '@/utils/schemaChangeBus'

function loadActiveChatSessionId(workspaceId: string): string | null {
  try {
    return localStorage.getItem(`que.chatSession.${workspaceId}`)
  } catch {
    return null
  }
}

function saveActiveChatSessionId(workspaceId: string, sessionId: string | null) {
  try {
    const key = `que.chatSession.${workspaceId}`
    if (sessionId) localStorage.setItem(key, sessionId)
    else localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

function turnsToUiMessages(turns: ChatSessionTurn[]): UiMessage[] {
  return turns.map((t) => ({
    id: t.id,
    role: t.role,
    content: t.content,
    sql: t.sql ?? null,
    mode: t.mode ?? undefined,
    model: t.model ?? null,
    audience:
      t.audience === 'engineer' || t.audience === 'ceo'
        ? t.audience
        : undefined,
    at: new Date(t.at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    }),
  }))
}

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
  /** Inline Outcome plan card (same chat thread) */
  outcome?: OutcomeRecord | null
  /** Inline Stitch Agent plan (HITL checkpoints) */
  agentSession?: AgentSession | null
  planeScope?: ChatPlaneScope
  planeScopeHint?: string | null
  /** Original user question — for Managed Plane NLP handoff */
  planeHandoffQuestion?: string | null
  liveQuery?: ChatLiveQueryResult | null
  systemNotes?: string | null
  audience?: ChatAudience
  graphContext?: ChatGraphContext | null
}

/**
 * Single assistant chat — schema Q&A, Outcome plans, and Stitch Agent HITL.
 */
export function ChatPage() {
  const { canWrite } = useWorkspaceRole()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { workspaceId, workspaces, user } = useAuth()
  const workspaceName =
    workspaces.find((w) => w.id === workspaceId)?.name || 'Workspace'
  const firstName =
    user?.displayName?.trim().split(/\s+/)[0] ||
    user?.email?.split('@')[0] ||
    'there'
  const { pushToast } = useToast()
  const queAgentCtx = useQueAgentOptional()
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [activeOutcomeId, setActiveOutcomeId] = useState<string | null>(null)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
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
  const [chatAudience, setChatAudience] = useState<ChatAudience>(() =>
    loadChatAudience(),
  )
  const [chatSessions, setChatSessions] = useState<ChatSessionRecord[]>([])
  const [archivedChatSessions, setArchivedChatSessions] = useState<
    ChatSessionRecord[]
  >([])
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(
    null,
  )
  const [historyOpen, setHistoryOpen] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)

  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<{
    stop: () => void
    abort?: () => void
  } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const allTables = context?.tables ?? []

  const lastProbeMessage = useMemo(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    return lastUser?.content?.trim() || ''
  }, [messages])

  const latestGraphContext = useMemo(() => {
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant' && m.graphContext?.ssmRouting)
    return lastAssistant?.graphContext ?? null
  }, [messages])

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

  const reloadChatSessions = useCallback(async () => {
    if (!workspaceId) return
    setHistoryLoading(true)
    try {
      const [active, archived] = await Promise.all([
        fetchChatSessions('active', workspaceId),
        fetchChatSessions('archived', workspaceId),
      ])
      setChatSessions(active)
      setArchivedChatSessions(archived)
    } catch {
      setChatSessions([])
      setArchivedChatSessions([])
    } finally {
      setHistoryLoading(false)
    }
  }, [workspaceId])

  const openChatSession = useCallback(
    async (sessionId: string) => {
      if (!workspaceId) return
      try {
        const { session, turns } = await fetchChatSessionTurns(
          sessionId,
          workspaceId,
        )
        setActiveChatSessionId(session.id)
        saveActiveChatSessionId(workspaceId, session.id)
        setChatAudience(session.audience)
        saveChatAudience(session.audience)
        setMessages(turnsToUiMessages(turns))
        setFocusTables([])
        setActiveMentions([])
        setActiveOutcomeId(null)
        setActiveAgentId(null)
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : 'Could not load chat',
          'error',
        )
      }
    },
    [workspaceId, pushToast],
  )

  const agentBootDone = useRef(false)

  useEffect(() => {
    agentBootDone.current = false
    setActiveOutcomeId(null)
    setActiveAgentId(null)
    void reloadContext()
    void reloadAiStatus()
    void reloadChatSessions()

    const saved = loadActiveChatSessionId(workspaceId)
    if (saved) {
      void openChatSession(saved).catch(() => {
        setMessages([])
        setActiveChatSessionId(null)
        saveActiveChatSessionId(workspaceId, null)
      })
    } else {
      setMessages([])
      setActiveChatSessionId(null)
    }
  }, [workspaceId, reloadContext, reloadAiStatus, reloadChatSessions, openChatSession])

  useEffect(() => {
    const q = searchParams.get('q')
    if (q?.trim()) setInput(q.trim())
  }, [searchParams])

  useEffect(() => {
    const wantAgent =
      searchParams.get('agent') === '1' || searchParams.get('agent') === 'true'
    if (!wantAgent || agentBootDone.current) return
    agentBootDone.current = true
    void (async () => {
      try {
        const list = await fetchAgentSessions()
        const open =
          list.find((s) => s.checkpoints.some((c) => c.status === 'open')) ||
          list[0]
        if (open) {
          setActiveAgentId(open.id)
          setMessages([
            {
              id: `ag-boot-${open.id}`,
              role: 'assistant',
              content:
                'Resumed Que Agent plan in this chat. Approve checkpoints here — Promote joins stays HITL.',
              agentSession: open,
              mode: 'agent',
              at: stamp(),
            },
          ])
        } else {
          setInput(
            'Create a job joining my connected tables and materialize as a new table',
          )
        }
      } catch {
        setInput(
          'Create a job joining my connected tables and materialize as a new table',
        )
      } finally {
        const next = new URLSearchParams(searchParams)
        next.delete('agent')
        setSearchParams(next, { replace: true })
      }
    })()
  }, [searchParams, setSearchParams])

  function stamp() {
    return new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function latestOutcomeFromMessages(list: UiMessage[]): OutcomeRecord | null {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].outcome) return list[i].outcome!
    }
    return null
  }

  function latestAgentFromMessages(list: UiMessage[]): AgentSession | null {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].agentSession) return list[i].agentSession!
    }
    return null
  }

  function upsertOutcomeMessage(outcome: OutcomeRecord, content: string) {
    setActiveOutcomeId(outcome.id)
    setMessages((prev) => {
      const idx = [...prev]
        .map((m, i) => (m.outcome?.id === outcome.id ? i : -1))
        .filter((i) => i >= 0)
        .pop()
      const nextMsg: UiMessage = {
        id: idx != null ? prev[idx].id : `o-${Date.now()}`,
        role: 'assistant',
        content,
        outcome,
        mode: 'outcome',
        audience: 'engineer',
        at: stamp(),
      }
      if (idx == null) return [...prev, nextMsg]
      const copy = [...prev]
      copy[idx] = nextMsg
      return copy
    })
  }

  function upsertAgentMessage(session: AgentSession, content: string) {
    setActiveAgentId(session.id)
    setMessages((prev) => {
      const idx = [...prev]
        .map((m, i) => (m.agentSession?.id === session.id ? i : -1))
        .filter((i) => i >= 0)
        .pop()
      const nextMsg: UiMessage = {
        id: idx != null ? prev[idx].id : `ag-${Date.now()}`,
        role: 'assistant',
        content,
        agentSession: session,
        mode: 'agent',
        audience: 'engineer',
        at: stamp(),
      }
      if (idx == null) return [...prev, nextMsg]
      const copy = [...prev]
      copy[idx] = nextMsg
      return copy
    })
  }

  async function runAgentAction(
    action: 'approve' | 'reject' | 'continue_after_promote' | 'refresh',
    sessionId?: string | null,
  ) {
    const id =
      sessionId ||
      activeAgentId ||
      latestAgentFromMessages(messages)?.id ||
      null
    if (!id || (!canWrite && action !== 'refresh')) {
      setBusy(false)
      return
    }
    setBusy(true)
    try {
      if (action === 'refresh') {
        const list = await fetchAgentSessions()
        const session = list.find((s) => s.id === id)
        if (session) {
          upsertAgentMessage(session, 'Agent plan refreshed.')
        }
        return
      }
      const current =
        latestAgentFromMessages(messages)?.id === id
          ? latestAgentFromMessages(messages)
          : null
      const open = current?.checkpoints.find((c) => c.status === 'open')
      const session = await agentCheckpointApi(id, {
        action,
        checkpointId: open?.id,
      })
      upsertAgentMessage(
        session,
        action === 'approve'
          ? 'Plan approved — agent continues tools (HITL Promote still required for joins).'
          : action === 'reject'
            ? 'Plan rejected.'
            : 'Continued after Promote checkpoint.',
      )
      pushToast(`Agent · ${action}`, 'success')
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Agent action failed',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  async function runOutcomeAction(
    action: 'refresh' | 'infer' | 'next' | 'approve' | 'advance' | 'ship',
    outcomeId?: string | null,
  ) {
    const id =
      outcomeId ||
      activeOutcomeId ||
      latestOutcomeFromMessages(messages)?.id ||
      null
    if (!id || !canWrite) {
      setBusy(false)
      return
    }
    setBusy(true)
    try {
      if (action === 'ship') {
        const current =
          latestOutcomeFromMessages(messages) ||
          (await refreshOutcomeApi(id))
        const hint = current.plan?.steps?.find((s) => s.kind === 'chart')
          ?.chartHint
        const ship = await createShipDraftApi({
          title: hint?.title || current.prompt.slice(0, 80),
          outcomeId: id,
          chartType: hint?.chartType || 'bar',
          description: current.prompt,
        })
        pushToast('Ship draft created', 'success')
        window.location.href = `/ship?id=${ship.id}`
        return
      }
      if (action === 'refresh') {
        const outcome = await refreshOutcomeApi(id)
        upsertOutcomeMessage(outcome, 'Plan refreshed from live schema.')
        return
      }
      if (action === 'infer') {
        const out = await runOutcomeStepApi(id, {
          stepId: 'joins',
          inferJoins: true,
        })
        if (out.outcome) {
          upsertOutcomeMessage(
            out.outcome,
            'Inferred joins (HITL Promote still required for Yellow/Red).',
          )
        }
        return
      }
      if (action === 'next') {
        const out = await runOutcomeStepApi(id, { stepId: 'auto' })
        if (out.outcome) {
          upsertOutcomeMessage(
            out.outcome,
            `Ran step “${out.stepId}”. Continue with Promote / Ship when ready.`,
          )
        }
        const shipAction = (out.actions || []).find(
          (a) =>
            a &&
            typeof a === 'object' &&
            (a as { tool?: string }).tool === 'ship_draft' &&
            (a as { href?: string }).href,
        ) as { href?: string } | undefined
        if (shipAction?.href) {
          window.location.href = shipAction.href
        }
        return
      }
      if (action === 'approve' || action === 'advance') {
        const out = await advanceOutcomeAgentApi(id, {
          approvePlan: action === 'approve',
        })
        if (out.outcome) {
          upsertOutcomeMessage(
            out.outcome,
            out.needsHitl
              ? 'HITL gate — Promote joins or approve the agent plan.'
              : `Agent · ${out.session?.status || 'ok'}`,
          )
        }
      }
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Outcome action failed',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

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
    const el = messagesScrollRef.current
    if (!el || !stickToBottomRef.current) return
    el.scrollTo({
      top: el.scrollHeight,
      behavior: busy ? 'auto' : 'smooth',
    })
  }, [messages, busy])

  const onMessagesScroll = useCallback(() => {
    const el = messagesScrollRef.current
    if (!el) return
    stickToBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 96
  }, [])

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

    stickToBottomRef.current = true

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

    // Stitch Agent follow-ups (prefer over Outcome when an agent card is active)
    const agentFollow = detectAgentFollowUp(message)
    const currentAgent =
      (activeAgentId
        ? latestAgentFromMessages([...messages, userMsg])
        : null) || latestAgentFromMessages(messages)
    if (agentFollow && (activeAgentId || currentAgent?.id)) {
      await runAgentAction(agentFollow, activeAgentId || currentAgent?.id)
      return
    }

    // Outcome follow-ups in the same thread
    const follow = detectOutcomeFollowUp(message)
    const currentOutcome =
      (activeOutcomeId
        ? latestOutcomeFromMessages([...messages, userMsg])
        : null) || latestOutcomeFromMessages(messages)
    if (follow && (activeOutcomeId || currentOutcome?.id)) {
      const map = {
        run_next: 'next',
        infer_joins: 'infer',
        ship: 'ship',
        approve_agent: 'approve',
        advance_agent: 'advance',
      } as const
      await runOutcomeAction(map[follow], activeOutcomeId || currentOutcome?.id)
      return
    }

    // Outcome plan build in the same thread
    if (looksLikeOutcomePrompt(message)) {
      setChatAudience('engineer')
      saveChatAudience('engineer')
      try {
        const promptText =
          stripOutcomeSlash(message) ||
          'I want a trusted stitch outcome from connected sources'
        const outcome = await createOutcomeApi(promptText)
        upsertOutcomeMessage(
          outcome,
          'Outcome plan ready. Review steps below — Promote stays HITL for Yellow/Red.',
        )
        pushToast('Outcome plan built in chat', 'success')
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            content: `Outcome failed: ${err instanceof Error ? err.message : String(err)}`,
            at: stamp(),
          },
        ])
      } finally {
        setBusy(false)
      }
      return
    }

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

    let sessionId = activeChatSessionId
    if (!sessionId) {
      const created = await createChatSessionApi(
        { audience: chatAudience },
        workspaceId,
      )
      sessionId = created.id
      setActiveChatSessionId(created.id)
      saveActiveChatSessionId(workspaceId, created.id)
      setChatSessions((prev) => [created, ...prev])
    }

    try {
      const res = await sendChatMessage(message, history, workspaceId, {
        signal: ctrl.signal,
        mentions,
        modelId: modelId || undefined,
        sessionId,
        audience: chatAudience,
        pageContext: queAgentCtx?.pageContext as Record<string, unknown>,
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
        planeScope: res.planeScope ?? 'in_scope',
        planeScopeHint: res.planeScopeHint ?? null,
        planeHandoffQuestion: message,
        liveQuery: res.liveQuery ?? null,
        systemNotes: res.systemNotes ?? null,
        audience: (res.audience as ChatAudience) ?? chatAudience,
        agentSession: res.agentSession ?? null,
        graphContext: res.graphContext ?? null,
        feedback: null,
        at: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }
      setMessages((prev) => [...prev, assistant])
      if (res.agentSession?.id) {
        setActiveAgentId(res.agentSession.id)
      }
      if (res.biReport?.reportId) {
        pushToast('Report built', 'success')
        navigate(`/bi?report=${encodeURIComponent(res.biReport.reportId)}`)
      } else if (res.agentSession?.result?.jobId) {
        pushToast('Job ready', 'success')
      }
      if (res.sql) {
        window.dispatchEvent(new CustomEvent('que-plane-activity'))
      }
      if (res.referencedTables?.length) {
        setFocusTables(res.referencedTables)
      }
      await reloadContext({ quiet: true })
      void reloadAiStatus()
      void reloadChatSessions()
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

  async function startNewChat() {
    if (!canWrite || !workspaceId) return
    try {
      const created = await createChatSessionApi(
        { audience: chatAudience },
        workspaceId,
      )
      setActiveChatSessionId(created.id)
      saveActiveChatSessionId(workspaceId, created.id)
      setChatSessions((prev) => [created, ...prev.filter((s) => s.id !== created.id)])
      setMessages([])
      setFocusTables([])
      setActiveMentions([])
      setActiveOutcomeId(null)
      setActiveAgentId(null)
      setInput('')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not start chat', 'error')
    }
  }

  async function archiveChatSession(sessionId: string) {
    if (!canWrite || !workspaceId) return
    try {
      await updateChatSessionApi(sessionId, { status: 'archived' }, workspaceId)
      if (activeChatSessionId === sessionId) {
        setActiveChatSessionId(null)
        saveActiveChatSessionId(workspaceId, null)
        setMessages([])
      }
      await reloadChatSessions()
      pushToast('Chat archived', 'success')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Archive failed', 'error')
    }
  }

  async function deleteChatSessionById(sessionId: string) {
    if (!canWrite || !workspaceId) return
    try {
      await deleteChatSessionApi(sessionId, workspaceId)
      if (activeChatSessionId === sessionId) {
        setActiveChatSessionId(null)
        saveActiveChatSessionId(workspaceId, null)
        setMessages([])
      }
      await reloadChatSessions()
      pushToast('Chat deleted', 'success')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Delete failed', 'error')
    }
  }

  async function restoreChatSession(sessionId: string) {
    if (!canWrite || !workspaceId) return
    try {
      await updateChatSessionApi(sessionId, { status: 'active' }, workspaceId)
      await reloadChatSessions()
      pushToast('Chat restored', 'success')
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Restore failed', 'error')
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

  const isLanding = messages.length === 0 && !busy

  const landingSuggestions = [
    {
      category: 'Schema help',
      title: 'Explore tables and relationships in my workspace',
      onClick: () => void ask('/list'),
    },
    {
      category: 'SQL & joins',
      title: 'Draft SQL or explain how tables connect',
      onClick: () => {
        setInput('/sql ')
        textareaRef.current?.focus()
      },
    },
    {
      category: 'Outcome plan',
      title: 'Build a revenue or metrics plan from connected sources',
      onClick: () =>
        void ask('/outcome I want revenue by region from connected sources'),
    },
  ]

  return (
    <QueAppChrome flush>
      <div className={`flex h-full min-h-0 flex-1 overflow-hidden ${CHAT.page}`}>
        <main
          className={[
            'relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden',
            isLanding ? '' : 'border-r border-solid border-[#424850]',
          ].join(' ')}
        >
          <ChatHistorySidebar
            open={historyOpen}
            onToggle={() => setHistoryOpen((v) => !v)}
            sessions={chatSessions}
            archivedSessions={archivedChatSessions}
            activeSessionId={activeChatSessionId}
            loading={historyLoading}
            canWrite={canWrite}
            onNewChat={() => void startNewChat()}
            onSelectSession={(id) => void openChatSession(id)}
            onArchiveSession={(id) => void archiveChatSession(id)}
            onDeleteSession={(id) => void deleteChatSessionById(id)}
            onRestoreSession={(id) => void restoreChatSession(id)}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {isLanding ? (
            <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto">
              <AssistantLandingLayout
                greeting={`Hey! ${firstName}`}
                headline="What can I help with?"
                suggestions={landingSuggestions.map((s) => ({
                  ...s,
                  disabled: !canWrite,
                }))}
                footer={`${workspaceName} · AI can make mistakes. Verify critical schema changes.`}
                composer={
                  <LandingComposer
                    canWrite={canWrite}
                    busy={busy}
                    input={input}
                    setInput={setInput}
                    composerDragOver={composerDragOver}
                    attachments={attachments}
                    setAttachments={setAttachments}
                    suggestOpen={suggestOpen}
                    suggestions={suggestions}
                    suggestIndex={suggestIndex}
                    setSuggestIndex={setSuggestIndex}
                    pickMention={pickMention}
                    pickSkill={pickSkill}
                    onComposerDragOver={onComposerDragOver}
                    onComposerDragLeave={onComposerDragLeave}
                    onComposerDrop={onComposerDrop}
                    syncTriggerFromCaret={syncTriggerFromCaret}
                    setSuggestOpen={setSuggestOpen}
                    setTrigger={setTrigger}
                    setActiveMentions={setActiveMentions}
                    ask={ask}
                    fileInputRef={fileInputRef}
                    onPickAttachments={onPickAttachments}
                    textareaRef={textareaRef}
                    chatAudience={chatAudience}
                    onChatAudienceChange={(next) => {
                      setChatAudience(next)
                      saveChatAudience(next)
                    }}
                  />
                }
              />
            </div>
          ) : (
            <div className="pdf-chat-thread-grid min-h-0 flex-1">
          <div className="min-h-0 shrink-0 px-[16px] pt-[8px] md:px-[20px] md:pt-[10px]">
          <div className="pdf-chat-column">
          <PdfPageHeader
            compact
            title={
              <span className="inline-flex items-center gap-[6px]">
                <span>Assistant</span>
                <ChatAudienceSelect
                  value={chatAudience}
                  disabled={busy}
                  onChange={(next) => {
                    setChatAudience(next)
                    saveChatAudience(next)
                  }}
                />
              </span>
            }
            subtitle={
              chatAudience === 'ceo'
                ? `Plain-English answers from your live data${busy ? ' · thinking…' : ''}`
                : `Schema, SQL, joins, and pipeline detail${busy ? ' · thinking…' : ''}`
            }
            actions={
              <div className="hidden flex-wrap items-center gap-[8px] sm:flex">
                <PdfGhostButton type="button" onClick={() => setShowSkills((v) => !v)}>
                  Skills
                </PdfGhostButton>
                <PdfGhostButton
                  type="button"
                  disabled={!canWrite || reindexing}
                  onClick={() => {
                    if (reindexing) return
                    void runReindex()
                  }}
                  title="Reindex schema embeddings"
                >
                  {reindexing ? 'Indexing…' : 'Reindex'}
                </PdfGhostButton>
                {busy ? (
                  <PdfGhostButton type="button" onClick={stopAsk} className="text-[#ff6b6b]">
                    Stop
                  </PdfGhostButton>
                ) : null}
                <PdfGhostButton type="button" onClick={() => void startNewChat()}>
                  New chat
                </PdfGhostButton>
              </div>
            }
          />

          {latestGraphContext?.ssmRouting ? (
            <div className="mb-[10px] shrink-0 rounded-[4px] border border-[#424850] bg-[#121619] px-[12px] py-[8px]">
              <p className="mb-[4px] text-[9px] font-bold tracking-[0.7px] text-[#6b7380] uppercase">
                Last answer context
              </p>
              <ChatSsmRouteChip
                variant={chatAudience === 'engineer' ? 'full' : 'ceo'}
                routing={latestGraphContext.ssmRouting}
                intent={latestGraphContext.intent}
                focusTableCount={latestGraphContext.focusTableCount}
                compact
              />
            </div>
          ) : null}

          {showSkills ? (
            <div className={`mb-[12px] shrink-0 p-[14px] ${CHAT.panel}`}>
              <p className="mb-[8px] text-[11px] text-[#a3afbe]">
                Slash skills · type / or click · use @ for tables
              </p>
              <div className="flex flex-wrap gap-[8px]">
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
                    className={CHAT.pill}
                  >
                    <span className={CHAT.accent}>{s.slash}</span>
                    <span className="ml-[8px] text-[#c8cdd3]">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          </div>
          </div>

          <div
            ref={messagesScrollRef}
            onScroll={onMessagesScroll}
            className="pdf-chat-scroll-region pdf-chat-messages min-h-0 px-[16px] py-[12px] md:px-[24px]"
          >
            <div className="pdf-chat-messages-inner space-y-[14px]">
            {messages.map((m) => (
                <ChatBubble
                  key={m.id}
                  message={m}
                  busy={busy}
                  canWrite={canWrite}
                  onOutcomeAction={
                    m.outcome
                      ? (action) =>
                          void runOutcomeAction(action, m.outcome?.id)
                      : undefined
                  }
                  onAgentAction={
                    m.agentSession
                      ? (action) =>
                          void runAgentAction(action, m.agentSession?.id)
                      : undefined
                  }
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
              ))}
            {busy ? (
              <div className="pdf-chat-row pdf-chat-row--assistant">
                <div className={CHAT.avatarAi}>…</div>
                <div className={`${CHAT.bubbleAi} pdf-chat-bubble-content pdf-chat-typing`}>
                  <span className="pdf-chat-typing-dot" />
                  <span className="pdf-chat-typing-dot" />
                  <span className="pdf-chat-typing-dot" />
                  <span className="ml-2 text-[12px] text-[var(--pdf-text-faint)]">
                    Thinking…
                  </span>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
            </div>
          </div>

          <div className="min-h-0 shrink-0 px-[16px] pb-[10px] md:px-[24px]">
            <div className="pdf-chat-column space-y-[8px]">
            {activeMentions.length > 0 ? (
              <div className="flex flex-wrap gap-[6px]">
                {activeMentions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={CHAT.pillAccent}
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

            {chatAudience === 'engineer' ? (
            <div className="pdf-chat-quick-pills">
              <button
                type="button"
                disabled={!canWrite}
                onClick={() =>
                  void ask(
                    '/outcome I want revenue by region from connected sources',
                  )
                }
                className={CHAT.pillAccent}
              >
                Outcome plan
              </button>
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => {
                  setInput('/sql ')
                  textareaRef.current?.focus()
                }}
                className={CHAT.pill}
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
                className={CHAT.pill}
              >
                Explain table
              </button>
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => void ask('/suggested')}
                className={CHAT.pill}
              >
                Visualize joins
              </button>
              <button
                type="button"
                className={CHAT.pill}
                onClick={() => setShowSkills((v) => !v)}
              >
                ···
              </button>
              {canWrite && messages.some((m) => m.role === 'user') ? (
                <button type="button" disabled={busy} onClick={regenerate} className={CHAT.pill}>
                  Regen
                </button>
              ) : null}
            </div>
            ) : null}

            <div className="relative w-full">
              {suggestOpen && suggestions.length > 0 ? (
                <div className="absolute bottom-full left-0 right-0 z-20 mb-xs max-h-56 overflow-y-auto rounded-xl border border-outline-variant/40 bg-surface-container-low">
                  {suggestions.map((s, i) => {
                    const active = i === suggestIndex
                    if (s.kind === 'mention') {
                      return (
                        <button
                          key={s.item.id}
                          type="button"
                          className={`flex w-full items-center justify-between px-md py-sm text-left font-body text-xs ${
                            active
                              ? 'bg-secondary/15 text-on-surface'
                              : 'text-on-surface-variant hover:bg-surface-container-low'
                          }`}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            pickMention(s.item)
                          }}
                        >
                          <span>
                            <span className="font-label text-[10px] text-secondary uppercase">
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
                            ? 'bg-secondary/15 text-on-surface'
                            : 'text-on-surface-variant hover:bg-surface-container-low'
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          pickSkill(s.item)
                        }}
                      >
                        <span>
                          <span className="text-secondary">{s.item.slash}</span>{' '}
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
                  CHAT.composer,
                  composerDragOver ? 'border-[#7aecd0]/45 border-dashed bg-[rgba(122,236,208,0.04)]' : '',
                ].join(' ')}
                onDragOver={onComposerDragOver}
                onDragLeave={onComposerDragLeave}
                onDrop={onComposerDrop}
              >
                {composerDragOver ? (
                  <p className="pointer-events-none absolute inset-x-0 top-2 z-10 text-center font-label text-[10px] font-bold tracking-wide text-secondary">
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
                  rows={1}
                  disabled={!canWrite}
                  placeholder={
                    canWrite
                      ? 'Message Que…'
                      : 'Read-only'
                  }
                  className="pdf-chat-composer-input max-h-24 min-h-[1.5rem] w-full resize-none border-none bg-transparent px-[2px] py-[2px] text-[13px] leading-snug text-[#d4dbe3] outline-none placeholder:text-[#6b7380] disabled:opacity-50"
                />

                <div className="pdf-chat-composer-footer flex flex-wrap items-center gap-[4px]">
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
                    className="pdf-chat-composer-icon disabled:opacity-40"
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
                    className="pdf-chat-composer-icon text-sm font-bold disabled:opacity-40"
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
                    className="pdf-chat-composer-icon font-label text-sm disabled:opacity-40"
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
                      'pdf-chat-composer-icon disabled:opacity-40',
                      listening ? 'text-[#ff6b6b]' : '',
                    ].join(' ')}
                    title={listening ? 'Stop listening' : 'Voice input'}
                    aria-label={listening ? 'Stop voice input' : 'Voice input'}
                    aria-pressed={listening}
                  >
                    <MicIcon />
                  </button>

                  <div className="ml-auto flex items-center gap-[6px]">
                    <select
                      value={modelId}
                      onChange={(e) => setModelId(e.target.value)}
                      disabled={!canWrite || !aiStatus?.models?.length}
                      className="pdf-chat-composer-model max-w-[9rem] truncate outline-none disabled:opacity-40"
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
                    {busy ? (
                      <button
                        type="button"
                        onClick={stopAsk}
                        className="pdf-chat-composer-icon text-[10px] font-semibold"
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
                        className="pdf-chat-composer-send flex shrink-0 items-center justify-center text-[13px] font-bold disabled:opacity-40"
                        aria-label="Send"
                      >
                        →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <p className="pdf-chat-footer-note pb-[6px]">
              AI can make mistakes. Verify critical schema changes.
              {contextError ? ` · ${contextError}` : ''}
            </p>
            </div>
          </div>
            </div>
          )}
          </div>
        </main>

        {!isLanding ? (
          <ChatContextSidebar
            contextRefreshing={contextRefreshing}
            onRefreshContext={() => void reloadContext()}
            modelId={modelId}
            aiStatus={aiStatus}
            sidebarQuery={sidebarQuery}
            onSidebarQueryChange={setSidebarQuery}
            sidebarTables={sidebarTables}
            expandedTables={expandedTables}
            onToggleTableExpand={toggleTableExpand}
            canWrite={canWrite}
            onMentionDragStart={onMentionDragStart}
            onInsertFromSidebar={insertFromSidebar}
            context={context}
            chatAudience={chatAudience}
            lastProbeMessage={lastProbeMessage}
            latestGraphContext={latestGraphContext}
            onAskOutcome={() => {
              void ask(
                '/outcome I want revenue by region from connected sources',
              )
            }}
            onAskAgent={() => {
              void ask(
                '/agent Build trusted customer 360 from connected sources, then draft a stitch job',
              )
            }}
          />
        ) : null}
      </div>
    </QueAppChrome>
  )
}


function ChatBubble({
  message,
  busy,
  canWrite,
  onOutcomeAction,
  onAgentAction,
  onSaveJob,
  onCopy,
  onInsertMention,
  onFeedback,
}: {
  message: UiMessage
  busy?: boolean
  canWrite?: boolean
  onOutcomeAction?: (
    action: 'refresh' | 'infer' | 'next' | 'approve' | 'advance' | 'ship',
  ) => void
  onAgentAction?: (
    action: 'approve' | 'reject' | 'continue_after_promote' | 'refresh',
  ) => void
  onSaveJob?: () => void
  onCopy?: () => void
  onInsertMention?: (token: string) => void
  onFeedback?: (rating: 1 | -1) => void
}) {
  const isEngineer = (message.audience ?? 'ceo') === 'engineer'

  if (message.role === 'user') {
    return (
      <div className="pdf-chat-row pdf-chat-row--user">
        <div className={`${CHAT.bubbleUser} pdf-chat-bubble-content pdf-chat-bubble-content--boxed`}>
          <p className="pdf-chat-message-text whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="pdf-chat-row pdf-chat-row--assistant">
      <div className={CHAT.avatarAi} aria-hidden>
        Q
      </div>
      <div className="pdf-chat-assistant-body min-w-0 flex-1 space-y-[8px]">
        <div className={`${CHAT.bubbleAi} pdf-chat-bubble-content space-y-[8px]`}>
          {!isEngineer ? null : (
          <div className="pdf-chat-toolbar">
            {onCopy ? (
              <button type="button" onClick={onCopy} className="pdf-chat-tool-btn">
                Copy
              </button>
            ) : null}
            {onFeedback ? (
              <>
                <button
                  type="button"
                  disabled={message.feedback === 1}
                  onClick={() => onFeedback(1)}
                  className="pdf-chat-tool-btn"
                >
                  Good
                </button>
                <button
                  type="button"
                  disabled={message.feedback === -1}
                  onClick={() => onFeedback(-1)}
                  className="pdf-chat-tool-btn pdf-chat-tool-btn--muted"
                >
                  Bad
                </button>
              </>
            ) : null}
          </div>
          )}
          <AssistantBody text={message.content} compact={!isEngineer} />
          {message.graphContext?.ssmRouting ? (
            <ChatSsmRouteChip
              variant={isEngineer ? 'full' : 'ceo'}
              routing={message.graphContext.ssmRouting}
              intent={message.graphContext.intent}
              focusTableCount={message.graphContext.focusTableCount}
              compact={!isEngineer}
            />
          ) : null}
          {isEngineer && message.systemNotes ? (
            <details className="pdf-chat-system-notes">
              <summary>Schema alerts</summary>
              <AssistantBody text={message.systemNotes} />
            </details>
          ) : null}
          {message.liveQuery ? (
            <ChatLiveResults liveQuery={message.liveQuery} />
          ) : null}
          {message.sql || message.liveQuery?.sql ? (
            <RunInWarehouseButton
              sql={message.sql || String(message.liveQuery?.sql || '')}
              compact
              showResults={!message.liveQuery?.ok}
            />
          ) : null}
          {isEngineer && message.planeScope && message.planeScope !== 'in_scope' ? (
            <ChatPlaneBoundaryCard
              scope={message.planeScope}
              hint={message.planeScopeHint}
              sql={message.sql}
              question={message.planeHandoffQuestion}
            />
          ) : null}
          {isEngineer && message.outcome ? (
            <OutcomePlanCard
              outcome={message.outcome}
              busy={busy}
              canWrite={canWrite}
              onRefresh={
                onOutcomeAction ? () => onOutcomeAction('refresh') : undefined
              }
              onInferJoins={
                onOutcomeAction ? () => onOutcomeAction('infer') : undefined
              }
              onRunNext={
                onOutcomeAction ? () => onOutcomeAction('next') : undefined
              }
              onApproveAgent={
                onOutcomeAction ? () => onOutcomeAction('approve') : undefined
              }
              onAdvanceAgent={
                onOutcomeAction ? () => onOutcomeAction('advance') : undefined
              }
              onShip={
                onOutcomeAction ? () => onOutcomeAction('ship') : undefined
              }
            />
          ) : null}
          {message.agentSession ? (
            <AgentPlanCard
              session={message.agentSession}
              busy={busy}
              canWrite={canWrite}
              compact={!isEngineer}
              onRefresh={
                onAgentAction ? () => onAgentAction('refresh') : undefined
              }
              onApprove={
                onAgentAction ? () => onAgentAction('approve') : undefined
              }
              onReject={
                onAgentAction ? () => onAgentAction('reject') : undefined
              }
              onContinueAfterPromote={
                onAgentAction
                  ? () => onAgentAction('continue_after_promote')
                  : undefined
              }
            />
          ) : null}
          {isEngineer &&
          message.referencedTables &&
          message.referencedTables.length > 0 ? (
            <div className="my-md flex flex-col items-stretch gap-lg rounded-lg border border-outline-variant bg-surface-container-low/50 p-md md:flex-row md:items-center">
              <div className="flex w-full flex-col items-center gap-sm md:w-1/3">
                {message.referencedTables.slice(0, 2).map((t, i) => (
                  <div key={`${t.connection}-${t.name}`} className="w-full">
                    {i > 0 ? (
                      <p className="mb-sm text-center font-label text-secondary">
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
                          c.keyKind === 'pk' ? 'bg-secondary' : 'bg-tertiary'
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
                      className="rounded-full border border-outline-variant px-sm py-xs font-label text-[11px] text-secondary hover:bg-secondary/15 disabled:opacity-40"
                    >
                      @{t.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          {isEngineer && message.sql ? (
            <div className="relative overflow-hidden rounded-[4px] border border-solid border-[#424850] bg-[#0d1117] p-[12px]">
              <span className="absolute top-0 right-0 rounded-bl-[4px] border-b border-l border-solid border-[#424850] bg-[#121619] px-[8px] py-[4px] text-[9px] font-bold tracking-[0.6px] text-[#7aecd0] uppercase">
                SQL
              </span>
              <SqlHighlight code={message.sql} />
              <div className="mt-[8px] flex flex-wrap gap-[8px]">
                <button
                  type="button"
                  className="pdf-btn-ghost px-[10px] py-[4px] text-[11px]"
                  onClick={() => void navigator.clipboard.writeText(message.sql!)}
                >
                  Copy SQL
                </button>
                <OpenInManagedPlaneButton
                  sql={message.sql}
                  detail={message.content.slice(0, 200)}
                  compact
                />
                <RunInWarehouseButton sql={message.sql} compact showResults={false} />
              </div>
              <p className="mt-[6px] text-[10px] text-[var(--pdf-text-faint)]">
                Read-only · max 20 rows · results shown above are not sent to the AI model.
              </p>
            </div>
          ) : null}
          {isEngineer ? (
          <VerifyScrubbedSamples
            previews={message.samplePreviews}
            hasSql={Boolean(message.sql)}
            hasTables={Boolean(message.referencedTables?.length)}
          />
          ) : null}
          {isEngineer && message.retrievedChunks && message.retrievedChunks.length > 0 ? (
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
          {isEngineer && message.jobDraft ? (
            <div className="rounded-xl border border-secondary/25 bg-surface-container-low p-md">
              <p className="font-label text-[11px] tracking-widest text-secondary">
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
                    className="rounded-lg bg-secondary px-sm py-xs font-label text-[11px] text-on-secondary"
                  >
                    Save to Jobs
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {isEngineer && message.citations && message.citations.length > 0 ? (
            <p className="font-label text-[11px] text-on-surface-variant/60">
              Cited: {message.citations.slice(0, 10).join(' · ')}
            </p>
          ) : null}
        </div>
        <span className={CHAT.meta}>
          {isEngineer ? (message.mode ? message.mode : 'engineer') : 'ceo'}
          {message.model && isEngineer ? ` · ${message.model}` : ''}
        </span>
      </div>
    </div>
  )
}


function VerifyScrubbedSamples({
  previews,
  hasSql,
  hasTables,
}: {
  previews?: SamplePreview[]
  hasSql?: boolean
  hasTables?: boolean
}) {
  const [open, setOpen] = useState(false)
  const list = (previews || [])
    .map((p) => ({
      ...p,
      rows: (p.rows || []).slice(0, 10),
      rowCount: Math.min(p.rowCount || p.rows?.length || 0, 10),
    }))
    .filter((p) => p.columns?.length)

  // Show control after query-ish answers (SQL, tables, or attached samples)
  if (!list.length && !hasSql && !hasTables) return null

  return (
    <div className="rounded-lg border border-secondary/30 bg-secondary/5 p-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div>
          <p className="font-label text-[11px] font-semibold text-secondary">
            Verify rows
          </p>
          <p className="mt-0.5 text-[11px] text-on-surface-variant">
            Scrubbed samples only (5–10 rows) — not the lake / not full managed
            data.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded bg-secondary px-md py-1.5 font-label text-[11px] font-semibold text-on-secondary"
        >
          {open
            ? 'Hide samples'
            : list.length
              ? 'Show scrubbed samples'
              : 'Verify data shape'}
        </button>
      </div>
      {open ? (
        <div className="mt-md space-y-md">
          {list.length > 0 ? (
            list.map((p) => (
              <SamplePreviewTable key={p.table} preview={p} capped />
            ))
          ) : (
            <p className="text-[12px] text-on-surface-variant">
              No scrubbed sample grid on this reply yet. Mention a table with{' '}
              <span className="font-mono text-secondary">@table</span> or ask to
              describe it — Que attaches 5–10 pinned/schema sample rows when
              available. Full row certify stays on Jobs → Results.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function SamplePreviewTable({
  preview,
  capped = false,
}: {
  preview: SamplePreview
  capped?: boolean
}) {
  const cols = preview.columns
  const rows = (preview.rows || []).slice(0, 10)
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
          {rows.length} ROW{rows.length === 1 ? '' : 'S'} · SCRUBBED 5–10 MAX
          {capped ? ' · VERIFY' : ''}
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
            {rows.map((row, ri) => (
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
        {preview.note ||
          'Pinned / schema scrubbed samples only — never full warehouse or managed custody for AI.'}
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

function AssistantBody({ text, compact }: { text: string; compact?: boolean }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return (
    <div
      className={[
        'pdf-chat-message-text whitespace-pre-wrap',
        compact ? 'pdf-chat-message-text--ceo' : '',
      ].join(' ')}
    >
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="rounded bg-secondary-container/60 px-1 text-[12px] text-secondary">
              {part.slice(1, -1)}
            </code>
          )
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold text-on-surface">
              {part.slice(2, -2)}
            </strong>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </div>
  )
}

export default ChatPage
