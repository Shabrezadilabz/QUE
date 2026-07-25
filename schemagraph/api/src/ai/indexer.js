/**
 * Reindex schema packs + Que product docs into pgvector.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildSchemaContextPack } from '../schemaContext.js'
import { chunkDocumentText, chunkSchemaPack, htmlToText } from './chunker.js'
import { embedTexts, embeddingMode } from './embeddings.js'
import {
  deleteGlobalDocChunks,
  deleteWorkspaceSchemaChunks,
  getAiChunkStats,
  upsertChunk,
  vectorExtensionReady,
} from './vectorStore.js'
import { resolveProviderKeys } from '../secrets.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** adc/schemagraph/docs — api/src/ai → ../../../docs */
const DOCS_DIR = path.resolve(__dirname, '../../../docs')

const DOC_FILES = [
  {
    docId: 'strategic-90-day',
    title: 'Que Strategic Plan (90-Day)',
    file: 'Que-Strategic-Plan-90-Day.html',
  },
  {
    docId: 'technical-docs',
    title: 'Que Technical Documentation',
    file: 'Que-Technical-Documentation.html',
  },
]

/**
 * Reindex workspace schema metadata into ai_chunks.
 * @param {string} workspaceId
 */
export async function reindexWorkspace(workspaceId) {
  const keys = await resolveProviderKeys(workspaceId)
  const ready = await vectorExtensionReady()
  if (!ready) {
    return {
      ok: false,
      error: 'pgvector not installed — use pgvector/pgvector:pg16 and apply 007_ai_rag.sql',
      embeddingMode: embeddingMode(keys.openai),
    }
  }

  const pack = await buildSchemaContextPack(workspaceId)
  const chunks = chunkSchemaPack(pack)
  await deleteWorkspaceSchemaChunks(workspaceId)

  // Batch embed in groups of 32
  const batchSize = 32
  let upserted = 0
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const vectors = await embedTexts(
      batch.map((c) => c.content),
      keys.openai,
    )
    for (let j = 0; j < batch.length; j++) {
      await upsertChunk(batch[j], vectors[j], workspaceId)
      upserted += 1
    }
  }

  const stats = await getAiChunkStats(workspaceId)
  return {
    ok: true,
    upserted,
    embeddingMode: embeddingMode(keys.openai),
    stats,
  }
}

/** Index Que product docs as global (workspace_id NULL) chunks. */
export async function reindexDocs() {
  const ready = await vectorExtensionReady()
  if (!ready) {
    return {
      ok: false,
      error: 'pgvector not installed',
      embeddingMode: embeddingMode(),
    }
  }

  await deleteGlobalDocChunks()
  const allChunks = []
  for (const doc of DOC_FILES) {
    const full = path.join(DOCS_DIR, doc.file)
    if (!fs.existsSync(full)) {
      console.warn('[Que indexer] missing doc:', full)
      continue
    }
    const raw = fs.readFileSync(full, 'utf8')
    const text = htmlToText(raw)
    allChunks.push(
      ...chunkDocumentText(text, {
        docId: doc.docId,
        title: doc.title,
      }),
    )
  }

  let upserted = 0
  const batchSize = 16
  for (let i = 0; i < allChunks.length; i += batchSize) {
    const batch = allChunks.slice(i, i + batchSize)
    const vectors = await embedTexts(batch.map((c) => c.content))
    for (let j = 0; j < batch.length; j++) {
      await upsertChunk(batch[j], vectors[j], null)
      upserted += 1
    }
  }

  return {
    ok: true,
    upserted,
    embeddingMode: embeddingMode(),
    docsFound: DOC_FILES.filter((d) =>
      fs.existsSync(path.join(DOCS_DIR, d.file)),
    ).map((d) => d.file),
  }
}

/** Full reindex: workspace schema + global docs. */
export async function reindexAll(workspaceId) {
  const schema = await reindexWorkspace(workspaceId)
  const docs = await reindexDocs()
  const stats = schema.ok
    ? await getAiChunkStats(workspaceId)
    : null
  return {
    ok: Boolean(schema.ok && docs.ok),
    schema,
    docs,
    stats,
    embeddingMode: embeddingMode(),
  }
}
