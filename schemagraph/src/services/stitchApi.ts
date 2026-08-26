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

export type RelationshipReviewAction = 'promote' | 'reject' | 'edit'

export type JoinSampleAssessment = {
  ok: boolean
  incorrect: boolean
  label: string
  reason: string
  band?: string
  ratio?: number | null
  inter?: number
  minRatio?: number
  from?: { table: string; column: string; samples?: unknown[] }
  to?: { table: string; column: string; samples?: unknown[] }
}

export class IncorrectJoinError extends Error {
  code = 'INCORRECT_JOIN' as const
  assessment: JoinSampleAssessment
  constructor(message: string, assessment: JoinSampleAssessment) {
    super(message)
    this.assessment = assessment
  }
}

/**
 * Promote (accept as explicit), reject, or edit join columns.
 */
export async function reviewRelationship(
  relationshipId: string,
  action: RelationshipReviewAction,
  opts: {
    fromColumnId?: string
    toColumnId?: string
    workspaceId?: string
    confirmIncorrect?: boolean
  } = {},
): Promise<SchemaRelationship | null> {
  const workspaceId = opts.workspaceId ?? getActiveWorkspaceId()
  const res = await apiFetch(
    `/workspaces/${workspaceId}/relationships/${relationshipId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        action,
        ...(action === 'edit'
          ? {
              fromColumnId: opts.fromColumnId,
              toColumnId: opts.toColumnId,
              confirmIncorrect: opts.confirmIncorrect === true,
            }
          : {}),
      }),
    },
  )
  const body = (await res.json().catch(() => ({}))) as {
    relationship?: SchemaRelationship
    error?: string
    code?: string
    assessment?: JoinSampleAssessment
  }
  if (!res.ok) {
    if (body.code === 'INCORRECT_JOIN' && body.assessment) {
      throw new IncorrectJoinError(
        body.error || 'Incorrect join',
        body.assessment,
      )
    }
    throw new Error(body.error ?? `review ${res.status}`)
  }
  return body.relationship ?? null
}

/** Create a join by dragging columns in Workspace Edit mode. */
export async function createManualRelationshipApi(
  fromColumnId: string,
  toColumnId: string,
  opts: {
    workspaceId?: string
    confirmIncorrect?: boolean
  } = {},
): Promise<SchemaRelationship> {
  const workspaceId = opts.workspaceId ?? getActiveWorkspaceId()
  const res = await apiFetch(`/workspaces/${workspaceId}/relationships`, {
    method: 'POST',
    body: JSON.stringify({
      fromColumnId,
      toColumnId,
      confirmIncorrect: opts.confirmIncorrect === true,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    relationship?: SchemaRelationship
    error?: string
    code?: string
    assessment?: JoinSampleAssessment
  }
  if (!res.ok) {
    if (body.code === 'INCORRECT_JOIN' && body.assessment) {
      throw new IncorrectJoinError(
        body.error || 'Incorrect join',
        body.assessment,
      )
    }
    throw new Error(body.error ?? `create join ${res.status}`)
  }
  if (!body.relationship) throw new Error('create join returned empty')
  return body.relationship
}

export async function fetchTableColumns(
  schemaObjectId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ id: string; name: string; dataType: string; keyKind: string }[]> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/tables/${schemaObjectId}/columns`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    columns?: { id: string; name: string; dataType: string; keyKind: string }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `columns ${res.status}`)
  return body.columns ?? []
}

export async function fetchPinnedSamples(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<unknown[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/pinned-samples`)
  const body = (await res.json().catch(() => ({}))) as {
    items?: unknown[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `pinned ${res.status}`)
  return body.items ?? []
}

export async function rePinTableSamples(
  schemaObjectId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<unknown> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/pinned-samples/${schemaObjectId}`,
    { method: 'POST', body: JSON.stringify({ rePin: true }) },
  )
  const body = (await res.json().catch(() => ({}))) as {
    item?: unknown
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `re-pin ${res.status}`)
  return body.item
}

export interface ManagedDataset {
  id: string
  name: string
  slug: string
  description: string
  jobId: string | null
  status: string
  columns: { name: string; dataType?: string }[]
  rowCount: number
  certified: boolean
  aiAccess: string
  updatedAt: string
}

export interface ManagedPlaneQuotas {
  maxDatasets: number
  maxRowsPerDataset: number
  retentionDays: number
  usedDatasets: number
  usedRows: number
}

export async function fetchManagedDatasets(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{
  enabled: boolean
  items: ManagedDataset[]
  quotas?: ManagedPlaneQuotas
}> {
  const res = await apiFetch(`/workspaces/${workspaceId}/managed-datasets`)
  const body = (await res.json().catch(() => ({}))) as {
    enabled?: boolean
    items?: ManagedDataset[]
    quotas?: ManagedPlaneQuotas
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `managed ${res.status}`)
  return {
    enabled: Boolean(body.enabled),
    items: body.items ?? [],
    quotas: body.quotas,
  }
}

export async function fetchManagedDatasetRows(
  datasetId: string,
  opts: { limit?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{
  rows: { id: string; data: Record<string, unknown> }[]
  displayMasked?: boolean
}> {
  const q = new URLSearchParams()
  if (opts.limit != null) q.set('limit', String(opts.limit))
  const res = await apiFetch(
    `/workspaces/${workspaceId}/managed-datasets/${datasetId}/rows?${q}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    rows?: { id: string; data: Record<string, unknown> }[]
    displayMasked?: boolean
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `rows ${res.status}`)
  return { rows: body.rows ?? [], displayMasked: body.displayMasked }
}

export async function certifyManagedDatasetApi(
  datasetId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<ManagedDataset> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/managed-datasets/${datasetId}/certify`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    item?: ManagedDataset
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `certify ${res.status}`)
  if (!body.item) throw new Error('certify missing item')
  return body.item
}

export type PlaneActivityKind =
  | 'created'
  | 'drafted'
  | 'edited'
  | 'executed'
  | 'landed'
  | 'certified'
  | 'failed'

export type PlaneActivitySource =
  | 'chat'
  | 'plane_sql'
  | 'plane_nlp'
  | 'job'
  | 'source_sync'
  | 'system'

export interface PlaneActivityEvent {
  id: string
  workspaceId: string
  kind: PlaneActivityKind
  source: PlaneActivitySource
  actor: 'user' | 'ai_chat' | 'ssm' | 'system'
  title: string
  detail?: string
  sql?: string
  sqlHash?: string
  datasetId?: string | null
  connectionId?: string | null
  rowCount?: number | null
  durationMs?: number | null
  read: boolean
  createdAt: string
}

export async function fetchPlaneActivity(
  opts: { source?: PlaneActivitySource; limit?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ items: PlaneActivityEvent[]; unread: number }> {
  const q = new URLSearchParams()
  if (opts.source) q.set('source', opts.source)
  if (opts.limit != null) q.set('limit', String(opts.limit))
  const res = await apiFetch(
    `/workspaces/${workspaceId}/plane/activity?${q}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    items?: PlaneActivityEvent[]
    unread?: number
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `plane activity ${res.status}`)
  return { items: body.items ?? [], unread: body.unread ?? 0 }
}

export async function fetchPlaneActivityUnread(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<number> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/plane/activity/unread`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    unread?: number
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `plane unread ${res.status}`)
  return body.unread ?? 0
}

export async function createPlaneActivityApi(
  input: {
    kind: PlaneActivityKind
    source: PlaneActivitySource
    actor?: PlaneActivityEvent['actor']
    title: string
    detail?: string
    sql?: string
    datasetId?: string | null
    connectionId?: string | null
    rowCount?: number | null
    durationMs?: number | null
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<PlaneActivityEvent> {
  const res = await apiFetch(`/workspaces/${workspaceId}/plane/activity`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    item?: PlaneActivityEvent
    error?: string
  }
  if (!res.ok || !body.item) {
    throw new Error(body.error ?? `create plane activity ${res.status}`)
  }
  return body.item
}

export async function markPlaneActivityReadApi(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/plane/activity/mark-read`,
    { method: 'POST', body: '{}' },
  )
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `mark plane read ${res.status}`)
  }
}

export async function handoffChatSqlToPlaneApi(
  input: { sql: string; detail?: string },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<PlaneActivityEvent> {
  return createPlaneActivityApi(
    {
      kind: 'drafted',
      source: 'chat',
      actor: 'user',
      title: 'Opened SQL in Managed Plane',
      detail: input.detail,
      sql: input.sql,
    },
    workspaceId,
  )
}

export type DataLandingMode =
  | 'schema_only'
  | 'managed_plane'
  | 'customer_warehouse'

export interface PlanePreviewConnection {
  id: string
  name: string
  type: string
  dataLandingMode: DataLandingMode
}

export interface PlaneQueryPreviewResult {
  ok: boolean
  target: 'managed' | 'warehouse'
  datasetId: string | null
  datasetName: string | null
  datasetSlug: string | null
  connectionId: string | null
  connectionName: string | null
  engine?: string
  columns: { name: string; dataType?: string }[]
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
  note?: string | null
  sqlExecuted: string
  durationMs: number
  policy: string
  displayMasked?: boolean
}

/** Managed Plane — read-only SQL preview (server-side credentials). */
export async function previewPlaneQueryApi(
  input: {
    sql: string
    connectionId?: string | null
    datasetId?: string | null
    maxRows?: number
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<PlaneQueryPreviewResult> {
  const res = await apiFetch(`/workspaces/${workspaceId}/plane/query/preview`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as PlaneQueryPreviewResult & {
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `plane preview ${res.status}`)
  return body
}

export async function fetchPlanePreviewConnections(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<PlanePreviewConnection[]> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/plane/preview-connections`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    items?: PlanePreviewConnection[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `preview connections ${res.status}`)
  return body.items ?? []
}

export type PlaneNlpScope = 'in_scope' | 'complex' | 'blocked'

export interface PlaneNlpToSqlResult {
  ok: boolean
  question: string
  sql: string | null
  explanation: string
  scope: PlaneNlpScope
  mode: 'llm' | 'heuristic'
  model: string | null
  tablesUsed: string[]
  policy: string
}

/** Managed Plane SSM — bounded NLP → read-only SQL (schema metadata only). */
export async function generatePlaneSqlFromNlpApi(
  input: {
    question: string
    datasetId?: string | null
    modelId?: string
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<PlaneNlpToSqlResult> {
  const res = await apiFetch(`/workspaces/${workspaceId}/plane/nlp-to-sql`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as PlaneNlpToSqlResult & {
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `plane nlp ${res.status}`)
  return body
}

export async function reportExternalJobStatusApi(
  input: {
    jobId?: string
    runId?: string
    status: string
    summary?: string
    externalRef?: string
    executionTarget?: string
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<unknown> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/jobs/external-status`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  const body = (await res.json().catch(() => ({}))) as {
    run?: unknown
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `external-status ${res.status}`)
  return body.run
}

export interface BiChart {
  id: string
  title: string
  description: string
  chartType: string
  datasetId: string | null
  config: Record<string, unknown>
  certified: boolean
  updatedAt: string
}

export async function fetchBiCharts(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<BiChart[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/bi/charts`)
  const body = (await res.json().catch(() => ({}))) as {
    items?: BiChart[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `bi ${res.status}`)
  return body.items ?? []
}

export async function createBiChartApi(
  input: {
    title: string
    chartType?: string
    datasetId?: string | null
    config?: Record<string, unknown>
    certify?: boolean
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<BiChart> {
  const res = await apiFetch(`/workspaces/${workspaceId}/bi/charts`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    item?: BiChart
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `bi create ${res.status}`)
  if (!body.item) throw new Error('bi create missing item')
  return body.item
}

export async function updateBiChartApi(
  chartId: string,
  patch: Partial<BiChart> & {
    certified?: boolean
    chartType?: string
    datasetId?: string | null
    config?: Record<string, unknown>
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<BiChart> {
  const res = await apiFetch(`/workspaces/${workspaceId}/bi/charts/${chartId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  const body = (await res.json().catch(() => ({}))) as {
    item?: BiChart
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `bi update ${res.status}`)
  if (!body.item) throw new Error('bi update missing item')
  return body.item
}

export async function deleteBiChartApi(
  chartId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/bi/charts/${chartId}`,
    { method: 'DELETE' },
  )
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error ?? `bi delete ${res.status}`)
}

export async function previewBiChartApi(
  chartId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<Record<string, unknown>[]> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/bi/charts/${chartId}/preview`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    rows?: Record<string, unknown>[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `preview ${res.status}`)
  return body.rows || []
}

export async function scaffoldBiReportApi(
  input: { title?: string; datasetId?: string | null; prompt?: string } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{
  reportId: string
  title: string
  datasetId: string
  datasetName: string
  charts: BiChart[]
  note?: string
}> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/bi/scaffold-report`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
  const body = (await res.json().catch(() => ({}))) as {
    reportId?: string
    title?: string
    datasetId?: string
    datasetName?: string
    charts?: BiChart[]
    note?: string
    error?: string
    code?: string
  }
  if (!res.ok) throw new Error(body.error || `scaffold ${res.status}`)
  return {
    reportId: body.reportId || '',
    title: body.title || 'Report',
    datasetId: body.datasetId || '',
    datasetName: body.datasetName || '',
    charts: body.charts || [],
    note: body.note,
  }
}

export async function mintBiEmbedTokenApi(
  chartId: string,
  opts: { label?: string; expiresInDays?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ token: string; tokenId: string; expiresAt: string }> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/bi/charts/${chartId}/embed-token`,
    { method: 'POST', body: JSON.stringify(opts) },
  )
  const body = (await res.json().catch(() => ({}))) as {
    token?: string
    tokenId?: string
    expiresAt?: string
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `embed ${res.status}`)
  return {
    token: body.token || '',
    tokenId: body.tokenId || '',
    expiresAt: body.expiresAt || '',
  }
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
    pinnedOverlap?: {
      ratio: number | null
      band: string
      label: string
      confidenceHint?: number | null
    } | null
    prePromoteConfidence?: number | null
  }
  risk?: {
    tier: 'green' | 'yellow' | 'red' | string
    effectiveTier?: string
    rationale?: string
    greenEligible?: boolean
  } | null
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

export type ChatPlaneScope = 'in_scope' | 'needs_plane' | 'blocked'

export type ChatAudience = 'ceo' | 'engineer'

export interface ChatLiveQueryResult {
  ok: boolean
  columns?: string[]
  rows?: Record<string, unknown>[]
  rowCount?: number
  connectionName?: string | null
  connectionId?: string | null
  durationMs?: number
  displayMasked?: boolean
  policy?: string
  aiIsolation?: string
  error?: string
  compact?: boolean
}

export interface ChatCapabilities {
  chatMay: string[]
  chatMayNot: string[]
  planeMay: string[]
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
  planeScope?: ChatPlaneScope
  planeScopeHint?: string | null
  chatCapabilities?: ChatCapabilities
  systemNotes?: string | null
  liveQuery?: ChatLiveQueryResult | null
  audience?: ChatAudience
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
    audience?: ChatAudience
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
      audience: opts?.audience ?? 'ceo',
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

export interface ChatSessionRecord {
  id: string
  title: string
  status: 'active' | 'archived' | 'deleted'
  audience: ChatAudience
  preview: string | null
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface ChatSessionTurn {
  id: string
  role: 'user' | 'assistant'
  content: string
  model?: string | null
  mode?: string | null
  sql?: string | null
  audience?: ChatAudience | null
  at: string
}

export async function fetchChatSessions(
  status: 'active' | 'archived' | 'all' = 'active',
  workspaceId: string = getActiveWorkspaceId(),
): Promise<ChatSessionRecord[]> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/chat/sessions?status=${encodeURIComponent(status)}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    sessions?: ChatSessionRecord[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `chat sessions ${res.status}`)
  return body.sessions ?? []
}

export async function createChatSessionApi(
  opts?: { title?: string; audience?: ChatAudience },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<ChatSessionRecord> {
  const res = await apiFetch(`/workspaces/${workspaceId}/chat/sessions`, {
    method: 'POST',
    body: JSON.stringify({
      title: opts?.title ?? 'New chat',
      audience: opts?.audience ?? 'ceo',
    }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    session?: ChatSessionRecord
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `create chat session ${res.status}`)
  if (!body.session) throw new Error('create chat session returned no session')
  return body.session
}

export async function fetchChatSessionTurns(
  sessionId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ session: ChatSessionRecord; turns: ChatSessionTurn[] }> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/chat/sessions/${encodeURIComponent(sessionId)}/turns`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    session?: ChatSessionRecord
    turns?: ChatSessionTurn[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `chat turns ${res.status}`)
  if (!body.session) throw new Error('chat turns returned no session')
  return { session: body.session, turns: body.turns ?? [] }
}

export async function updateChatSessionApi(
  sessionId: string,
  patch: {
    title?: string
    status?: 'active' | 'archived' | 'deleted'
    audience?: ChatAudience
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<ChatSessionRecord> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/chat/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
  )
  const body = (await res.json().catch(() => ({}))) as {
    session?: ChatSessionRecord
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `update chat session ${res.status}`)
  if (!body.session) throw new Error('update chat session returned no session')
  return body.session
}

export async function deleteChatSessionApi(
  sessionId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<ChatSessionRecord> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/chat/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    session?: ChatSessionRecord
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `delete chat session ${res.status}`)
  if (!body.session) throw new Error('delete chat session returned no session')
  return body.session
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

export interface MaterializationEvent {
  id: string
  jobId: string
  jobTitle: string | null
  connectionId: string | null
  connectionName: string | null
  engine: string | null
  kind: string
  qualifiedName: string
  status: string
  meta: Record<string, unknown>
  createdAt: string
}

export async function fetchMaterializations(
  opts: { jobId?: string; limit?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<MaterializationEvent[]> {
  const q = new URLSearchParams()
  if (opts.jobId) q.set('jobId', opts.jobId)
  if (opts.limit != null) q.set('limit', String(opts.limit))
  const res = await apiFetch(
    `/workspaces/${workspaceId}/materializations?${q.toString()}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    events?: MaterializationEvent[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error ?? `materializations ${res.status}`)
  return body.events ?? []
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
  /** Production — AI may use pinned scrubbed 5–10 row samples (default ON) */
  aiMayUsePinnedSamples?: boolean
  pinnedSampleRows?: number
  /** Offer B — Que-hosted job outputs */
  enableManagedDataPlane?: boolean
  defaultExecutionPlane?: 'customer' | 'managed' | 'que'
  managedMaxDatasets?: number
  managedMaxRowsPerDataset?: number
  managedRetentionDays?: number
  inferJoinsOnSync: boolean
  preferLlmChat: boolean
  aiModelId: string
  ragTopK: number
  ragIncludeDocs: boolean
  blockExportOnDrift: boolean
  blockPrOnColumnDrift?: boolean
  blockExportOnUnreviewedJoins: boolean
  databricksQueryJoinAssist?: boolean
  snowflakeQueryJoinAssist?: boolean
  enableStitchAgent?: boolean
  enableLiveValidate?: boolean
  enableMaterialize?: boolean
  /** Phase 3 — optional low-risk auto-Promote (default false / HITL) */
  enableAutoPromoteLowRisk?: boolean
  /** CEO P0 — golden recall gate (0–1) for Green auto-Promote */
  autoPromoteMinRecall?: number
  lastGoldenEval?: {
    recall: number | null
    precision: number | null
    at?: string
    pairCount?: number | null
  } | null
  yellowPromoteMinRole?: 'member' | 'admin' | 'owner'
  redPromoteMinRole?: 'member' | 'admin' | 'owner'
  /** Phase 4 — catalog / governance */
  enableCatalogGovernance?: boolean
  stewardUxMode?: boolean
  ticketProvider?: 'webhook' | 'jira' | 'servicenow'
  ticketWebhookUrl?: string
  ticketWebhookAuthHeader?: string
  jiraWebhookUrl?: string
  serviceNowWebhookUrl?: string
  /** Phase 5 — enterprise */
  enforceSso?: boolean
  siemExportEnabled?: boolean
  siemWebhookUrl?: string
  dataRegion?: string
  dataResidency?: string
  slaUptimeTarget?: string
  slaRpoHours?: number
  slaRtoHours?: number
  emitContractEvents: boolean
  contractWebhookUrl: string
  driftAlertsEnabled?: boolean
  driftAlertOnHigh?: boolean
  driftAlertWebhookUrl?: string
  driftAlertEmails?: string
  githubOwner: string
  githubRepo: string
  githubBaseBranch: string
  githubAllowedBranches?: string
  githubPrMinRole?: 'member' | 'admin' | 'owner'
  joinProposeMinRole?: 'member' | 'admin' | 'owner'
  joinPromoteMinRole?: 'member' | 'admin' | 'owner'
  joinReviewNotifyEnabled?: boolean
  joinReviewWebhookUrl?: string
  /** Slack channel for interactive Block Kit (needs SLACK_BOT_TOKEN) */
  slackNotifyChannel?: string
  joinPromoteNotify?: boolean
  driftDigestEnabled?: boolean
  driftDigestWebhookUrl?: string
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
      openrouterConfigured?: boolean
      openaiSource?: 'workspace' | 'env' | 'none'
      anthropicSource?: 'workspace' | 'env' | 'none'
      openrouterSource?: 'workspace' | 'env' | 'none'
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
  openrouter?: WorkspaceSecretSlot
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
    openrouterApiKey?: string | null
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

/* ─── Phase 0 / 1 APIs ───────────────────────────────────────────────────── */

export interface AgentCheckpoint {
  id: string
  type: string
  status: string
  message?: string
  meta?: Record<string, unknown>
}

export interface AgentSession {
  id: string
  title: string
  status: string
  plan: {
    goal?: string
    intent?: string
    sourceIds?: string[]
    tools?: { id: string; label: string }[]
    steps?: { id: string; label: string; status: string; error?: string }[]
  }
  checkpoints: AgentCheckpoint[]
  result: Record<string, unknown>
  toolCalls?: {
    id: string
    tool: string
    ok?: boolean
    output?: Record<string, unknown>
    startedAt?: string
    finishedAt?: string
  }[]
  createdAt?: string
  updatedAt?: string
}

export interface ValidationCheck {
  id: string
  kind: string
  title: string
  sql: string
  status: string
  lastRunId?: string | null
  lastRunAt?: string | null
}

export interface DriftFixSuggestion {
  id: string
  driftEventId?: string | null
  jobId?: string | null
  kind: string
  status: string
  summary: string
  proposal?: Record<string, unknown>
  createdAt?: string
}

export async function fetchAgentSessions(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<AgentSession[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/agent/sessions`)
  const body = (await res.json().catch(() => ({}))) as {
    sessions?: AgentSession[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `agent sessions ${res.status}`)
  return body.sessions || []
}

export async function createAgentSessionApi(
  input: { title?: string; goal?: string; sourceIds?: string[] } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<AgentSession> {
  const res = await apiFetch(`/workspaces/${workspaceId}/agent/sessions`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    session?: AgentSession
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `create agent ${res.status}`)
  if (!body.session) throw new Error('missing session')
  return body.session
}

export async function agentCheckpointApi(
  sessionId: string,
  body: Record<string, unknown>,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<AgentSession> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/agent/sessions/${sessionId}/checkpoint`,
    { method: 'POST', body: JSON.stringify(body) },
  )
  const data = (await res.json().catch(() => ({}))) as {
    session?: AgentSession
    error?: string
  }
  if (!res.ok) throw new Error(data.error || `checkpoint ${res.status}`)
  if (!data.session) throw new Error('missing session')
  return data.session
}

export async function fetchValidationSuite(
  jobId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<ValidationCheck[]> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/jobs/${jobId}/validation-suite`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    checks?: ValidationCheck[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `validation-suite ${res.status}`)
  return body.checks || []
}

export async function generateValidationSuiteApi(
  jobId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ checks: ValidationCheck[]; cellCount?: number }> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/jobs/${jobId}/validation-suite/generate`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    checks?: ValidationCheck[]
    cellCount?: number
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `generate suite ${res.status}`)
  return { checks: body.checks || [], cellCount: body.cellCount }
}

export async function runValidationSuiteApi(
  jobId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ checks: ValidationCheck[]; run?: Record<string, unknown> }> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/jobs/${jobId}/validation-suite/run`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    checks?: ValidationCheck[]
    run?: Record<string, unknown>
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `run suite ${res.status}`)
  return { checks: body.checks || [], run: body.run }
}

export async function fetchDriftFixes(
  status: string = 'proposed',
  workspaceId: string = getActiveWorkspaceId(),
): Promise<DriftFixSuggestion[]> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/drift-fixes?status=${encodeURIComponent(status)}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    suggestions?: DriftFixSuggestion[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `drift-fixes ${res.status}`)
  return body.suggestions || []
}

export async function proposeDriftFixesApi(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ created: number; scannedDrift?: number }> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/drift-fixes/propose`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    created?: number
    scannedDrift?: number
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `propose drift ${res.status}`)
  return { created: body.created || 0, scannedDrift: body.scannedDrift }
}

export async function resolveDriftFixApi(
  suggestionId: string,
  action: 'accept' | 'reject' | 'dismiss' = 'accept',
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/drift-fixes/${suggestionId}/resolve`,
    { method: 'POST', body: JSON.stringify({ action }) },
  )
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || `resolve drift ${res.status}`)
}

export async function runGoldenSetEvalApi(
  pairs: {
    fromTable: string
    fromColumn: string
    toTable: string
    toColumn: string
  }[],
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ report: Record<string, unknown>; markdown: string }> {
  const res = await apiFetch(`/workspaces/${workspaceId}/joins/golden-eval`, {
    method: 'POST',
    body: JSON.stringify({ pairs }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    report?: Record<string, unknown>
    markdown?: string
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `golden-eval ${res.status}`)
  return { report: body.report || {}, markdown: body.markdown || '' }
}

export async function exportAuditCsv(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<Blob> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/audit-events/export`,
  )
  if (!res.ok) throw new Error(`audit export ${res.status}`)
  return res.blob()
}

export async function fetchAuthSessions(): Promise<
  { id: string; createdAt: string; expiresAt: string; current: boolean }[]
> {
  const res = await apiFetch('/auth/sessions')
  const body = (await res.json().catch(() => ({}))) as {
    sessions?: {
      id: string
      createdAt: string
      expiresAt: string
      current: boolean
    }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `sessions ${res.status}`)
  return body.sessions || []
}

export async function revokeAuthSession(sessionId: string): Promise<void> {
  const res = await apiFetch(`/auth/sessions/${sessionId}`, { method: 'DELETE' })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `revoke ${res.status}`)
  }
}

export async function revokeOtherAuthSessions(): Promise<void> {
  const res = await apiFetch('/auth/sessions/revoke-others', { method: 'POST' })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `revoke-others ${res.status}`)
  }
}

/* ─── Phase 2 Team OS ────────────────────────────────────────────────────── */

export interface WorkspaceDomain {
  id: string
  name: string
  slug: string
  description?: string
  ownerUserId?: string | null
  ownerEmail?: string | null
  ownerDisplayName?: string | null
  connectionIds: string[]
  tableGlobs: string[]
  createdAt?: string
  updatedAt?: string
}

export interface JobTemplate {
  id: string
  name: string
  slug: string
  description?: string
  kind: string
  notebook: unknown[]
  defaultTables: string[]
  isSystem: boolean
}

export async function fetchDomains(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<WorkspaceDomain[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/domains`)
  const body = (await res.json().catch(() => ({}))) as {
    domains?: WorkspaceDomain[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `domains ${res.status}`)
  return body.domains || []
}

export async function createDomainApi(
  input: {
    name: string
    description?: string
    connectionIds?: string[]
    tableGlobs?: string[]
    ownerUserId?: string | null
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<WorkspaceDomain> {
  const res = await apiFetch(`/workspaces/${workspaceId}/domains`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    domain?: WorkspaceDomain
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `create domain ${res.status}`)
  if (!body.domain) throw new Error('missing domain')
  return body.domain
}

export async function updateDomainApi(
  domainId: string,
  patch: Partial<WorkspaceDomain> & { connectionIds?: string[]; tableGlobs?: string[] },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<WorkspaceDomain> {
  const res = await apiFetch(`/workspaces/${workspaceId}/domains/${domainId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  const body = (await res.json().catch(() => ({}))) as {
    domain?: WorkspaceDomain
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `update domain ${res.status}`)
  if (!body.domain) throw new Error('missing domain')
  return body.domain
}

export async function deleteDomainApi(
  domainId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(`/workspaces/${workspaceId}/domains/${domainId}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `delete domain ${res.status}`)
  }
}

export async function fetchJobTemplates(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<JobTemplate[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/job-templates`)
  const body = (await res.json().catch(() => ({}))) as {
    templates?: JobTemplate[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `templates ${res.status}`)
  return body.templates || []
}

export async function applyJobTemplateApi(
  templateId: string,
  input: { title?: string; tableNames?: string[] } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<StitchJob> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/job-templates/${templateId}/apply`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  const body = (await res.json().catch(() => ({}))) as {
    job?: StitchJob
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `apply template ${res.status}`)
  if (!body.job) throw new Error('missing job')
  return body.job
}

export async function sendDriftDigestApi(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<Record<string, unknown>> {
  const res = await apiFetch(`/workspaces/${workspaceId}/notify/drift-digest`, {
    method: 'POST',
    body: '{}',
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `drift digest ${res.status}`)
  return body
}

export async function sendJoinReviewTestNotify(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<Record<string, unknown>> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/notify/join-review-test`,
    { method: 'POST', body: JSON.stringify({ created: 1 }) },
  )
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `join notify ${res.status}`)
  return body
}

/** Phase 4 — Catalog / glossary / stewardship */
export interface CatalogAsset {
  id: string
  kind: string
  name: string
  description?: string
  depCount?: number
  status?: string
}

export interface GlossaryTerm {
  id: string
  name: string
  slug: string
  definition: string
  status: string
  linkCount: number
}

export interface StewardCertification {
  id: string
  targetKind: string
  targetId: string
  targetLabel: string
  status: string
  expiresAt?: string | null
  expired?: boolean
}

export interface StewardQueue {
  needsCertification: {
    targetKind: string
    targetId: string
    targetLabel: string
    reason: string
  }[]
  expiringSoon: StewardCertification[]
  certifiedCount: number
}

export interface ColumnLineageResult {
  ok?: boolean
  note?: string
  start?: { table?: string | null; column?: string | null; key: string } | null
  summary?: Record<string, number>
  downstream?: {
    nodes: { key: string; table?: string; column?: string; hop?: number }[]
    pathEdges: { kind: string; from: { key: string }; to: { key: string }; hop?: number }[]
  }
  upstream?: {
    nodes: { key: string; table?: string; column?: string; hop?: number }[]
    pathEdges: { kind: string; from: { key: string }; to: { key: string }; hop?: number }[]
  }
}

export async function fetchCatalogAssets(
  kind?: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<CatalogAsset[]> {
  const q = kind ? `?kind=${encodeURIComponent(kind)}` : ''
  const res = await apiFetch(`/workspaces/${workspaceId}/catalog/assets${q}`)
  const body = (await res.json().catch(() => ({}))) as {
    assets?: CatalogAsset[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `catalog ${res.status}`)
  return body.assets || []
}

export async function createCatalogAssetApi(
  input: {
    name: string
    kind?: string
    description?: string
    dependsOn?: string[]
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<CatalogAsset> {
  const res = await apiFetch(`/workspaces/${workspaceId}/catalog/assets`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    asset?: CatalogAsset
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `create asset ${res.status}`)
  if (!body.asset) throw new Error('missing asset')
  return body.asset
}

export async function fetchGlossaryTerms(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<GlossaryTerm[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/glossary`)
  const body = (await res.json().catch(() => ({}))) as {
    terms?: GlossaryTerm[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `glossary ${res.status}`)
  return body.terms || []
}

export async function createGlossaryTermApi(
  input: { name: string; definition?: string; status?: string },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<GlossaryTerm> {
  const res = await apiFetch(`/workspaces/${workspaceId}/glossary`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    term?: GlossaryTerm
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `create term ${res.status}`)
  if (!body.term) throw new Error('missing term')
  return body.term
}

export async function linkGlossaryTermApi(
  termId: string,
  input: { tableName: string; columnName?: string },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/glossary/${termId}/links`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || `link term ${res.status}`)
}

export async function fetchStewardQueue(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<StewardQueue> {
  const res = await apiFetch(`/workspaces/${workspaceId}/stewardship/queue`)
  const body = (await res.json().catch(() => ({}))) as StewardQueue & {
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `steward queue ${res.status}`)
  return {
    needsCertification: body.needsCertification || [],
    expiringSoon: body.expiringSoon || [],
    certifiedCount: body.certifiedCount || 0,
  }
}

export async function fetchCertifications(
  status: string = 'all',
  workspaceId: string = getActiveWorkspaceId(),
): Promise<StewardCertification[]> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/stewardship/certs?status=${encodeURIComponent(status)}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    certifications?: StewardCertification[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `certs ${res.status}`)
  return body.certifications || []
}

export async function certifyTargetApi(
  input: {
    targetKind: string
    targetId: string
    targetLabel?: string
    expiresInDays?: number
    note?: string
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<StewardCertification> {
  const res = await apiFetch(`/workspaces/${workspaceId}/stewardship/certify`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    certification?: StewardCertification
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `certify ${res.status}`)
  if (!body.certification) throw new Error('missing certification')
  return body.certification
}

export async function expireCertificationApi(
  certId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/stewardship/certs/${certId}/expire`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || `expire ${res.status}`)
}

export async function fetchColumnLineage(
  opts: {
    table?: string
    column?: string
    maxHops?: number
    direction?: string
  } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<ColumnLineageResult> {
  const q = new URLSearchParams()
  if (opts.table) q.set('table', opts.table)
  if (opts.column) q.set('column', opts.column)
  if (opts.maxHops) q.set('maxHops', String(opts.maxHops))
  if (opts.direction) q.set('direction', opts.direction)
  const res = await apiFetch(
    `/workspaces/${workspaceId}/column-lineage?${q.toString()}`,
  )
  const body = (await res.json().catch(() => ({}))) as ColumnLineageResult & {
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `column-lineage ${res.status}`)
  return body
}

export async function ensurePolicyPacksApi(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/policy-packs?ensureDefaults=1`,
  )
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || `policy packs ${res.status}`)
}

export async function applyPiiPolicyApi(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ scannedColumns: number; tagged: number }> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/policy-packs/apply-pii`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    scannedColumns?: number
    tagged?: number
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `apply pii ${res.status}`)
  return {
    scannedColumns: body.scannedColumns || 0,
    tagged: body.tagged || 0,
  }
}

export async function createGovernanceTicketApi(
  input: {
    title: string
    body?: string
    kind?: string
    provider?: string
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{
  id: string
  status: string
  externalKey?: string | null
}> {
  const res = await apiFetch(`/workspaces/${workspaceId}/governance/tickets`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    ticket?: { id: string; status: string; externalKey?: string | null }
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `ticket ${res.status}`)
  if (!body.ticket) throw new Error('missing ticket')
  return body.ticket
}

/** Phase 5 — Enterprise control plane */
export interface ApiKeyRow {
  id: string
  name: string
  tokenPrefix: string
  scopes: string[]
  revokedAt?: string | null
  token?: string
}

export interface ScimTokenRow {
  id: string
  name: string
  tokenPrefix: string
  revokedAt?: string | null
  token?: string
}

export interface CmkStatus {
  enabled: boolean
  keyId?: string | null
  hasDek?: boolean
  rotatedAt?: string | null
}

export interface BreakGlassEvent {
  id: string
  reason: string
  status: string
  expiresAt?: string
}

export async function fetchApiKeys(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<ApiKeyRow[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/enterprise/api-keys`)
  const body = (await res.json().catch(() => ({}))) as {
    keys?: ApiKeyRow[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `api-keys ${res.status}`)
  return body.keys || []
}

export async function createApiKeyApi(
  input: { name?: string; scopes?: string[]; expiresInDays?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
): Promise<ApiKeyRow> {
  const res = await apiFetch(`/workspaces/${workspaceId}/enterprise/api-keys`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    key?: ApiKeyRow
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `create key ${res.status}`)
  if (!body.key) throw new Error('missing key')
  return body.key
}

export async function revokeApiKeyApi(
  keyId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/enterprise/api-keys/${keyId}`,
    { method: 'DELETE' },
  )
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `revoke key ${res.status}`)
  }
}

export async function fetchScimTokens(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<ScimTokenRow[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/enterprise/scim-tokens`)
  const body = (await res.json().catch(() => ({}))) as {
    tokens?: ScimTokenRow[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `scim tokens ${res.status}`)
  return body.tokens || []
}

export async function createScimTokenApi(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<ScimTokenRow> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/enterprise/scim-tokens`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    token?: ScimTokenRow
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `scim token ${res.status}`)
  if (!body.token) throw new Error('missing token')
  return body.token
}

export async function fetchCmkStatus(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<CmkStatus> {
  const res = await apiFetch(`/workspaces/${workspaceId}/enterprise/cmk`)
  const body = (await res.json().catch(() => ({}))) as {
    cmk?: CmkStatus
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `cmk ${res.status}`)
  return body.cmk || { enabled: false }
}

export async function enableCmkApi(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<CmkStatus> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/enterprise/cmk/enable`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    cmk?: CmkStatus
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `cmk enable ${res.status}`)
  return body.cmk || { enabled: true }
}

export async function disableCmkApi(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<CmkStatus> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/enterprise/cmk/disable`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    cmk?: CmkStatus
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `cmk disable ${res.status}`)
  return body.cmk || { enabled: false }
}

export async function fetchBreakGlass(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<BreakGlassEvent[]> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/enterprise/break-glass`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    events?: BreakGlassEvent[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `break-glass ${res.status}`)
  return body.events || []
}

export async function openBreakGlassApi(
  input: { reason: string; hours?: number },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/enterprise/break-glass`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || `open break-glass ${res.status}`)
}

export async function closeBreakGlassApi(
  eventId: string,
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/enterprise/break-glass/${eventId}/close`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || `close break-glass ${res.status}`)
}

export async function fetchSiemConfig(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{
  enabled: boolean
  webhookUrl: string
  lastExportedAt?: string | null
}> {
  const res = await apiFetch(`/workspaces/${workspaceId}/enterprise/siem`)
  const body = (await res.json().catch(() => ({}))) as {
    siem?: {
      enabled?: boolean
      webhookUrl?: string
      lastExportedAt?: string | null
    }
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `siem ${res.status}`)
  return {
    enabled: body.siem?.enabled === true,
    webhookUrl: body.siem?.webhookUrl || '',
    lastExportedAt: body.siem?.lastExportedAt ?? null,
  }
}

export async function updateSiemConfigApi(
  patch: { enabled?: boolean; webhookUrl?: string },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(`/workspaces/${workspaceId}/enterprise/siem`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || `siem update ${res.status}`)
}

export async function pushSiemApi(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ pushed: number }> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/enterprise/siem/push`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    pushed?: number
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `siem push ${res.status}`)
  return { pushed: body.pushed || 0 }
}

export async function exportSoc2EvidenceApi(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ markdown: string; pack: Record<string, unknown> }> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/enterprise/soc2-evidence`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    markdown?: string
    pack?: Record<string, unknown>
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `evidence ${res.status}`)
  return { markdown: body.markdown || '', pack: body.pack || {} }
}

export async function runIsolationTestApi(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ status: string; summary: string }> {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/enterprise/isolation-test`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    result?: { status?: string; summary?: string }
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `isolation ${res.status}`)
  return {
    status: body.result?.status || 'unknown',
    summary: body.result?.summary || '',
  }
}

export async function fetchAbacPolicies(
  workspaceId: string = getActiveWorkspaceId(),
): Promise<{ id: string; name: string }[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/enterprise/abac`)
  const body = (await res.json().catch(() => ({}))) as {
    policies?: { id: string; name: string }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `abac ${res.status}`)
  return body.policies || []
}

export async function createAbacPolicyApi(
  input: {
    name: string
    effect?: string
    actions?: string[]
    resourceTypes?: string[]
    conditions?: Record<string, unknown>
  },
  workspaceId: string = getActiveWorkspaceId(),
): Promise<void> {
  const res = await apiFetch(`/workspaces/${workspaceId}/enterprise/abac`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || `abac create ${res.status}`)
}

// -- Gap close: rules, transforms, proposals, metrics, eval, comments --

export async function fetchWorkspaceRules(
  workspaceId: string = getActiveWorkspaceId(),
  opts?: { ensureDefaults?: boolean },
): Promise<
  {
    id: string
    kind: string
    title: string
    body: string
    enabled: boolean
    source: string
    priority: number
  }[]
> {
  const q = opts?.ensureDefaults ? '?ensureDefaults=1' : ''
  const res = await apiFetch(`/workspaces/${workspaceId}/rules${q}`)
  const body = (await res.json().catch(() => ({}))) as {
    items?: {
      id: string
      kind: string
      title: string
      body: string
      enabled: boolean
      source: string
      priority: number
    }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `rules ${res.status}`)
  return body.items || []
}

export async function createWorkspaceRuleApi(
  input: { kind?: string; title: string; body: string; priority?: number },
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/rules`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as { item?: unknown; error?: string }
  if (!res.ok) throw new Error(body.error || `rule create ${res.status}`)
  return body.item
}

export async function updateWorkspaceRuleApi(
  ruleId: string,
  patch: {
    enabled?: boolean
    title?: string
    body?: string
    kind?: string
    priority?: number
  },
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/rules/${ruleId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  const body = (await res.json().catch(() => ({}))) as {
    item?: {
      id: string
      kind: string
      title: string
      body: string
      enabled: boolean
      source: string
      priority: number
    }
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `rule update ${res.status}`)
  return body.item!
}

export async function fetchJoinComments(
  relationshipId: string,
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/relationships/${relationshipId}/comments`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    items?: {
      id: string
      body: string
      authorName?: string
      authorEmail?: string
      createdAt: string
      parentId?: string | null
      replies?: {
        id: string
        body: string
        authorName?: string
        authorEmail?: string
        createdAt: string
      }[]
    }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `comments ${res.status}`)
  return body.items || []
}

export async function addJoinCommentApi(
  relationshipId: string,
  text: string,
  opts: { parentId?: string | null; workspaceId?: string } = {},
) {
  const ws = opts.workspaceId || getActiveWorkspaceId()
  const res = await apiFetch(
    `/workspaces/${ws}/relationships/${relationshipId}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ body: text, parentId: opts.parentId || null }),
    },
  )
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || `comment ${res.status}`)
}

export async function fetchTransforms(
  opts: { status?: string } = {},
  workspaceId: string = getActiveWorkspaceId(),
) {
  const q = opts.status ? `?status=${encodeURIComponent(opts.status)}` : ''
  const res = await apiFetch(`/workspaces/${workspaceId}/transforms${q}`)
  const body = (await res.json().catch(() => ({}))) as {
    items?: {
      id: string
      title: string
      prompt: string
      sqlText: string
      status: string
      jobId?: string | null
      createdBy?: string | null
      createdByName?: string | null
      createdByEmail?: string | null
      createdAt?: string
      evidence?: {
        mode?: string
        model?: string | null
        proposerKind?: string
        nature?: string
        query?: string
        whyReferred?: string
        referredTables?: {
          name: string
          connection?: string | null
          reason?: string
        }[]
        tableCount?: number
        rulesApplied?: number
        ruleTitles?: string[]
      }
    }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `transforms ${res.status}`)
  return body.items || []
}

export async function createTransformApi(
  input: { prompt: string; title?: string },
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/transforms`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    item?: { id: string; sqlText: string; status: string }
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `transform ${res.status}`)
  return body.item!
}

export async function reviewTransformApi(
  draftId: string,
  action: 'approve' | 'reject' | 'apply',
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/transforms/${draftId}/review`,
    { method: 'POST', body: JSON.stringify({ action }) },
  )
  const body = (await res.json().catch(() => ({}))) as {
    error?: string
    item?: { id: string; jobId?: string | null; status: string }
  }
  if (!res.ok) throw new Error(body.error || `review ${res.status}`)
  return body.item
}

export async function fetchProposals(
  opts: { status?: string } = {},
  workspaceId: string = getActiveWorkspaceId(),
) {
  const q = new URLSearchParams()
  if (opts.status) q.set('status', opts.status)
  const res = await apiFetch(
    `/workspaces/${workspaceId}/proposals?${q.toString()}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    items?: {
      id: string
      kind: string
      title: string
      summary: string
      before: Record<string, unknown>
      after: Record<string, unknown>
      unifiedDiff?: string
      status: string
      resourceType?: string | null
      resourceId?: string | null
    }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `proposals ${res.status}`)
  return body.items || []
}

export async function reviewProposalApi(
  diffId: string,
  action: 'approve' | 'reject',
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/proposals/${diffId}/review`,
    { method: 'POST', body: JSON.stringify({ action }) },
  )
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || `proposal ${res.status}`)
}

export async function fetchMetricsDefs(
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/metrics-defs`)
  const body = (await res.json().catch(() => ({}))) as {
    items?: {
      id: string
      name: string
      expressionSql: string
      description?: string
      datasetId: string | null
      certified: boolean
      tags?: string[]
      lineage?: Record<string, unknown>
      updatedAt?: string
    }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `metrics ${res.status}`)
  return body.items || []
}

export async function createMetricApi(
  input: {
    name: string
    expressionSql?: string
    datasetId?: string | null
    description?: string
    certify?: boolean
    sourceColumnName?: string
    sourceObjectId?: string | null
    lineage?: Record<string, unknown>
    tags?: string[]
  },
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/metrics-defs`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    item?: { id: string }
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `metric ${res.status}`)
  return body.item!
}

export async function publishMetricBiApi(
  metricId: string,
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/metrics-defs/${metricId}/publish-bi`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(body.error || `publish ${res.status}`)
}

export async function fetchEvalDashboard(
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/eval-dashboard`)
  const body = (await res.json().catch(() => ({}))) as {
    dashboard?: Record<string, unknown>
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `eval ${res.status}`)
  return body.dashboard || {}
}

export async function fetchIndustryTemplates() {
  const res = await apiFetch(`/industry-templates`)
  const body = (await res.json().catch(() => ({}))) as {
    items?: {
      id: string
      industry: string
      title: string
      description: string
    }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `templates ${res.status}`)
  return body.items || []
}

export async function applyIndustryTemplateApi(
  packId: string,
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/industry-templates/${packId}/apply`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    job?: { id: string; title: string }
    outcome?: { id: string; prompt?: string } | null
    ship?: { id: string } | null
    bi?: { reportId?: string; charts?: unknown[] } | null
    seededRules?: string[]
    joins?: { created?: number; scanned?: number; ok?: boolean }
    tableMatch?: {
      matched?: { hint: string; table: string }[]
      missing?: string[]
    }
    playbook?: {
      id: string
      title: string
      status: string
      detail: string
      href: string
    }[]
    next?: { href?: string; hint?: string }
    pack?: { ceoReady?: boolean; title?: string }
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `apply ${res.status}`)
  return body
}

export async function fetchPublicStatus() {
  const res = await fetch(`${getApiBase()}/status`)
  return res.json()
}

export async function fetchSaasOps(
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/saas-ops`)
  const body = (await res.json().catch(() => ({}))) as {
    progressPct?: number
    checklist?: {
      id: string
      title: string
      done: boolean
      evidence: string
    }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `saas-ops ${res.status}`)
  return {
    progressPct: body.progressPct ?? 0,
    checklist: body.checklist || [],
  }
}

export async function createBackupApi(
  label?: string,
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/backups`, {
    method: 'POST',
    body: JSON.stringify({ label }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    item?: { id: string; label: string }
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `backup ${res.status}`)
  return body.item!
}

export async function runDrDrillApi(
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/dr-drills/run`, {
    method: 'POST',
    body: '{}',
  })
  const body = (await res.json().catch(() => ({}))) as {
    summary?: string
    status?: string
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `dr-drill ${res.status}`)
  return { summary: body.summary || '', status: body.status || '' }
}

export async function fetchWarehouseDigests(
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/warehouse-digests`)
  const body = (await res.json().catch(() => ({}))) as {
    items?: {
      id: string
      summary: string
      failedCount: number
      createdAt: string
    }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `digests ${res.status}`)
  return body.items || []
}

export async function buildWarehouseDigestApi(
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/warehouse-digests/build`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    digest?: { summary: string; failedCount: number }
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `digest build ${res.status}`)
  return body.digest || { summary: '', failedCount: 0 }
}

export async function fetchConnectorReliability(
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/connector-reliability`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    summary?: Record<string, number>
    connections?: unknown[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `reliability ${res.status}`)
  return {
    summary: body.summary || {},
    connections: body.connections || [],
  }
}

export async function fetchGoldenEvalSchedule(
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/golden-eval/schedule`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    schedule?: {
      enabled: boolean
      intervalHours: number
      pairs: unknown[]
      lastRunAt?: string | null
      lastRecall?: number | null
      nextRunAt?: string | null
    }
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `golden schedule ${res.status}`)
  return (
    body.schedule || {
      enabled: false,
      intervalHours: 24,
      pairs: [],
    }
  )
}

export async function upsertGoldenEvalScheduleApi(
  input: {
    enabled?: boolean
    intervalHours?: number
    pairs?: unknown[]
  },
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/golden-eval/schedule`,
    { method: 'PUT', body: JSON.stringify(input) },
  )
  const body = (await res.json().catch(() => ({}))) as {
    schedule?: {
      enabled: boolean
      intervalHours: number
      pairs: unknown[]
      lastRunAt?: string | null
      lastRecall?: number | null
      nextRunAt?: string | null
    }
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `golden upsert ${res.status}`)
  return body.schedule!
}

export async function runGoldenEvalScheduleApi(
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/golden-eval/run`, {
    method: 'POST',
    body: '{}',
  })
  const body = (await res.json().catch(() => ({}))) as {
    recall?: number
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `golden run ${res.status}`)
  return body
}

export async function fetchMarketplaceCatalog(opts: {
  industry?: string
  tag?: string
  q?: string
} = {}) {
  const q = new URLSearchParams()
  if (opts.industry) q.set('industry', opts.industry)
  if (opts.tag) q.set('tag', opts.tag)
  if (opts.q) q.set('q', opts.q)
  const res = await apiFetch(`/marketplace/packs?${q.toString()}`)
  const body = (await res.json().catch(() => ({}))) as {
    packs?: {
      id: string
      industry: string
      title: string
      description: string
      tablesHint: string[]
      tags: string[]
      difficulty: string
      featured: boolean
    }[]
    industries?: string[]
    tags?: string[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `marketplace ${res.status}`)
  return {
    packs: body.packs || [],
    industries: body.industries || [],
    tags: body.tags || [],
  }
}

export async function fetchMarketplaceInstalls(
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/marketplace/installs`)
  const body = (await res.json().catch(() => ({}))) as {
    items?: {
      id: string
      packId: string
      jobId: string
      createdAt: string
    }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `installs ${res.status}`)
  return body.items || []
}

export async function fetchPresence(
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/presence`)
  const body = (await res.json().catch(() => ({}))) as {
    items?: {
      userId: string
      displayName: string
      pagePath: string
      status: string
      active: boolean
    }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `presence ${res.status}`)
  return body.items || []
}

export async function heartbeatPresenceApi(
  input: { pagePath?: string; status?: string } = {},
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/presence/heartbeat`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    items?: {
      userId: string
      displayName: string
      pagePath: string
      status: string
      active: boolean
    }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `heartbeat ${res.status}`)
  return body.items || []
}

export async function fetchMetricLineage(
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/metrics-lineage`)
  const body = (await res.json().catch(() => ({}))) as {
    nodes?: { id: string; kind: string; label: string }[]
    edges?: { from: string; to: string; type: string }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `metric lineage ${res.status}`)
  return {
    nodes: body.nodes || [],
    edges: body.edges || [],
  }
}

/** CEO P0 — Outcome plans */
export type OutcomePlan = {
  prompt: string
  custody?: string
  agentSessionId?: string | null
  agentHref?: string | null
  steps?: {
    id: string
    kind: string
    title: string
    status: string
    href?: string
    detail?: string
    connections?: unknown[]
    joins?: unknown[]
    metrics?: unknown[]
    chartHint?: { title?: string; chartType?: string }
  }[]
  summary?: Record<string, number>
  riskContext?: Record<string, unknown>
}

export type OutcomeRecord = {
  id: string
  workspaceId: string
  prompt: string
  status: string
  plan: OutcomePlan
  createdAt: string
  updatedAt: string
}

export async function fetchOutcomes(
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/outcomes`)
  const body = (await res.json().catch(() => ({}))) as {
    outcomes?: OutcomeRecord[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `outcomes ${res.status}`)
  return body.outcomes || []
}

export async function createOutcomeApi(
  prompt: string,
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/outcomes`, {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    outcome?: OutcomeRecord
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `create outcome ${res.status}`)
  return body.outcome!
}

export async function refreshOutcomeApi(
  outcomeId: string,
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/outcomes/${outcomeId}/refresh`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    outcome?: OutcomeRecord
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `refresh outcome ${res.status}`)
  return body.outcome!
}

export async function runOutcomeStepApi(
  outcomeId: string,
  opts: { stepId?: string; inferJoins?: boolean } = {},
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/outcomes/${outcomeId}/run-step`,
    {
      method: 'POST',
      body: JSON.stringify({
        stepId: opts.stepId || 'auto',
        inferJoins: opts.inferJoins === true,
      }),
    },
  )
  const body = (await res.json().catch(() => ({}))) as {
    outcome?: OutcomeRecord
    stepId?: string
    actions?: unknown[]
    custody?: string
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `run-step ${res.status}`)
  return body
}

export async function advanceOutcomeAgentApi(
  outcomeId: string,
  opts: { approvePlan?: boolean } = {},
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/outcomes/${outcomeId}/advance-agent`,
    {
      method: 'POST',
      body: JSON.stringify({
        approvePlan: opts.approvePlan === true,
      }),
    },
  )
  const body = (await res.json().catch(() => ({}))) as {
    outcome?: OutcomeRecord
    session?: { id?: string; status?: string }
    actions?: unknown[]
    needsHitl?: boolean
    custody?: string
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `advance-agent ${res.status}`)
  return body
}

/** CEO P0 — Ship to BI */
export type ShipEvent = {
  id: string
  outcomeId?: string | null
  chartId?: string | null
  embedTokenId?: string | null
  status: string
  title: string
  attestation: Record<string, unknown>
  config: Record<string, unknown>
  rolledBackAt?: string | null
  createdAt: string
}

export async function fetchShipEvents(
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/ship-events`)
  const body = (await res.json().catch(() => ({}))) as {
    ships?: ShipEvent[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `ships ${res.status}`)
  return body.ships || []
}

export async function createShipDraftApi(
  input: {
    title: string
    outcomeId?: string | null
    datasetId?: string | null
    chartType?: string
    description?: string
  },
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/ship-events`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  const body = (await res.json().catch(() => ({}))) as {
    ship?: ShipEvent
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `ship draft ${res.status}`)
  return body.ship!
}

export async function approveShipApi(
  shipId: string,
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/ship-events/${shipId}/approve`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    ship?: ShipEvent
    embedUrl?: string | null
    embedToken?: string | null
    certifyError?: string | null
    verifyHint?: string
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `ship approve ${res.status}`)
  return body
}

export async function rollbackShipApi(
  shipId: string,
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/ship-events/${shipId}/rollback`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    ship?: ShipEvent
    already?: boolean
    warehouseRollback?: Record<string, unknown>
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `ship rollback ${res.status}`)
  return body
}

export async function linkShipMaterializationApi(
  shipId: string,
  input: { jobId?: string | null; materializationId?: string | null },
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/ship-events/${shipId}/link-materialization`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  const body = (await res.json().catch(() => ({}))) as {
    ship?: ShipEvent
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `link mat ${res.status}`)
  return body.ship!
}

/* ── Monk Mode + Steward inbox (Phase 1) ── */

export type MonkPhase =
  | 'discover'
  | 'map'
  | 'clean'
  | 'build'
  | 'certify'
  | 'done'

export type MonkRun = {
  id: string
  workspaceId: string
  packId: string
  industry: string
  status: string
  phase: MonkPhase
  matchScore: number | null
  capability: MonkCapabilityMap
  summary: Record<string, unknown>
  errorMessage?: string | null
  startedAt?: string | null
  completedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type MonkEvent = {
  id: string
  phase: string
  level: 'info' | 'success' | 'warn' | 'error'
  message: string
  detail: Record<string, unknown>
  createdAt: string
}

export type MonkCapabilityItem = {
  id: string
  label: string
  href?: string
  reason?: string
}

export type MonkCapabilityMap = {
  ready: MonkCapabilityItem[]
  review: MonkCapabilityItem[]
  unavailable: MonkCapabilityItem[]
  matchScorePct?: number
  profiledColumns?: number
}

export type IndustryPackMeta = {
  id: string
  industry: string
  displayName: string
  description: string
  minMatchScore?: number
  kpiCount?: number
  featured?: boolean
  policies?: {
    hipaaStrict?: boolean
    noAutoMaterialize?: boolean
    noAutoFixApply?: boolean
    immutableMonkLog?: boolean
    minCertRecall?: number
  }
  kpis?: { id: string; label: string; ceoQuestion?: string }[]
}

export type RankedIndustryPack = {
  pack: IndustryPackMeta
  scorePct: number
  canRunMonk: boolean
  missing: string[]
}

export type MonkEvidencePack = {
  disclaimer: string
  generatedAt: string
  workspaceId: string
  packId: string | null
  runCount: number
  runs: unknown[]
  certification: PackCertification | null
  stewardDecisions: unknown[]
  workspaceMemory: WorkspaceMemoryEntry[]
  controls: { id: string; title: string; status: string; evidence: string }[]
}

export type WorkspaceMemoryEntry = {
  id: string
  kind: string
  key: string
  value: Record<string, unknown>
  source: string
  createdAt: string
  updatedAt: string
}

export type StewardInboxIssue = {
  id: string
  workspaceId: string
  runId?: string | null
  issueKind: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: string
  title: string
  description?: string | null
  tableName?: string | null
  columnName?: string | null
  proposalSql?: string | null
  proposal: Record<string, unknown>
  resolvedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type StewardInboxSummary = {
  open: number
  high: number
  resolved: number
  breakdown: { status: string; severity: string; n: number }[]
}

export async function fetchMonkPacks(
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/monk/packs`)
  const body = (await res.json().catch(() => ({}))) as {
    packs?: IndustryPackMeta[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `monk packs ${res.status}`)
  return body.packs || []
}

export async function fetchMonkPreview(
  packId = 'ecommerce-v1',
  workspaceId: string = getActiveWorkspaceId(),
) {
  const q = new URLSearchParams({ packId })
  const res = await apiFetch(
    `/workspaces/${workspaceId}/monk/preview?${q}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    capability?: MonkCapabilityMap
    ranked?: RankedIndustryPack[]
    phases?: MonkPhase[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `monk preview ${res.status}`)
  return body
}

export async function fetchMonkEvidenceMarkdown(
  opts: { packId?: string; limit?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
) {
  const q = new URLSearchParams()
  if (opts.packId) q.set('packId', opts.packId)
  q.set('format', 'markdown')
  if (opts.limit) q.set('limit', String(opts.limit))
  const res = await apiFetch(
    `/workspaces/${workspaceId}/monk/evidence?${q}`,
  )
  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(errBody.error || `monk evidence ${res.status}`)
  }
  return res.text()
}

export async function fetchMonkEvidence(
  opts: { packId?: string; limit?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
) {
  const q = new URLSearchParams()
  if (opts.packId) q.set('packId', opts.packId)
  if (opts.limit) q.set('limit', String(opts.limit))
  const res = await apiFetch(
    `/workspaces/${workspaceId}/monk/evidence?${q}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    evidence?: MonkEvidencePack
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `monk evidence ${res.status}`)
  return body.evidence!
}

export async function fetchWorkspaceMemory(
  opts: { kind?: string; limit?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
) {
  const q = new URLSearchParams()
  if (opts.kind) q.set('kind', opts.kind)
  if (opts.limit) q.set('limit', String(opts.limit))
  const res = await apiFetch(
    `/workspaces/${workspaceId}/workspace-memory?${q}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    items?: WorkspaceMemoryEntry[]
    hints?: { kind: string; key: string; hint: string }[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `workspace memory ${res.status}`)
  return { items: body.items || [], hints: body.hints || [] }
}

export async function fetchMonkRuns(
  workspaceId: string = getActiveWorkspaceId(),
  limit = 10,
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/monk/runs?limit=${limit}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    items?: MonkRun[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `monk runs ${res.status}`)
  return body.items || []
}

export async function fetchMonkRun(
  runId: string,
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/monk/runs/${runId}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    run?: MonkRun
    events?: MonkEvent[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `monk run ${res.status}`)
  return { run: body.run!, events: body.events || [] }
}

export async function fetchMonkEvents(
  runId: string,
  since?: string,
  workspaceId: string = getActiveWorkspaceId(),
) {
  const q = since ? `?since=${encodeURIComponent(since)}` : ''
  const res = await apiFetch(
    `/workspaces/${workspaceId}/monk/runs/${runId}/events${q}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    events?: MonkEvent[]
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `monk events ${res.status}`)
  return body.events || []
}

export async function startMonkModeApi(
  packId = 'ecommerce-v1',
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/monk/start`, {
    method: 'POST',
    body: JSON.stringify({ packId }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    run?: MonkRun
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `monk start ${res.status}`)
  return body.run!
}

export async function fetchStewardInbox(
  opts: { status?: string; limit?: number } = {},
  workspaceId: string = getActiveWorkspaceId(),
) {
  const q = new URLSearchParams()
  if (opts.status) q.set('status', opts.status)
  if (opts.limit) q.set('limit', String(opts.limit))
  const res = await apiFetch(
    `/workspaces/${workspaceId}/steward/inbox?${q}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    items?: StewardInboxIssue[]
    summary?: StewardInboxSummary
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `steward inbox ${res.status}`)
  return { items: body.items || [], summary: body.summary! }
}

export async function updateStewardIssueApi(
  issueId: string,
  status: string,
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/steward/inbox/${issueId}`,
    { method: 'PATCH', body: JSON.stringify({ status }) },
  )
  const body = (await res.json().catch(() => ({}))) as {
    issue?: StewardInboxIssue
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `steward update ${res.status}`)
  return body.issue!
}

export async function runProfilingApi(
  maxTables?: number,
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(`/workspaces/${workspaceId}/profiling/run`, {
    method: 'POST',
    body: JSON.stringify({ maxTables }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    tableCount?: number
    columnCount?: number
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `profiling ${res.status}`)
  return body
}

export type PackCertification = {
  id: string
  status: 'pending' | 'passed' | 'failed'
  goldenRecall: number | null
  promotedRecall: number | null
  kpiCount: number
  certifiedAt?: string | null
}

export async function fetchMonkCertification(
  packId = 'ecommerce-v1',
  workspaceId: string = getActiveWorkspaceId(),
) {
  const q = new URLSearchParams({ packId })
  const res = await apiFetch(
    `/workspaces/${workspaceId}/monk/certification?${q}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    certification?: PackCertification | null
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `monk cert ${res.status}`)
  return body.certification ?? null
}

export async function certifyMonkRunApi(
  runId: string,
  packId = 'ecommerce-v1',
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/monk/runs/${runId}/certify`,
    { method: 'POST', body: JSON.stringify({ packId }) },
  )
  const body = (await res.json().catch(() => ({}))) as {
    passed?: boolean
    report?: { recall?: number; promotedRecall?: number }
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `monk certify ${res.status}`)
  return body
}

export async function seedSportedgeGoldenApi(
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/golden-eval/seed-sportedge`,
    { method: 'POST', body: '{}' },
  )
  const body = (await res.json().catch(() => ({}))) as {
    pairs?: number
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `seed golden ${res.status}`)
  return body
}

export async function seedMetricsFromPackApi(
  packId = 'ecommerce-v1',
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/metrics-defs/seed-from-pack`,
    { method: 'POST', body: JSON.stringify({ packId }) },
  )
  const body = (await res.json().catch(() => ({}))) as {
    created?: number
    updated?: number
    total?: number
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `seed metrics ${res.status}`)
  return body
}

/* ── Phase 3: autofill + health + dashboards ── */

export type AutofillPageInfo = {
  status: 'ready' | 'review' | 'empty' | 'unavailable'
  headline: string
  hints: string[]
  href: string
  cta: string
}

export type HealthScorecardData = {
  score: number
  grade: string
  breakdown: { key: string; label: string; score: number; weight: number; detail: string }[]
  signals: Record<string, unknown>
}

export async function fetchPageAutofill(
  pageId?: string,
  workspaceId: string = getActiveWorkspaceId(),
) {
  const q = pageId ? `?page=${encodeURIComponent(pageId)}` : ''
  const res = await apiFetch(`/workspaces/${workspaceId}/autofill${q}`)
  const body = (await res.json().catch(() => ({}))) as {
    page?: AutofillPageInfo
    pages?: Record<string, AutofillPageInfo>
    global?: Record<string, unknown>
    health?: HealthScorecardData
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `autofill ${res.status}`)
  return body
}

export async function fetchHealthScorecard(
  packId = 'ecommerce-v1',
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/health-scorecard?packId=${encodeURIComponent(packId)}`,
  )
  const body = (await res.json().catch(() => ({}))) as {
    scorecard?: HealthScorecardData
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `health ${res.status}`)
  return body.scorecard!
}

export async function seedPackDashboardsApi(
  packId = 'ecommerce-v1',
  workspaceId: string = getActiveWorkspaceId(),
) {
  const res = await apiFetch(
    `/workspaces/${workspaceId}/dashboards/seed-from-pack`,
    { method: 'POST', body: JSON.stringify({ packId }) },
  )
  const body = (await res.json().catch(() => ({}))) as {
    created?: number
    updated?: number
    error?: string
  }
  if (!res.ok) throw new Error(body.error || `seed dashboards ${res.status}`)
  return body
}
