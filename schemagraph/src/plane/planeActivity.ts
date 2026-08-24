import { getActiveWorkspaceId } from '@/services/apiConfig'
import {
  createPlaneActivityApi,
  fetchPlaneActivity,
  fetchPlaneActivityUnread,
  markPlaneActivityReadApi,
  type PlaneActivityEvent,
} from '@/services/stitchApi'

export type {
  PlaneActivityEvent,
  PlaneActivityKind,
  PlaneActivitySource,
} from '@/services/stitchApi'

export type PlaneActivityActor = PlaneActivityEvent['actor']

const STORAGE_PREFIX = 'que-plane-activity'
const UNREAD_CACHE_PREFIX = 'que-plane-unread'

function storageKey(workspaceId: string) {
  return `${STORAGE_PREFIX}:${workspaceId}`
}

function unreadCacheKey(workspaceId: string) {
  return `${UNREAD_CACHE_PREFIX}:${workspaceId}`
}

function cacheItems(
  workspaceId: string,
  items: PlaneActivityEvent[],
  unread?: number,
) {
  if (typeof window === 'undefined') return
  localStorage.setItem(storageKey(workspaceId), JSON.stringify(items))
  if (unread != null) {
    localStorage.setItem(unreadCacheKey(workspaceId), String(unread))
  }
  window.dispatchEvent(new CustomEvent('que-plane-activity'))
}

export function listPlaneActivity(
  workspaceId: string = getActiveWorkspaceId(),
): PlaneActivityEvent[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(storageKey(workspaceId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as PlaneActivityEvent[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function syncPlaneActivityFromServer(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ items: PlaneActivityEvent[]; unread: number }> {
  try {
    const { items, unread } = await fetchPlaneActivity({}, workspaceId)
    cacheItems(workspaceId, items, unread)
    return { items, unread }
  } catch {
    return {
      items: listPlaneActivity(workspaceId),
      unread: countUnreadPlaneActivity(workspaceId),
    }
  }
}

export function countUnreadPlaneActivity(
  workspaceId: string = getActiveWorkspaceId(),
): number {
  if (typeof window === 'undefined') return 0
  const cached = localStorage.getItem(unreadCacheKey(workspaceId))
  if (cached != null && cached !== '') {
    const n = Number(cached)
    if (!Number.isNaN(n)) return n
  }
  return listPlaneActivity(workspaceId).filter((e) => !e.read).length
}

export async function refreshPlaneActivityUnread(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<number> {
  try {
    const unread = await fetchPlaneActivityUnread(workspaceId)
    localStorage.setItem(unreadCacheKey(workspaceId), String(unread))
    window.dispatchEvent(new CustomEvent('que-plane-activity'))
    return unread
  } catch {
    return countUnreadPlaneActivity(workspaceId)
  }
}

export async function markPlaneActivityRead(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  try {
    await markPlaneActivityReadApi(workspaceId)
  } catch {
    /* offline fallback */
  }
  const items = listPlaneActivity(workspaceId).map((e) => ({ ...e, read: true }))
  cacheItems(workspaceId, items, 0)
}

export function appendPlaneActivityLocal(
  input: Omit<
    PlaneActivityEvent,
    'id' | 'workspaceId' | 'read' | 'createdAt' | 'sqlHash'
  > & { workspaceId?: string; sql?: string },
): PlaneActivityEvent {
  const workspaceId = input.workspaceId ?? getActiveWorkspaceId()
  const event: PlaneActivityEvent = {
    id: crypto.randomUUID(),
    workspaceId,
    kind: input.kind,
    source: input.source,
    actor: input.actor,
    title: input.title,
    detail: input.detail,
    sql: input.sql,
    sqlHash: undefined,
    datasetId: input.datasetId ?? null,
    connectionId: input.connectionId ?? null,
    rowCount: input.rowCount ?? null,
    durationMs: input.durationMs ?? null,
    read: false,
    createdAt: new Date().toISOString(),
  }
  const prev = listPlaneActivity(workspaceId)
  const unread = countUnreadPlaneActivity(workspaceId) + 1
  cacheItems(workspaceId, [event, ...prev].slice(0, 200), unread)
  return event
}

/** Persist activity server-side when possible; always update local cache. */
export async function appendPlaneActivity(
  input: Omit<
    PlaneActivityEvent,
    'id' | 'workspaceId' | 'read' | 'createdAt' | 'sqlHash'
  > & { workspaceId?: string; sql?: string },
): Promise<PlaneActivityEvent> {
  const workspaceId = input.workspaceId ?? getActiveWorkspaceId()
  try {
    const item = await createPlaneActivityApi(
      {
        kind: input.kind,
        source: input.source,
        actor: input.actor,
        title: input.title,
        detail: input.detail,
        sql: input.sql,
        datasetId: input.datasetId,
        connectionId: input.connectionId,
        rowCount: input.rowCount,
        durationMs: input.durationMs,
      },
      workspaceId,
    )
    const prev = listPlaneActivity(workspaceId).filter((e) => e.id !== item.id)
    const unread = countUnreadPlaneActivity(workspaceId) + (item.read ? 0 : 1)
    cacheItems(workspaceId, [item, ...prev].slice(0, 200), unread)
    return item
  } catch {
    return appendPlaneActivityLocal(input)
  }
}

/** Seed welcome event when plane opens and feed is empty. */
export async function ensurePlaneWelcome(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const synced = await syncPlaneActivityFromServer(workspaceId)
  if (synced.items.length > 0) return
  await appendPlaneActivity({
    workspaceId,
    kind: 'created',
    source: 'system',
    actor: 'system',
    title: 'Managed Plane ready',
    detail:
      'SQL workspace is live. Run queries here — results stay out of AI Chat.',
  })
}
