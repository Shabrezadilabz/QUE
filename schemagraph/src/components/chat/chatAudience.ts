export type ChatAudienceMode = 'ceo' | 'engineer'

const STORAGE_KEY = 'que-chat-audience'

export function loadChatAudience(): ChatAudienceMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'ceo' || v === 'engineer') return v
  } catch {
    /* ignore */
  }
  return 'ceo'
}

export function saveChatAudience(mode: ChatAudienceMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* ignore */
  }
}

export const CHAT_AUDIENCE_OPTIONS: {
  id: ChatAudienceMode
  label: string
  hint: string
}[] = [
  {
    id: 'ceo',
    label: 'CEO',
    hint: 'Plain-language answers from live data',
  },
  {
    id: 'engineer',
    label: 'Engineer',
    hint: 'SQL, schema, joins, outcome steps',
  },
]
