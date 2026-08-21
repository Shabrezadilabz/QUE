/** PDF slate tokens for Chat page — matches app design system. */

export const CHAT = {
  page: 'bg-[#111416]',
  panel: 'rounded-[4px] border border-solid border-[#424850] bg-[#0f1215]',
  panelInner: 'rounded-[4px] border border-solid border-[#424850] bg-[#121619]',
  bubbleAi: 'rounded-[4px] rounded-tl-none border border-solid border-[#424850] bg-[#0f1215]',
  bubbleUser: 'rounded-[4px] rounded-tr-none border border-solid border-[#d0d8e0]/25 bg-[#2e343b]',
  pill: 'rounded-[12px] border border-solid border-[#424850] bg-[#121619] px-[12px] py-[6px] text-[11px] font-semibold text-[#c8cdd3] hover:border-[#6b7380] hover:text-[#d4dbe3] disabled:opacity-40',
  pillAccent:
    'rounded-[12px] border border-solid border-[rgba(122,236,208,0.35)] bg-[rgba(122,236,208,0.08)] px-[12px] py-[6px] text-[11px] font-semibold text-[#7aecd0] hover:bg-[rgba(122,236,208,0.12)] disabled:opacity-40',
  avatarAi:
    'flex size-[40px] shrink-0 items-center justify-center rounded-full border border-solid border-[#424850] bg-[#1e2328] text-[11px] font-bold text-[#d0d8e0]',
  avatarUser:
    'flex size-[40px] shrink-0 items-center justify-center rounded-full border border-solid border-[#d0d8e0]/35 bg-[#2e343b] text-[11px] font-bold text-[#ecf0f4]',
  composer:
    'relative rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] p-[14px] focus-within:border-[#6b7380]',
  meta: 'text-[11px] text-[#8a9099]',
  accent: 'text-[#7aecd0]',
  tipCard:
    'rounded-[4px] border border-solid border-[rgba(122,236,208,0.28)] bg-[rgba(122,236,208,0.06)] p-[16px]',
} as const
