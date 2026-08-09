import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import {
  fetchPresence,
  heartbeatPresenceApi,
  getActiveWorkspaceId,
} from '@/services/stitchApi'

type PresenceUser = {
  userId: string
  displayName: string
  pagePath: string
  status: string
  active: boolean
}

/**
 * Compact multiplayer presence strip — HTTP heartbeat, no WebSocket.
 */
export function PresenceBar() {
  const { user, ready } = useAuth()
  const location = useLocation()
  const [peers, setPeers] = useState<PresenceUser[]>([])

  useEffect(() => {
    if (!ready || !user) return
    let cancelled = false

    async function tick() {
      try {
        const ws = getActiveWorkspaceId()
        if (!ws) return
        const items = await heartbeatPresenceApi({
          pagePath: location.pathname,
        })
        if (!cancelled) setPeers(items.filter((p) => p.active))
      } catch {
        try {
          const items = await fetchPresence()
          if (!cancelled) setPeers(items.filter((p) => p.active))
        } catch {
          /* soft-fail */
        }
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), 45_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [ready, user, location.pathname])

  if (!peers.length) return null

  return (
    <div
      className="hidden items-center gap-1 md:flex"
      title="Teammates active in this workspace"
    >
      {peers.slice(0, 6).map((p) => (
        <span
          key={p.userId}
          className="inline-flex h-6 max-w-[5.5rem] items-center truncate rounded-full bg-secondary-container px-2 font-label text-[10px] text-on-surface"
          title={`${p.displayName} · ${p.pagePath || '/'}`}
        >
          {p.displayName.split(/[@\s]/)[0]}
        </span>
      ))}
      {peers.length > 6 ? (
        <span className="font-label text-[10px] text-on-surface-variant">
          +{peers.length - 6}
        </span>
      ) : null}
    </div>
  )
}
