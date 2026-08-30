/** Notebook cell languages (Databricks-style). */
export type NotebookCellKind = 'markdown' | 'sql' | 'python' | 'scala'

/**
 * Pull executable SQL from a cell — plain SQL, or embedded in Python/Scala
 * via %sql / spark.sql(...) / sql("""...""").
 */
export function extractExecutableSql(
  content: string,
  kind: NotebookCellKind | string = 'sql',
): string | null {
  const text = String(content || '')
  const k = String(kind || 'sql').toLowerCase()

  if (k === 'markdown') return null

  if (k === 'sql') {
    const trimmed = text.trim()
    if (!trimmed) return null
    const stripped = trimmed
      .replace(/\r\n/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^[ \t]*--[^\n]*$/gm, '')
      .replace(/^[ \t]*#[^\n]*$/gm, '')
      .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
      .trim()
    const start = stripped.search(/\b(?:with|select)\b/i)
    return start >= 0 ? stripped.slice(start).trim() : trimmed
  }

  const magic = text.match(
    /(?:^|\n)\s*%sql[ \t]*\n([\s\S]*?)(?=(?:\n\s*%[a-zA-Z_])|\s*$)/i,
  )
  if (magic?.[1]?.trim()) return magic[1].trim()

  const spark = text.match(
    /spark\.sql\s*\(\s*(?:"""([\s\S]*?)"""|'''([\s\S]*?)'''|"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)')\s*\)/i,
  )
  if (spark) {
    const sql = (spark[1] || spark[2] || spark[3] || spark[4] || '').trim()
    if (sql) return sql
  }

  const sqlFn = text.match(
    /(?:^|[^\w.])sql\s*\(\s*(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')\s*\)/i,
  )
  if (sqlFn) {
    const sql = (sqlFn[1] || sqlFn[2] || '').trim()
    if (sql) return sql
  }

  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*--[^\n]*$/gm, '')
    .replace(/^[ \t]*#[^\n]*$/gm, '')
    .replace(/^[ \t]*\/\/[^\n]*$/gm, '')
    .trim()
  if (/^(with|select)\b/i.test(stripped)) return text.trim()

  return null
}

export function defaultNotebookCellContent(kind: NotebookCellKind): string {
  switch (kind) {
    case 'python':
      return [
        '# Que Python cell — SQL executes via spark.sql / %sql (read-only)',
        '# Example:',
        '# spark.sql("""',
        '# SELECT 1 AS que_ready',
        '# """)',
        '',
        'spark.sql("""',
        'SELECT 1 AS que_ready',
        '""")',
        '',
      ].join('\n')
    case 'scala':
      return [
        '// Que Scala cell — SQL executes via spark.sql (read-only)',
        'spark.sql("""',
        'SELECT 1 AS que_ready',
        '""")',
        '',
      ].join('\n')
    case 'markdown':
      return '## Notes\n\nDescribe this step…\n'
    case 'sql':
    default:
      return '-- New SQL command\nSELECT 1 AS que_ready;\n'
  }
}

export function defaultNotebookCellTitle(kind: NotebookCellKind): string {
  switch (kind) {
    case 'python':
      return 'cell.py'
    case 'scala':
      return 'cell.scala'
    case 'markdown':
      return 'Notes'
    case 'sql':
    default:
      return 'Query'
  }
}
