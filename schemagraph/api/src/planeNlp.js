/**
 * Managed Plane SSM — bounded NLP → SQL (schema + managed metadata only).
 * Never sends warehouse or managed row payloads to the model.
 */
import {
  buildSchemaContextPack,
  findTablesMentioned,
  formatContextForPrompt,
} from './schemaContext.js'
import { getWorkspaceSettings } from './workspaceSettings.js'
import {
  getManagedDataset,
  isManagedPlaneEnabled,
  managedDatasetsSchemaForAi,
} from './managedDataPlane.js'
import { callChatModel, resolveModel } from './ai/models.js'
import { resolveProviderKeys } from './secrets.js'
import { prepareReadonlySql, LIVE_VALIDATE_MAX_ROWS } from './liveExec.js'
import { createPlaneActivityEvent } from './planeActivity.js'

const WRITE_RE =
  /\b(insert|update|delete|drop|alter|truncate|merge|create|grant|revoke)\b/i
const COMPLEX_RE =
  /\b(join|across|compare|versus|vs\.|trend|forecast|cohort|funnel|year over year|yoy|multi.?table|union all|subquer)\b/i

function extractSqlFromText(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed?.sql) return String(parsed.sql).trim()
    }
  } catch {
    /* fall through */
  }
  const fence = raw.match(/```(?:sql)?\s*([\s\S]*?)```/i)
  if (fence) return fence[1].trim()
  if (/^\s*(with|select)\b/i.test(raw)) return raw.replace(/;+\s*$/, '').trim()
  return null
}

function extractExplanation(text) {
  try {
    const jsonMatch = String(text).match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed?.explanation) return String(parsed.explanation).trim()
    }
  } catch {
    /* ignore */
  }
  return null
}

function extractScope(text, question, tableCount) {
  try {
    const jsonMatch = String(text).match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      const s = parsed?.scope
      if (s === 'in_scope' || s === 'complex' || s === 'blocked') return s
    }
  } catch {
    /* ignore */
  }
  const q = String(question || '').toLowerCase()
  if (WRITE_RE.test(q)) return 'blocked'
  if (COMPLEX_RE.test(q) || tableCount > 1) return 'complex'
  return 'in_scope'
}

function formatManagedForPrompt(list, focusSlug = null) {
  if (!list?.length) return ''
  const lines = ['## Managed datasets (schema only — use slug as table name)']
  for (const d of list.slice(0, 40)) {
    const cols = (d.columns || [])
      .map((c) => `${c.name}:${c.dataType || 'text'}`)
      .join(', ')
    lines.push(
      `- ${d.slug} · ${d.name} · rows≈${d.rowCount}${d.certified ? ' · certified' : ''}` +
        (cols ? `\n    columns: ${cols}` : ''),
    )
    if (focusSlug && d.slug === focusSlug) {
      lines.push('  ^ preferred target for this question')
    }
  }
  return lines.join('\n')
}

function compactPackForPlane(pack, question, focusTables = []) {
  const mentioned = findTablesMentioned(pack, question, focusTables)
  const focusIds = new Set(mentioned.map((t) => t.id))
  const tables = [
    ...pack.tables.filter((t) => focusIds.has(t.id)),
    ...pack.tables.filter((t) => !focusIds.has(t.id)),
  ].slice(0, 35)
  return {
    ...pack,
    tables,
    relationships: pack.relationships.slice(0, 25),
  }
}

function heuristicPlaneSql(question, { targetSlug, pack }) {
  const q = String(question || '').toLowerCase().trim()
  const slug = targetSlug || pack.tables[0]?.name || 'managed_dataset'
  const table = slug.replace(/[^a-z0-9_]/gi, '_')

  if (WRITE_RE.test(q)) {
    return {
      sql: null,
      explanation: 'Write/DDL requests are blocked in Managed Plane preview.',
      scope: 'blocked',
      mode: 'heuristic',
    }
  }

  const topM = q.match(/top\s+(\d+)/)
  const limit = topM ? Math.min(Number(topM[1]) || 20, LIVE_VALIDATE_MAX_ROWS) : 20

  if (/\bcount\b/.test(q)) {
    return {
      sql: `-- Heuristic draft\nSELECT COUNT(*) AS row_count\nFROM ${table}\nLIMIT 1;`,
      explanation: 'Count rows in the target table/dataset.',
      scope: 'in_scope',
      mode: 'heuristic',
    }
  }

  if (/\b(distinct|unique)\b/.test(q)) {
    const col = pack.tables[0]?.columns?.[0]?.name || 'id'
    return {
      sql: `-- Heuristic draft\nSELECT DISTINCT ${col}\nFROM ${table}\nLIMIT ${limit};`,
      explanation: 'Distinct values for a key column.',
      scope: 'in_scope',
      mode: 'heuristic',
    }
  }

  if (COMPLEX_RE.test(q)) {
    return {
      sql: `-- Heuristic draft — review joins before run\nSELECT *\nFROM ${table}\nLIMIT ${limit};`,
      explanation:
        'Complex analytics detected — starting point SELECT; refine joins in SQL tab or use AI Chat for schema planning.',
      scope: 'complex',
      mode: 'heuristic',
    }
  }

  return {
    sql: `-- Heuristic draft\n-- Question: ${question.slice(0, 120)}\nSELECT *\nFROM ${table}\nLIMIT ${limit};`,
    explanation: 'Basic projection — edit columns/filters before Run preview.',
    scope: 'in_scope',
    mode: 'heuristic',
  }
}

/**
 * @param {string} workspaceId
 * @param {{ question: string, datasetId?: string|null, modelId?: string|null, userId?: string|null }} opts
 */
export async function generatePlaneSqlFromNlp(workspaceId, opts = {}) {
  const question = String(opts.question || '').trim()
  if (!question) {
    const err = new Error('question is required')
    err.status = 400
    throw err
  }

  if (!(await isManagedPlaneEnabled(workspaceId))) {
    const err = new Error(
      'Managed Plane is disabled — enable enableManagedDataPlane in Settings',
    )
    err.status = 403
    throw err
  }

  const settings = (await getWorkspaceSettings(workspaceId))?.settings || {}
  const keys = await resolveProviderKeys(workspaceId)
  const model = resolveModel(settings, opts.modelId, keys)

  const pack = await buildSchemaContextPack(workspaceId)
  const managedList = await managedDatasetsSchemaForAi(workspaceId)

  let focusSlug = null
  let focusTableNames = []
  if (opts.datasetId) {
    const ds = await getManagedDataset(workspaceId, opts.datasetId)
    if (ds) {
      focusSlug = ds.slug
      focusTableNames = [ds.slug, ds.name]
    }
  }

  const compact = compactPackForPlane(pack, question, focusTableNames)
  const schemaBlock = formatContextForPrompt(compact)
  const managedBlock = formatManagedForPrompt(managedList, focusSlug)

  if (!model) {
    const heuristic = heuristicPlaneSql(question, {
      targetSlug: focusSlug,
      pack: compact,
    })
    return finalizePlaneNlpResult(workspaceId, question, heuristic, {
      userId: opts.userId,
    })
  }

  const system =
    `You are Que Plane SSM — a bounded SQL assistant inside Managed Plane (Offer B).\n` +
    `Generate ONE read-only PostgreSQL SELECT or WITH query only.\n` +
    `Rules:\n` +
    `- Use ONLY tables/slugs and columns from context. Never invent names.\n` +
    `- NEVER output INSERT/UPDATE/DELETE/DDL.\n` +
    `- Always end with LIMIT ${LIVE_VALIDATE_MAX_ROWS} or lower.\n` +
    `- Managed dataset slugs may be used as table identifiers in Managed Plane.\n` +
    `- You do NOT have access to row data — metadata only.\n\n` +
    `Respond with JSON only:\n` +
    `{"sql":"...","explanation":"one sentence","scope":"in_scope|complex|blocked"}\n\n` +
    `${schemaBlock}\n\n${managedBlock}`

  const userMsg =
    (focusSlug
      ? `Preferred managed dataset slug: ${focusSlug}\n`
      : '') + `Question: ${question}`

  let rawText
  try {
    rawText = await callChatModel(model, system, userMsg, [], keys)
  } catch (err) {
    const heuristic = heuristicPlaneSql(question, {
      targetSlug: focusSlug,
      pack: compact,
    })
    return finalizePlaneNlpResult(workspaceId, question, {
      ...heuristic,
      explanation:
        (heuristic.explanation || '') +
        ` (LLM unavailable: ${err.message || 'error'})`,
    }, { userId: opts.userId })
  }

  let sql = extractSqlFromText(rawText)
  let explanation =
    extractExplanation(rawText) || 'LLM-generated read-only draft — review before run.'
  let scope = extractScope(rawText, question, compact.tables.length)

  if (!sql) {
    const heuristic = heuristicPlaneSql(question, {
      targetSlug: focusSlug,
      pack: compact,
    })
    return finalizePlaneNlpResult(workspaceId, question, {
      ...heuristic,
      explanation: 'Could not parse LLM SQL — heuristic draft provided.',
    }, { userId: opts.userId })
  }

  if (scope === 'blocked' || WRITE_RE.test(sql)) {
    return finalizePlaneNlpResult(workspaceId, question, {
      sql: null,
      explanation: 'Blocked: only read-only SELECT/WITH is allowed in Managed Plane.',
      scope: 'blocked',
      mode: 'llm',
      model: model.id,
    }, { userId: opts.userId })
  }

  try {
    sql = prepareReadonlySql(sql, LIVE_VALIDATE_MAX_ROWS)
  } catch (err) {
    return finalizePlaneNlpResult(workspaceId, question, {
      sql: null,
      explanation: err.message || 'SQL failed safety checks',
      scope: 'blocked',
      mode: 'llm',
      model: model.id,
    }, { userId: opts.userId })
  }

  return finalizePlaneNlpResult(
    workspaceId,
    question,
    {
      sql,
      explanation,
      scope,
      mode: 'llm',
      model: model.id,
      tablesUsed: compact.tables.slice(0, 5).map((t) => t.name),
    },
    { userId: opts.userId },
  )
}

async function finalizePlaneNlpResult(workspaceId, question, result, meta = {}) {
  const out = {
    ok: true,
    question,
    sql: result.sql,
    explanation: result.explanation || '',
    scope: result.scope || 'in_scope',
    mode: result.mode || 'heuristic',
    model: result.model || null,
    tablesUsed: result.tablesUsed || [],
    policy: 'plane-ssm-readonly',
  }

  if (result.sql) {
    try {
      await createPlaneActivityEvent(
        workspaceId,
        {
          kind: 'drafted',
          source: 'plane_nlp',
          actor: result.mode === 'llm' ? 'ssm' : 'user',
          title: 'NLP → SQL draft',
          detail: question.slice(0, 240),
          sql: result.sql,
        },
        meta.userId ?? null,
      )
    } catch (err) {
      console.warn('[Que] plane nlp activity:', err.message || err)
    }
  }

  return out
}
