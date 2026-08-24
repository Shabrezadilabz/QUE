import { useEffect, useState } from 'react'
import {
  listPlaneActivity,
  markPlaneActivityRead,
  syncPlaneActivityFromServer,
  type PlaneActivityEvent,
  type PlaneActivitySource,
} from '@/plane/planeActivity'

interface PlaneActivityFeedProps {
  filter: 'all' | PlaneActivitySource
  onSelect: (event: PlaneActivityEvent) => void
  selectedId: string | null
}

const KIND_LABEL: Record<PlaneActivityEvent['kind'], string> = {
  created: 'New',
  drafted: 'Draft',
  edited: 'Edited',
  executed: 'Run',
  landed: 'Landed',
  certified: 'Certified',
  failed: 'Failed',
}

const SOURCE_LABEL: Record<PlaneActivitySource, string> = {
  chat: 'AI Chat',
  plane_sql: 'SQL',
  plane_nlp: 'NLP',
  job: 'Job',
  source_sync: 'Source',
  system: 'System',
}

function kindBadgeClass(kind: PlaneActivityEvent['kind']): string {
  if (kind === 'failed') return 'pdf-badge pdf-badge-danger'
  if (kind === 'executed') return 'pdf-badge pdf-badge-success'
  if (kind === 'drafted' || kind === 'edited') return 'pdf-badge pdf-badge-warn'
  return 'pdf-badge'
}

/** Right rail — activity notifications synced from server. */
export function PlaneActivityFeed({
  filter,
  onSelect,
  selectedId,
}: PlaneActivityFeedProps) {
  const [items, setItems] = useState<PlaneActivityEvent[]>(() => listPlaneActivity())
  const [syncing, setSyncing] = useState(true)

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      void syncPlaneActivityFromServer()
        .then(({ items: next }) => {
          if (!cancelled) setItems(next)
        })
        .catch(() => {
          if (!cancelled) setItems(listPlaneActivity())
        })
        .finally(() => {
          if (!cancelled) setSyncing(false)
        })
    }
    refresh()
    window.addEventListener('que-plane-activity', refresh)
    return () => {
      cancelled = true
      window.removeEventListener('que-plane-activity', refresh)
    }
  }, [])

  useEffect(() => {
    void markPlaneActivityRead()
  }, [])

  const visible =
    filter === 'all' ? items : items.filter((e) => e.source === filter)

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-[var(--pdf-bg-shell)]">
      <div className="shrink-0 border-b border-solid border-[var(--pdf-border)] px-[12px] py-[10px]">
        <p className="text-[10px] font-semibold tracking-[0.6px] text-[var(--pdf-text-faint)] uppercase">
          Activity
        </p>
        <p className="mt-[2px] text-[11px] text-[var(--pdf-text-muted)]">
          {syncing
            ? 'Syncing…'
            : 'AI actions, drafts, and runs — detail stays here, not in chat.'}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-[8px]">
        {visible.length === 0 ? (
          <p className="px-[4px] text-[11px] text-[var(--pdf-text-faint)]">
            No activity yet. Run SQL or receive a handoff from AI Chat.
          </p>
        ) : (
          <ul className="flex flex-col gap-[6px]">
            {visible.map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => onSelect(ev)}
                  className={[
                    'w-full rounded-[4px] border border-solid px-[10px] py-[8px] text-left transition-colors',
                    selectedId === ev.id
                      ? 'border-[var(--pdf-accent-border)] bg-[var(--pdf-accent-surface)]'
                      : 'border-[var(--pdf-border)] bg-[var(--pdf-bg-panel)] hover:border-[var(--pdf-border-subtle)]',
                  ].join(' ')}
                >
                  <div className="mb-[4px] flex flex-wrap items-center gap-[6px]">
                    <span className={kindBadgeClass(ev.kind)}>{KIND_LABEL[ev.kind]}</span>
                    <span className="text-[10px] text-[var(--pdf-text-faint)]">
                      {SOURCE_LABEL[ev.source]}
                    </span>
                    {!ev.read ? (
                      <span className="size-[6px] rounded-full bg-[var(--pdf-accent)]" aria-hidden />
                    ) : null}
                  </div>
                  <p className="text-[12px] font-medium text-[var(--pdf-text-primary)]">
                    {ev.title}
                  </p>
                  {ev.detail ? (
                    <p className="mt-[2px] line-clamp-2 text-[11px] text-[var(--pdf-text-muted)]">
                      {ev.detail}
                    </p>
                  ) : null}
                  <p className="mt-[4px] text-[10px] text-[var(--pdf-text-faint)]">
                    {new Date(ev.createdAt).toLocaleString()}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
