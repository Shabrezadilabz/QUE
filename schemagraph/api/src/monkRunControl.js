/**
 * In-process Monk run control — pause / resume / skip at phase checkpoints.
 * v1: single API instance; use DB-backed control for multi-instance later.
 */

/** @type {Map<string, { state: 'running'|'paused', skipPhases: Set<string> }>} */
const controls = new Map()

function ensure(runId) {
  if (!controls.has(runId)) {
    controls.set(runId, { state: 'running', skipPhases: new Set() })
  }
  return controls.get(runId)
}

export function getMonkRunControl(runId) {
  const c = controls.get(runId)
  return {
    state: c?.state || 'running',
    skipPhases: c ? [...c.skipPhases] : [],
  }
}

export function setMonkRunControl(runId, action, opts = {}) {
  const c = ensure(runId)
  if (action === 'pause') c.state = 'paused'
  else if (action === 'resume') c.state = 'running'
  else if (action === 'skip' && opts.phase) c.skipPhases.add(String(opts.phase))
  else if (action === 'skip_current' && opts.phase) {
    c.skipPhases.add(String(opts.phase))
    c.state = 'running'
  }
  return getMonkRunControl(runId)
}

export function clearMonkRunControl(runId) {
  controls.delete(runId)
}

export function shouldSkipMonkPhase(runId, phase) {
  return ensure(runId).skipPhases.has(String(phase))
}

/** Block until resumed or skipped; resolves when execution may continue. */
export async function waitMonkPhaseGate(runId, phase, opts = {}) {
  const maxMs = opts.maxPauseMs ?? 30 * 60 * 1000
  const started = Date.now()
  while (true) {
    const c = ensure(runId)
    if (shouldSkipMonkPhase(runId, phase)) return 'skipped'
    if (c.state === 'running') return 'running'
    if (Date.now() - started > maxMs) {
      const err = new Error('Monk run paused too long')
      err.status = 408
      throw err
    }
    await new Promise((r) => setTimeout(r, 400))
  }
}
