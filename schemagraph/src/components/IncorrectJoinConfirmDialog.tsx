import { createPortal } from 'react-dom'
import type { JoinSampleAssessment } from '@/services/stitchApi'

type Pending =
  | {
      mode: 'create'
      fromColumnId: string
      toColumnId: string
      assessment: JoinSampleAssessment
    }
  | {
      mode: 'edit'
      relationshipId: string
      fromColumnId: string
      toColumnId: string
      assessment: JoinSampleAssessment
    }

type Props = {
  pending: Pending | null
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}

/**
 * Blocks incorrect canvas joins until the user explicitly proceeds.
 */
export function IncorrectJoinConfirmDialog({
  pending,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  if (!pending) return null
  const a = pending.assessment

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-md"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="incorrect-join-title"
        className="w-full max-w-md rounded-xl border border-error/40 bg-surface-container-low p-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p
          id="incorrect-join-title"
          className="font-headline text-lg font-semibold text-error"
        >
          Incorrect join?
        </p>
        <p className="mt-sm text-[13px] text-on-surface">
          {a.reason ||
            'Sample data does not support this join. Stop here unless you are sure.'}
        </p>
        <p className="mt-md font-mono text-[12px] text-secondary">
          {a.label}
        </p>
        <div className="mt-md grid grid-cols-2 gap-sm text-[11px] text-on-surface-variant">
          <div className="rounded-lg border border-outline-variant/30 p-sm">
            <p className="font-label text-[10px] tracking-widest uppercase">
              From samples
            </p>
            <ul className="mt-xs space-y-px font-mono">
              {(a.from?.samples || []).slice(0, 5).map((s, i) => (
                <li key={i}>{String(s)}</li>
              ))}
              {!a.from?.samples?.length ? <li>—</li> : null}
            </ul>
          </div>
          <div className="rounded-lg border border-outline-variant/30 p-sm">
            <p className="font-label text-[10px] tracking-widest uppercase">
              To samples
            </p>
            <ul className="mt-xs space-y-px font-mono">
              {(a.to?.samples || []).slice(0, 5).map((s, i) => (
                <li key={i}>{String(s)}</li>
              ))}
              {!a.to?.samples?.length ? <li>—</li> : null}
            </ul>
          </div>
        </div>
        <div className="mt-lg flex flex-wrap justify-end gap-sm">
          <button
            type="button"
            className="rounded-lg border border-outline-variant/50 px-md py-sm text-[13px] text-on-surface-variant"
            disabled={busy}
            onClick={onCancel}
          >
            Stop — don’t create
          </button>
          <button
            type="button"
            className="rounded-lg bg-error px-md py-sm text-[13px] font-medium text-on-error disabled:opacity-50"
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? 'Saving…' : 'Yes, proceed anyway'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
