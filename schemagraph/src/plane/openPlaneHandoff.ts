/** Build Managed Plane URL with optional SQL handoff (never includes connection strings). */
export function buildPlaneUrl(opts: {
  sql?: string
  datasetId?: string
  ask?: string
} = {}): string {
  const base = `${window.location.origin}/plane`
  const params = new URLSearchParams()
  if (opts.sql?.trim()) {
    params.set('sql', opts.sql.trim())
  }
  if (opts.datasetId) {
    params.set('dataset', opts.datasetId)
  }
  if (opts.ask?.trim()) {
    params.set('ask', opts.ask.trim())
  }
  const q = params.toString()
  return q ? `${base}?${q}` : base
}

export function openManagedPlane(opts: {
  sql?: string
  datasetId?: string
  ask?: string
} = {}): void {
  window.open(buildPlaneUrl(opts), '_blank', 'noopener,noreferrer')
}
