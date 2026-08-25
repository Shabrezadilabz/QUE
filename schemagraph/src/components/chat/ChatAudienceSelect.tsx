export type ChatAudience = 'ceo' | 'engineer'

const OPTIONS: { id: ChatAudience; label: string }[] = [
  { id: 'ceo', label: 'CEO' },
  { id: 'engineer', label: 'Engineer' },
]

export function ChatAudienceSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: ChatAudience
  onChange: (next: ChatAudience) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <label className="pdf-chat-audience-select">
      <span className="sr-only">Chat audience</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as ChatAudience)}
        className={['pdf-chat-audience-select__control', className]
          .filter(Boolean)
          .join(' ')}
      >
        {OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function loadChatAudience(): ChatAudience {
  try {
    const v = localStorage.getItem('que.chatAudience')
    return v === 'engineer' ? 'engineer' : 'ceo'
  } catch {
    return 'ceo'
  }
}

export function saveChatAudience(audience: ChatAudience) {
  try {
    localStorage.setItem('que.chatAudience', audience)
  } catch {
    /* ignore */
  }
}
