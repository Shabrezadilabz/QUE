/**
 * pgvector store for Que RAG chunks.
 */
import { query } from '../db.js'
import { toPgVector } from './embeddings.js'

/**
 * @param {object} chunk
 * @param {number[]} embedding
 * @param {string|null} workspaceId
 */
export async function upsertChunk(chunk, embedding, workspaceId) {
  const vec = toPgVector(embedding)
  await query(
    `INSERT INTO ai_chunks (
       workspace_id, source_kind, source_ref, title, content, embedding, metadata_json, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb, now())
     ON CONFLICT (workspace_id, source_ref) DO UPDATE SET
       source_kind = EXCLUDED.source_kind,
       title = EXCLUDED.title,
       content = EXCLUDED.content,
       embedding = EXCLUDED.embedding,
       metadata_json = EXCLUDED.metadata_json,
       updated_at = now()`,
    [
      workspaceId,
      chunk.sourceKind,
      chunk.sourceRef,
      chunk.title,
      chunk.content,
      vec,
      JSON.stringify(chunk.metadata || {}),
    ],
  )
}

export async function upsertChunks(chunksWithEmbeddings, workspaceId) {
  for (const { chunk, embedding } of chunksWithEmbeddings) {
    await upsertChunk(chunk, embedding, workspaceId)
  }
}

/** Delete workspace schema chunks (keep global docs). */
export async function deleteWorkspaceSchemaChunks(workspaceId) {
  await query(
    `DELETE FROM ai_chunks
     WHERE workspace_id = $1
       AND source_kind IN ('schema_table', 'schema_column', 'relationship')`,
    [workspaceId],
  )
}

export async function deleteGlobalDocChunks() {
  await query(
    `DELETE FROM ai_chunks WHERE workspace_id IS NULL AND source_kind = 'doc'`,
  )
}

/**
 * Cosine similarity search.
 * @param {string|null} workspaceId
 * @param {number[]} queryEmbedding
 * @param {{ topK?: number, includeDocs?: boolean, kinds?: string[] }} [opts]
 */
export async function searchChunks(workspaceId, queryEmbedding, opts = {}) {
  const topK = Math.min(Math.max(opts.topK ?? 8, 1), 32)
  const includeDocs = opts.includeDocs !== false
  const vec = toPgVector(queryEmbedding)

  const { rows } = await query(
    `SELECT
       id, workspace_id, source_kind, source_ref, title, content, metadata_json,
       1 - (embedding <=> $1::vector) AS score
     FROM ai_chunks
     WHERE (
       workspace_id = $2
       OR ($3::boolean AND workspace_id IS NULL AND source_kind = 'doc')
     )
     ORDER BY embedding <=> $1::vector
     LIMIT $4`,
    [vec, workspaceId, includeDocs, topK],
  )

  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    sourceKind: r.source_kind,
    sourceRef: r.source_ref,
    title: r.title,
    content: r.content,
    metadata: r.metadata_json || {},
    score: Number(r.score) || 0,
  }))
}

export async function getAiChunkStats(workspaceId) {
  const { rows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE workspace_id = $1)::int AS workspace_chunks,
       COUNT(*) FILTER (WHERE workspace_id IS NULL AND source_kind = 'doc')::int AS doc_chunks,
       COUNT(*) FILTER (WHERE workspace_id = $1 AND source_kind = 'schema_table')::int AS table_chunks,
       COUNT(*) FILTER (WHERE workspace_id = $1 AND source_kind = 'relationship')::int AS rel_chunks,
       MAX(updated_at) FILTER (WHERE workspace_id = $1 OR workspace_id IS NULL) AS last_indexed_at
     FROM ai_chunks`,
    [workspaceId],
  )
  const r = rows[0] || {}
  return {
    workspaceChunks: r.workspace_chunks || 0,
    docChunks: r.doc_chunks || 0,
    tableChunks: r.table_chunks || 0,
    relationshipChunks: r.rel_chunks || 0,
    lastIndexedAt: r.last_indexed_at || null,
  }
}

export async function vectorExtensionReady() {
  try {
    const { rows } = await query(
      `SELECT extname FROM pg_extension WHERE extname = 'vector'`,
    )
    return rows.length > 0
  } catch {
    return false
  }
}
