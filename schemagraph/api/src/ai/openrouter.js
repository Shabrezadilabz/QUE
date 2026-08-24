/**
 * OpenRouter — OpenAI-compatible chat + embeddings gateway.
 * @see https://openrouter.ai/docs
 */

export const OPENROUTER_API_BASE =
  process.env.OPENROUTER_BASE_URL?.replace(/\/$/, '') ||
  'https://openrouter.ai/api/v1'

export function openRouterHeaders(apiKey) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  const referer =
    process.env.OPENROUTER_HTTP_REFERER ||
    process.env.QUE_PUBLIC_URL ||
    process.env.QUE_PUBLIC_API_URL ||
    null
  const title = process.env.OPENROUTER_APP_NAME || 'Que Data Engine'
  if (referer) headers['HTTP-Referer'] = referer
  if (title) headers['X-Title'] = title
  return headers
}

/**
 * @param {string} apiKey
 * @param {string} modelName OpenRouter model slug (e.g. openai/gpt-4o-mini)
 * @param {string} system
 * @param {string} message
 * @param {{ role: string, content: string }[]} history
 */
export async function callOpenRouterChat(
  apiKey,
  modelName,
  system,
  message,
  history = [],
) {
  const messages = [
    { role: 'system', content: system },
    ...history.slice(-8).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    { role: 'user', content: message },
  ]
  const res = await fetch(`${OPENROUTER_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model: modelName,
      temperature: 0.2,
      messages,
    }),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`openrouter ${res.status} ${errBody.slice(0, 240)}`)
  }
  const body = await res.json()
  return body.choices?.[0]?.message?.content?.trim() || ''
}

/**
 * @param {string} apiKey
 * @param {string} text
 * @param {string} [model]
 */
export async function embedOpenRouter(apiKey, text, model) {
  const res = await fetch(`${OPENROUTER_API_BASE}/embeddings`, {
    method: 'POST',
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model:
        model ||
        process.env.OPENROUTER_EMBED_MODEL ||
        'openai/text-embedding-3-small',
      input: text,
    }),
  })
  if (!res.ok) throw new Error(`openrouter embeddings ${res.status}`)
  const body = await res.json()
  const vec = body.data?.[0]?.embedding
  if (!Array.isArray(vec)) throw new Error('openrouter embedding missing')
  return vec
}

/**
 * @param {string} apiKey
 * @param {string[]} texts
 * @param {string} [model]
 */
export async function embedOpenRouterBatch(apiKey, texts, model) {
  const indexed = texts.map((t, i) => ({ t, i })).filter((x) => x.t)
  if (indexed.length === 0) {
    return texts.map(() => new Array(1536).fill(0))
  }
  const res = await fetch(`${OPENROUTER_API_BASE}/embeddings`, {
    method: 'POST',
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify({
      model:
        model ||
        process.env.OPENROUTER_EMBED_MODEL ||
        'openai/text-embedding-3-small',
      input: indexed.map((x) => x.t),
    }),
  })
  if (!res.ok) throw new Error(`openrouter embeddings batch ${res.status}`)
  const body = await res.json()
  const dim = body.data?.[0]?.embedding?.length || 1536
  const out = texts.map(() => new Array(dim).fill(0))
  for (const row of body.data || []) {
    const src = indexed[row.index]
    if (src && Array.isArray(row.embedding)) out[src.i] = row.embedding
  }
  return out
}
