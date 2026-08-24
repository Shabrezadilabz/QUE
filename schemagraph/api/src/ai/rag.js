/**
 * RAG retrieve + assemble grounded context for Que chat.
 */
import { embedText } from './embeddings.js'
import { searchChunks } from './vectorStore.js'
import { getBoostedSourceRefs } from './feedback.js'

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

  return hits.slice(0, topK)
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
