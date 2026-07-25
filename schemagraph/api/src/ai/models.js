/**
 * Model registry + resolver for Que AI (OpenAI + Anthropic).
 * Keys resolve from workspace BYOK → process env.
 */
import { resolveProviderKeys } from '../secrets.js'

export const AI_MODELS = [
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    label: 'GPT-4o mini',
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    model: 'gpt-4o',
    label: 'GPT-4o',
  },
  {
    id: 'claude-3-5-haiku-latest',
    provider: 'anthropic',
    model: 'claude-3-5-haiku-latest',
    label: 'Claude 3.5 Haiku',
  },
  {
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    label: 'Claude Sonnet',
  },
]

/**
 * @param {{ openai?: string|null, anthropic?: string|null } | null} [keys]
 */
export function listAvailableModels(keys = null) {
  const openai = keys
    ? Boolean(keys.openai)
    : Boolean(process.env.OPENAI_API_KEY)
  const anthropic = keys
    ? Boolean(keys.anthropic)
    : Boolean(process.env.ANTHROPIC_API_KEY)
  return AI_MODELS.filter((m) => {
    if (m.provider === 'openai') return openai
    if (m.provider === 'anthropic') return anthropic
    return false
  }).map((m) => ({ ...m, configured: true }))
}

/**
 * @param {{ aiModelId?: string } | null} settings
 * @param {string | null | undefined} requestModelId
 * @param {{ openai?: string|null, anthropic?: string|null } | null} [keys]
 */
export function resolveModel(settings, requestModelId, keys = null) {
  const available = listAvailableModels(keys)
  const wanted =
    requestModelId ||
    settings?.aiModelId ||
    process.env.QUE_AI_MODEL ||
    (keys?.openai || process.env.OPENAI_API_KEY
      ? 'gpt-4o-mini'
      : 'claude-3-5-haiku-latest')

  const hit = available.find((m) => m.id === wanted)
  if (hit) return hit
  if (available.length) return available[0]
  return null
}

/**
 * @param {{ provider: string, model: string }} model
 * @param {string} system
 * @param {string} message
 * @param {{ role: string, content: string }[]} history
 * @param {{ openai?: string|null, anthropic?: string|null } | null} [keys]
 */
export async function callChatModel(
  model,
  system,
  message,
  history = [],
  keys = null,
) {
  if (model.provider === 'anthropic') {
    const key = keys?.anthropic || process.env.ANTHROPIC_API_KEY
    if (!key) throw new Error('Anthropic API key missing (Settings → BYOK or ANTHROPIC_API_KEY)')
    return callAnthropic(key, model.model, system, message, history)
  }
  const key = keys?.openai || process.env.OPENAI_API_KEY
  if (!key) throw new Error('OpenAI API key missing (Settings → BYOK or OPENAI_API_KEY)')
  return callOpenAI(key, model.model, system, message, history)
}

/** Convenience: resolve keys for workspace then list models */
export async function listModelsForWorkspace(workspaceId) {
  const keys = await resolveProviderKeys(workspaceId)
  return {
    models: listAvailableModels(keys),
    keys: {
      openaiSource: keys.openaiSource,
      anthropicSource: keys.anthropicSource,
    },
  }
}

async function callOpenAI(apiKey, modelName, system, message, history) {
  const messages = [
    { role: 'system', content: system },
    ...history.slice(-8).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    { role: 'user', content: message },
  ]
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      temperature: 0.2,
      messages,
    }),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`openai ${res.status} ${errBody.slice(0, 200)}`)
  }
  const body = await res.json()
  return body.choices?.[0]?.message?.content?.trim() || ''
}

async function callAnthropic(apiKey, modelName, system, message, history) {
  const messages = [
    ...history.slice(-8).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
    { role: 'user', content: message },
  ]
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 1600,
      system,
      messages,
    }),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`anthropic ${res.status} ${errBody.slice(0, 200)}`)
  }
  const body = await res.json()
  return (
    body.content?.map((c) => c.text).filter(Boolean).join('\n').trim() || ''
  )
}
