import type { ReactNode } from 'react'

export function PdfTableShell({
  children,
  footer,
}: {
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="pdf-table-shell">
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
    <footer className="pdf-table-footer">
      <span>{left}</span>
      {right ? <div className="flex items-center gap-[8px]">{right}</div> : null}
    </footer>
  )
}

export const PDF_TABLE_HEAD = 'pdf-table-head'

export const PDF_TABLE_ROW = 'pdf-table-row'

export const PDF_TABLE_CELL = 'pdf-table-cell'
