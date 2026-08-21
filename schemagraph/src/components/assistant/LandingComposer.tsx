import type { Dispatch, DragEvent, RefObject, SetStateAction } from 'react'
import { LandingSparkleIcon } from '@/components/assistant/AssistantLandingLayout'
import type { ChatSkill } from '@/chat/skills'
import type { MentionSuggestion } from '@/chat/mentions'
import { extractMentions } from '@/chat/mentions'

type Suggestion =
  | { kind: 'mention'; item: MentionSuggestion }
  | { kind: 'skill'; item: ChatSkill }

export function LandingComposer({
  canWrite,
  busy,
  input,
  setInput,
  composerDragOver,
  attachments,
  setAttachments,
  suggestOpen,
  suggestions,
  suggestIndex,
  setSuggestIndex,
  pickMention,
  pickSkill,
  onComposerDragOver,
  onComposerDragLeave,
  onComposerDrop,
  syncTriggerFromCaret,
  setSuggestOpen,
  setTrigger,
  setActiveMentions,
  ask,
  fileInputRef,
  onPickAttachments,
  textareaRef,
}: {
  canWrite: boolean
  busy: boolean
  input: string
  setInput: (v: string) => void
  composerDragOver: boolean
  attachments: { id: string; name: string; text: string }[]
  setAttachments: Dispatch<
    SetStateAction<{ id: string; name: string; text: string }[]>
  >
  suggestOpen: boolean
  suggestions: Suggestion[]
  suggestIndex: number
  setSuggestIndex: Dispatch<SetStateAction<number>>
  pickMention: (item: MentionSuggestion) => void
  pickSkill: (item: ChatSkill) => void
  onComposerDragOver: (e: DragEvent) => void
  onComposerDragLeave: (e: DragEvent) => void
  onComposerDrop: (e: DragEvent) => void
  syncTriggerFromCaret: (value: string, caret: number) => void
  setSuggestOpen: (open: boolean) => void
  setTrigger: Dispatch<
    SetStateAction<{ type: '@' | '/' | null; start: number; query: string }>
  >
  setActiveMentions: Dispatch<SetStateAction<string[]>>
  ask: (text: string) => void | Promise<void>
  fileInputRef: RefObject<HTMLInputElement | null>
  onPickAttachments: (files: FileList | null) => void | Promise<void>
  textareaRef: RefObject<HTMLTextAreaElement | null>
}) {
  return (
    <div className="relative">
      {suggestOpen && suggestions.length > 0 ? (
        <div className="absolute bottom-full left-0 right-0 z-20 mb-[8px] max-h-56 overflow-y-auto rounded-[8px] border border-solid border-[#424850] bg-[#15191e]">
          {suggestions.map((s, i) => {
            const active = i === suggestIndex
            if (s.kind === 'mention') {
              return (
                <button
                  key={s.item.id}
                  type="button"
                  className={`flex w-full items-center justify-between px-[14px] py-[10px] text-left text-[12px] ${
                    active
                      ? 'bg-[#252a30] text-[#d4dbe3]'
                      : 'text-[#c8cdd3] hover:bg-[#1e2328]'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pickMention(s.item)
                  }}
                >
                  <span>{s.item.label}</span>
                  <span className="text-[10px] text-[#8a9099]">{s.item.detail}</span>
                </button>
              )
            }
            return (
              <button
                key={s.item.id}
                type="button"
                className={`flex w-full items-center justify-between px-[14px] py-[10px] text-left text-[12px] ${
                  active
                    ? 'bg-[#252a30] text-[#d4dbe3]'
                    : 'text-[#c8cdd3] hover:bg-[#1e2328]'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pickSkill(s.item)
                }}
              >
                <span>
                  <span className="text-[#7aecd0]">{s.item.slash}</span> {s.item.label}
                </span>
                <span className="max-w-[50%] truncate text-[10px] text-[#8a9099]">
                  {s.item.description}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      <div
        className={[
          'overflow-hidden rounded-[16px] border border-solid bg-[#0f1215]',
          composerDragOver
            ? 'border-[#7aecd0]/45 border-dashed bg-[rgba(122,236,208,0.04)]'
            : 'border-[#424850]',
        ].join(' ')}
        onDragOver={onComposerDragOver}
        onDragLeave={onComposerDragLeave}
        onDrop={onComposerDrop}
      >
        {composerDragOver ? (
          <p className="pointer-events-none px-[20px] pt-[12px] text-center text-[10px] font-semibold tracking-wide text-[#7aecd0]">
            Drop to mention @table or @table.column
          </p>
        ) : null}

        <div className="flex items-start gap-[12px] px-[20px] pb-[12px] pt-[20px]">
          <LandingSparkleIcon />
          <div className="min-w-0 flex-1">
            {attachments.length > 0 ? (
              <div className="mb-[8px] flex flex-wrap gap-[6px]">
                {attachments.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex max-w-full items-center gap-[4px] rounded-full border border-solid border-[#424850] bg-[#15191e] px-[10px] py-[4px] text-[11px] text-[#d4dbe3]"
                  >
                    <span className="truncate" title={a.name}>
                      {a.name}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${a.name}`}
                      onClick={() =>
                        setAttachments((prev) => prev.filter((x) => x.id !== a.id))
                      }
                      className="text-[#8a9099] hover:text-[#ff6b6b]"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                const v = e.target.value
                setInput(v)
                setActiveMentions(extractMentions(v).tables)
                syncTriggerFromCaret(v, e.target.selectionStart ?? v.length)
              }}
              onDragOver={onComposerDragOver}
              onDrop={onComposerDrop}
              onClick={(e) => {
                const t = e.currentTarget
                syncTriggerFromCaret(t.value, t.selectionStart ?? 0)
              }}
              onKeyUp={(e) => {
                const t = e.currentTarget
                syncTriggerFromCaret(t.value, t.selectionStart ?? 0)
              }}
              onKeyDown={(e) => {
                if (suggestOpen && suggestions.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSuggestIndex((i) => (i + 1) % suggestions.length)
                    return
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSuggestIndex(
                      (i) => (i - 1 + suggestions.length) % suggestions.length,
                    )
                    return
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setSuggestOpen(false)
                    setTrigger({ type: null, start: -1, query: '' })
                    return
                  }
                  if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                    const picked = suggestions[suggestIndex]
                    if (picked) {
                      e.preventDefault()
                      if (picked.kind === 'mention') pickMention(picked.item)
                      else pickSkill(picked.item)
                      return
                    }
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void ask(input)
                }
              }}
              rows={3}
              disabled={!canWrite}
              placeholder={
                canWrite
                  ? 'Ask me anything about your schema…'
                  : 'Read-only — viewer cannot send chat'
              }
              className="min-h-[72px] w-full resize-none border-none bg-transparent text-[15px] leading-relaxed text-[#d4dbe3] outline-none placeholder:text-[#6b7380] disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-[12px] border-t border-solid border-[#424850] px-[20px] py-[14px]">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".sql,.md,.txt,.json,.csv,.yml,.yaml"
            className="hidden"
            onChange={(e) => {
              void onPickAttachments(e.target.files)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            disabled={!canWrite}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-[8px] rounded-full border border-solid border-[#424850] bg-[#15191e] px-[14px] py-[8px] text-[12px] font-medium text-[#c8cdd3] transition-colors hover:border-[#6b7380] hover:text-[#d4dbe3] disabled:opacity-40"
          >
            <PaperclipIcon />
            Attach file
          </button>

          <button
            type="button"
            disabled={!canWrite || busy || (!input.trim() && attachments.length === 0)}
            onClick={() => void ask(input)}
            className="pdf-btn-primary flex size-[44px] shrink-0 items-center justify-center rounded-full text-[16px] font-bold disabled:opacity-40"
            aria-label="Send"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}

function PaperclipIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}
