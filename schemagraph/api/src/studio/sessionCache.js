/**
 * Phase 4.3 — in-memory session cache for BI widget/metric warehouse queries.
 * TTL default 60s (configurable 30–120s per workspace settings later).
 */
const store = new Map()

export const DEFAULT_CACHE_TTL_MS = 60_000

/** @param {string[]} parts */
export function cacheKey(parts) {
  return parts.filter(Boolean).join(':')
}

/** @param {string} key */
export function getCached(key) {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry.value
}

/** @param {string} key @param {object} value @param {number} [ttlMs] */
export function setCached(key, value, ttlMs = DEFAULT_CACHE_TTL_MS) {
  store.set(key, {
    value,
    expiresAt: Date.now() + Math.max(5_000, ttlMs),
  })
}

/** @param {string} workspaceId */
export function invalidateWorkspaceCache(workspaceId) {
  const prefix = `${workspaceId}:`
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

/** Test helper */
export function clearStudioCache() {
  store.clear()
}

export function cacheStats() {
  return { entries: store.size }
}
