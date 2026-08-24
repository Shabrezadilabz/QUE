/**
 * Chat vs Managed Plane scope — what AI Chat may do vs what needs Plane SSM.
 */
const WRITE_RE =
  /\b(insert|update|delete|drop|alter|truncate|merge|create|grant|revoke|load into)\b/i

const COMPLEX_RE =
  /\b(join|across|compare|versus|vs\.|trend|forecast|cohort|funnel|year over year|yoy|multi.?table|union all|subquer|pivot|window function|rolling average)\b/i

const RUN_DATA_RE =
  /\b(run (this|the )?query|execute|preview|show me (the )?(data|rows|results)|how many rows|row count|count all|total revenue|sum of|average of|top \d+|bottom \d+|query (the )?warehouse|live data|actual (values|numbers))\b/i

const CHAT_OK_RE =
  /\b(describe|explain|list tables|schema|join draft|draft sql|\/sql|suggested|promote|privacy|help|skill|what columns|how do i join)\b/i

/**
 * @param {string} message
 * @param {{ hasSqlDraft?: boolean, mentionedTableCount?: number }} [ctx]
 */
export function classifyChatPlaneScope(message, ctx = {}) {
  const q = String(message || '').trim()
  const lower = q.toLowerCase()

  if (!q) {
    return {
      planeScope: 'in_scope',
      planeScopeHint: null,
    }
  }

  if (WRITE_RE.test(lower)) {
    return {
      planeScope: 'blocked',
      planeScopeHint:
        'AI Chat cannot run writes or DDL. Use Jobs → Materialize with human approval, or Managed Plane for read-only previews first.',
    }
  }

  const wantsLiveData = RUN_DATA_RE.test(lower)
  const isComplex = COMPLEX_RE.test(lower)
  const multiTable = Number(ctx.mentionedTableCount || 0) > 2

  if (wantsLiveData || (isComplex && !CHAT_OK_RE.test(lower)) || multiTable) {
    return {
      planeScope: 'needs_plane',
      planeScopeHint:
        'This needs Managed Plane — AI Chat stays schema-only (metadata + capped samples). Open the plane to run read-only SQL and view results without sending rows to the model.',
    }
  }

  if (isComplex && ctx.hasSqlDraft) {
    return {
      planeScope: 'needs_plane',
      planeScopeHint:
        'Complex analytics — review the SQL draft here, then run preview in Managed Plane. Results stay out of AI Chat context.',
    }
  }

  return {
    planeScope: 'in_scope',
    planeScopeHint: null,
  }
}

/** Attach scope fields to a chat result object. */
export function enrichChatWithPlaneScope(userMessage, result, pack) {
  const mentioned = pack?.tables
    ? pack.tables.filter((t) =>
        String(userMessage || '')
          .toLowerCase()
          .includes(String(t.name || '').toLowerCase()),
      ).length
    : 0
  const { planeScope, planeScopeHint } = classifyChatPlaneScope(userMessage, {
    hasSqlDraft: Boolean(result?.sql),
    mentionedTableCount: mentioned || (result?.referencedTables || []).length,
  })
  return {
    ...result,
    planeScope,
    planeScopeHint,
    chatCapabilities: {
      chatMay: [
        'Explain schema & joins (metadata only)',
        'Draft SQL / job proposals',
        'Use 5–10 scrubbed pinned samples when enabled',
      ],
      chatMayNot: [
        'Run warehouse queries or return live row results',
        'Read managed-plane row payloads',
        'Execute writes / DDL',
      ],
      planeMay: [
        'Run read-only SQL preview (max 20 rows)',
        'NLP → SQL via Plane SSM',
        'Show results to humans only — never to AI',
      ],
    },
  }
}
