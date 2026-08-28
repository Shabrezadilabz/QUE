import { useEffect, useState } from 'react'
import {
  fetchPresence,
  heartbeatPresenceApi,
  type PresenceItem,
} from '@/services/stitchApi'

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Sprint 11 — HTTP heartbeat presence bar for steward collab pages. */
export function PresenceBar({
  pagePath,
  compact = false,
  className = '',
}: {
  pagePath: string
  compact?: boolean
  className?: string
}) {
  const [items, setItems] = useState<PresenceItem[]>([])

  useEffect(() => {
    let cancelled = false
    async function tick() {
      try {
        const list = await heartbeatPresenceApi({ pagePath, status: 'active' })
        if (!cancelled) setItems(list)
      } catch {
        try {
          const list = await fetchPresence()
          if (!cancelled) setItems(list)
        } catch {
          /* optional when unauthenticated */
        }
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 25_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [pagePath])

  const active = items.filter((i) => i.active)
  if (!active.length) return null

  return (
    <div
      className={[
        'flex flex-wrap items-center gap-2 rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-2',
        className,
      ].join(' ')}
      title="Stewards active on this page"
    >
      {!compact ? (
        <span className="font-label text-[10px] uppercase tracking-wide text-on-surface-variant">
          Here now
        </span>
      ) : null}
      <div className="flex -space-x-1">
        {active.slice(0, 6).map((p) => (
          <span
            key={p.userId}
            title={`${p.displayName}${p.pagePath ? ` · ${p.pagePath}` : ''}`}
            className="inline-flex size-7 items-center justify-center rounded-full border-2 border-surface-container-low bg-secondary/20 font-label text-[10px] font-bold text-secondary"
          >
            {initials(p.displayName)}
          </span>
        ))}
      </div>
      {!compact ? (
        <span className="font-body text-[11px] text-on-surface-variant">
          {active.length} active
        </span>
      ) : null}
    </div>
  )
}

export default PresenceBar
