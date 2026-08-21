import type { ReactNode } from 'react'
import { PdfSidebar } from '@/components/pdf/PdfSidebar'
import { MobileNav } from '@/components/MobileNav'

interface QueAppChromeProps {
  children: ReactNode
  /** Ignored — PDF app frames use sidebar-only chrome */
  eyebrow?: string
  /** Full-bleed page — no scroll wrapper */
  flush?: boolean
}

/**
 * App shell — PDF pages 2–10: #111416 canvas + icon sidebar.
 * No top bar (workspace strip / search / Promote / Sync Schema removed per design).
 */
export function QueAppChrome({ children, flush = false }: QueAppChromeProps) {
  return (
    <div className="pdf-app-canvas flex h-full min-h-0 w-full overflow-hidden text-[#d4dbe3]">
      <PdfSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center border-b border-[#424850] bg-[#0f1215] px-3 md:hidden">
          <MobileNav showBelow="md" />
          <span className="ml-3 text-[10px] font-black text-[#ecf0f4]">QUE</span>
        </div>
        <div
          className={[
            'min-h-0 flex-1',
            flush ? 'overflow-hidden' : 'overflow-y-auto',
          ].join(' ')}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
