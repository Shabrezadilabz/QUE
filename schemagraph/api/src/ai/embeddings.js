/**
 * Embeddings for Que RAG.
 * OpenAI or OpenRouter text-embedding-3-small when a key is available (BYOK or env);
 * deterministic local bag-of-tokens → 1536-d otherwise (always searchable).
 */
import {
  embedOpenRouter,
  embedOpenRouterBatch,
} from './openrouter.js'

const DIM = 1536

function normalizeEmbedKeys(openaiKeyOrKeys = null) {
  if (openaiKeyOrKeys && typeof openaiKeyOrKeys === 'object') {
    return {
      openai: openaiKeyOrKeys.openai || process.env.OPENAI_API_KEY || null,
      openrouter:
        openaiKeyOrKeys.openrouter || process.env.OPENROUTER_API_KEY || null,
    }
  }
  return {
    openai: openaiKeyOrKeys || process.env.OPENAI_API_KEY || null,
    openrouter: process.env.OPENROUTER_API_KEY || null,
  }
}

export function embeddingMode(openaiKeyOrKeys = null) {
  const keys = normalizeEmbedKeys(openaiKeyOrKeys)
  if (keys.openai) return 'openai'
  if (keys.openrouter) return 'openrouter'
  return 'local'
}

export function embeddingDimensions() {
  return DIM
}

/**
 * @param {string} text
 * @param {string | { openai?: string|null, openrouter?: string|null } | null} [openaiKeyOrKeys]
 * @returns {Promise<number[]>}
 */
export async function embedText(text, openaiKeyOrKeys = null) {
  const cleaned = String(text || '').trim().slice(0, 8000)
  if (!cleaned) return zeroVec()

  const keys = normalizeEmbedKeys(openaiKeyOrKeys)
  if (keys.openai) {
    try {
      return await embedOpenAI(keys.openai, cleaned)
    } catch (err) {
      console.warn('[Que embed] OpenAI failed, trying fallback:', err.message || err)
    }
  }
  if (keys.openrouter) {
    try {
      const vec = await embedOpenRouter(keys.openrouter, cleaned)
      if (Array.isArray(vec) && vec.length === DIM) return vec
      if (Array.isArray(vec)) return padOrTrim(vec, DIM)
    } catch (err) {
      console.warn('[Que embed] OpenRouter failed, using local:', err.message || err)
    }
  }
  return embedLocal(cleaned)
}

/**
 * @param {string[]} texts
 * @param {string | { openai?: string|null, openrouter?: string|null } | null} [openaiKeyOrKeys]
 * @returns {Promise<number[][]>}
 */
export async function embedTexts(texts, openaiKeyOrKeys = null) {
  const keys = normalizeEmbedKeys(openaiKeyOrKeys)
  const list = texts.map((t) => String(t || '').trim().slice(0, 8000))
  if (keys.openai && list.some(Boolean)) {
    try {
      return await embedOpenAIBatch(keys.openai, list)
    } catch (err) {
      console.warn('[Que embed] batch OpenAI failed, trying fallback:', err.message || err)
    }
  }
  if (keys.openrouter && list.some(Boolean)) {
    try {
      const vectors = await embedOpenRouterBatch(keys.openrouter, list)
      return vectors.map((vec) =>
        Array.isArray(vec) && vec.length === DIM ? vec : padOrTrim(vec, DIM),
      )
    } catch (err) {
      console.warn('[Que embed] batch OpenRouter failed, using local:', err.message || err)
    }
  }
  return list.map((t) => (t ? embedLocal(t) : zeroVec()))
}

async function embedOpenAI(apiKey, text) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
      input: text,
    }),
  })
  if (!res.ok) throw new Error(`openai embeddings ${res.status}`)
  const body = await res.json()
  const vec = body.data?.[0]?.embedding
  if (!Array.isArray(vec) || vec.length !== DIM) {
    throw new Error(`unexpected embedding dim ${vec?.length}`)
  }
  return vec
}

async function embedOpenAIBatch(apiKey, texts) {
  const indexed = texts.map((t, i) => ({ t, i })).filter((x) => x.t)
  if (indexed.length === 0) return texts.map(() => zeroVec())

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
      input: indexed.map((x) => x.t),
    }),
  })
  if (!res.ok) throw new Error(`openai embeddings batch ${res.status}`)
  const body = await res.json()
  const out = texts.map(() => zeroVec())
  for (const row of body.data || []) {
    const src = indexed[row.index]
    if (src && Array.isArray(row.embedding)) out[src.i] = row.embedding
  }
  return out
}

function padOrTrim(vec, dim) {
  if (!Array.isArray(vec)) return zeroVec()
  if (vec.length === dim) return vec
  if (vec.length > dim) return vec.slice(0, dim)
  return [...vec, ...new Array(dim - vec.length).fill(0)]
}

/** Deterministic hashed bag-of-tokens → unit L2 vector (1536-d). */
export function embedLocal(text) {
  const vec = new Float64Array(DIM)
  const tokens = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9_@.]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) return zeroVec()

  for (const tok of tokens) {
    const h1 = hash32(tok)
    const h2 = hash32(tok + '#')
    const i1 = h1 % DIM
    const i2 = h2 % DIM
    vec[i1] += 1
    vec[i2] += 0.5
    if (tok.length > 3) {
      for (let i = 0; i < tok.length - 2; i++) {
        const g = tok.slice(i, i + 3)
        vec[hash32(g) % DIM] += 0.25
      }
    }
  }

  let norm = 0
  for (let i = 0; i < DIM; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm) || 1
  const out = new Array(DIM)
  for (let i = 0; i < DIM; i++) out[i] = vec[i] / norm
  return out
}

function hash32(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function zeroVec() {
  return new Array(DIM).fill(0)
}

/** Format for pgvector literal */
export function toPgVector(vec) {
  return `[${vec.join(',')}]`
}
