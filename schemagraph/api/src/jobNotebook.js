/**
 * Job notebook helpers — cells are the interactive source of truth (Step 2+).
 * Legacy sql_text / steps / notes stay in sync for export compatibility.
 */
import { randomUUID } from 'node:crypto'

const KINDS = new Set(['markdown', 'sql'])

/**
 * @typedef {{ id: string, kind: 'markdown'|'sql', title?: string, content: string }} NotebookCell
 */

/**
 * @param {unknown} raw
 * @returns {NotebookCell[]}
 */
export function normalizeNotebook(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const kind = String(item.kind || '').toLowerCase()
    if (!KINDS.has(kind)) continue
    const content = String(item.content ?? '')
    const id =
      typeof item.id === 'string' && item.id.trim()
        ? item.id.trim().slice(0, 80)
        : randomUUID()
    const title =
      typeof item.title === 'string' && item.title.trim()
        ? item.title.trim().slice(0, 120)
        : kind === 'sql'
          ? 'stitch.sql'
          : 'Notes'
    out.push({ id, kind, title, content })
  }
  return out
}

/**
 * Build a starter notebook from legacy job fields / chat draft.
 * @param {{
 *   title?: string
 *   notes?: string | null
 *   steps?: { id?: number, action?: string, detail?: string }[]
 *   sqlText?: string | null
 *   tables?: string[]
 *   status?: string
 * }} fields
 * @returns {NotebookCell[]}
 */
export function buildNotebookFromFields(fields = {}) {
  const title = String(fields.title || 'Untitled Que job').trim()
  const tables = Array.isArray(fields.tables) ? fields.tables : []
  const notes = fields.notes != null ? String(fields.notes).trim() : ''
  const status = fields.status || 'draft'

  /** @type {NotebookCell[]} */
  const cells = []

  cells.push({
    id: randomUUID(),
    kind: 'markdown',
    title: 'Overview',
    content:
      notes ||
      [
        `# ${title}`,
        '',
        `Status: **${status}**`,
        '',
        tables.length
          ? `Tables: ${tables.map((t) => `\`${t}\``).join(', ')}`
          : 'No tables bound yet.',
        '',
        '_Schema-only Que notebook — no raw warehouse rows centralized._',
      ].join('\n'),
  })

  const steps = Array.isArray(fields.steps) ? fields.steps : []
  if (steps.length > 0) {
    cells.push({
      id: randomUUID(),
      kind: 'markdown',
      title: 'Pipeline steps',
      content: [
        '## Pipeline steps',
        '',
        ...steps.map((s) => {
          const n = s.id ?? ''
          const action = s.action || 'step'
          const detail = s.detail || ''
          return `${n}. **${action}** — ${detail}`
        }),
      ].join('\n'),
    })
  }

  const sql =
    fields.sqlText != null && String(fields.sqlText).trim()
      ? String(fields.sqlText).trim()
      : [
          '-- Que stitch SQL draft',
          '-- Filled when AI / canvas creates a job with joins.',
          'SELECT 1 AS que_notebook_stub;',
        ].join('\n')

  cells.push({
    id: randomUUID(),
    kind: 'sql',
    title: 'stitch.sql',
    content: sql,
  })

  return cells
}

/** First SQL cell content (or null). */
export function primarySqlFromNotebook(notebook) {
  const cells = normalizeNotebook(notebook)
  const sql = cells.find((c) => c.kind === 'sql' && c.content.trim())
  return sql ? sql.content : null
}

/**
 * Keep sql_text aligned when notebook changes; keep notebook aligned when sql changes.
 * @param {NotebookCell[]} notebook
 * @param {string | null | undefined} sqlText
 */
export function syncNotebookAndSql(notebook, sqlText) {
  let cells = normalizeNotebook(notebook)
  if (cells.length === 0) {
    cells = buildNotebookFromFields({ sqlText })
  }

  if (sqlText !== undefined && sqlText !== null) {
    const next = String(sqlText)
    const idx = cells.findIndex((c) => c.kind === 'sql')
    if (idx >= 0) {
      cells = cells.map((c, i) =>
        i === idx ? { ...c, content: next } : c,
      )
    } else {
      cells = [
        ...cells,
        {
          id: randomUUID(),
          kind: 'sql',
          title: 'stitch.sql',
          content: next,
        },
      ]
    }
  }

  return {
    notebook: cells,
    sqlText: primarySqlFromNotebook(cells),
  }
}

/**
 * Resolve notebook for create/update: explicit body.notebook wins, else build.
 */
export function resolveNotebookInput(body = {}, legacy = {}) {
  if (Array.isArray(body.notebook) && body.notebook.length > 0) {
    const synced = syncNotebookAndSql(
      body.notebook,
      body.sqlText ?? body.sql_text ?? legacy.sqlText,
    )
    return synced
  }

  const built = buildNotebookFromFields({
    title: body.title ?? legacy.title,
    notes: body.notes !== undefined ? body.notes : legacy.notes,
    steps: body.steps ?? legacy.steps,
    sqlText: body.sqlText ?? body.sql_text ?? legacy.sqlText,
    tables: body.tables ?? legacy.tables,
    status: body.status ?? legacy.status,
  })
  return {
    notebook: built,
    sqlText: primarySqlFromNotebook(built),
  }
}
