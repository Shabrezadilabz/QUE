/**
 * RAG retrieve + assemble grounded context for Que chat.
 * Hybrid: dense vector search + graph-aware reranking (relationship / metric boosts).
 */
import { embedText } from './embeddings.js'
import { searchChunks } from './vectorStore.js'
import { getBoostedSourceRefs } from './feedback.js'

const METRIC_BOOST_RE =
  /\b(revenue|sales|total|profit|margin|orders?|customers?|sum|count|avg|kpi|metric)\b/i
const JOIN_BOOST_RE =
  /\b(join|relate|relationship|link|across|between|via|brand|customer|product)\b/i

/**
 * Rerank vector hits — boost relationship + table chunks when query implies joins/metrics.
 * @param {object[]} hits
 * @param {string} queryText
 */
export function rerankRagHitsForGraph(hits, queryText) {
  const q = String(queryText || '')
  const wantMetric = METRIC_BOOST_RE.test(q)
  const wantJoin = JOIN_BOOST_RE.test(q)
  if (!wantMetric && !wantJoin) return hits

  return [...hits]
    .map((h) => {
      let boost = 0
      if (h.sourceKind === 'relationship' && (wantJoin || wantMetric)) boost += 0.12
      if (h.sourceKind === 'schema_table' && wantMetric) boost += 0.04
      if (h.sourceKind === 'schema_column' && wantJoin) boost += 0.03
      if (wantMetric && /revenue|sales|amount|total|price|cost/i.test(h.content || '')) {
        boost += 0.06
      }
      return { ...h, score: h.score + boost }
    })
    .sort((a, b) => b.score - a.score)
}

/**
 * @param {string} workspaceId
 * @param {string} queryText
 * @param {{ topK?: number, includeDocs?: boolean }} [opts]
 */
export async function retrieveForQuery(workspaceId, queryText, opts = {}) {
  const topK = opts.topK ?? 8
  const includeDocs = opts.includeDocs !== false
  const queryVec = await embedText(
    queryText,
    opts.embedKeys || { openai: opts.openaiKey || null },
  )
  let hits = await searchChunks(workspaceId, queryVec, {
    topK: topK + 4,
    includeDocs,
  })

  // Soft boost positively rated source_refs
  try {
    const boosts = await getBoostedSourceRefs(workspaceId)
    if (boosts.size) {
      hits = hits
        .map((h) => ({
          ...h,
          score: h.score + (boosts.get(h.sourceRef) || 0) * 0.05,
        }))
        .sort((a, b) => b.score - a.score)
    }
  } catch {
    /* feedback table may be missing during migrate */
  }

  hits = rerankRagHitsForGraph(hits, queryText)
  return hits.slice(0, topK)
}

/**
 * Vector retrieve + graph-aware rerank (alias for retrieveForQuery).
 * @param {string} workspaceId
 * @param {string} queryText
 * @param {object} [opts]
 */
export async function retrieveForQueryHybrid(workspaceId, queryText, opts = {}) {
  return retrieveForQuery(workspaceId, queryText, opts)
}

/**
 * Build a compact RAG context block + citation labels.
 * @param {Awaited<ReturnType<typeof retrieveForQuery>>} chunks
 */
export function formatRagContext(chunks) {
  if (!chunks?.length) {
    return { block: '(no retrieved chunks)', citations: [] }
  }
  const lines = ['## Retrieved context (schema-only / product docs)']
  const citations = []
  for (const c of chunks) {
    lines.push(`### [${c.sourceKind}] ${c.title} (score=${c.score.toFixed(3)})`)
    lines.push(c.content.slice(0, 1200))
    lines.push('')
    citations.push(c.title || c.sourceRef)
  }
  return { block: lines.join('\n'), citations }
}

export function retrievedChunkSummary(chunks) {
  return (chunks || []).map((c) => ({
    sourceKind: c.sourceKind,
    sourceRef: c.sourceRef,
    title: c.title,
    score: c.score,
  }))
}
