#!/usr/bin/env node
/**
 * Stdio MCP bridge → Que API POST /mcp
 *
 * Env:
 *   QUE_API_URL  — e.g. https://que-k31z.onrender.com
 *   QUE_API_KEY  — workspace API key (que_…, scope read)
 *
 * Usage:
 *   npm run mcp
 *   node scripts/que-mcp-server.js
 */
import readline from 'node:readline'

const API_URL = String(process.env.QUE_API_URL || '').replace(/\/$/, '')
const API_KEY = String(process.env.QUE_API_KEY || '').trim()

if (!API_URL || !API_KEY) {
  console.error(
    'que-mcp-server: set QUE_API_URL and QUE_API_KEY (workspace API key que_…)',
  )
  process.exit(1)
}

async function forward(message) {
  const res = await fetch(`${API_URL}/mcp`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(message),
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = {
      jsonrpc: '2.0',
      id: message?.id ?? null,
      error: {
        code: -32000,
        message: `HTTP ${res.status}: ${text.slice(0, 400)}`,
      },
    }
  }
  return body
}

function writeMessage(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

rl.on('line', async (line) => {
  const trimmed = String(line || '').trim()
  if (!trimmed) return
  let message
  try {
    message = JSON.parse(trimmed)
  } catch {
    writeMessage({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    })
    return
  }
  // Notifications have no id — still forward initialize handshake notifications.
  try {
    const result = await forward(message)
    if (message.id !== undefined && message.id !== null) {
      writeMessage(result)
    } else if (result?.error) {
      writeMessage(result)
    }
  } catch (err) {
    if (message.id !== undefined && message.id !== null) {
      writeMessage({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32000, message: String(err.message || err) },
      })
    }
  }
})

rl.on('close', () => process.exit(0))
