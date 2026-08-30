import {
  SourceTypeIcon,
  sourceTypeLabel,
} from '@/components/sidebar/SourceTypeIcon'
import {
  PDF_TABLE_CELL,
  PDF_TABLE_HEAD,
  PDF_TABLE_ROW,
  PdfTableFooter,
  PdfTableShell,
} from '@/components/pdf/PdfTable'
import type { DataSource, DataLandingMode } from '@/types/dataSource'
import {
  readDataLandingMode,
  SourceLandingModeSelect,
} from '@/components/sources/SourceLandingModeSelect'
import {
  canSyncSource,
  isPendingSource,
  readSourceSetupMode,
  relativeLastSyncLabel,
  sourceStatusDisplay,
} from '@/sources/sourceSetup'

const HEADERS = [
  'SOURCE NAME',
  'TYPE',
  'STATUS',
  'DATA LANDING',
  'LAST SYNCED',
  'ACTIONS',
] as const

type Props = {
  sources: DataSource[]
  onSelect: (id: string) => void
  onSync?: (id: string) => void
  onUseDemo?: (id: string) => void
  onSkip?: (id: string) => void
  onLandingModeChange?: (id: string, mode: DataLandingMode) => void
  canSync?: boolean
  canAdd?: boolean
  onAdd?: () => void
  canEditLanding?: boolean
  canAdmin?: boolean
}

/** Sources list — PDF page-02 style segregated table (slate, no mint). */
export function SourcesTableView({
  sources,
  onSelect,
  onSync,
  onUseDemo,
  onSkip,
  onLandingModeChange,
  canSync,
  canAdd,
  onAdd,
  canEditLanding,
  canAdmin,
}: Props) {
  const active = sources.filter((s) => s.status === 'active').length
  const healthPct =
    sources.length === 0
      ? 100
      : Math.round((active / sources.length) * 10000) / 100

  return (
    <PdfTableShell
      footer={
        <PdfTableFooter
          left={
            <>
              Showing 1 to {sources.length} of {sources.length} sources
              {sources.length > 0 ? (
                <span className="ml-[12px] text-[#8a9099]">
                  · {healthPct}% healthy
                </span>
              ) : null}
            </>
          }
          right={
            <>
              <button
                type="button"
                className="pdf-btn-ghost rounded-[4px] px-[10px] py-[4px] text-[12px]"
                disabled
              >
                ‹
              </button>
              <button
                type="button"
                className="pdf-btn-ghost rounded-[4px] px-[10px] py-[4px] text-[12px]"
                disabled
              >
                ›
              </button>
            </>
          }
        />
      }
    >
      <table className="w-full min-w-[880px] border-collapse text-left">
        <thead>
          <tr className="border-b border-solid border-[#424850] bg-[#1e2328]">
            {HEADERS.map((h, i) => (
              <th
                key={h}
                className={[
                  PDF_TABLE_HEAD,
                  i === 4 ? 'text-right' : '',
                ].join(' ')}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const st = sourceStatusDisplay(s)
            const pending = isPendingSource(s)
            const setup = readSourceSetupMode(s)
            const showSync = canSync && canSyncSource(s) && onSync
            return (
              <tr key={s.id} className={PDF_TABLE_ROW}>
                <td className={PDF_TABLE_CELL}>
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    className="flex w-full items-center gap-[12px] text-left"
                  >
                    <div className="pdf-shine flex size-[32px] shrink-0 items-center justify-center rounded-[2px]">
                      <SourceTypeIcon type={s.type} className="h-4 w-4 text-[#c8cdd3]" />
                    </div>
                    <div className="min-w-0 flex flex-col gap-[2px]">
                      <p className="truncate text-[14px] font-medium leading-[20px] text-[#d4dbe3]">
                        {s.name}
                      </p>
                      {s.description ? (
                        <p className="truncate font-mono text-[12px] leading-[16px] text-[#8a9099]">
                          {s.description}
                        </p>
                      ) : null}
                    </div>
                  </button>
                </td>
                <td className={PDF_TABLE_CELL}>
                  <span className="inline-flex items-center gap-[6px] rounded-[12px] border border-solid border-[#424850] bg-[#252a30] px-[9px] py-[5px] text-[12px] text-[#d4dbe3]">
                    {sourceTypeLabel(s.type)}
                  </span>
                </td>
                <td className={PDF_TABLE_CELL}>
                  <span
                    className={[
                      'inline-flex items-center gap-[6px] rounded-[4px] px-[8px] py-[4px] text-[11px] font-semibold',
                      st.pill,
                    ].join(' ')}
                  >
                    <span className={`size-[6px] shrink-0 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>
                </td>
                <td className={PDF_TABLE_CELL}>
                  {pending ? (
                    <span className="text-[11px] text-[#8a9099]">—</span>
                  ) : canEditLanding && onLandingModeChange ? (
                    <SourceLandingModeSelect
                      value={readDataLandingMode(s.config)}
                      onChange={(mode) => onLandingModeChange(s.id, mode)}
                    />
                  ) : (
                    <span className="text-[11px] text-[#a3afbe]">
                      {readDataLandingMode(s.config) === 'schema_only'
                        ? 'Schema only'
                        : readDataLandingMode(s.config) === 'managed_plane'
                          ? 'Managed'
                          : 'Warehouse'}
                    </span>
                  )}
                </td>
                <td className={`${PDF_TABLE_CELL} text-[12px] text-[#c8cdd3]`}>
                  {relativeLastSyncLabel(s.lastSyncAt)}
                </td>
                <td className={`${PDF_TABLE_CELL} text-right`}>
                  <div className="flex flex-wrap items-center justify-end gap-[8px]">
                    {pending && canAdmin ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onSelect(s.id)}
                          className="pdf-btn-ghost rounded-[4px] px-[10px] py-[4px] text-[11px] font-semibold"
                        >
                          Connect
                        </button>
                        {onUseDemo ? (
                          <button
                            type="button"
                            onClick={() => onUseDemo(s.id)}
                            className="pdf-btn-ghost rounded-[4px] px-[10px] py-[4px] text-[11px] font-semibold"
                          >
                            Use demo
                          </button>
                        ) : null}
                        {onSkip ? (
                          <button
                            type="button"
                            onClick={() => onSkip(s.id)}
                            className="text-[12px] text-[#a3afbe] hover:text-[#ff6b6b]"
                          >
                            Skip
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {showSync ? (
                          <button
                            type="button"
                            onClick={() => onSync?.(s.id)}
                            className="pdf-btn-ghost rounded-[4px] px-[10px] py-[4px] text-[11px] font-semibold"
                          >
                            Sync
                          </button>
                        ) : null}
                        {setup === 'fixture' && canAdmin ? (
                          <button
                            type="button"
                            onClick={() => onSelect(s.id)}
                            className="text-[12px] text-[#a3afbe] hover:text-[#d0d8e0]"
                            title="Switch to live credentials"
                          >
                            Add live
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onSelect(s.id)}
                          className="text-[12px] text-[#a3afbe] hover:text-[#d0d8e0]"
                        >
                          Open
                        </button>
                        {onSkip && canAdmin ? (
                          <button
                            type="button"
                            onClick={() => onSkip(s.id)}
                            className="text-[12px] text-[#a3afbe] hover:text-[#ff6b6b]"
                          >
                            Remove
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
          {canAdd && onAdd ? (
            <tr className={PDF_TABLE_ROW}>
              <td colSpan={6} className={PDF_TABLE_CELL}>
                <button
                  type="button"
                  onClick={onAdd}
                  className="flex w-full items-center justify-center gap-[8px] rounded-[4px] border border-dashed border-[#424850] py-[14px] text-[13px] font-medium text-[#a3afbe] hover:border-[#6b7380] hover:text-[#d0d8e0]"
                >
                  <span className="text-[18px] leading-none">+</span>
                  Add connector
                </button>
              </td>
            </tr>
          ) : null}
          {!sources.length ? (
            <tr className={PDF_TABLE_ROW}>
              <td
                colSpan={6}
                className={`${PDF_TABLE_CELL} py-[32px] text-center text-[13px] text-[#a3afbe]`}
              >
                No sources yet.{' '}
                {canAdd ? (
                  <button
                    type="button"
                    onClick={onAdd}
                    className="text-[#d0d8e0] underline"
                  >
                    Add a connector
                  </button>
                ) : (
                  'Ask an admin to add a connection.'
                )}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </PdfTableShell>
  )
}
