/**
 * Workspace BYOK secrets — encrypt at rest, never echo plaintext to the client.
 *
 * Set QUE_SECRETS_KEY in api/.env (32+ char random). If unset, falls back to a
 * derived demo key (OK for local showcase; required for production).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { query } from './db.js'
import { isProduction } from './env.js'

const SECRET_KEYS = [
  'openai_api_key',
  'anthropic_api_key',
  'github_token',
]

function masterKeyBytes() {
  const raw = String(
    process.env.QUE_SECRETS_KEY || process.env.STITCH_SECRETS_KEY || '',
  ).trim()
  if (!raw) {
    if (isProduction()) {
      const err = new Error(
        'QUE_SECRETS_KEY is required in production (32+ char random)',
      )
      err.status = 500
      err.code = 'SECRETS_KEY_MISSING'
      throw err
    }
    console.warn(
      '[Que secrets] QUE_SECRETS_KEY unset — using insecure local-dev fallback. Do not deploy like this.',
    )
    return createHash('sha256')
      .update('que-local-dev-secrets-key-change-me')
      .digest()
  }
  if (raw === 'que-local-dev-secrets-key-change-me' && isProduction()) {
    const err = new Error('Refuse default QUE_SECRETS_KEY in production')
    err.status = 500
    throw err
  }
  return createHash('sha256').update(String(raw)).digest()
}

export function encryptBlob(plaintext) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', masterKeyBytes(), iv)
  const enc = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

export function decryptBlob(blob) {
  const parts = String(blob || '').split(':')
  if (parts[0] !== 'v1' || parts.length !== 4) {
    throw new Error('invalid secret blob')
  }
  const iv = Buffer.from(parts[1], 'base64')
  const tag = Buffer.from(parts[2], 'base64')
  const data = Buffer.from(parts[3], 'base64')
  const decipher = createDecipheriv('aes-256-gcm', masterKeyBytes(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

function encrypt(plaintext) {
  return encryptBlob(plaintext)
}

function decrypt(blob) {
  return decryptBlob(blob)
}

export function maskSecret(value) {
  const s = String(value || '')
  if (s.length < 8) return s ? '••••••••' : null
  return `${s.slice(0, 3)}…${s.slice(-4)}`
}

/**
 * @param {string} workspaceId
 * @param {string} secretKey
 * @returns {Promise<string|null>}
 */
export async function getSecret(workspaceId, secretKey) {
  const { rows } = await query(
    `SELECT ciphertext FROM workspace_secrets
     WHERE workspace_id = $1 AND secret_key = $2`,
    [workspaceId, secretKey],
  )
  if (!rows.length) return null
  try {
    return decrypt(rows[0].ciphertext)
  } catch (err) {
    console.warn('[Que secrets] decrypt failed:', err.message || err)
    return null
  }
}

export async function setSecret(workspaceId, secretKey, plaintext) {
  if (!SECRET_KEYS.includes(secretKey)) {
    const err = new Error(`unknown secret key: ${secretKey}`)
    err.status = 400
    throw err
  }
  const value = String(plaintext || '').trim()
  if (!value) {
    await query(
      `DELETE FROM workspace_secrets WHERE workspace_id = $1 AND secret_key = $2`,
      [workspaceId, secretKey],
    )
    return { configured: false, hint: null }
  }
  const hint = maskSecret(value)
  await query(
    `INSERT INTO workspace_secrets (workspace_id, secret_key, ciphertext, hint, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (workspace_id, secret_key) DO UPDATE SET
       ciphertext = EXCLUDED.ciphertext,
       hint = EXCLUDED.hint,
       updated_at = now()`,
    [workspaceId, secretKey, encrypt(value), hint],
  )
  return { configured: true, hint }
}

export async function clearSecret(workspaceId, secretKey) {
  return setSecret(workspaceId, secretKey, '')
}

/** Public status for settings UI (no plaintext). */
export async function getSecretsStatus(workspaceId) {
  const { rows } = await query(
    `SELECT secret_key, hint, updated_at FROM workspace_secrets
     WHERE workspace_id = $1`,
    [workspaceId],
  )
  const map = Object.fromEntries(rows.map((r) => [r.secret_key, r]))
  const openaiWorkspace = Boolean(map.openai_api_key)
  const anthropicWorkspace = Boolean(map.anthropic_api_key)
  const githubWorkspace = Boolean(map.github_token)
  const openaiEnv = Boolean(process.env.OPENAI_API_KEY)
  const anthropicEnv = Boolean(process.env.ANTHROPIC_API_KEY)
  const githubEnv = Boolean(process.env.GITHUB_TOKEN)

  return {
    openai: {
      configured: openaiWorkspace || openaiEnv,
      source: openaiWorkspace ? 'workspace' : openaiEnv ? 'env' : 'none',
      hint: map.openai_api_key?.hint || (openaiEnv ? 'env:OPENAI_API_KEY' : null),
    },
    anthropic: {
      configured: anthropicWorkspace || anthropicEnv,
      source: anthropicWorkspace ? 'workspace' : anthropicEnv ? 'env' : 'none',
      hint: map.anthropic_api_key?.hint || (anthropicEnv ? 'env:ANTHROPIC_API_KEY' : null),
    },
    github: {
      configured: githubWorkspace || githubEnv,
      source: githubWorkspace ? 'workspace' : githubEnv ? 'env' : 'none',
      hint: map.github_token?.hint || (githubEnv ? 'env:GITHUB_TOKEN' : null),
    },
    byok: true,
    secretsKeyConfigured: Boolean(
      String(process.env.QUE_SECRETS_KEY || process.env.STITCH_SECRETS_KEY || '').trim(),
    ),
    note:
      'Keys are encrypted at rest. Workspace github_token preferred over env GITHUB_TOKEN. Que still proxies LLM calls server-side (schema-only prompts).',
  }
}

/**
 * Resolve GitHub token: workspace BYOK wins, else process env.
 */
export async function resolveGithubToken(workspaceId) {
  if (workspaceId) {
    try {
      const ws = await getSecret(workspaceId, 'github_token')
      if (ws) return { token: ws, source: 'workspace' }
    } catch (err) {
      console.warn('[Que secrets] github resolve failed:', err.message || err)
    }
  }
  const env = process.env.GITHUB_TOKEN || null
  return { token: env, source: env ? 'env' : 'none' }
}

/**
 * Resolve provider keys for a workspace: workspace BYOK wins, else process env.
 * @param {string} [workspaceId]
 */
export async function resolveProviderKeys(workspaceId) {
  let openai = process.env.OPENAI_API_KEY || null
  let anthropic = process.env.ANTHROPIC_API_KEY || null
  let openaiSource = openai ? 'env' : 'none'
  let anthropicSource = anthropic ? 'env' : 'none'

  if (workspaceId) {
    try {
      const wsOpenai = await getSecret(workspaceId, 'openai_api_key')
      const wsAnthropic = await getSecret(workspaceId, 'anthropic_api_key')
      if (wsOpenai) {
        openai = wsOpenai
        openaiSource = 'workspace'
      }
      if (wsAnthropic) {
        anthropic = wsAnthropic
        anthropicSource = 'workspace'
      }
    } catch (err) {
      console.warn('[Que secrets] resolve failed:', err.message || err)
    }
  }

  return { openai, anthropic, openaiSource, anthropicSource }
}
