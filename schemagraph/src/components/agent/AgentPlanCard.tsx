import { Link } from 'react-router-dom'
import type { AgentSession } from '@/services/stitchApi'

type Props = {
  session: AgentSession
  busy?: boolean
  canWrite?: boolean
  onApprove?: () => void
  onReject?: () => void
  onContinueAfterPromote?: () => void
  onRefresh?: () => void
}

/**
 * Inline Stitch Agent plan — HITL checkpoints inside Assistant chat.
 */
export function AgentPlanCard({
  session,
  busy = false,
  canWrite = false,
  onApprove,
  onReject,
  onContinueAfterPromote,
  onRefresh,
}: Props) {
  const openCheckpoint = session.checkpoints.find((c) => c.status === 'open')
  const jobId = session.result?.jobId

  return (
    <div className="mt-md space-y-md rounded-lg border border-secondary/30 bg-surface p-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <p className="font-label text-[11px] font-bold tracking-widest text-secondary uppercase">
          Stitch agent · {session.status}
        </p>
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
      </div>

      <div>
        <p className="font-body text-[13px] font-medium text-on-surface">
          {session.title}
        </p>
        {session.plan?.goal ? (
          <p className="mt-xs text-[12px] text-on-surface-variant">
            {session.plan.goal}
          </p>
        ) : null}
        {session.plan?.intent ? (
          <p className="mt-xs font-label text-[10px] tracking-widest text-secondary uppercase">
            Intent · {session.plan.intent}
            {(session.plan.tools || []).length
              ? ` · ${(session.plan.tools || []).map((t) => t.id).join(' → ')}`
              : ''}
          </p>
        ) : null}
      </div>

      <ol className="space-y-sm">
        {(session.plan?.steps || []).map((step) => (
          <li
            key={step.id}
            className="flex items-center justify-between rounded-lg border border-outline-variant/25 bg-surface-container-low/60 px-sm py-sm font-body text-[12px]"
          >
            <span className="text-on-surface">{step.label}</span>
            <span className="font-label text-[10px] tracking-wide text-on-surface-variant uppercase">
              {step.status}
            </span>
          </li>
        ))}
      </ol>

      {openCheckpoint ? (
        <div className="rounded-lg border border-secondary/40 bg-secondary/5 p-md">
          <p className="font-label text-[10px] tracking-widest text-secondary uppercase">
            Checkpoint · {openCheckpoint.type}
          </p>
          <p className="mt-sm font-body text-[12px] text-on-surface">
            {openCheckpoint.message}
          </p>
          <div className="mt-md flex flex-wrap gap-sm">
            {openCheckpoint.type === 'promote_joins' ? (
              <>
                <Link
                  to="/joins"
                  className="rounded-md border border-secondary px-sm py-1.5 font-label text-[11px] text-secondary"
                >
                  Open Join Review
                </Link>
                <button
                  type="button"
                  disabled={!canWrite || busy}
                  onClick={onContinueAfterPromote}
                  className="rounded-md bg-secondary px-sm py-1.5 font-label text-[11px] text-on-secondary disabled:opacity-40"
                >
                  Continue after Promote
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!canWrite || busy}
                  onClick={onApprove}
                  className="rounded-md bg-secondary px-sm py-1.5 font-label text-[11px] text-on-secondary disabled:opacity-40"
                >
                  Approve plan
                </button>
                <button
                  type="button"
                  disabled={!canWrite || busy}
                  onClick={onReject}
                  className="rounded-md border border-error/40 px-sm py-1.5 font-label text-[11px] text-error disabled:opacity-40"
                >
                  Reject
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {(session.toolCalls || []).length ? (
        <div>
          <p className="mb-xs font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
            Tool transcript
          </p>
          <ul className="space-y-xs">
            {(session.toolCalls || []).map((t) => (
              <li
                key={t.id}
                className="rounded-md border border-outline-variant/20 px-sm py-1 font-mono text-[11px] text-on-surface-variant"
              >
                <span className={t.ok === false ? 'text-error' : 'text-secondary'}>
                  {t.tool}
                </span>
                {t.output?.error
                  ? ` · ${String(t.output.error)}`
                  : t.output?.created != null
                    ? ` · created ${String(t.output.created)}`
                    : t.output?.jobId
                      ? ` · job ${String(t.output.jobId)}`
                      : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {jobId ? (
        <div className="flex flex-wrap gap-sm">
          <Link
            to={`/jobs/${String(jobId)}/notebook`}
            className="rounded-md bg-secondary px-sm py-1.5 font-label text-[11px] font-semibold text-on-secondary"
          >
            Open drafted job
          </Link>
          <Link
            to="/jobs"
            className="rounded-md border border-secondary/40 px-sm py-1.5 font-label text-[11px] text-secondary"
          >
            Jobs · Results
          </Link>
        </div>
      ) : null}

      <p className="font-label text-[10px] text-on-surface-variant">
        Tip: type <span className="text-secondary">approve</span>,{' '}
        <span className="text-secondary">reject</span>, or{' '}
        <span className="text-secondary">continue after promote</span>.
      </p>
    </div>
  )
}

/** Detect NL / slash intent to start the Stitch Agent pipeline. */
export function looksLikeAgentPrompt(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return false
  if (/^\/agent\b/i.test(t)) return true
  if (/\bstart\s+(an?\s+)?(stitch\s+)?agent\b/i.test(t)) return true
  if (/\bstitch\s+agent\b/i.test(t)) return true
  if (
    /\bbuild\s+trusted\b/i.test(t) &&
    /\b(customer\s*360|stitch\s+job)\b/i.test(t)
  ) {
    return true
  }
  if (
    /\b(run|start)\s+(the\s+)?(multi-?step|hitl)\s+(plan|agent|pipeline)\b/i.test(
      t,
    )
  ) {
    return true
  }
  return false
}

export function stripAgentSlash(text: string): string {
  return String(text || '')
    .replace(/^\/agent\s*/i, '')
    .replace(/^start\s+(an?\s+)?(stitch\s+)?agent\s*[:\-–]?\s*/i, '')
    .trim()
}

export type AgentFollowUp =
  | 'approve'
  | 'reject'
  | 'continue_after_promote'
  | 'refresh'
  | null

export function detectAgentFollowUp(text: string): AgentFollowUp {
  const t = String(text || '').trim().toLowerCase()
  if (!t) return null
  if (/^(reject(\s+plan)?|\/reject)\b/.test(t)) return 'reject'
  if (
    /^(continue(\s+after\s+promote)?|advance(\s+agent)?|\/continue)\b/.test(t)
  ) {
    return 'continue_after_promote'
  }
  if (/^(approve(\s+agent)?(\s+plan)?|\/approve)\b/.test(t)) return 'approve'
  if (/^(refresh(\s+agent)?|\/refresh-agent)\b/.test(t)) return 'refresh'
  return null
}
