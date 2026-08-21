import type { ReactNode } from 'react'

/** VS Code Dark+ inspired SQL token colors */
const SQL_COLORS = {
  keyword: '#569cd6',
  function: '#dcdcaa',
  identifier: '#9cdcfe',
  number: '#b5cea8',
  operator: '#d4d4d4',
  string: '#ce9178',
  punctuation: '#808080',
  default: '#d4d4d4',
} as const

const KEYWORDS = new Set([
  'SELECT',
  'FROM',
  'WHERE',
  'DISTINCT',
  'AS',
  'AND',
  'OR',
  'NOT',
  'NULL',
  'IN',
  'ON',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'GROUP',
  'BY',
  'ORDER',
  'HAVING',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'WITH',
  'UNION',
  'ALL',
  'LIMIT',
  'OFFSET',
  'OVER',
  'PARTITION',
  'BETWEEN',
  'LIKE',
  'IS',
  'TRUE',
  'FALSE',
])

const FUNCTIONS = new Set([
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'CAST',
  'COALESCE',
  'NULLIF',
  'ROUND',
  'FLOOR',
  'CEIL',
  'ABS',
  'UPPER',
  'LOWER',
  'TRIM',
  'DATE',
  'DATE_TRUNC',
  'ROW_NUMBER',
  'RANK',
  'DENSE_RANK',
  'LAG',
  'LEAD',
])

function classifyWord(word: string): keyof typeof SQL_COLORS {
  const upper = word.toUpperCase()
  if (FUNCTIONS.has(upper)) return 'function'
  if (KEYWORDS.has(upper)) return 'keyword'
  if (/^\d+(\.\d+)?$/.test(word)) return 'number'
  return 'identifier'
}

/**
 * Lightweight SQL syntax highlight — VS Code–style token colors, no deps.
 */
export function SqlHighlight({ code }: { code: string }) {
  const parts: ReactNode[] = []
  const re =
    /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\b[A-Za-z_][\w]*\b|\d+(?:\.\d+)?|[()+*/,\-=<>:]|[^\s\w'"]+)/g

  let match: RegExpExecArray | null
  let key = 0
  let lastIndex = 0

  while ((match = re.exec(code)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++} style={{ color: SQL_COLORS.default }}>
          {code.slice(lastIndex, match.index)}
        </span>,
      )
    }

    const token = match[0]
    let color: string = SQL_COLORS.default

    if (token.startsWith("'") || token.startsWith('"')) {
      color = SQL_COLORS.string
    } else if (/^[A-Za-z_][\w]*$/.test(token)) {
      color = SQL_COLORS[classifyWord(token)]
    } else if (/^\d/.test(token)) {
      color = SQL_COLORS.number
    } else if (/^[()+*,]$/.test(token)) {
      color = SQL_COLORS.punctuation
    } else if (/^[*/+\-=<>/]$/.test(token)) {
      color = SQL_COLORS.operator
    }

    parts.push(
      <span key={key++} style={{ color }}>
        {token}
      </span>,
    )
    lastIndex = re.lastIndex
  }

  if (lastIndex < code.length) {
    parts.push(
      <span key={key++} style={{ color: SQL_COLORS.default }}>
        {code.slice(lastIndex)}
      </span>,
    )
  }

  return (
    <code className="block whitespace-pre-wrap break-words font-mono text-[13px] leading-[1.45]">
      {parts}
    </code>
  )
}
