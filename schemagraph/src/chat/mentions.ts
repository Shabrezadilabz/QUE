import type { ChatReferencedTable } from '@/services/stitchApi'

export type MentionKind = 'table' | 'column' | 'skill'

export interface MentionSuggestion {
  id: string
  kind: MentionKind
  /** Inserted token, e.g. @customers or @customers.email */
  insert: string
  label: string
  detail: string
}

/** Active @ or / token at caret */
export function getTriggerAtCaret(
  value: string,
  caret: number,
): { type: '@' | '/' | null; start: number; query: string } {
  const before = value.slice(0, caret)
  const at = before.lastIndexOf('@')
  const slash = before.lastIndexOf('/')

  // Prefer the nearer trigger that starts a token (whitespace or start before it)
  const candidates: { type: '@' | '/'; start: number }[] = []
  if (at >= 0) {
    const beforeAt = at === 0 ? ' ' : before[at - 1]
    if (/\s/.test(beforeAt) || at === 0) candidates.push({ type: '@', start: at })
  }
  if (slash >= 0) {
    // slash only at beginning of input or after newline for skills
    if (slash === 0 || before[slash - 1] === '\n') {
      candidates.push({ type: '/', start: slash })
    }
  }
  if (candidates.length === 0) return { type: null, start: -1, query: '' }

  candidates.sort((a, b) => b.start - a.start)
  const top = candidates[0]
  const raw = before.slice(top.start + 1)
  // Stop if whitespace in query (token ended)
  if (/\s/.test(raw)) return { type: null, start: -1, query: '' }
  return { type: top.type, start: top.start, query: raw }
}

export function buildAtSuggestions(
  tables: ChatReferencedTable[],
  query: string,
  limit = 12,
): MentionSuggestion[] {
  const q = query.toLowerCase()
  const out: MentionSuggestion[] = []

  for (const t of tables) {
    const tName = t.name.toLowerCase()
    if (!q || tName.includes(q) || tName.startsWith(q)) {
      out.push({
        id: `t:${t.connection}:${t.name}`,
        kind: 'table',
        insert: `@${t.name}`,
        label: t.name,
        detail: `${t.sourceType} · ${t.columns.length} cols`,
      })
    }
    for (const c of t.columns) {
      const full = `${t.name}.${c.name}`.toLowerCase()
      const cName = c.name.toLowerCase()
      if (
        !q ||
        full.includes(q) ||
        cName.includes(q) ||
        `${tName}.${cName}`.startsWith(q)
      ) {
        out.push({
          id: `c:${t.connection}:${t.name}.${c.name}`,
          kind: 'column',
          insert: `@${t.name}.${c.name}`,
          label: `${t.name}.${c.name}`,
          detail: `${c.dataType}${c.keyKind && c.keyKind !== 'none' ? ` · ${c.keyKind}` : ''}`,
        })
      }
    }
  }

  // Prefer exact/prefix table matches first
  out.sort((a, b) => {
    const score = (s: MentionSuggestion) => {
      const l = s.label.toLowerCase()
      if (l === q) return 0
      if (l.startsWith(q)) return 1
      if (s.kind === 'table') return 2
      return 3
    }
    return score(a) - score(b)
  })

  return out.slice(0, limit)
}

export function applySuggestion(
  value: string,
  caret: number,
  start: number,
  insert: string,
): { next: string; caret: number } {
  const after = value.slice(caret)
  // Keep trailing text; add space after insert if needed
  const spacer = after.startsWith(' ') || after.length === 0 ? '' : ' '
  const next = value.slice(0, start) + insert + spacer + after
  const nextCaret = start + insert.length + spacer.length
  return { next, caret: nextCaret }
}

/** Extract @Table and @Table.col tokens from text */
export function extractMentions(text: string): {
  tables: string[]
  columns: { table: string; column: string }[]
} {
  const tables = new Set<string>()
  const columns: { table: string; column: string }[] = []
  const re = /@([A-Za-z_][\w]*)(?:\.([A-Za-z_][\w]*))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m[2]) {
      tables.add(m[1])
      columns.push({ table: m[1], column: m[2] })
    } else {
      tables.add(m[1])
    }
  }
  return { tables: [...tables], columns }
}
