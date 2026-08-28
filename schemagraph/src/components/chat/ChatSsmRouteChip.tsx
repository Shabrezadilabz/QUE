import type { ChatSsmRouting } from '@/services/stitchApi'

function routingLabel(routing: ChatSsmRouting): string {
  const src = routing.routingSource || 'heuristic'
  if (src === 'ml_trained') return 'SSM-B trained'
  if (src === 'ml_stub') return 'ML stub'
  return 'Heuristic'
}

function intentLabel(routing: ChatSsmRouting): string {
  return (
    routing.recommendedIntent ||
    routing.heuristicIntent ||
    routing.mlIntent ||
    'question'
  )
}

function ceoIntentPhrase(intent?: string | null): string {
  const i = String(intent || 'question').toLowerCase()
  if (i.includes('job') || i.includes('create')) return 'Pipeline planning'
  if (i.includes('studio') || i.includes('board') || i.includes('bi')) {
    return 'Report context'
  }
  if (i.includes('metric')) return 'Metrics context'
  return 'Schema Q&A'
}

type Props = {
  routing: ChatSsmRouting
  intent?: string | null
  focusTableCount?: number
  compact?: boolean
  /** full = engineer detail; ceo = plain-language trust chip */
  variant?: 'full' | 'ceo'
}

/** Per-turn SSM-B routing chip on assistant messages. */
export function ChatSsmRouteChip({
  routing,
  intent,
  focusTableCount,
  compact = false,
  variant = 'full',
}: Props) {
  const src = routing.routingSource || 'heuristic'
  const tone =
    src === 'ml_trained'
      ? 'border-[#7aecd0]/40 bg-[#7aecd0]/10 text-[#7aecd0]'
      : src === 'ml_stub'
        ? 'border-[#c3f400]/30 bg-[#c3f400]/10 text-[#c3f400]'
        : 'border-[#424850] bg-[#121619] text-[#a3afbe]'

  const conf =
    routing.confidence != null && Number.isFinite(Number(routing.confidence))
      ? `${Math.round(Number(routing.confidence) * 100)}%`
      : null

  if (variant === 'ceo') {
    const tables =
      focusTableCount != null && focusTableCount > 0
        ? `${focusTableCount} certified table${focusTableCount === 1 ? '' : 's'}`
        : 'schema context'
    return (
      <div
        className={[
          'flex flex-wrap items-center gap-[6px]',
          compact ? 'text-[9px]' : 'text-[10px]',
        ].join(' ')}
        title="Que routes your question using schema metadata and scrubbed samples only — never raw warehouse rows in the AI."
      >
        <span
          className={[
            'inline-flex items-center gap-[4px] rounded-full border px-[8px] py-[2px]',
            src === 'ml_trained'
              ? 'border-[#7aecd0]/35 bg-[#7aecd0]/10 text-[#7aecd0]'
              : 'border-[#424850] bg-[#121619] text-[#a3afbe]',
          ].join(' ')}
        >
          ✓ {ceoIntentPhrase(intent || intentLabel(routing))}
        </span>
        <span className="text-[#6b7380]">{tables}</span>
        {src === 'ml_trained' ? (
          <span className="text-[#7aecd0]">Enhanced routing</span>
        ) : null}
      </div>
    )
  }

  return (
    <div
      className={[
        'flex flex-wrap items-center gap-[6px]',
        compact ? 'text-[9px]' : 'text-[10px]',
      ].join(' ')}
    >
      <span
        className={[
          'inline-flex items-center gap-[4px] rounded-full border px-[8px] py-[2px] font-mono uppercase tracking-wide',
          tone,
        ].join(' ')}
        title={
          routing.agreed === false
            ? 'Heuristic and ML routes disagreed — using recommended intent'
            : undefined
        }
      >
        {routingLabel(routing)}
        {conf ? ` · ${conf}` : ''}
      </span>
      <span className="rounded border border-[#424850] px-[6px] py-[1px] font-mono text-[#8a9099]">
        {intent || intentLabel(routing)}
      </span>
      {focusTableCount != null && focusTableCount > 0 ? (
        <span className="text-[#6b7380]">
          {focusTableCount} focus table{focusTableCount === 1 ? '' : 's'}
        </span>
      ) : null}
      {routing.agreed === false ? (
        <span className="text-[#f0a020]">split route</span>
      ) : null}
    </div>
  )
}
