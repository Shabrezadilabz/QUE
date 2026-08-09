import { useMemo, type ReactNode } from 'react'
import type { SchemaColumn } from '@/types/schema'
import type {
  RightSidebarStatus,
  SampleDataRow,
  TableDetailProps,
  TableDetailStats,
} from '@/types/tableDetail'
import {
  resolveSampleRows,
  resolveTableStats,
} from '@/data/dummyTableDetail'
import { SourceTypeIcon, sourceTypeLabel } from '@/components/sidebar/SourceTypeIcon'
import { ColumnKeyIcon } from '@/components/canvas/ColumnIcons'

export type {
  TableDetailProps,
  TableDetailStats,
  SampleDataRow,
  RightSidebarStatus,
}

const WIDTH_PX = 320

/**
 * Properties panel — dark IDE inspector.
 */
export function RightSidebar({
  table,
  selectedColumnId = null,
  status: statusProp,
  errorMessage = 'Failed to load table details.',
  stats: statsProp,
  sampleRows: sampleRowsProp,
  onClose,
  onAddToJob,
  onPreviewData,
  onShowLineage,
  onSelectColumn,
  className = '',
}: TableDetailProps) {
  const status: RightSidebarStatus =
    statusProp ?? (table ? 'ready' : 'empty')

  const stats = table
    ? (statsProp ?? resolveTableStats(table.id) ?? {})
    : {}

  const sampleRows = useMemo(() => {
    if (!table) return []
    if (sampleRowsProp) return sampleRowsProp
    return resolveSampleRows(table)
  }, [table, sampleRowsProp])

  return (
    <aside
      data-region="right-sidebar"
      className={`flex h-full shrink-0 flex-col border-l border-outline-variant bg-surface-container ${className}`}
      style={{ width: WIDTH_PX }}
      aria-label="Properties"
    >
      <div className="shrink-0 border-b border-outline-variant/20 p-lg">
        <div className="mb-md flex items-center justify-between">
          <h3 className="font-headline text-xl font-semibold text-on-surface">
            Properties
          </h3>
          <button
            type="button"
            className="rounded-full p-xs text-on-surface-variant transition-colors hover:bg-secondary-container"
            aria-label="Close properties"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {status === 'ready' && table ? (
          <div className="flex items-center gap-md rounded-lg border border-secondary/30 bg-secondary/10 p-md">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-outline-variant bg-surface-container-high text-secondary">
              <SourceTypeIcon type={table.sourceType} className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-label text-sm font-bold text-on-surface">
                {table.name}
              </p>
              <p className="font-mono text-[11px] text-on-surface-variant">
                Table · {table.sourceLabel || sourceTypeLabel(table.sourceType)}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-lg">
        {status === 'loading' ? <LoadingState /> : null}
        {status === 'error' ? <ErrorState message={errorMessage} /> : null}
        {status === 'empty' ||
        (!table && status !== 'loading' && status !== 'error') ? (
          <EmptyState />
        ) : null}

        {status === 'ready' && table ? (
          <div className="flex flex-col gap-lg">
            <Section title="Description">
              <p className="font-body text-sm leading-relaxed text-on-surface-variant">
                {stats.description ||
                  `${table.name} schema metadata from ${
                    table.sourceLabel || sourceTypeLabel(table.sourceType)
                  }.`}
              </p>
            </Section>

            <Section
              title={`Columns (${table.columns.length})`}
              action={
                <span className="font-label text-[10px] text-secondary">
                  {stats.rowCount != null
                    ? `${stats.rowCount.toLocaleString()} rows`
                    : null}
                </span>
              }
            >
              <div className="flex flex-col gap-xs">
                {table.columns.map((col) => (
                  <ColumnPill
                    key={col.id}
                    column={col}
                    selected={selectedColumnId === col.id}
                    onSelect={() => onSelectColumn?.(col.id)}
                  />
                ))}
              </div>
            </Section>

            <Section title="Metadata Tags">
              <div className="flex flex-wrap gap-xs">
                <Tag tone="sage">Schema only</Tag>
                <Tag tone="primary">
                  {sourceTypeLabel(table.sourceType)}
                </Tag>
                <Tag tone="sand">
                  {(table.entityKind ?? 'TABLE').toString()}
                </Tag>
                {stats.storageLabel ? (
                  <Tag tone="sand">{stats.storageLabel}</Tag>
                ) : null}
              </div>
            </Section>

            <Section title="Preview Data">
              <PreviewTable rows={sampleRows} />
              {onPreviewData ? (
                <button
                  type="button"
                  className="mt-sm font-label text-[10px] tracking-widest text-secondary hover:underline"
                  onClick={() => onPreviewData(table.id)}
                >
                  Refresh preview
                </button>
              ) : null}
            </Section>

            {onShowLineage ? (
              <button
                type="button"
                className="rounded-lg border border-outline-variant/40 px-md py-sm font-label text-[11px] tracking-widest text-on-surface-variant hover:border-secondary"
                onClick={() => onShowLineage(table.id)}
              >
                Show lineage
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-outline-variant/20 bg-surface-container-low/50 p-lg">
        <button
          type="button"
          disabled={!table || status !== 'ready'}
          onClick={() => table && onAddToJob?.(table.id)}
          className="w-full rounded bg-secondary py-md font-label text-sm font-medium text-on-secondary transition-colors hover:bg-secondary-fixed-dim active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save Changes
        </button>
        <p className="mt-xs text-center font-label text-[9px] tracking-wide text-on-surface-variant/70">
          Creates a stitch job from this table + neighbors
        </p>
      </div>
    </aside>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section>
      <div className="mb-sm flex items-center justify-between gap-sm">
        <h4 className="font-label text-[11px] font-medium tracking-widest text-outline uppercase">
          {title}
        </h4>
        {action}
      </div>
      {children}
    </section>
  )
}

function ColumnPill({
  column,
  selected,
  onSelect,
}: {
  column: SchemaColumn
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex w-full items-center justify-between rounded-lg border px-sm py-sm text-left transition-colors',
        selected
          ? 'border-secondary/40 bg-surface-container-low'
          : 'border-outline-variant/30 bg-surface-container-low/30 hover:border-secondary/40',
      ].join(' ')}
    >
      <span className="flex min-w-0 items-center gap-sm">
        <span className="text-tertiary">
          <ColumnKeyIcon kind={column.keyKind} />
        </span>
        <span className="truncate font-label text-[13px] text-on-surface">
          {column.name}
        </span>
      </span>
      <span className="shrink-0 font-label text-[10px] tracking-wide text-outline uppercase">
        {column.keyKind === 'pk'
          ? 'pk'
          : column.keyKind === 'fk'
            ? 'fk'
            : column.dataType}
      </span>
    </button>
  )
}

function Tag({
  children,
  tone,
}: {
  children: ReactNode
  tone: 'sage' | 'primary' | 'sand'
}) {
  const cls =
    tone === 'sage'
      ? 'bg-tertiary/10 text-tertiary'
      : tone === 'primary'
        ? 'bg-secondary/10 text-secondary'
        : 'bg-secondary-container text-on-secondary-container'
  return (
    <span
      className={`rounded-full px-sm py-xs text-[10px] font-bold tracking-wide uppercase ${cls}`}
    >
      {children}
    </span>
  )
}

function PreviewTable({ rows }: { rows: SampleDataRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-sm font-body text-xs text-on-surface-variant">
        No sample values on columns yet.
      </p>
    )
  }
  const keys = Object.keys(rows[0] ?? {}).slice(0, 3)
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-low">
      <table className="w-full text-left text-[11px]">
        <thead className="border-b border-outline-variant/20 bg-surface-container-low">
          <tr>
            {keys.map((k) => (
              <th
                key={k}
                className="p-sm font-label text-[10px] tracking-wide text-outline uppercase"
              >
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 4).map((row, i) => (
            <tr
              key={i}
              className={
                i % 2 === 1
                  ? 'bg-surface-container/60'
                  : 'border-b border-outline-variant/10'
              }
            >
              {keys.map((k) => (
                <td key={k} className="max-w-[5rem] truncate p-sm font-label">
                  {row[k] == null ? (
                    <span className="opacity-40">null</span>
                  ) : (
                    String(row[k])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState() {
  return (
    <div>
      <p className="font-headline text-lg font-semibold text-on-surface">
        No table selected
      </p>
      <p className="mt-sm font-body text-sm text-on-surface-variant">
        Select a table on the canvas to inspect columns, tags, and sample
        values.
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center gap-sm py-lg" role="status">
      <div className="h-8 w-8 animate-pulse rounded-full border-2 border-secondary border-t-transparent" />
      <p className="font-label text-[11px] tracking-widest text-on-surface-variant">
        LOADING…
      </p>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl border border-error/40 bg-error-container p-md"
      role="alert"
    >
      <p className="font-label text-[11px] font-bold tracking-widest text-error">
        ERROR
      </p>
      <p className="mt-sm font-body text-xs text-on-surface">{message}</p>
    </div>
  )
}

export { buildSampleRowsFromColumns } from '@/data/dummyTableDetail'
export default RightSidebar
