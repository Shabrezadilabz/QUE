/**
 * Phase 2 — SSM-A Schema Context Service.
 * Single unified context pack for Chat, Genie, live SQL, and job draft surfaces.
 */
import {
  buildSchemaContextPack,
  findTablesMentioned,
} from '../schemaContext.js'
import {
  buildChatGraphContext,
  buildSchemaAdjacency,
} from '../chatGraphContext.js'
import { buildPinnedSamplesAiPack, PINNED_SAMPLE_ROWS_MIN, PINNED_SAMPLE_ROWS_MAX, buildRowsFromColumnSamples } from '../pinnedSamples.js'
import { filterPackForCeoAudience } from '../ceoChatGuard.js'
import { getWarehouseStatus } from '../queWarehouse.js'
import { routeSsmIntent, rankFocusTables } from './ssmRouter.js'
import { resolveSsmRouteWithAb, ensureWorkspaceSsmModelAsync } from './ssmMlExport.js'
import { listRecentWorkspaceEvents } from './workspaceEvents.js'
import {
  SSM_SYSTEM_PROMPT_ANCHOR,
  validateContextPackStructure,
  formatSsmSystemPrompt,
} from './contextPackValidate.js'
import { evaluateSampleGate } from './sampleGate.js'

/**
 * Human-readable SSM-B routing label for prompts and UI.
 * @param {object} ssmRoute
 */
export function formatSsmRoutingLabel(ssmRoute = {}) {
  const src = ssmRoute.routingSource || 'heuristic'
  if (src === 'ml_trained') {
    return `Routing: SSM-B trained (${ssmRoute.mlModel || 'ssm-b-trained-v1'})`
  }
  if (src === 'ml_stub') {
    return `Routing: ML stub (${ssmRoute.mlModel || 'ssm-b-lite-stub-v0'})`
  }
  return 'Routing: heuristic'
}

/** @param {string} edge e.g. "orders.id" */
function tableFromEdge(edge) {
  const s = String(edge || '').trim()
  const dot = s.indexOf('.')
  return dot > 0 ? s.slice(0, dot) : s
}

function sanitizeMermaidId(name) {
  return String(name || 't')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .slice(0, 48)
}

/**
 * Merge pinned rows + column samples so each table exposes 5–10 scrubbed values.
 * @param {object} pack
 * @param {object[]} pinnedSamples
 */
export function enforceMandatorySamples(
  pack,
  pinnedSamples = [],
  {
    minRows = PINNED_SAMPLE_ROWS_MIN,
    maxRows = PINNED_SAMPLE_ROWS_MAX,
  } = {},
) {
  const pinByTable = new Map(
    pinnedSamples.map((p) => [String(p.table || '').toLowerCase(), p]),
  )
  const warnings = []
  const tables = (pack.tables || []).map((t) => {
    const pin = pinByTable.get(String(t.name || '').toLowerCase())
    const pinRows = pin?.rows || []
    const columns = (t.columns || []).map((c) => {
      const fromPin = pinRows
        .map((row) => row?.[c.name])
        .filter((v) => v != null && String(v).trim() !== '')
      const merged = [...new Set([...(c.samples || []), ...fromPin])].slice(
        0,
        maxRows,
      )
      return { ...c, samples: merged }
    })
    const depth = Math.max(
      pinRows.length,
      ...columns.map((c) => (c.samples || []).length),
      0,
    )
    let tableSamples = pinRows.slice(0, maxRows)
    if (tableSamples.length < minRows && columns.some((c) => (c.samples || []).length)) {
      const built = buildRowsFromColumnSamples(
        columns.map((c) => ({
          name: c.name,
          dataType: c.dataType,
          sampleValues: c.samples || [],
        })),
        maxRows,
      )
      if (built.rows.length > tableSamples.length) {
        tableSamples = built.rows.slice(0, maxRows)
      }
    }
    const effectiveDepth = Math.max(tableSamples.length, depth)
    if (effectiveDepth > 0 && effectiveDepth < minRows) {
      warnings.push(`${t.name}: ${effectiveDepth} sample(s) — target ${minRows}–${maxRows}`)
    } else if (effectiveDepth === 0) {
      warnings.push(`${t.name}: no scrubbed samples`)
    }
    return {
      ...t,
      columns,
      pinnedRowCount: tableSamples.length,
      tableSamples,
    }
  })
  return {
    pack: { ...pack, tables },
    warnings,
  }
}

/**
 * Structured join graph for SSM-A pack.
 * @param {object} pack
 */
export function buildJoinGraphJson(pack) {
  const nodes = (pack.tables || []).map((t) => ({
    id: t.name,
    connection: t.connection,
    entityKind: t.entityKind,
    sourceType: t.sourceType,
  }))
  const edges = (pack.relationships || []).map((r) => ({
    from: tableFromEdge(r.from),
    to: tableFromEdge(r.to),
    fromColumn: r.from.split('.').pop(),
    toColumn: r.to.split('.').pop(),
    type: r.type,
    status: r.status,
    confidence: r.confidence,
    label: r.label,
  }))
  return { nodes, edges, nodeCount: nodes.length, edgeCount: edges.length }
}

/**
 * @param {object} pack
 * @param {string[]} [focusTableNames]
 */
export function buildJoinGraphMermaid(pack, focusTableNames = []) {
  const focus = new Set(
    (focusTableNames || []).map((n) => String(n || '').toLowerCase()),
  )
  const lines = ['graph LR']
  const seen = new Set()
  for (const r of pack.relationships || []) {
    const a = tableFromEdge(r.from)
    const b = tableFromEdge(r.to)
    if (
      focus.size &&
      !focus.has(a.toLowerCase()) &&
      !focus.has(b.toLowerCase())
    ) {
      continue
    }
    const key = `${a}-->${b}`
    if (seen.has(key)) continue
    seen.add(key)
    const label = String(r.type || 'join').replace(/"/g, "'")
    lines.push(
      `  ${sanitizeMermaidId(a)} -->|"${label}"| ${sanitizeMermaidId(b)}`,
    )
    if (lines.length > 42) break
  }
  if (lines.length === 1) {
    for (const t of (pack.tables || []).slice(0, 12)) {
      lines.push(`  ${sanitizeMermaidId(t.name)}["${t.name}"]`)
    }
  }
  return lines.join('\n')
}

function formatWarehouseMapBlock(warehouseMap = []) {
  if (!warehouseMap.length) {
    return '## Que Warehouse map\n(no raw tables replicated yet)'
  }
  const lines = ['## Que Warehouse map (physical raw tables)']
  for (const t of warehouseMap.slice(0, 40)) {
    lines.push(
      `- ${t.rawTableName} ← ${t.sourceTable} · ${t.rowCount ?? 0} rows`,
    )
  }
  return lines.join('\n')
}

function formatJoinGraphBlock(joinGraph, mermaid, joinPaths = []) {
  const lines = [
    '## Join graph',
    `Nodes: ${joinGraph.nodeCount} · Edges: ${joinGraph.edgeCount}`,
  ]
  if (joinPaths.length) {
    lines.push('', '### Join paths (focus)')
    for (const p of joinPaths.slice(0, 6)) {
      lines.push(`- ${p.path.join(' → ')} (${p.hops} hop${p.hops === 1 ? '' : 's'})`)
    }
  }
  if (mermaid) {
    lines.push('', '```mermaid', mermaid, '```')
  }
  return lines.join('\n')
}

/**
 * Main SSM-A entry — one pack for all AI surfaces.
 * @param {string} workspaceId
 * @param {{
 *   message?: string,
 *   intent?: object,
 *   mentions?: object|null,
 *   mentioned?: object[],
 *   audience?: string,
 *   ceoScope?: object|null,
 *   settings?: object,
 *   ragChunks?: object[],
 *   pinnedSamples?: object[],
 *   basePack?: object|null,
 *   graphHops?: number,
 *   maxTables?: number,
 *   connectionName?: string|null,
 *   pageContext?: object,
 * }} [opts]
 */
export async function buildUnifiedContextPack(workspaceId, opts = {}) {
  const message = String(
    opts.message || opts.intent?.goal || '',
  ).trim()
  const audience = opts.audience === 'engineer' ? 'engineer' : 'ceo'
  const settings = opts.settings || {}

  let events = []
  try {
    events = await listRecentWorkspaceEvents(workspaceId, 40)
  } catch {
    /* event log optional until migrate */
  }

  await ensureWorkspaceSsmModelAsync(workspaceId, events)

  const useAb = settings.enableSsmAbRouting !== false
  const { ssmRoute, ssmAb } = resolveSsmRouteWithAb(
    message,
    events,
    {
      pageContext: opts.pageContext,
      mentions: opts.mentions,
      useAb,
      workspaceId,
    },
  )

  let pack = opts.basePack || (await buildSchemaContextPack(workspaceId))

  if (
    audience === 'ceo' &&
    opts.ceoScope?.certifiedOnly &&
    opts.ceoScope?.hasCertifiedTables
  ) {
    pack = filterPackForCeoAudience(pack, opts.ceoScope)
  }

  let pinnedSamples = opts.pinnedSamples
  if (!pinnedSamples && settings.aiMayUsePinnedSamples !== false) {
    try {
      pinnedSamples = await buildPinnedSamplesAiPack(workspaceId, {
        maxTables: 24,
      })
    } catch {
      pinnedSamples = []
    }
  }

  const { pack: enrichedPack, warnings: sampleWarnings } = enforceMandatorySamples(
    pack,
    pinnedSamples || [],
  )

  let warehouseMap = []
  try {
    const wh = await getWarehouseStatus(workspaceId)
    warehouseMap = (wh.tables || []).map((t) => ({
      rawTableName: t.rawTableName,
      sourceTable: t.sourceTable,
      rowCount: t.rowCount,
      connectionId: t.connectionId,
    }))
  } catch {
    /* warehouse optional */
  }

  const joinGraph = buildJoinGraphJson(enrichedPack)
  const focusSeed = rankFocusTables(
    enrichedPack,
    message,
    events,
    ssmRoute.focusTableNames,
  )
  const mermaid = buildJoinGraphMermaid(enrichedPack, focusSeed)

  const mentioned =
    opts.mentioned ||
    (message ? findTablesMentioned(enrichedPack, message, []) : [])

  const graphCtx = buildChatGraphContext(
    enrichedPack,
    message,
    mentioned,
    opts.ragChunks || [],
    {
      audience,
      graphHops: opts.graphHops ?? 1,
      maxTables: opts.maxTables ?? 35,
      includeSamples: true,
      pinnedSamples: pinnedSamples || [],
      connectionName: opts.connectionName ?? null,
    },
  )

  const focusedPack = graphCtx.focusedPack
  const warehouseBlock = formatWarehouseMapBlock(warehouseMap)
  const joinGraphBlock = formatJoinGraphBlock(
    joinGraph,
    mermaid,
    graphCtx.joinPaths,
  )

  const ssmStateBlock = ssmRoute.workspaceStateSummary
    ? `## Workspace state (SSM-B)\n${ssmRoute.workspaceStateSummary}\n${formatSsmRoutingLabel(ssmRoute)}`
    : ''

  const promptBlock = [
    formatSsmSystemPrompt({ intent: ssmRoute.intent, ssmRoute, focusedPack }),
    ssmStateBlock,
    graphCtx.promptBlock,
    warehouseBlock,
    joinGraphBlock,
  ]
    .filter(Boolean)
    .join('\n\n')

  const validation = validateContextPackStructure({
    pack: enrichedPack,
    focusedPack,
    pinnedSamples: pinnedSamples || [],
  })

  const sampleGate = evaluateSampleGate({
    validation,
    sampleWarnings,
    settings,
    tableCount: enrichedPack.stats?.tableCount ?? enrichedPack.tables?.length ?? 0,
  })

  return {
    pack: enrichedPack,
    focusedPack,
    joinGraph,
    joinPaths: graphCtx.joinPaths,
    mermaid,
    warehouseMap,
    intent: ssmRoute.intent,
    ssmRoute,
    ssmAb,
    graphCtx,
    promptBlock,
    systemPromptAnchor: SSM_SYSTEM_PROMPT_ANCHOR,
    pinnedSamples: pinnedSamples || [],
    sampleWarnings,
    sampleGate,
    stats: enrichedPack.stats,
    validation,
    adjacency: buildSchemaAdjacency(enrichedPack),
  }
}

/** Alias for master-plan naming. */
export const buildSchemaContextServicePack = buildUnifiedContextPack

export { SSM_SYSTEM_PROMPT_ANCHOR }
