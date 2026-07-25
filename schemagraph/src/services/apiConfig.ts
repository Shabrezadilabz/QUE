/** Shared API / workspace config — avoids auth ↔ stitchApi circular imports. */

export const DEMO_WORKSPACE_ID = '22222222-2222-2222-2222-222222222222'

const DEFAULT_API_BASE = 'http://localhost:8787'
const WS_KEY = 'stitch_workspace_id'

export function getApiBase(): string {
  return import.meta.env.VITE_STITCH_API_URL ?? DEFAULT_API_BASE
}

export function getActiveWorkspaceId(): string {
  try {
    return localStorage.getItem(WS_KEY) || DEMO_WORKSPACE_ID
  } catch {
    return DEMO_WORKSPACE_ID
  }
}

export function setActiveWorkspaceId(id: string) {
  localStorage.setItem(WS_KEY, id)
  window.dispatchEvent(
    new CustomEvent('stitch:workspace-changed', { detail: { id } }),
  )
}

export class ApiHttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}
