/**
 * Que AI chat “skills” — slash commands that expand into grounded schema prompts.
 */
export interface ChatSkill {
  id: string
  slash: string
  label: string
  description: string
  /** Expand into a full user message. `focus` = @mentioned table names. */
  buildPrompt: (focus: string[]) => string
  /** If true, skill expects at least one table focus */
  needsTable?: boolean
}

export const CHAT_SKILLS: ChatSkill[] = [
  {
    id: 'list',
    slash: '/list',
    label: 'List tables',
    description: 'Inventory every table/collection in this workspace',
    buildPrompt: () => 'list tables',
  },
  {
    id: 'describe',
    slash: '/describe',
    label: 'Describe table',
    description: 'Columns, keys, and types for a focused table',
    needsTable: true,
    buildPrompt: (focus) =>
      focus[0]
        ? `describe ${focus[0]}`
        : 'describe the first important table in this workspace',
  },
  {
    id: 'joins',
    slash: '/joins',
    label: 'Explain joins',
    description: 'How focused tables relate (accepted + suggested)',
    needsTable: true,
    buildPrompt: (focus) =>
      focus.length >= 2
        ? `how do I join ${focus.join(' to ')}?`
        : focus[0]
          ? `show joins for ${focus[0]}`
          : 'show suggested joins',
  },
  {
    id: 'suggested',
    slash: '/suggested',
    label: 'Suggested joins',
    description: 'AI-inferred joins awaiting promote/reject',
    buildPrompt: () => 'show suggested joins',
  },
  {
    id: 'sql',
    slash: '/sql',
    label: 'Draft SQL',
    description: 'Schema-only SELECT/JOIN draft for focused tables',
    needsTable: true,
    buildPrompt: (focus) =>
      focus.length
        ? `SQL join ${focus.join(' and ')}`
        : 'SQL draft for the main stitch tables',
  },
  {
    id: 'job',
    slash: '/job',
    label: 'Draft stitch job',
    description: 'Create a reviewable Que job artifact from focused tables',
    needsTable: true,
    buildPrompt: (focus) =>
      focus.length
        ? `draft a job to stitch ${focus.join(' and ')}`
        : 'draft a job to stitch excel into postgres',
  },
  {
    id: 'diff',
    slash: '/diff',
    label: 'Schema summary',
    description: 'Counts + sources overview for this workspace',
    buildPrompt: () =>
      'summarize this workspace schema: table counts by source, relationship counts, and suggested joins',
  },
  {
    id: 'privacy',
    slash: '/privacy',
    label: 'Schema-only policy',
    description: 'What Que sends to AI (and what it never sees)',
    buildPrompt: () =>
      'explain Que schema-only AI policy: what metadata is used, sample caps, and that raw warehouse rows are never centralized',
  },
  {
    id: 'outcome',
    slash: '/outcome',
    label: 'Outcome plan',
    description: 'CEO-style plan: sources → joins → metrics → Ship to BI',
    buildPrompt: () =>
      '/outcome I want revenue by region from connected sources',
  },
  {
    id: 'agent',
    slash: '/que',
    label: 'Que agent',
    description:
      'Create jobs, tables, BI — auto-runs from chat (CEO or Engineer)',
    buildPrompt: () =>
      '/que Create a job joining orders and customers, then materialize as a table',
  },
  {
    id: 'genie',
    slash: '/genie',
    label: 'Que genie',
    description: 'Same as Que agent — use the floating Genie on any page',
    buildPrompt: () =>
      '/genie Build a bar chart dashboard in blue and green by revenue',
  },
  {
    id: 'bi',
    slash: '/bi',
    label: 'Build Report Studio',
    description: 'Open Metrics + BI studio; scaffold after job / managed certify',
    buildPrompt: () =>
      '/bi Build a semantic BI report from this workspace summary',
  },
  {
    id: 'dashboard',
    slash: '/dashboard',
    label: 'Dashboard draft (RS-2)',
    description: 'Genie creates an editable Report Studio board from your prompt',
    buildPrompt: () =>
      '/genie Create a dashboard draft with revenue KPI, bar chart by region, and a detail table — open in Report Studio',
  },
  {
    id: 'help',
    slash: '/help',
    label: 'Help',
    description: 'Show skills and @ mention tips',
    buildPrompt: () =>
      'help — list available chat skills and how to use @table / @table.column mentions',
  },
]

export function matchSkillSlash(input: string): {
  skill: ChatSkill | null
  query: string
} {
  const m = input.match(/^\/([a-zA-Z0-9_-]*)/)
  if (!m) return { skill: null, query: '' }
  const q = m[1].toLowerCase()
  const skill =
    CHAT_SKILLS.find(
      (s) => s.slash.slice(1) === q || s.id.startsWith(q),
    ) ?? null
  return { skill, query: q }
}

export function filterSkills(query: string): ChatSkill[] {
  const q = query.toLowerCase().replace(/^\//, '')
  if (!q) return CHAT_SKILLS
  return CHAT_SKILLS.filter(
    (s) =>
      s.id.includes(q) ||
      s.slash.includes(q) ||
      s.label.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q),
  )
}

/** Expand leading /skill into a full prompt, preserving trailing free text. */
export function expandSkillInput(input: string, focusTables: string[]): string {
  const trimmed = input.trim()
  const m = trimmed.match(/^\/([a-zA-Z0-9_-]+)(?:\s+(.*))?$/s)
  if (!m) return trimmed
  const skill = CHAT_SKILLS.find(
    (s) => s.id === m[1].toLowerCase() || s.slash === `/${m[1].toLowerCase()}`,
  )
  if (!skill) return trimmed
  const rest = (m[2] || '').trim()
  // Keep /outcome, /agent, /bi as chat intents — do not rewrite user goal text.
  if (skill.id === 'outcome') {
    return rest ? `/outcome ${rest}` : skill.buildPrompt(focusTables)
  }
  if (skill.id === 'agent') {
    return rest ? `/agent ${rest}` : skill.buildPrompt(focusTables)
  }
  if (skill.id === 'bi') {
    return rest ? `/bi ${rest}` : skill.buildPrompt(focusTables)
  }
  const base = skill.buildPrompt(focusTables)
  return rest ? `${base}\n\nAdditional context: ${rest}` : base
}
