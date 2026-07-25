/**
 * Lightweight pub/sub so Chat (and others) refresh when schema changes.
 * Same-tab: CustomEvent on window.
 * Cross-tab: localStorage ping.
 */
const EVENT = 'que:schema-changed'
const STORAGE_KEY = 'que_schema_changed_at'

export type SchemaChangeReason =
  | 'sync'
  | 'promote'
  | 'reject'
  | 'connection'
  | 'manual'
  | 'unknown'

export function notifySchemaChanged(reason: SchemaChangeReason = 'unknown') {
  const at = String(Date.now())
  try {
    window.dispatchEvent(
      new CustomEvent(EVENT, { detail: { reason, at } }),
    )
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(STORAGE_KEY, at)
  } catch {
    /* ignore */
  }
}

export function subscribeSchemaChanged(
  handler: (reason: SchemaChangeReason) => void,
): () => void {
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent).detail as
      | { reason?: SchemaChangeReason }
      | undefined
    handler(detail?.reason ?? 'unknown')
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) handler('unknown')
  }
  window.addEventListener(EVENT, onCustom)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, onCustom)
    window.removeEventListener('storage', onStorage)
  }
}
