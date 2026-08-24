/** Client-side PII masking for human grids (defense in depth — API also scrubs). */

const PII_COL =
  /\b(email|e_mail|mail|phone|mobile|ssn|social|password|passwd|secret|token|api_key|credit|card|cvv|address|street|zip|postal|dob|birth|salary|iban|account_num)\b/i

function scrubValue(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  if (!s) return ''
  if (/^(true|false|yes|no|null|n\/a)$/i.test(s)) return s.toLowerCase()
  if (/^\d{1,4}$/.test(s)) return s
  const digest = hashish(s)
  if (s.includes('@')) return `email_${digest}`
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  ) {
    return `uuid_${digest}`
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) return `num_${digest}`
  return `tok_${digest}`
}

function hashish(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 12)
}

export function columnLooksSensitive(colName: string): boolean {
  return PII_COL.test(colName)
}

export function formatGridCell(
  col: string,
  value: unknown,
  opts?: { forceMask?: boolean },
): string {
  if (value == null) return 'NULL'
  if (opts?.forceMask || columnLooksSensitive(col)) {
    return scrubValue(value)
  }
  return String(value)
}

export function maskGridRows(
  rows: Record<string, unknown>[],
  columns: string[],
): Record<string, unknown>[] {
  const sensitive = new Set(columns.filter(columnLooksSensitive))
  if (!sensitive.size) return rows
  return rows.map((row) => {
    const out = { ...row }
    for (const col of sensitive) {
      if (out[col] != null) out[col] = scrubValue(out[col])
    }
    return out
  })
}
