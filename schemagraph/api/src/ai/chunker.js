/**
 * Chunk schema packs and product docs for RAG indexing.
 */

/**
 * @param {object} pack - from buildSchemaContextPack
 * @returns {{ sourceKind: string, sourceRef: string, title: string, content: string, metadata: object }[]}
 */
export function chunkSchemaPack(pack) {
  const chunks = []
  for (const t of pack.tables || []) {
    const colLines = (t.columns || [])
      .map((c) => {
        const key =
          c.keyKind && c.keyKind !== 'none' ? ` ${c.keyKind}` : ''
        const refs = c.references ? ` → ${c.references}` : ''
        return `  - ${c.name}: ${c.dataType}${key}${refs}`
      })
      .join('\n')
    chunks.push({
      sourceKind: 'schema_table',
      sourceRef: `table:${t.connection}:${t.name}`,
      title: t.name,
      content:
        `Table ${t.name} (${t.entityKind}) from ${t.connection} [${t.sourceType}]\n` +
        `Columns:\n${colLines || '  (none)'}`,
      metadata: {
        table: t.name,
        connection: t.connection,
        sourceType: t.sourceType,
        columnCount: (t.columns || []).length,
      },
    })
    for (const c of t.columns || []) {
      chunks.push({
        sourceKind: 'schema_column',
        sourceRef: `col:${t.connection}:${t.name}.${c.name}`,
        title: `${t.name}.${c.name}`,
        content:
          `Column ${t.name}.${c.name}: ${c.dataType}` +
          (c.keyKind && c.keyKind !== 'none' ? ` (${c.keyKind})` : '') +
          (c.references ? ` references ${c.references}` : '') +
          `\nTable ${t.name} via ${t.connection} [${t.sourceType}]`,
        metadata: {
          table: t.name,
          column: c.name,
          dataType: c.dataType,
          keyKind: c.keyKind,
          connection: t.connection,
        },
      })
    }
  }
  for (const r of pack.relationships || []) {
    const id = r.id || `${r.from}->${r.to}`
    chunks.push({
      sourceKind: 'relationship',
      sourceRef: `rel:${id}`,
      title: `${r.from} → ${r.to}`,
      content:
        `Relationship ${r.from} → ${r.to}\n` +
        `type=${r.type} status=${r.status} confidence=${r.confidence}`,
      metadata: {
        from: r.from,
        to: r.to,
        type: r.type,
        status: r.status,
        confidence: r.confidence,
      },
    })
  }
  return chunks
}

/**
 * Split plain text into overlapping chunks (~maxChars, overlap).
 * @param {string} text
 * @param {{ docId: string, title: string, maxChars?: number, overlap?: number }} opts
 */
export function chunkDocumentText(text, opts) {
  const maxChars = opts.maxChars ?? 2400
  const overlap = opts.overlap ?? 300
  const cleaned = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!cleaned) return []

  const parts = []
  let start = 0
  let idx = 0
  while (start < cleaned.length) {
    let end = Math.min(start + maxChars, cleaned.length)
    if (end < cleaned.length) {
      const slice = cleaned.slice(start, end)
      const breakAt = Math.max(
        slice.lastIndexOf('\n\n'),
        slice.lastIndexOf('\n'),
        slice.lastIndexOf('. '),
      )
      if (breakAt > maxChars * 0.4) end = start + breakAt + 1
    }
    const body = cleaned.slice(start, end).trim()
    if (body) {
      parts.push({
        sourceKind: 'doc',
        sourceRef: `doc:${opts.docId}:${idx}`,
        title: `${opts.title} (#${idx + 1})`,
        content: `${opts.title}\n\n${body}`,
        metadata: { docId: opts.docId, title: opts.title, chunkIndex: idx },
      })
      idx += 1
    }
    if (end >= cleaned.length) break
    start = Math.max(0, end - overlap)
  }
  return parts
}

/** Strip HTML to readable text (no external deps). */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
