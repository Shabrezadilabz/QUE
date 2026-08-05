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
    syncSchedule?: 'off' | 'hourly' | 'daily'
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
  const res = await apiFetch(
    `/workspaces/${workspaceId}/relationships/${relationshipId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    },
  )
  const body = (await res.json().catch(() => ({}))) as {
    relationship?: SchemaRelationship
    error?: string
  }
  if (!res.ok) {
    throw new Error(body.error ?? `review ${res.status}`)
  }
  return body.relationship ?? null
}

export interface JoinReviewEndpoint {
  tableId: string
  table: string
  columnId: string
  column: string
  dataType: string
  samples: string[]
  connection: string
  sourceType: string
  sourceLabel: string
}

export interface JoinReviewItem {
  id: string
  status: string
  type: string
  confidence: number
  joinCriteria: string | null
  label: string | null
  aiNotes: string | null
  evidence: {
    summary: string | null
    signals: { code?: string; label?: string; weight?: number }[]
    scoredAt: string | null
  }
  from: JoinReviewEndpoint
  to: JoinReviewEndpoint
  crossSource: boolean
  createdAt: string
  updatedAt: string
}

export interface JoinReviewInbox {
  items: JoinReviewItem[]
  summary: {
    pending: number
    accepted: number
    rejected: number
  }
}

/** Wave 2.1 — suggested joins inbox with evidence. */
export async function fetchJoinReviews(
  opts: { status?: string; limit?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<JoinReviewInbox> {
  const q = new URLSearchParams()
  if (opts.status) q.set('status', opts.status)
  if (opts.limit != null) q.set('limit', String(opts.limit))
  const qs = q.toString()
  const res = await apiFetch(
    `/workspaces/${workspaceId}/join-reviews${qs ? `?${qs}` : ''}`,
  )
  const body = (await res.json().catch(() => ({}))) as JoinReviewInbox & {
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `join-reviews ${res.status}`)
  return {
    items: body.items ?? [],
    summary: body.summary ?? { pending: 0, accepted: 0, rejected: 0 },
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
  /** Wave 4.2 */
  runSchedule?: 'off' | 'hourly' | 'daily'
  runNextAt?: string | null
  lastScheduledRunAt?: string | null
  runMode?: 'dry_run' | 'live'
  maxRetries?: number
  retryDelaySec?: number
  /** Wave 4.5 */
  executionTarget?: 'que' | 'private_runner'
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
    runSchedule: 'off' | 'hourly' | 'daily'
    runMode: 'dry_run' | 'live'
    maxRetries: number
    retryDelaySec: number
    executionTarget: 'que' | 'private_runner'
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

export interface JobContractValidation {
  ok: boolean
  blocking: boolean
  warnings: string[]
  errors: string[]
}

export interface JobContractStatus {
  hasContract: boolean
  frozenAt: string | null
  schemaSnapshotId: string | null
  schemaSnapshotLabel: string | null
  latestSchemaSnapshotId: string | null
  stale: boolean
  frozenJoinCount: number
  acceptedJoinsAvailable: number
  unreviewedJoins: number
  readyToFreeze: boolean
  validation: JobContractValidation
  joins: StitchJob['joinsSnapshot']
  claim: string | null
}

export async function fetchJobContract(
  jobId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{
  jobId: string
  title: string
  tables: string[]
  contract: StitchJob['contract']
  status: JobContractStatus
}> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/jobs/${jobId}/contract`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    jobId?: string
    title?: string
    tables?: string[]
    contract?: StitchJob['contract']
    status?: JobContractStatus
    error?: string
  }
  if (!res.ok || !body.status) {
    throw new Error(body.error ?? `job contract ${res.status}`)
  }
  return {
    jobId: body.jobId || jobId,
    title: body.title || '',
    tables: body.tables || [],
    contract: body.contract || null,
    status: body.status,
  }
}

export async function freezeJobContract(
  jobId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ job: StitchJob; status: JobContractStatus }> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/jobs/${jobId}/contract/freeze`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    job?: StitchJob
    status?: JobContractStatus
    error?: string
  }
  if (!res.ok || !body.job || !body.status) {
    throw new Error(body.error ?? `freeze contract ${res.status}`)
  }
  return { job: body.job, status: body.status }
}

export async function validateJobContract(
  jobId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{
  validation: JobContractValidation
  status: JobContractStatus
  contract: StitchJob['contract']
}> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/jobs/${jobId}/contract/validate`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    validation?: JobContractValidation
    status?: JobContractStatus
    contract?: StitchJob['contract']
    error?: string
  }
  if (!res.ok || !body.validation || !body.status) {
    throw new Error(body.error ?? `validate contract ${res.status}`)
  }
  return {
    validation: body.validation,
    status: body.status,
    contract: body.contract || null,
  }
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
  trigger?: 'manual' | 'schedule' | 'retry' | 'webhook'
  attempt?: number
  parentRunId?: string | null
  jobTitle?: string | null
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
    createArtifact?: boolean
    ttlHours?: number
  } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{
  job: StitchJob
  export: Record<string, unknown>
  artifact?: {
    id: string
    downloadUrl: string
    downloadPath: string
    expiresAt: string
    filename: string
    contentSha256: string
    note?: string
  } | null
}> {
  const res = await apiFetch(`/workspaces/${workspaceId}/jobs/${jobId}/export`, {
    method: 'POST',
    body: JSON.stringify({ format, ...options }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    job?: StitchJob
    export?: Record<string, unknown>
    artifact?: {
      id: string
      downloadUrl: string
      downloadPath: string
      expiresAt: string
      filename: string
      contentSha256: string
      note?: string
    } | null
    error?: string
    validation?: { errors?: string[]; warnings?: string[] }
  }
  if (!res.ok || !body.job || !body.export) {
    const detail = body.validation?.errors?.length
      ? ` — ${body.validation.errors.slice(0, 3).join('; ')}`
      : ''
    throw new Error((body.error ?? `export job ${res.status}`) + detail)
  }
  return { job: body.job, export: body.export, artifact: body.artifact }
}

export interface JobMaterializationResult {
  ok: boolean
  note?: string
  materialization: {
    id: string
    runId: string
    kind: 'table' | 'view'
    schema: string | null
    objectName: string
    qualifiedName: string
    connectionId: string
    connectionName: string
    engine: string
    sqlHash: string
    durationMs: number
    createdAt: string
  }
  attestation?: Record<string, unknown>
}

/** Wave 3.1 — CTAS/VIEW in customer warehouse (confirm required). */
export async function materializeJob(
  jobId: string,
  options: {
    confirm: true
    connectionId?: string
    objectName?: string
    schema?: string
    kind?: 'table' | 'view'
    replace?: boolean
    force?: boolean
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<JobMaterializationResult> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/jobs/${jobId}/materialize`,
    {
      method: 'POST',
      body: JSON.stringify(options),
    },
  )
  const body = (await res.json().catch(() => ({}))) as JobMaterializationResult & {
    error?: string
    validation?: { errors?: string[] }
  }
  if (!res.ok || !body.materialization) {
    const detail = body.validation?.errors?.length
      ? ` — ${body.validation.errors.slice(0, 3).join('; ')}`
      : ''
    throw new Error((body.error ?? `materialize ${res.status}`) + detail)
  }
  return body
}

/** Wave 3.3 — signed / tokenized export artifact */
export interface SignedArtifactSummary {
  id: string
  workspaceId: string
  jobId: string | null
  jobTitle: string | null
  format: string
  filename: string
  contentType: string
  contentSha256: string
  expiresAt: string | null
  revokedAt: string | null
  downloadCount: number
  lastDownloadedAt: string | null
  createdAt: string | null
  active: boolean
  actor: {
    id: string
    email: string | null
    displayName: string | null
  } | null
}

export interface MintedArtifact {
  artifact: SignedArtifactSummary
  downloadUrl: string
  downloadPath: string
  expiresAt: string
  note?: string
  job?: StitchJob
}

export async function mintJobArtifactLink(
  jobId: string,
  options: {
    format?: 'json' | 'sql' | 'dbt' | 'dbt-pr'
    ttlHours?: number
    force?: boolean
  } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<MintedArtifact> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/jobs/${jobId}/artifacts`,
    {
      method: 'POST',
      body: JSON.stringify(options),
    },
  )
  const body = (await res.json().catch(() => ({}))) as MintedArtifact & {
    error?: string
    validation?: { errors?: string[] }
  }
  if (!res.ok || !body.artifact || !body.downloadUrl) {
    const detail = body.validation?.errors?.length
      ? ` — ${body.validation.errors.slice(0, 3).join('; ')}`
      : ''
    throw new Error((body.error ?? `mint artifact ${res.status}`) + detail)
  }
  return body
}

export async function fetchWorkspaceArtifacts(
  opts: { jobId?: string; limit?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<SignedArtifactSummary[]> {
  const q = new URLSearchParams()
  if (opts.jobId) q.set('jobId', opts.jobId)
  if (opts.limit != null) q.set('limit', String(opts.limit))
  const qs = q.toString()
  const res = await apiFetch(
    `/workspaces/${workspaceId}/artifacts${qs ? `?${qs}` : ''}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    events?: SignedArtifactSummary[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `artifacts ${res.status}`)
  return body.events ?? []
}

export async function revokeWorkspaceArtifact(
  artifactId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/artifacts/${artifactId}/revoke`,
    { method: 'POST', body: '{}' },
  )
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `revoke artifact ${res.status}`)
  }
}

/** Wave 3.4 — lineage lite */
export interface LineageStage {
  key: string
  label: string
  count: number
  ready: boolean
}

export interface LineagePath {
  job: {
    id: string
    title: string
    status: string
    updatedAt: string | null
  }
  stages: LineageStage[]
  sources: {
    id: string | null
    name: string
    type: string | null
    status: string | null
  }[]
  joins: {
    id: string | null
    label: string
    fromTable: string | null
    toTable: string | null
    frozen: boolean
  }[]
  tables: string[]
  export: {
    id: string
    format: string
    fingerprint: string | null
    githubPrUrl: string | null
    createdAt: string
  } | null
  materializations: {
    id: string
    kind: string
    qualifiedName: string
    connectionId: string | null
    createdAt: string
  }[]
  artifacts: {
    id: string
    format: string
    filename: string
    active: boolean
    downloadCount: number
    expiresAt: string | null
    createdAt: string
  }[]
  complete: boolean
}

export interface WorkspaceLineage {
  ok: boolean
  note: string
  summary: {
    sources: number
    acceptedJoins: number
    jobs: number
    exported: number
    materialized: number
    completePaths: number
  }
  paths: LineagePath[]
  unusedSources: {
    id: string
    name: string
    type: string
    status: string
  }[]
  joins: unknown[]
}

export async function fetchWorkspaceLineage(
  opts: { jobId?: string; limit?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<WorkspaceLineage> {
  const q = new URLSearchParams()
  if (opts.jobId) q.set('jobId', opts.jobId)
  if (opts.limit != null) q.set('limit', String(opts.limit))
  const qs = q.toString()
  const res = await apiFetch(
    `/workspaces/${workspaceId}/lineage${qs ? `?${qs}` : ''}`,
  )
  const body = (await res.json().catch(() => ({}))) as WorkspaceLineage & {
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `lineage ${res.status}`)
  return body
}

export interface DriftEvent {
  id: string
  connectionId?: string | null
  severity: 'info' | 'warn' | 'high' | string
  code: string
  summary: string
  detail?: unknown
  acknowledged?: boolean
  createdAt: string
  notifiedAt?: string | null
  notifyStatus?: string | null
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

/** Wave 2.3 — re-notify Slack/webhook/email for a drift event */
export async function notifyDriftEvent(
  eventId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{
  notify: { delivered?: boolean; status?: string; channels?: string[] }
}> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/drift/${eventId}/notify`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    notify?: { delivered?: boolean; status?: string; channels?: string[] }
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `notify drift ${res.status}`)
  return { notify: body.notify || {} }
}

/** Wave 2.3 — create synthetic high-drift test alert */
export async function sendDriftTestAlert(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{
  event: { id: string; summary: string }
  notify: { delivered?: boolean; status?: string }
}> {
  const res = await apiFetch(`/workspaces/${workspaceId}/drift/test-alert`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  const body = (await res.json().catch(() => ({}))) as {
    event?: { id: string; summary: string }
    notify?: { delivered?: boolean; status?: string }
    error?: string
  }
  if (!res.ok || !body.event) {
    throw new Error(body.error ?? `test alert ${res.status}`)
  }
  return { event: body.event, notify: body.notify || {} }
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
  driftAlertsEnabled?: boolean
  driftAlertOnHigh?: boolean
  driftAlertWebhookUrl?: string
  driftAlertEmails?: string
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
  /** Wave 1.4 — true when this user is the sole owner */
  isLastOwner?: boolean
}

export interface WorkspaceMembershipSummary {
  memberCount: number
  ownerCount: number
  hasSingleOwner: boolean
  lastOwnerId: string | null
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
): Promise<{
  members: WorkspaceMember[]
  summary: WorkspaceMembershipSummary | null
}> {
  const res = await apiFetch(`/workspaces/${workspaceId}/members`)
  if (!res.ok) throw new Error(`members ${res.status}`)
  const body = (await res.json()) as {
    members: WorkspaceMember[]
    summary?: WorkspaceMembershipSummary
  }
  return {
    members: body.members ?? [],
    summary: body.summary ?? null,
  }
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

export interface WorkspaceAuditEvent {
  id: string
  action: string
  resourceType: string | null
  resourceId: string | null
  summary: string | null
  meta: Record<string, unknown>
  createdAt: string
  actor: {
    id: string
    email: string | null
    displayName: string | null
  } | null
}

export async function fetchWorkspaceAuditEvents(
  opts: { limit?: number; offset?: number; action?: string } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<WorkspaceAuditEvent[]> {
  const q = new URLSearchParams()
  if (opts.limit != null) q.set('limit', String(opts.limit))
  if (opts.offset != null) q.set('offset', String(opts.offset))
  if (opts.action) q.set('action', opts.action)
  const qs = q.toString()
  const res = await apiFetch(
    `/workspaces/${workspaceId}/audit-events${qs ? `?${qs}` : ''}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    events?: WorkspaceAuditEvent[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `audit-events ${res.status}`)
  return body.events ?? []
}

export type UsageLimitKey = 'connections' | 'members' | 'syncs' | 'exports'

export interface WorkspaceUsage {
  plan: {
    name: string
    softLimits: boolean
    note: string
  }
  inventory: {
    connections: number
    connectionsError: number
    connectionsSynced: number
    tables: number
    relationships: number
    jobs: number
    members: number
  }
  period: {
    days: number
    since: string
    syncs: number
    syncFailures: number
    exports: number
    joinPromotes: number
  }
  againstLimits: Record<
    UsageLimitKey,
    { used: number; max: number; pct: number }
  >
  usagePct: number
  nearLimit: UsageLimitKey[]
}

export async function fetchWorkspaceUsage(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<WorkspaceUsage> {
  const res = await apiFetch(`/workspaces/${workspaceId}/usage`)
  const body = (await res.json().catch(() => ({}))) as {
    usage?: WorkspaceUsage
    error?: string
  }
  if (!res.ok || !body.usage) {
    throw new Error(body.error ?? `usage ${res.status}`)
  }
  return body.usage
}

/** Wave 2.4 — export attestation diligence pack */
export interface ExportAttestationSummary {
  id: string
  workspaceId: string
  jobId: string | null
  jobTitle: string | null
  format: string
  fingerprint: string | null
  githubOpened: boolean
  githubPrUrl: string | null
  meta: Record<string, unknown>
  createdAt: string
  actor: {
    id: string
    email: string | null
    displayName: string | null
  } | null
  policy: string | null
  signed: boolean
  attestation?: Record<string, unknown>
}

export interface AttestationVerifyResult {
  ok: boolean
  reason?: string | null
  fingerprint?: string | null
  policy?: string | null
  alg?: string | null
}

export async function fetchExportAttestations(
  opts: { jobId?: string; limit?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<ExportAttestationSummary[]> {
  const q = new URLSearchParams()
  if (opts.jobId) q.set('jobId', opts.jobId)
  if (opts.limit != null) q.set('limit', String(opts.limit))
  const qs = q.toString()
  const res = await apiFetch(
    `/workspaces/${workspaceId}/export-attestations${qs ? `?${qs}` : ''}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    events?: ExportAttestationSummary[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `export-attestations ${res.status}`)
  return body.events ?? []
}

export async function fetchExportAttestation(
  eventId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<ExportAttestationSummary> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/export-attestations/${eventId}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    event?: ExportAttestationSummary
    error?: string
  }
  if (!res.ok || !body.event) {
    throw new Error(body.error ?? `export-attestation ${res.status}`)
  }
  return body.event
}

export async function downloadAttestationVerifyPack(
  eventId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ filename: string; pack: Record<string, unknown> }> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/export-attestations/${eventId}/pack`,
  )
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(body.error ?? `attestation pack ${res.status}`)
  }
  const cd = res.headers.get('Content-Disposition') || ''
  const m = /filename="([^"]+)"/.exec(cd)
  return {
    filename: m?.[1] || `que-attestation-pack-${eventId.slice(0, 8)}.json`,
    pack: body,
  }
}

/** Public — no auth. Paste export.attestation JSON. */
export async function verifyAttestationPublic(
  attestation: unknown,
): Promise<AttestationVerifyResult> {
  const res = await fetch(`${getApiBase()}/auth/attestation/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attestation }),
  })
  const body = (await res.json().catch(() => ({}))) as AttestationVerifyResult & {
    error?: string
  }
  if (!res.ok) {
    throw new Error(body.error ?? `verify ${res.status}`)
  }
  return body
}

/** Wave 2.5 — scheduled schema sync (introspect only) */
export interface SyncScheduleStatus {
  enabled: boolean
  tickMs: number
  note: string
  summary: {
    total: number
    scheduled: number
    due: number
    hourly: number
    daily: number
  }
  connections: {
    id: string
    name: string
    type: string
    status: string
    syncSchedule: 'off' | 'hourly' | 'daily'
    syncNextAt: string | null
    lastScheduledSyncAt: string | null
    lastSyncAt: string | null
    lastSyncErrorKind: string | null
    syncable: boolean
  }[]
}

export async function fetchSyncScheduleStatus(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<SyncScheduleStatus> {
  const res = await apiFetch(`/workspaces/${workspaceId}/sync-schedule`)
  const body = (await res.json().catch(() => ({}))) as SyncScheduleStatus & {
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `sync-schedule ${res.status}`)
  return body
}

export async function runWorkspaceScheduledSync(
  opts: { limit?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{
  due: number
  ran: number
  results: { connectionId: string; name: string; ok: boolean; error?: string }[]
}> {
  const res = await apiFetch(`/workspaces/${workspaceId}/sync-schedule/run`, {
    method: 'POST',
    body: JSON.stringify(opts),
  })
  const body = (await res.json().catch(() => ({}))) as {
    due?: number
    ran?: number
    results?: {
      connectionId: string
      name: string
      ok: boolean
      error?: string
    }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `sync-schedule/run ${res.status}`)
  return {
    due: body.due ?? 0,
    ran: body.ran ?? 0,
    results: body.results ?? [],
  }
}

/** Wave 4.2 — scheduled job runs */
export interface JobScheduleStatus {
  enabled: boolean
  tickMs: number
  note: string
  summary: {
    total: number
    scheduled: number
    due: number
    hourly: number
    daily: number
  }
  jobs: {
    id: string
    title: string
    status: string
    runSchedule: 'off' | 'hourly' | 'daily'
    runNextAt: string | null
    lastScheduledRunAt: string | null
    runMode: 'dry_run' | 'live'
    maxRetries: number
    retryDelaySec: number
  }[]
}

export async function fetchJobScheduleStatus(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<JobScheduleStatus> {
  const res = await apiFetch(`/workspaces/${workspaceId}/jobs/schedule`)
  const body = (await res.json().catch(() => ({}))) as JobScheduleStatus & {
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `jobs/schedule ${res.status}`)
  return body
}

export async function runWorkspaceScheduledJobs(
  opts: { limit?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{
  due: number
  ran: number
  results: {
    jobId: string
    title: string
    ok: boolean
    error?: string
    status?: string
    attempts?: number
  }[]
}> {
  const res = await apiFetch(`/workspaces/${workspaceId}/jobs/schedule/run`, {
    method: 'POST',
    body: JSON.stringify(opts),
  })
  const body = (await res.json().catch(() => ({}))) as {
    due?: number
    ran?: number
    results?: {
      jobId: string
      title: string
      ok: boolean
      error?: string
      status?: string
      attempts?: number
    }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `jobs/schedule/run ${res.status}`)
  return {
    due: body.due ?? 0,
    ran: body.ran ?? 0,
    results: body.results ?? [],
  }
}

export async function fetchWorkspaceJobRuns(
  opts: { limit?: number; jobId?: string } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<JobRun[]> {
  const q = new URLSearchParams()
  if (opts.limit) q.set('limit', String(opts.limit))
  if (opts.jobId) q.set('jobId', opts.jobId)
  const qs = q.toString()
  const res = await apiFetch(
    `/workspaces/${workspaceId}/job-runs${qs ? `?${qs}` : ''}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    runs?: JobRun[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `job-runs ${res.status}`)
  return body.runs ?? []
}

/** Wave 4.3 */
export interface OrchestratorConfig {
  enabled: boolean
  kind: 'generic' | 'airflow' | 'dagster'
  webhookUrl: string
  secretConfigured: boolean
  webhookSecret?: string | null
}

export async function fetchOrchestratorConfig(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<OrchestratorConfig> {
  const res = await apiFetch(`/workspaces/${workspaceId}/orchestrator`)
  const body = (await res.json().catch(() => ({}))) as {
    config?: OrchestratorConfig
    error?: string
  }
  if (!res.ok || !body.config) {
    throw new Error(body.error ?? `orchestrator ${res.status}`)
  }
  return body.config
}

export async function updateOrchestratorConfig(
  patch: Record<string, unknown>,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<OrchestratorConfig> {
  const res = await apiFetch(`/workspaces/${workspaceId}/orchestrator`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  const body = (await res.json().catch(() => ({}))) as {
    config?: OrchestratorConfig
    error?: string
  }
  if (!res.ok || !body.config) {
    throw new Error(body.error ?? `orchestrator patch ${res.status}`)
  }
  return body.config
}

export async function testOrchestrator(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{
  ok?: boolean
  skipped?: boolean
  reason?: string
  status?: number
  error?: string
}> {
  const res = await apiFetch(`/workspaces/${workspaceId}/orchestrator/test`, {
    method: 'POST',
    body: '{}',
  })
  const body = (await res.json().catch(() => ({}))) as {
    result?: {
      ok?: boolean
      skipped?: boolean
      reason?: string
      status?: number
      error?: string
    }
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `orchestrator test ${res.status}`)
  return body.result ?? {}
}

/** Wave 4.4 */
export interface RenameSuggestion {
  id: string | null
  status: string
  suggestedAlias: string
  score: number
  reason: string
  from: { column: string; table: string; connection?: string }
  to: { column: string; table: string; connection?: string }
}

export async function runMappingAssistApi(
  opts: { refreshJoins?: boolean; limit?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{
  joins: unknown[]
  renames: RenameSuggestion[]
  note?: string
}> {
  const res = await apiFetch(`/workspaces/${workspaceId}/mapping-assist`, {
    method: 'POST',
    body: JSON.stringify(opts),
  })
  const body = (await res.json().catch(() => ({}))) as {
    joins?: unknown[]
    renames?: RenameSuggestion[]
    note?: string
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `mapping-assist ${res.status}`)
  return {
    joins: body.joins ?? [],
    renames: body.renames ?? [],
    note: body.note,
  }
}

export async function reviewRenameSuggestionApi(
  suggestionId: string,
  action: 'accept' | 'reject' | 'dismiss',
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ id: string; status: string }> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/mapping-assist/renames/${suggestionId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    },
  )
  const body = (await res.json().catch(() => ({}))) as {
    item?: { id: string; status: string }
    error?: string
  }
  if (!res.ok || !body.item) {
    throw new Error(body.error ?? `rename review ${res.status}`)
  }
  return body.item
}

/** Wave 4.5 */
export interface PrivateRunnerConfig {
  enabled: boolean
  runnerUrl: string
  secretConfigured: boolean
  runnerSecret?: string | null
}

export async function fetchPrivateRunnerConfig(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<PrivateRunnerConfig> {
  const res = await apiFetch(`/workspaces/${workspaceId}/private-runner`)
  const body = (await res.json().catch(() => ({}))) as {
    config?: PrivateRunnerConfig
    error?: string
  }
  if (!res.ok || !body.config) {
    throw new Error(body.error ?? `private-runner ${res.status}`)
  }
  return body.config
}

export async function updatePrivateRunnerConfig(
  patch: Record<string, unknown>,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<PrivateRunnerConfig> {
  const res = await apiFetch(`/workspaces/${workspaceId}/private-runner`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  const body = (await res.json().catch(() => ({}))) as {
    config?: PrivateRunnerConfig
    error?: string
  }
  if (!res.ok || !body.config) {
    throw new Error(body.error ?? `private-runner patch ${res.status}`)
  }
  return body.config
}

/** Wave 4.6 */
export interface BillingStatus {
  configured: boolean
  workspaceName?: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  seatCount: number
  billingStatus: string
  members: number
  effectiveMaxMembers: number
  overSeatSoft: boolean
  note?: string
}

export async function fetchBillingStatus(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<BillingStatus> {
  const res = await apiFetch(`/workspaces/${workspaceId}/billing`)
  const body = (await res.json().catch(() => ({}))) as {
    billing?: BillingStatus
    error?: string
  }
  if (!res.ok || !body.billing) {
    throw new Error(body.error ?? `billing ${res.status}`)
  }
  return body.billing
}

export async function createBillingCheckout(
  opts: { seats?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ url: string; sessionId: string; seats: number }> {
  const res = await apiFetch(`/workspaces/${workspaceId}/billing/checkout`, {
    method: 'POST',
    body: JSON.stringify(opts),
  })
  const body = (await res.json().catch(() => ({}))) as {
    url?: string
    sessionId?: string
    seats?: number
    error?: string
  }
  if (!res.ok || !body.url) {
    throw new Error(body.error ?? `checkout ${res.status}`)
  }
  return {
    url: body.url,
    sessionId: body.sessionId || '',
    seats: body.seats ?? opts.seats ?? 0,
  }
}

export async function createBillingPortal(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ url: string }> {
  const res = await apiFetch(`/workspaces/${workspaceId}/billing/portal`, {
    method: 'POST',
    body: '{}',
  })
  const body = (await res.json().catch(() => ({}))) as {
    url?: string
    error?: string
  }
  if (!res.ok || !body.url) {
    throw new Error(body.error ?? `portal ${res.status}`)
  }
  return { url: body.url }
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
