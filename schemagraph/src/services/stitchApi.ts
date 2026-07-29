import { DUMMY_DATA_SOURCES } from '@/data/dummySources'
import { DUMMY_RELATIONSHIPS, DUMMY_TABLES } from '@/data/dummySchema'
import type { DataSource } from '@/types/dataSource'
import type { SchemaRelationship, SchemaTable } from '@/types/schema'
import { authHeaders, notifyAuthExpired } from '@/services/auth'
import {
  ApiHttpError,
  DEMO_WORKSPACE_ID,
  getActiveWorkspaceId,
  getApiBase,
} from '@/services/apiConfig'

export { DEMO_WORKSPACE_ID, getApiBase, getActiveWorkspaceId }

/** Authenticated fetch — notifies AuthContext on 401 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers || {})
  const auth = authHeaders()
  for (const [k, v] of Object.entries(auth)) headers.set(k, v)
  if (
    init.body &&
    !headers.has('Content-Type') &&
    !(typeof FormData !== 'undefined' && init.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers })
  if (res.status === 401) {
    notifyAuthExpired()
  }
  return res
}

export interface WorkspaceSchemaResponse {
  workspaceId: string
  tables: SchemaTable[]
  relationships: SchemaRelationship[]
}

export interface WorkspaceSourcesResponse {
  sources: DataSource[]
}

/**
 * Fetch workspace graph from stitch-api.
 * Throws on network / non-OK — caller should fall back to dummy data.
 */
export async function fetchWorkspaceSchema(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<WorkspaceSchemaResponse> {
  const res = await apiFetch(`/workspaces/${workspaceId}/schema`)
  if (!res.ok) {
    throw new ApiHttpError(`schema ${res.status}`, res.status)
  }
  return res.json()
}

export async function fetchWorkspaceSources(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<DataSource[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/sources`)
  if (!res.ok) {
    throw new ApiHttpError(`sources ${res.status}`, res.status)
  }
  const body = (await res.json()) as WorkspaceSourcesResponse
  return body.sources
}

export async function createConnection(
  input: {
    name: string
    type: DataSource['type']
    description?: string
    status?: DataSource['status']
    config?: Record<string, unknown>
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<DataSource> {
  const res = await apiFetch(`/workspaces/${workspaceId}/connections`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
  const body = (await res.json().catch(() => ({}))) as {
    connection?: DataSource
    error?: string
  }
  if (!res.ok || !body.connection) {
    throw new Error(body.error ?? `create connection ${res.status}`)
  }
  return body.connection
}

export interface SpreadsheetUploadResult {
  ok: boolean
  connection: DataSource
  uploaded: {
    path: string
    tableName: string
    sheet?: string
    originalName?: string
    size?: number
  }[]
  sync?: {
    tablesSynced?: number
    columnsSynced?: number
    suggestedJoins?: number
    drift?: { hasRisk?: boolean; summary?: string }
    error?: string
  } | null
}

/** Create excel/csv source from browser file upload + sync schema into workspace */
export async function uploadSpreadsheetSource(
  input: {
    files: File[]
    name: string
    type: 'excel' | 'csv'
    description?: string
    tableNames?: string[]
    sheets?: string[]
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<SpreadsheetUploadResult> {
  const fd = new FormData()
  fd.append('name', input.name)
  fd.append('type', input.type)
  if (input.description) fd.append('description', input.description)
  if (input.tableNames?.length) {
    fd.append('tableNames', JSON.stringify(input.tableNames))
  }
  if (input.sheets?.length) {
    fd.append('sheets', JSON.stringify(input.sheets))
  }
  for (const f of input.files) fd.append('files', f)
  const res = await apiFetch(`/workspaces/${workspaceId}/uploads/spreadsheet`, {
    method: 'POST',
    body: fd,
  })
  const body = (await res.json().catch(() => ({}))) as SpreadsheetUploadResult & {
    error?: string
  }
  if (!res.ok || !body.connection) {
    throw new Error(body.error ?? `upload spreadsheet ${res.status}`)
  }
  return body
}

/** Upload more Excel/CSV files onto an existing connection (then sync) */
export async function uploadConnectionFiles(
  connectionId: string,
  files: File[],
  opts: {
    tableNames?: string[]
    sheets?: string[]
    replace?: boolean
    sync?: boolean
  } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<SpreadsheetUploadResult> {
  const fd = new FormData()
  for (const f of files) fd.append('files', f)
  if (opts.tableNames?.length) {
    fd.append('tableNames', JSON.stringify(opts.tableNames))
  }
  if (opts.sheets?.length) {
    fd.append('sheets', JSON.stringify(opts.sheets))
  }
  if (opts.replace) fd.append('replace', 'true')
  if (opts.sync === false) fd.append('sync', 'false')
  const res = await apiFetch(
    `/workspaces/${workspaceId}/connections/${connectionId}/upload`,
    { method: 'POST', body: fd },
  )
  const body = (await res.json().catch(() => ({}))) as SpreadsheetUploadResult & {
    error?: string
  }
  if (!res.ok || !body.connection) {
    throw new Error(body.error ?? `upload files ${res.status}`)
  }
  return body
}

export async function updateConnection(
  connectionId: string,
  patch: {
    name?: string
    type?: DataSource['type']
    description?: string | null
    status?: DataSource['status']
    config?: Record<string, unknown>
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<DataSource> {
  const res = await apiFetch(`/workspaces/${workspaceId}/connections/${connectionId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
  )
  const body = (await res.json().catch(() => ({}))) as {
    connection?: DataSource
    error?: string
  }
  if (!res.ok || !body.connection) {
    throw new Error(body.error ?? `update connection ${res.status}`)
  }
  return body.connection
}

export async function deleteConnection(
  connectionId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(`/workspaces/${workspaceId}/connections/${connectionId}`,
    { method: 'DELETE' },
  )
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `delete connection ${res.status}`)
  }
}

export type LayoutPositions = Record<string, { x: number; y: number }>

/**
 * Persist canvas node positions. Returns false on failure (UI keeps local state).
 */
export async function saveWorkspaceLayout(
  positions: LayoutPositions,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<boolean> {
  try {
    const res = await apiFetch(`/workspaces/${workspaceId}/layout`,
      {
        method: 'PUT',
        body: JSON.stringify({ positions }),
      },
    )
    return res.ok
  } catch {
    return false
  }
}

export type RelationshipReviewAction = 'promote' | 'reject'

/**
 * Promote (accept as explicit) or reject an inferred Stitch Relation.
 */
export async function reviewRelationship(
  relationshipId: string,
  action: RelationshipReviewAction,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<SchemaRelationship | null> {
  try {
    const res = await apiFetch(`/workspaces/${workspaceId}/relationships/${relationshipId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      },
    )
    if (!res.ok) return null
    const body = (await res.json()) as { relationship: SchemaRelationship }
    return body.relationship
  } catch {
    return null
  }
}

export interface JoinInferenceResult {
  ok: boolean
  created: number
  scanned: number
  connections: number
  durationMs: number
}

/** Re-run cross-source join inference (no full sync). */
export async function runJoinInference(
  options: { connectionId?: string } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<JoinInferenceResult> {
  const res = await apiFetch(`/workspaces/${workspaceId}/join-inference`, {
    method: 'POST',
    body: JSON.stringify(options),
  })
  const body = (await res.json().catch(() => ({}))) as JoinInferenceResult & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(body.error ?? `join-inference ${res.status}`)
  }
  return body
}

export interface StitchSessionSuggestion {
  id: string
  confidence: number
  label?: string
  joinCriteria?: string
  from: string
  to: string
  evidence?: { summary?: string; signals?: { code: string; label: string; weight: number }[] }
}

export interface StitchSessionResult {
  ok: boolean
  connectionA: { id: string; name?: string; sourceType?: string }
  connectionB: { id: string; name?: string; sourceType?: string }
  inference: { created: number; scanned: number }
  suggested: StitchSessionSuggestion[]
  acceptedBetween: number
  tables: { name: string; connectionId: string }[]
  job?: StitchJob | null
  export?: Record<string, unknown> | null
}

/** Two-source stitch session: infer A↔B joins, optionally create job. */
export async function runStitchSession(
  options: {
    connectionIdA: string
    connectionIdB: string
    createJob?: boolean
    shipDbtPr?: boolean
    jobTitle?: string
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<StitchSessionResult> {
  const res = await apiFetch(`/workspaces/${workspaceId}/stitch-session`, {
    method: 'POST',
    body: JSON.stringify(options),
  })
  const body = (await res.json().catch(() => ({}))) as StitchSessionResult & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(body.error ?? `stitch-session ${res.status}`)
  }
  return body
}

export interface SyncConnectionResult {
  ok: boolean
  connectionId: string
  sourceType?: string
  schema: string
  tablesSynced: number
  columnsSynced: number
  relationshipsSynced: number
  suggestedJoins?: number
  drift?: {
    tablesAdded: string[]
    tablesRemoved: string[]
    joinsBroken: {
      id: string
      label: string
      fromTable: string
      fromColumn: string
      toTable: string
      toColumn: string
    }[]
    suggestedJoins: number
    summary: string
    hasRisk: boolean
  }
}

/**
 * Introspect a live connection (Postgres) and refresh Stitch metadata.
 */
export async function syncConnection(
  connectionId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<SyncConnectionResult> {
  const res = await apiFetch(`/workspaces/${workspaceId}/connections/${connectionId}/sync`,
    { method: 'POST' },
  )
  const body = (await res.json().catch(() => ({}))) as SyncConnectionResult & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(body.error ?? `sync ${res.status}`)
  }
  return body
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatReferencedTable {
  name: string
  entityKind: string
  sourceType: string
  connection: string
  columns: {
    name: string
    dataType: string
    keyKind: string
    samples?: unknown[]
  }[]
}

export interface SamplePreview {
  table: string
  connection: string | null
  sourceType: string | null
  policy: string
  note: string
  columns: { name: string; dataType: string; keyKind: string }[]
  rows: Record<string, unknown>[]
  rowCount: number
}

export interface JobNotebookCell {
  id: string
  kind: 'markdown' | 'sql'
  title?: string
  content: string
}

export interface ChatJobDraft {
  title: string
  status: string
  sources: string[]
  tables: string[]
  steps: { id: number; action: string; detail: string }[]
  notes?: string
  sqlText?: string | null
  notebook?: JobNotebookCell[]
}

export interface RetrievedChunk {
  sourceKind: string
  sourceRef: string
  title: string
  score: number
}

export interface ChatResponse {
  ok: boolean
  reply: string
  citations: string[]
  jobDraft: ChatJobDraft | null
  referencedTables: ChatReferencedTable[]
  samplePreviews?: SamplePreview[]
  sql: string | null
  mode: string
  model?: string | null
  retrievedChunks?: RetrievedChunk[]
  vectorReady?: boolean
  contextStats?: {
    tableCount: number
    columnCount: number
    relationshipCount: number
    suggestedJoins: number
  }
}

/** Schema-only chat — never sends raw warehouse rows */
export async function sendChatMessage(
  message: string,
  history: ChatMessage[] = [],
  workspaceId: string = getActiveWorkspaceId(),
  opts?: {
    signal?: AbortSignal
    /** Explicit @table / @table.column focus from the composer */
    mentions?: { tables: string[]; columns: { table: string; column: string }[] }
    modelId?: string
    sessionId?: string
  },
): Promise<ChatResponse> {
  const res = await apiFetch(`/workspaces/${workspaceId}/chat`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      history,
      mentions: opts?.mentions ?? undefined,
      modelId: opts?.modelId,
      sessionId: opts?.sessionId,
    }),
    signal: opts?.signal,
  })
  const body = (await res.json().catch(() => ({}))) as ChatResponse & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(body.error ?? `chat ${res.status}`)
  }
  return body
}

export async function sendChatFeedback(
  payload: {
    rating: 1 | -1
    messageId?: string
    content?: string
    modelId?: string
    sourceRefs?: string[]
    note?: string
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ ok: boolean; id: string }> {
  const res = await apiFetch(`/workspaces/${workspaceId}/chat/feedback`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    id?: string
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `feedback ${res.status}`)
  return { ok: true, id: body.id || '' }
}

export interface AiModelInfo {
  id: string
  provider: string
  model: string
  label: string
  configured?: boolean
}

export interface AiStatus {
  ok: boolean
  vectorReady: boolean
  embeddingMode: 'openai' | 'local' | string
  models: AiModelInfo[]
  stats: {
    workspaceChunks: number
    docChunks: number
    tableChunks: number
    relationshipChunks: number
    lastIndexedAt: string | null
  } | null
  pillars: Record<string, boolean>
}

export async function fetchAiStatus(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<AiStatus> {
  const res = await apiFetch(`/workspaces/${workspaceId}/ai/status`)
  if (!res.ok) throw new Error(`ai status ${res.status}`)
  return res.json()
}

export async function reindexAi(
  opts?: { docs?: boolean },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ ok: boolean; stats?: AiStatus['stats']; error?: string }> {
  const res = await apiFetch(`/workspaces/${workspaceId}/ai/reindex`, {
    method: 'POST',
    body: JSON.stringify({ docs: opts?.docs !== false }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    stats?: AiStatus['stats']
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `reindex ${res.status}`)
  return { ok: Boolean(body.ok), stats: body.stats, error: body.error }
}

export interface ContextPackSummary {
  ok: boolean
  stats: ChatResponse['contextStats']
  snapshot: { id: string; label: string; createdAt: string } | null
  tables: ChatReferencedTable[]
  relationships: unknown[]
}

export async function fetchSchemaContext(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<ContextPackSummary> {
  const res = await apiFetch(`/workspaces/${workspaceId}/context`,
  )
  if (!res.ok) throw new Error(`context ${res.status}`)
  return res.json()
}

export type JobStatus = 'draft' | 'ready' | 'exported' | 'archived'

export interface StitchJob {
  id: string
  workspaceId: string
  title: string
  status: JobStatus
  sources: string[]
  tables: string[]
  steps: { id: number; action: string; detail: string }[]
  sqlText: string | null
  notes: string | null
  notebook: JobNotebookCell[]
  /** false when API derived cells from legacy fields — UI may backfill once */
  notebookPersisted?: boolean
  relationshipIds?: string[]
  joinsSnapshot?: {
    id: string
    fromTable: string
    fromColumn: string
    toTable: string
    toColumn: string
    joinCriteria?: string
    confidence?: number | null
    fromType?: string | null
    toType?: string | null
  }[]
  schemaSnapshotId?: string | null
  contract?: {
    version?: number
    policy?: string
    frozenAt?: string
    schemaSnapshotId?: string | null
    schemaSnapshotLabel?: string | null
    relationshipIds?: string[]
    tables?: unknown[]
    joins?: unknown[]
    claim?: string
  } | null
  createdAt: string
  updatedAt: string
}

export async function fetchJobs(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<StitchJob[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/jobs`)
  if (!res.ok) throw new Error(`jobs ${res.status}`)
  const body = (await res.json()) as { jobs: StitchJob[] }
  return body.jobs
}

export async function createJobFromDraft(
  draft: ChatJobDraft & { sqlText?: string | null },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<StitchJob> {
  const res = await apiFetch(`/workspaces/${workspaceId}/jobs`, {
    method: 'POST',
    body: JSON.stringify({
      title: draft.title,
      status: 'draft',
      sources: draft.sources,
      tables: draft.tables,
      steps: draft.steps,
      notes: draft.notes,
      sqlText: draft.sqlText ?? null,
      notebook: draft.notebook,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    job?: StitchJob
    error?: string
  }
  if (!res.ok || !body.job) {
    throw new Error(body.error ?? `create job ${res.status}`)
  }
  return body.job
}

/** Manual job create from Jobs page (no AI chat required). */
export async function createManualJob(
  input: {
    title: string
    tables?: string[]
    sources?: string[]
    notes?: string
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<StitchJob> {
  const title = String(input.title || '').trim() || 'Untitled Que job'
  const tables = (input.tables || []).map(String).filter(Boolean)
  const res = await apiFetch(`/workspaces/${workspaceId}/jobs`, {
    method: 'POST',
    body: JSON.stringify({
      title,
      status: 'draft',
      sources: input.sources ?? [],
      tables,
      notes:
        input.notes ??
        'Created manually from Jobs. Edit notebook cells, then dry-run / live-run / deploy.',
      sqlText:
        tables.length >= 2
          ? null
          : [
              '-- Manual Que notebook',
              '-- Write your stitch SQL below, then SAVE and RUN.',
              'SELECT 1 AS que_ready;',
            ].join('\n'),
    }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    job?: StitchJob
    error?: string
  }
  if (!res.ok || !body.job) {
    throw new Error(body.error ?? `create job ${res.status}`)
  }
  return body.job
}

/** One-click canvas → job with frozen accepted joins */
export async function createStitchJobFromCanvas(
  tableNames: string[],
  workspaceId: string = getActiveWorkspaceId(),
): Promise<StitchJob> {
  const res = await apiFetch(`/workspaces/${workspaceId}/jobs`, {
    method: 'POST',
    body: JSON.stringify({
      fromCanvas: true,
      tableNames,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    job?: StitchJob
    error?: string
  }
  if (!res.ok || !body.job) {
    throw new Error(body.error ?? `create stitch job ${res.status}`)
  }
  return body.job
}

export async function updateJob(
  jobId: string,
  patch: Partial<{
    title: string
    status: JobStatus
    notes: string | null
    sqlText: string | null
    steps: StitchJob['steps']
    notebook: JobNotebookCell[]
    refreezeContract: boolean
    refreezeJoins: boolean
  }>,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<StitchJob> {
  const res = await apiFetch(`/workspaces/${workspaceId}/jobs/${jobId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
  )
  const body = (await res.json().catch(() => ({}))) as {
    job?: StitchJob
    error?: string
  }
  if (!res.ok || !body.job) {
    throw new Error(body.error ?? `update job ${res.status}`)
  }
  return body.job
}

export type JobRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface JobRunLog {
  ts: string
  level: 'info' | 'warn' | 'error' | string
  message: string
}

export interface JobRunSamplePreview {
  table: string
  connection?: string | null
  sourceType?: string | null
  policy?: string
  note?: string
  columns: { name: string; dataType: string; keyKind: string }[]
  rows: Record<string, unknown>[]
  rowCount: number
  cellId?: string
  cellTitle?: string
}

export interface JobRunLiveResult {
  cellId: string
  cellTitle?: string
  connectionId?: string
  connectionName?: string
  engine?: string
  columns: { name: string; dataType?: string }[]
  rows: Record<string, unknown>[]
  rowCount: number
  truncated?: boolean
  durationMs?: number
  sqlExecuted?: string
  policy?: string
}

export interface JobRun {
  id: string
  workspaceId: string
  jobId: string
  status: JobRunStatus
  scope: 'all' | 'cell'
  cellId: string | null
  mode: 'dry_run' | 'live'
  summary: string | null
  logs: JobRunLog[]
  output: {
    mode?: string
    policy?: string
    note?: string
    cellResults?: {
      cellId: string
      kind: string
      title?: string
      status: string
      issues?: { level: string; message: string }[]
      tableRefs?: string[]
    }[]
    samplePreviews?: JobRunSamplePreview[]
    liveResults?: JobRunLiveResult[]
    connection?: { id: string; name: string; type: string } | null
    contractSnapshotId?: string | null
    error?: string
  }
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
}

/** Run notebook cells — dry_run (schema) or live (read-only SQL on source). */
export async function runJobNotebook(
  jobId: string,
  body: {
    scope?: 'all' | 'cell'
    cellId?: string
    notebook?: JobNotebookCell[]
    mode?: 'dry_run' | 'live' | 'validate'
    connectionId?: string
    maxRows?: number
  } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<JobRun> {
  const res = await apiFetch(`/workspaces/${workspaceId}/jobs/${jobId}/run`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const payload = (await res.json().catch(() => ({}))) as {
    run?: JobRun
    error?: string
  }
  if (!res.ok || !payload.run) {
    throw new Error(payload.error ?? `run job ${res.status}`)
  }
  return payload.run
}

export async function fetchJobRuns(
  jobId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<JobRun[]> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/jobs/${jobId}/runs?limit=20`,
  )
  if (!res.ok) throw new Error(`runs ${res.status}`)
  const body = (await res.json()) as { runs: JobRun[] }
  return body.runs || []
}

export async function exportJobArtifact(
  jobId: string,
  format: 'json' | 'sql' | 'dbt' | 'dbt-pr' = 'json',
  options: {
    githubOwner?: string
    githubRepo?: string
    githubBaseBranch?: string
    branchName?: string
    force?: boolean
  } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ job: StitchJob; export: Record<string, unknown> }> {
  const res = await apiFetch(`/workspaces/${workspaceId}/jobs/${jobId}/export`, {
    method: 'POST',
    body: JSON.stringify({ format, ...options }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    job?: StitchJob
    export?: Record<string, unknown>
    error?: string
    validation?: { errors?: string[]; warnings?: string[] }
  }
  if (!res.ok || !body.job || !body.export) {
    const detail = body.validation?.errors?.length
      ? ` — ${body.validation.errors.slice(0, 3).join('; ')}`
      : ''
    throw new Error((body.error ?? `export job ${res.status}`) + detail)
  }
  return { job: body.job, export: body.export }
}

export interface DriftEvent {
  id: string
  connectionId?: string
  severity: 'info' | 'warn' | 'high' | string
  code: string
  summary: string
  detail?: unknown
  acknowledged?: boolean
  createdAt: string
}

export async function fetchDrift(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{
  events: DriftEvent[]
  openHigh: DriftEvent[]
  hasBlockingRisk: boolean
}> {
  const res = await apiFetch(`/workspaces/${workspaceId}/drift`)
  if (!res.ok) throw new Error(`drift ${res.status}`)
  return res.json()
}

export async function acknowledgeDriftEvent(
  eventId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/drift/${eventId}/ack`,
    { method: 'POST', body: '{}' },
  )
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `ack drift ${res.status}`)
  }
}

export async function fetchContractOutbox(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ events: { id: string; eventType: string; delivered: boolean; createdAt: string }[] }> {
  const res = await apiFetch(`/workspaces/${workspaceId}/events/outbox`)
  if (!res.ok) throw new Error(`outbox ${res.status}`)
  return res.json()
}

export interface DbtExportFile {
  path: string
  content: string
}

export interface DbtGithubResult {
  opened?: boolean
  reason?: string
  prUrl?: string
  htmlUrl?: string
  number?: number
  branch?: string
  owner?: string
  repo?: string
  baseBranch?: string
}

export interface WorkspaceSettingsFlags {
  includeSamplesDefault: boolean
  scrubSamples?: boolean
  inferJoinsOnSync: boolean
  preferLlmChat: boolean
  aiModelId: string
  ragTopK: number
  ragIncludeDocs: boolean
  blockExportOnDrift: boolean
  blockPrOnColumnDrift?: boolean
  blockExportOnUnreviewedJoins: boolean
  databricksQueryJoinAssist?: boolean
  emitContractEvents: boolean
  contractWebhookUrl: string
  githubOwner: string
  githubRepo: string
  githubBaseBranch: string
  dbtModelsPath: string
}

export interface WorkspaceSettingsPayload {
  ok: boolean
  workspace: {
    id: string
    name: string
    slug: string
    createdAt: string
  }
  settings: WorkspaceSettingsFlags
  stats: {
    connections: number
    tables: number
    relationships: number
    jobs: number
  }
  latestSnapshot: {
    id: string
    label: string
    createdAt: string
  } | null
  capabilities: {
    connectors: string[]
    llm: {
      openaiConfigured: boolean
      anthropicConfigured: boolean
      openaiSource?: 'workspace' | 'env' | 'none'
      anthropicSource?: 'workspace' | 'env' | 'none'
      byok?: boolean
    }
    secrets?: WorkspaceSecretsStatus
    ai?: {
      vectorReady: boolean
      embeddingMode: string
      models: AiModelInfo[]
      docsIndexed: boolean
      chunkStats: AiStatus['stats']
      feedback: { up: number; down: number }
      pillars: Record<string, boolean>
    }
    github?: {
      tokenConfigured: boolean
      dbtExport: boolean
      tokenSource?: string
    }
    brand: string
    wedge: string
  }
}

export interface WorkspaceSecretSlot {
  configured: boolean
  source: 'workspace' | 'env' | 'none'
  hint: string | null
}

export interface WorkspaceSecretsStatus {
  openai: WorkspaceSecretSlot
  anthropic: WorkspaceSecretSlot
  github?: WorkspaceSecretSlot
  byok: boolean
  secretsKeyConfigured?: boolean
  note?: string
}

export async function fetchWorkspaceSettings(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<WorkspaceSettingsPayload> {
  const res = await apiFetch(`/workspaces/${workspaceId}/settings`,
  )
  if (!res.ok) throw new Error(`settings ${res.status}`)
  return res.json()
}

export async function updateWorkspaceSettings(
  patch: Partial<WorkspaceSettingsFlags>,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<WorkspaceSettingsPayload> {
  const res = await apiFetch(`/workspaces/${workspaceId}/settings`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
  )
  const body = (await res.json().catch(() => ({}))) as WorkspaceSettingsPayload & {
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `settings ${res.status}`)
  return body
}

/** BYOK — set/clear workspace LLM keys. Never returns plaintext. */
export async function updateWorkspaceLlmSecrets(
  patch: {
    openaiApiKey?: string | null
    anthropicApiKey?: string | null
    githubToken?: string | null
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<WorkspaceSecretsStatus> {
  const res = await apiFetch(`/workspaces/${workspaceId}/secrets/llm`, {
    method: 'PUT',
    body: JSON.stringify(patch),
  })
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    secrets?: WorkspaceSecretsStatus
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `secrets ${res.status}`)
  if (!body.secrets) throw new Error('secrets response missing status')
  return body.secrets
}

export type WorkspaceMemberRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface WorkspaceMember {
  id: string
  email: string
  displayName: string | null
  role: WorkspaceMemberRole
  joinedAt?: string
}

export interface WorkspaceInvite {
  id: string
  email: string
  role: string
  invitedBy?: string | null
  acceptedAt?: string | null
  createdAt?: string
}

export async function fetchWorkspaceMembers(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<WorkspaceMember[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/members`)
  if (!res.ok) throw new Error(`members ${res.status}`)
  const body = (await res.json()) as { members: WorkspaceMember[] }
  return body.members ?? []
}

export async function updateWorkspaceMemberRole(
  userId: string,
  nextRole: WorkspaceMemberRole,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<WorkspaceMember> {
  const res = await apiFetch(`/workspaces/${workspaceId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role: nextRole }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    member?: WorkspaceMember
    error?: string
  }
  if (!res.ok || !body.member) {
    throw new Error(body.error ?? `member role ${res.status}`)
  }
  return body.member
}

export async function removeWorkspaceMember(
  userId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(`/workspaces/${workspaceId}/members/${userId}`, {
    method: 'DELETE',
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error ?? `remove member ${res.status}`)
}

export async function fetchWorkspaceInvites(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<WorkspaceInvite[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/invites`)
  if (!res.ok) throw new Error(`invites ${res.status}`)
  const body = (await res.json()) as { invites: WorkspaceInvite[] }
  return body.invites ?? []
}

export async function createWorkspaceInvite(
  email: string,
  role: WorkspaceMemberRole = 'member',
  workspaceId: string = getActiveWorkspaceId(),
): Promise<WorkspaceInvite> {
  const res = await apiFetch(`/workspaces/${workspaceId}/invites`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    invite?: WorkspaceInvite
    error?: string
  }
  if (!res.ok || !body.invite) {
    throw new Error(body.error ?? `invite ${res.status}`)
  }
  return body.invite
}

export async function revokeWorkspaceInvite(
  inviteId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/invites/${inviteId}`,
    { method: 'DELETE' },
  )
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error ?? `revoke invite ${res.status}`)
}

/** Load workspace graph. Auth errors never silently become dummy data. */
export type WorkspaceLoadError = 'auth' | 'forbidden' | 'offline' | null

export async function loadWorkspaceData(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{
  tables: SchemaTable[]
  relationships: SchemaRelationship[]
  sources: DataSource[]
  fromApi: boolean
  loadError: WorkspaceLoadError
}> {
  try {
    const [schema, sources] = await Promise.all([
      fetchWorkspaceSchema(workspaceId),
      fetchWorkspaceSources(workspaceId),
    ])
    return {
      tables: schema.tables,
      relationships: schema.relationships,
      sources,
      fromApi: true,
      loadError: null,
    }
  } catch (err) {
    if (err instanceof ApiHttpError) {
      if (err.status === 401) {
        return {
          tables: [],
          relationships: [],
          sources: [],
          fromApi: false,
          loadError: 'auth',
        }
      }
      if (err.status === 403) {
        return {
          tables: [],
          relationships: [],
          sources: [],
          fromApi: false,
          loadError: 'forbidden',
        }
      }
    }
    // Live-only testing: never paint fake schema when API is down
    const liveOnly =
      import.meta.env.VITE_STITCH_LIVE_ONLY === '1' ||
      import.meta.env.VITE_STITCH_LIVE_ONLY === 'true'
    if (liveOnly) {
      return {
        tables: [],
        relationships: [],
        sources: [],
        fromApi: false,
        loadError: 'offline',
      }
    }
    return {
      tables: DUMMY_TABLES,
      relationships: DUMMY_RELATIONSHIPS,
      sources: DUMMY_DATA_SOURCES,
      fromApi: false,
      loadError: 'offline',
    }
  }
}
