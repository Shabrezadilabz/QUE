import { openManagedPlane } from '@/plane/openPlaneHandoff'
import { handoffChatSqlToPlaneApi } from '@/services/stitchApi'

export type ChatPlaneScope = 'in_scope' | 'needs_plane' | 'blocked'

interface ChatPlaneBoundaryCardProps {
  scope: ChatPlaneScope
  hint?: string | null
  sql?: string | null
  question?: string | null
}

/** Boundary between schema-only AI Chat and Managed Plane execution. */
export function ChatPlaneBoundaryCard({
  scope,
  hint,
  sql,
  question,
}: ChatPlaneBoundaryCardProps) {
  if (scope === 'in_scope') return null

  const isBlocked = scope === 'blocked'

  return (
    <div
      className={[
        'rounded-[4px] border border-solid px-[12px] py-[10px] text-[11px]',
        isBlocked
          ? 'border-[var(--pdf-danger-border)] bg-[var(--pdf-danger-surface)] text-[var(--pdf-text-secondary)]'
          : 'border-[var(--pdf-warn-border)] bg-[var(--pdf-warn-surface)] text-[var(--pdf-text-secondary)]',
      ].join(' ')}
    >
      <p className="font-semibold text-[var(--pdf-text-primary)]">
        {isBlocked ? 'Blocked in AI Chat' : 'Needs Managed Plane (SSM)'}
      </p>
      <p className="mt-[4px] leading-[16px]">
        {hint ||
          (isBlocked
            ? 'Only read-only schema assistance is allowed in chat.'
            : 'Run analytics and see row results in Managed Plane — not here.')}
      </p>

      <div className="mt-[8px] space-y-[4px] text-[10px] text-[var(--pdf-text-muted)]">
        <p>
          <span className="font-semibold text-[var(--pdf-text-secondary)]">Chat can:</span>{' '}
          draft SQL, explain schema, propose jobs — metadata + capped samples only.
        </p>
        <p>
          <span className="font-semibold text-[var(--pdf-text-secondary)]">Plane can:</span>{' '}
          execute read-only preview, show results to you — rows never return to AI.
        </p>
      </div>

      {!isBlocked ? (
        <div className="mt-[10px] flex flex-wrap gap-[8px]">
          <button
            type="button"
            className="pdf-btn-primary rounded-[4px] px-[12px] py-[6px] text-[11px] font-semibold"
            onClick={() => {
              if (sql) {
                void handoffChatSqlToPlaneApi({
                  sql,
                  detail: question?.slice(0, 200),
                }).catch(() => undefined)
                openManagedPlane({ sql })
              } else if (question) {
                openManagedPlane({ ask: question })
              } else {
                openManagedPlane()
              }
              window.dispatchEvent(new CustomEvent('que-plane-activity'))
            }}
          >
            Open in Managed Plane
          </button>
          {sql ? (
            <button
              type="button"
              className="pdf-btn-ghost rounded-[4px] px-[10px] py-[6px] text-[11px]"
              onClick={() => void navigator.clipboard.writeText(sql)}
            >
              Copy SQL draft only
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
