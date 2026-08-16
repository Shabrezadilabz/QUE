import { Link } from 'react-router-dom'
import type { OutcomeRecord } from '@/services/stitchApi'

type Props = {
  outcome: OutcomeRecord
  busy?: boolean
  canWrite?: boolean
  onRefresh?: () => void
  onInferJoins?: () => void
  onRunNext?: () => void
  onApproveAgent?: () => void
  onAdvanceAgent?: () => void
  onShip?: () => void
}

/**
 * Inline Outcome plan card rendered inside a Chat assistant bubble.
 */
export function OutcomePlanCard({
  outcome,
  busy = false,
  canWrite = false,
  onRefresh,
  onInferJoins,
  onRunNext,
  onApproveAgent,
  onAdvanceAgent,
  onShip,
}: Props) {
  const steps = outcome.plan?.steps || []

  return (
    <div className="mt-md space-y-md rounded-lg border border-secondary/30 bg-surface p-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="font-label text-[11px] font-bold tracking-widest text-secondary uppercase">
          Outcome plan · {outcome.status}
        </p>
        <div className="flex flex-wrap gap-sm">
          {onRefresh ? (
            <button
              type="button"
              disabled={busy}
              onClick={onRefresh}
              className="rounded-md border border-outline-variant px-sm py-1 font-label text-[10px] text-on-surface-variant"
            >
              Refresh
            </button>
          ) : null}
          {onInferJoins ? (
            <button
              type="button"
              disabled={busy || !canWrite}
              onClick={onInferJoins}
              className="rounded-md border border-secondary/50 px-sm py-1 font-label text-[10px] text-secondary"
            >
              Infer joins
            </button>
          ) : null}
          {onRunNext ? (
            <button
              type="button"
              disabled={busy || !canWrite}
              onClick={onRunNext}
              className="rounded-md border border-secondary/50 px-sm py-1 font-label text-[10px] text-secondary"
            >
              Run next
            </button>
          ) : null}
          {onApproveAgent ? (
            <button
              type="button"
              disabled={busy || !canWrite}
              onClick={onApproveAgent}
              className="rounded-md border border-outline-variant px-sm py-1 font-label text-[10px]"
            >
              Approve agent
            </button>
          ) : null}
          {onAdvanceAgent ? (
            <button
              type="button"
              disabled={busy || !canWrite}
              onClick={onAdvanceAgent}
              className="rounded-md border border-outline-variant px-sm py-1 font-label text-[10px]"
            >
              Advance agent
            </button>
          ) : null}
          {onShip ? (
            <button
              type="button"
              disabled={busy || !canWrite}
              onClick={onShip}
              className="rounded-md bg-primary px-sm py-1 font-label text-[10px] font-medium text-on-primary"
            >
              Ship to BI →
            </button>
          ) : null}
        </div>
      </div>
      <p className="text-[12px] text-on-surface-variant">{outcome.prompt}</p>
      {outcome.plan?.agentSessionId ? (
        <p className="text-[11px] text-on-surface-variant">
          Linked agent —{' '}
          <Link to="/agent" className="text-secondary underline">
            open /agent
          </Link>
        </p>
      ) : null}
      <ol className="space-y-sm">
        {steps.map((s, i) => (
          <li
            key={s.id}
            className="rounded-lg border border-outline-variant/25 bg-surface-container-low/60 p-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-sm">
              <span className="text-[12px] font-medium text-on-surface">
                {i + 1}. {s.title}
              </span>
              <span className="rounded-full bg-surface-container-high px-sm py-px text-[9px] uppercase tracking-wide text-on-surface-variant">
                {s.status}
              </span>
            </div>
            {s.detail ? (
              <p className="mt-xs text-[11px] text-on-surface-variant">
                {s.detail}
              </p>
            ) : null}
            {s.href ? (
              <Link
                to={s.href}
                className="mt-xs inline-block text-[11px] text-secondary underline"
              >
                Open {s.kind}
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="font-label text-[10px] text-on-surface-variant">
        Tip: type <span className="text-secondary">run next</span>,{' '}
        <span className="text-secondary">infer joins</span>, or{' '}
        <span className="text-secondary">ship</span> in chat.
      </p>
    </div>
  )
}

/** Detect NL business-outcome prompts (or /outcome skill). */
export function looksLikeOutcomePrompt(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return false
  if (/^\/outcome\b/i.test(t)) return true
  if (/\b(build|create|draft)\s+(an?\s+)?outcome\b/i.test(t)) return true
  if (
    /\bi\s+want\b/i.test(t) &&
    /\b(revenue|sales|dashboard|report|kpi|metric|region|by\s+\w+)\b/i.test(t)
  ) {
    return true
  }
  if (
    /\b(show|give)\s+me\b/i.test(t) &&
    /\b(dashboard|report|revenue|kpi)\b/i.test(t)
  ) {
    return true
  }
  return false
}

export function stripOutcomeSlash(text: string): string {
  return String(text || '')
    .replace(/^\/outcome\s*/i, '')
    .trim()
}

export type OutcomeFollowUp =
  | 'run_next'
  | 'infer_joins'
  | 'ship'
  | 'approve_agent'
  | 'advance_agent'
  | null

export function detectOutcomeFollowUp(text: string): OutcomeFollowUp {
  const t = String(text || '').trim().toLowerCase()
  if (!t) return null
  if (/^(infer(\s+joins)?|\/infer)\b/.test(t)) return 'infer_joins'
  if (/^(run\s+next|next\s+step|continue|\/next)\b/.test(t)) return 'run_next'
  if (/^(ship(\s+to\s+bi)?|\/ship)\b/.test(t)) return 'ship'
  if (/^approve(\s+agent)?(\s+plan)?\b/.test(t)) return 'approve_agent'
  if (/^advance(\s+agent)?\b/.test(t)) return 'advance_agent'
  return null
}
