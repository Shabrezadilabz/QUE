import { useCallback, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  type ChatAudience,
} from '@/components/chat/ChatAudienceSelect'
import { AgentPlanCard } from '@/components/agent/AgentPlanCard'
import { useQueAgentOptional } from '@/context/QueAgentContext'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  agentCheckpointApi,
  queAgentActApi,
  sendChatMessage,
  type AgentSession,
  type ChatMessage,
} from '@/services/stitchApi'
import './QueGenieAgent.css'

const GENIE_ICON = '/que-genie-icon.svg'

/** Side sparkle particles — staggered CSS animation delays */
const SPRINKLE_DELAYS = [0, 0.35, 0.7, 1.05, 0.2, 0.55, 0.9, 1.25]

type GenieMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  agentSession?: AgentSession | null
}

function GenieSprinkles({ side }: { side: 'left' | 'right' }) {
  return (
    <span
      className={`que-genie-sprinkles que-genie-sprinkles--${side}`}
      aria-hidden
    >
      {SPRINKLE_DELAYS.map((delay, i) => (
        <span
          key={`${side}-${i}`}
          className="que-genie-spark"
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  )
}

/**
 * Floating Que Genie — cross-page agent with current page + chat context.
 */
export function QueGenieAgent() {
  const ctx = useQueAgentOptional()
  const navigate = useNavigate()
  const location = useLocation()
  const { canWrite } = useWorkspaceRole()
  const [open, setOpen] = useState(false)
  /** Full Chat page already has composer — hide FAB so it does not cover Send. */
  const hideOnChat = location.pathname.startsWith('/chat')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<GenieMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'I am your Que Genie. Ask me to create jobs, combine tables, materialize, edit jobs, or build BI — from any page.',
    },
  ])
  const [audience] = useState<ChatAudience>('engineer')
  const panelRef = useRef<HTMLDivElement>(null)

  const runCheckpoint = useCallback(
    async (sessionId: string, action: string) => {
      const session = await agentCheckpointApi(sessionId, { action })
      setMessages((prev) =>
        prev.map((m) =>
          m.agentSession?.id === sessionId
            ? { ...m, agentSession: session, content: m.content }
            : m,
        ),
      )
      const last = messages[messages.length - 1]
      if (last?.agentSession?.id === sessionId) {
        setMessages((prev) => {
          const copy = [...prev]
          const idx = copy.findIndex((m) => m.agentSession?.id === sessionId)
          if (idx >= 0) copy[idx] = { ...copy[idx], agentSession: session }
          return copy
        })
      }
      return session
    },
    [messages],
  )

  const submit = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setBusy(true)
    const userMsg: GenieMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    }
    setMessages((prev) => [...prev, userMsg])

    const history: ChatMessage[] = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const pageContext = ctx?.pageContext ?? { route: '/', pageId: 'app' }
      const res = await sendChatMessage(text, history, undefined, {
        audience,
        pageContext,
      })
      const assistant: GenieMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: res.reply,
        agentSession: res.agentSession ?? null,
      }
      setMessages((prev) => [...prev, assistant])

      if (res.biReport?.reportId) {
        navigate(`/bi?report=${encodeURIComponent(res.biReport.reportId)}`)
      } else if (res.agentSession?.result?.jobId) {
        navigate(`/jobs/${String(res.agentSession.result.jobId)}/notebook`)
      }
    } catch (err) {
      try {
        const out = await queAgentActApi({
          message: text,
          audience,
          pageContext: ctx?.pageContext,
        })
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: out.reply,
            agentSession: out.agentSession ?? null,
          },
        ])
      } catch (inner) {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            content: `Could not run: ${inner instanceof Error ? inner.message : String(inner)}`,
          },
        ])
      }
    } finally {
      setBusy(false)
    }
  }, [input, busy, messages, ctx?.pageContext, audience, navigate])

  if (!canWrite || !ctx || hideOnChat) return null

  return (
    <>
      <div
        className={`que-genie-anchor ${open ? 'que-genie-anchor--open' : ''}`}
      >
        <GenieSprinkles side="left" />
        <button
          type="button"
          className={`que-genie-fab ${open ? 'que-genie-fab--open' : ''}`}
          aria-label="Que Genie assistant"
          title="Que Genie — build jobs, tables, BI from anywhere"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="que-genie-float" aria-hidden>
            <span className="que-genie-glow" />
            <span className="que-genie-mist que-genie-mist--1" />
            <span className="que-genie-mist que-genie-mist--2" />
            <img
              src={GENIE_ICON}
              alt=""
              className="que-genie-icon"
              width={36}
              height={36}
              draggable={false}
            />
          </span>
        </button>
        <GenieSprinkles side="right" />
      </div>

      {open ? (
        <div className="que-genie-panel" ref={panelRef} role="dialog" aria-label="Que Genie">
          <div className="que-genie-panel__head">
            <div className="que-genie-panel__head-main">
              <img
                src={GENIE_ICON}
                alt=""
                className="que-genie-panel__icon"
                width={28}
                height={28}
              />
              <div>
                <p className="que-genie-panel__title">Que Genie</p>
                <p className="que-genie-panel__ctx">
                  {ctx.pageContext.pageId} · {ctx.pageContext.route.slice(0, 48)}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="que-genie-panel__close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="que-genie-panel__msgs">
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === 'user'
                    ? 'que-genie-msg que-genie-msg--user'
                    : 'que-genie-msg que-genie-msg--bot'
                }
              >
                <p className="whitespace-pre-wrap text-[12px]">{m.content}</p>
                {m.agentSession ? (
                  <AgentPlanCard
                    session={m.agentSession}
                    busy={busy}
                    canWrite={canWrite}
                    onApprove={() =>
                      void runCheckpoint(m.agentSession!.id, 'approve_plan')
                    }
                    onReject={() =>
                      void runCheckpoint(m.agentSession!.id, 'reject_plan')
                    }
                    onContinueAfterPromote={() =>
                      void runCheckpoint(
                        m.agentSession!.id,
                        'continue_after_promote',
                      )
                    }
                  />
                ) : null}
              </div>
            ))}
          </div>

          <div className="que-genie-panel__foot">
            <input
              className="que-genie-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void submit()
                }
              }}
              placeholder="Create job, edit SQL, build BI…"
              disabled={busy}
            />
            <button
              type="button"
              className="que-genie-send"
              disabled={busy || !input.trim()}
              onClick={() => void submit()}
            >
              {busy ? '…' : 'Ask'}
            </button>
          </div>

          <p className="que-genie-panel__hint">
            <Link to="/chat" className="text-secondary underline">
              Open full chat
            </Link>
            {' · CEO & Engineer modes supported'}
          </p>
        </div>
      ) : null}
    </>
  )
}
