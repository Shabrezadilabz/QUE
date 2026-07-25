/**
 * Build a schema-only context pack for AI chat.
 * Never includes raw row dumps — columns, types, keys, join edges only
 * (optional capped samples already stored as metadata).
 */
import { query } from './db.js'

/**
 * @param {string} workspaceId
 */
export async function buildSchemaContextPack(workspaceId) {
  const [objects, columns, rels, snap] = await Promise.all([
    query(
      `SELECT o.id, o.name, o.entity_kind, o.connection_id,
              c.name AS connection_name, c.source_type
       FROM schema_objects o
       JOIN connections c ON c.id = o.connection_id
       WHERE o.workspace_id = $1
       ORDER BY c.name, o.name`,
      [workspaceId],
    ),
    query(
      `SELECT id, schema_object_id, name, data_type, key_kind, is_nullable,
              sample_values, references_label
       FROM schema_columns
       WHERE workspace_id = $1
       ORDER BY schema_object_id, ordinal`,
      [workspaceId],
    ),
    query(
      `SELECT r.id, r.relation_type, r.status, r.confidence, r.label, r.join_criteria,
              r.ai_notes,
              fo.name AS from_table, fc.name AS from_column,
              tro.name AS to_table, tc.name AS to_column
       FROM relationships r
       JOIN schema_objects fo ON fo.id = r.from_object_id
       JOIN schema_columns fc ON fc.id = r.from_column_id
       JOIN schema_objects tro ON tro.id = r.to_object_id
       JOIN schema_columns tc ON tc.id = r.to_column_id
       WHERE r.workspace_id = $1 AND r.status <> 'rejected'
       ORDER BY r.relation_type, r.confidence DESC`,
      [workspaceId],
    ),
    query(
      `SELECT id, label, created_at
       FROM schema_snapshots
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [workspaceId],
    ),
  ])

  const colsByObject = new Map()
  for (const col of columns.rows) {
    const list = colsByObject.get(col.schema_object_id) ?? []
    list.push({
      name: col.name,
      dataType: col.data_type,
      keyKind: col.key_kind,
      nullable: col.is_nullable,
      references: col.references_label ?? undefined,
      samples: Array.isArray(col.sample_values)
        ? col.sample_values.slice(0, 5)
        : [],
    })
    colsByObject.set(col.schema_object_id, list)
  }

  const tables = objects.rows.map((o) => ({
    id: o.id,
    name: o.name,
    entityKind: o.entity_kind,
    sourceType: o.source_type,
    connection: o.connection_name,
    columns: colsByObject.get(o.id) ?? [],
  }))

  const relationships = rels.rows.map((r) => ({
    type: r.relation_type,
    status: r.status,
    confidence: Number(r.confidence),
    from: `${r.from_table}.${r.from_column}`,
    to: `${r.to_table}.${r.to_column}`,
    label: r.label ?? undefined,
    joinCriteria: r.join_criteria ?? undefined,
    aiNotes: r.ai_notes ?? undefined,
  }))

  const pack = {
    workspaceId,
    generatedAt: new Date().toISOString(),
    snapshot: snap.rows[0]
      ? {
          id: snap.rows[0].id,
          label: snap.rows[0].label,
          createdAt: snap.rows[0].created_at,
        }
      : null,
    tables,
    relationships,
    stats: {
      tableCount: tables.length,
      columnCount: columns.rows.length,
      relationshipCount: relationships.length,
      suggestedJoins: relationships.filter(
        (r) => r.type === 'ai-inferred' && r.status === 'suggested',
      ).length,
    },
  }

  return pack
}

/** Compact text block suitable for LLM system context */
export function formatContextForPrompt(pack) {
  const lines = [
    `Que schema context (metadata only — no raw warehouse data).`,
    `Tables: ${pack.stats.tableCount} · Columns: ${pack.stats.columnCount} · Relationships: ${pack.stats.relationshipCount}`,
    '',
    '## Tables',
  ]
  for (const t of pack.tables) {
    lines.push(
      `- ${t.name} [${t.entityKind}/${t.sourceType}] via ${t.connection}`,
    )
    for (const c of t.columns) {
      const key = c.keyKind && c.keyKind !== 'none' ? ` ${c.keyKind.toUpperCase()}` : ''
      const refs = c.references ? ` → ${c.references}` : ''
      lines.push(`    · ${c.name}: ${c.dataType}${key}${refs}`)
    }
  }
  lines.push('', '## Relationships')
  if (pack.relationships.length === 0) {
    lines.push('(none)')
  } else {
    for (const r of pack.relationships) {
      lines.push(
        `- [${r.type}/${r.status} conf=${r.confidence}] ${r.from} → ${r.to}`,
      )
    }
  }
  return lines.join('\n')
}

export function findTablesMentioned(pack, text, explicitNames = []) {
  const raw = String(text || '')
  const lower = raw.toLowerCase()
  // Prefer explicit @mentions / client-sent focus names
  const explicit = new Set(
    (explicitNames || []).map((n) => String(n).toLowerCase()).filter(Boolean),
  )
  // Also parse @Table and @Table.col from the message body
  const atRe = /@([A-Za-z_][\w]*)(?:\.([A-Za-z_][\w]*))?/g
  let m
  while ((m = atRe.exec(raw))) {
    explicit.add(m[1].toLowerCase())
  }

  const byExplicit = pack.tables.filter((t) =>
    explicit.has(t.name.toLowerCase()),
  )
  if (byExplicit.length) return byExplicit

  return pack.tables.filter((t) => {
    const name = t.name.toLowerCase()
    return (
      lower.includes(name) ||
      lower.includes(name.replace(/_/g, ' ')) ||
      new RegExp(`\\b${escapeReg(name)}\\b`, 'i').test(raw)
    )
  })
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
