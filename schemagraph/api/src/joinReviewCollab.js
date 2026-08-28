/**
 * Sprint 11 — Join review realtime collab (presence + soft edit lock).
 * Uses HTTP presence heartbeats; lock is in-process TTL (Redis in prod).
 */
import { listPresence } from './workspacePresence.js'

const LOCK_TTL_MS = 5 * 60 * 1000
const locks = new Map()

function lockKey(workspaceId, relationshipId) {
  return `${workspaceId}:${relationshipId}`
}

function pruneLock(key) {
  const cur = locks.get(key)
  if (!cur) return null
  if (Date.now() > cur.expiresAt) {
    locks.delete(key)
    return null
  }
  return cur
}

export function claimJoinReviewLock(
  workspaceId,
  relationshipId,
  { userId, displayName = '', email = '' } = {},
) {
  if (!userId) {
    const err = new Error('user required')
    err.status = 400
    throw err
  }
  const key = lockKey(workspaceId, relationshipId)
  const existing = pruneLock(key)
  if (existing && existing.userId !== userId) {
    const err = new Error(
      `${existing.displayName || existing.email || 'Another steward'} is editing this join`,
    )
    err.status = 409
    err.code = 'JOIN_LOCK_HELD'
    err.lock = existing
    throw err
  }
  const lock = {
    userId,
    displayName: String(displayName || email || 'member').slice(0, 120),
    email: String(email || '').slice(0, 200),
    relationshipId,
    claimedAt: new Date().toISOString(),
    expiresAt: Date.now() + LOCK_TTL_MS,
  }
  locks.set(key, lock)
  return lock
}

export function releaseJoinReviewLock(workspaceId, relationshipId, userId) {
  const key = lockKey(workspaceId, relationshipId)
  const existing = pruneLock(key)
  if (!existing) return { released: false }
  if (existing.userId !== userId) {
    const err = new Error('lock held by another user')
    err.status = 403
    throw err
  }
  locks.delete(key)
  return { released: true }
}

export function touchJoinReviewLock(workspaceId, relationshipId, userId) {
  const key = lockKey(workspaceId, relationshipId)
  const existing = pruneLock(key)
  if (!existing || existing.userId !== userId) return null
  existing.expiresAt = Date.now() + LOCK_TTL_MS
  locks.set(key, existing)
  return existing
}

/**
 * Viewers on join review pages + optional lock for co-edit.
 */
export async function getJoinReviewCollab(
  workspaceId,
  relationshipId,
  { userId = null } = {},
) {
  let presence = []
  try {
    presence = await listPresence(workspaceId)
  } catch {
    /* presence optional when DB unavailable (unit tests) */
  }
  const joinPath = '/joins'
  const viewers = presence.filter(
    (p) =>
      p.active &&
      (p.pagePath.includes(joinPath) ||
        p.pagePath.includes('join-review') ||
        p.pagePath.includes('steward')),
  )
  const key = lockKey(workspaceId, relationshipId)
  const lock = pruneLock(key)
  const canEdit =
    !lock || !userId || lock.userId === userId
  return {
    viewers,
    lock,
    canEdit,
    coEditEnabled: true,
    lockTtlSec: Math.floor(LOCK_TTL_MS / 1000),
  }
}
