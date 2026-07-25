/**
 * Skill runtime — proven slash-command handlers over schema pack + RAG hints.
 */
import { findTablesMentioned } from '../schemaContext.js'

export const SKILL_IDS = [
  'list',
  'describe',
  'joins',
  'suggested',
  'sql',
  'job',
  'diff',
  'privacy',
  'help',
]

/**
 * Detect leading /skill or natural skill intent.
 * @returns {{ id: string, rest: string } | null}
 */
export function detectSkill(message) {
  const trimmed = String(message || '').trim()
  const m = trimmed.match(/^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/)
  if (m) {
    const id = m[1].toLowerCase()
    if (SKILL_IDS.includes(id)) {
      return { id, rest: (m[2] || '').trim() }
    }
    // aliases
    const aliases = {
      tables: 'list',
      schema: 'list',
      summarize: 'diff',
      summary: 'diff',
      commands: 'help',
      skills: 'help',
    }
    if (aliases[id]) return { id: aliases[id], rest: (m[2] || '').trim() }
  }
  return null
}

/**
 * Run a structured skill using heuristic builders passed in (from chatEngine).
 * @param {object} pack
 * @param {string} skillId
 * @param {object[]} mentioned
 * @param {string} message
 * @param {object} handlers - { listTables, describeTable, ... }
 * @param {object[]} [ragChunks]
 */
export function runSkill(
  pack,
  skillId,
  mentioned,
  message,
  handlers,
  ragChunks = [],
) {
  const ragNote =
    ragChunks.length > 0
      ? `\n\n_Retrieved ${ragChunks.length} vector hit(s) for grounding._`
      : ''

  let result
  switch (skillId) {
    case 'list':
      result = handlers.listTables(pack)
      break
    case 'describe':
      result = mentioned[0]
        ? handlers.describeTable(pack, mentioned[0])
        : {
            reply:
              'Pick a table with `@tablename` or ask `describe customers`.',
            citations: [],
            jobDraft: null,
            referencedTables: [],
            sql: null,
            mode: 'describe-help',
          }
      break
    case 'joins':
      result = handlers.explainJoins(pack, mentioned)
      break
    case 'suggested':
      result = handlers.listSuggested(pack)
      break
    case 'sql':
      result = handlers.draftSql(pack, mentioned, message)
      break
    case 'job':
      result = handlers.draftJob(pack, mentioned, message)
      break
    case 'diff':
      result = handlers.schemaSummary(pack)
      break
    case 'privacy':
      result = handlers.privacyPolicy(pack)
      break
    case 'help':
    default:
      result = handlers.helpSkills(pack)
      break
  }

  return {
    ...result,
    reply: `${result.reply}${ragNote}`,
    mode: `rag-skill:${skillId}`,
    skillId,
  }
}

export function resolveMentioned(pack, message, mentions) {
  const explicit = Array.isArray(mentions?.tables) ? mentions.tables : []
  return findTablesMentioned(pack, message, explicit)
}
