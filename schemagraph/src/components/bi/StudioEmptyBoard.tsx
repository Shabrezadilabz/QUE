import { Link } from 'react-router-dom'
import { PdfPrimaryButton } from '@/components/pdf/PdfUi'

type Props = {
  canWrite: boolean
  busy: boolean
  hasDatasets: boolean
  onScaffold: () => void
}

/**
 * Studio v3 — honest empty state (no mock chart data).
 */
export function StudioEmptyBoard({
  canWrite,
  busy,
  hasDatasets,
  onScaffold,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-[16px] px-[24px] py-[48px]">
      <div className="max-w-[480px] rounded-[8px] border border-dashed border-[#424850] bg-[#0f1215] px-[24px] py-[32px] text-center">
        <p className="text-[14px] font-semibold text-[#d4dbe3]">
          No warehouse-bound visuals yet
        </p>
        <p className="mt-[8px] text-[12px] leading-relaxed text-[#a3afbe]">
          Report Studio renders from stored SQL on Que Warehouse — not mock bars.
          Scaffold a board from certified datasets or bind SQL on each visual.
        </p>
        {canWrite ? (
          <div className="mt-[16px] flex flex-wrap items-center justify-center gap-[10px]">
            <PdfPrimaryButton
              type="button"
              disabled={busy}
              onClick={onScaffold}
              className="px-[16px] py-[8px] text-[12px]"
            >
              {busy ? 'Scaffolding…' : 'Scaffold exec board'}
            </PdfPrimaryButton>
            <Link
              to="/studio/grid"
              className="text-[12px] font-semibold text-[#7aecd0] underline"
            >
              Explore in grid →
            </Link>
          </div>
        ) : null}
        {!hasDatasets ? (
          <p className="mt-[12px] text-[11px] text-[#f0a020]">
            Certify a managed dataset first (Monk or Jobs → materialize).
          </p>
        ) : null}
      </div>
    </div>
  )
}
