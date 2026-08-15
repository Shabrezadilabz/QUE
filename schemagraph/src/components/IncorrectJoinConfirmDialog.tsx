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
 * Inline layout styles avoid flex-body / purge collapsing the modal into a strip.
 */
export function IncorrectJoinConfirmDialog({
  pending,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  if (!pending || typeof document === 'undefined') return null
  const a = pending.assessment

  return createPortal(
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        boxSizing: 'border-box',
        background: 'rgba(0,0,0,0.65)',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="incorrect-join-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(28rem, calc(100vw - 2rem))',
          maxWidth: '28rem',
          minWidth: 'min(20rem, calc(100vw - 2rem))',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxSizing: 'border-box',
          borderRadius: 12,
          border: '1px solid rgba(255, 138, 128, 0.45)',
          background: '#0b1c30',
          color: '#d3e4fe',
          padding: 20,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        }}
      >
        <p
          id="incorrect-join-title"
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            color: '#ff8a80',
          }}
        >
          Incorrect join?
        </p>
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 13,
            lineHeight: 1.45,
            color: '#d3e4fe',
          }}
        >
          {a.reason ||
            'Sample data does not support this join. Stop here unless you are sure.'}
        </p>
        <p
          style={{
            margin: '12px 0 0',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            color: '#7bd0ff',
            wordBreak: 'break-word',
          }}
        >
          {a.label}
        </p>

        <div
          style={{
            marginTop: 14,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            fontSize: 11,
            color: '#c6c6cd',
          }}
        >
          <div
            style={{
              borderRadius: 8,
              border: '1px solid rgba(69,70,77,0.6)',
              padding: 10,
              minWidth: 0,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#9aa3b2',
              }}
            >
              From samples
            </p>
            <ul
              style={{
                margin: '8px 0 0',
                padding: 0,
                listStyle: 'none',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                wordBreak: 'break-all',
              }}
            >
              {(a.from?.samples || []).slice(0, 5).map((s, i) => (
                <li key={i}>{String(s)}</li>
              ))}
              {!a.from?.samples?.length ? <li>—</li> : null}
            </ul>
          </div>
          <div
            style={{
              borderRadius: 8,
              border: '1px solid rgba(69,70,77,0.6)',
              padding: 10,
              minWidth: 0,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#9aa3b2',
              }}
            >
              To samples
            </p>
            <ul
              style={{
                margin: '8px 0 0',
                padding: 0,
                listStyle: 'none',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                wordBreak: 'break-all',
              }}
            >
              {(a.to?.samples || []).slice(0, 5).map((s, i) => (
                <li key={i}>{String(s)}</li>
              ))}
              {!a.to?.samples?.length ? <li>—</li> : null}
            </ul>
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            style={{
              borderRadius: 8,
              border: '1px solid rgba(69,70,77,0.7)',
              background: 'transparent',
              color: '#c6c6cd',
              padding: '8px 14px',
              fontSize: 13,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Stop — don’t create
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            style={{
              borderRadius: 8,
              border: 'none',
              background: '#c62828',
              color: '#fff',
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Saving…' : 'Yes, proceed anyway'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
