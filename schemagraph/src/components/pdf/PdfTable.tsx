import type { ReactNode } from 'react'

export function PdfTableShell({
  children,
  footer,
}: {
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-solid border-[#424850] bg-[#0f1215] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
      <div className="overflow-x-auto">{children}</div>
      {footer}
    </div>
  )
}

export function PdfTableFooter({
  left,
  right,
}: {
  left: ReactNode
  right?: ReactNode
}) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-[12px] border-t border-solid border-[#424850] bg-[#0f1215] px-[16px] py-[12px] text-[12px] text-[#a3afbe]">
      <span>{left}</span>
      {right ? <div className="flex items-center gap-[8px]">{right}</div> : null}
    </footer>
  )
}

export const PDF_TABLE_HEAD =
  'px-[16px] py-[12px] text-[10px] font-semibold tracking-[0.5px] text-[#c8cdd3] uppercase'

export const PDF_TABLE_ROW = 'border-t border-solid border-[#424850]'

export const PDF_TABLE_CELL = 'px-[16px] py-[18px]'
