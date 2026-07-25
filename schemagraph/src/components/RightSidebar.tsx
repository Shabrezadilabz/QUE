import { useMemo, useState, type ReactNode } from 'react'
import type { SchemaColumn, SchemaTable } from '@/types/schema'
import type {
  RightSidebarStatus,
  SampleDataRow,
  TableDetailProps,
  TableDetailStats,
} from '@/types/tableDetail'
import {
  buildSampleRowsFromColumns,
  resolveSampleRows,
  resolveTableStats,
} from '@/data/dummyTableDetail'
import { SourceTypeIcon, sourceTypeLabel } from '@/components/sidebar/SourceTypeIcon'
import {
  ColumnKeyIcon,
  ColumnTypeIcon,
  keyKindLabel,
} from '@/components/canvas/ColumnIcons'

/* ─────────────────────────────────────────────────────────────────────────────
 * RightSidebar
 *
 * Fixed 320px inspector for the selected TableNode.
 * States: empty | loading | error | ready (with expandable Schema / Details /
 * Sample Data sections) + action buttons (Add to Job, Preview, Lineage).
 *
 * Primary props type: TableDetailProps (exported below and from types/).
 * ─────────────────────────────────────────────────────────────────────────── */

export type { TableDetailProps, TableDetailStats, SampleDataRow, RightSidebarStatus }

type SectionKey = 'schema' | 'details' | 'sample'

const WIDTH_PX = 320

/**
 * Right-hand table detail rail.
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
  /** Derive status when parent does not force one */
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

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    schema: true,
    details: true,
    sample: true,
  })

  function toggleSection(key: SectionKey) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <aside
      data-region="right-sidebar"
      className={`flex h-full shrink-0 flex-col border-l border-outline-variant bg-surface-container-low ${className}`}
      style={{ width: WIDTH_PX }}
      aria-label="Table details"
    >
      {/* ── Chrome header ──────────────────────────────────────────────── */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container px-md">
        <span className="font-label text-[11px] font-bold tracking-widest text-primary-fixed">
          TABLE DETAILS
        </span>
        <button
          type="button"
          className="text-sm text-on-surface-variant transition-colors hover:text-on-surface"
          aria-label="Close table details"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {status === 'loading' ? <LoadingState /> : null}
        {status === 'error' ? <ErrorState message={errorMessage} /> : null}
        {status === 'empty' || (!table && status !== 'loading' && status !== 'error') ? (
          <EmptyState />
        ) : null}

        {status === 'ready' && table ? (
          <TableDetailBody
            table={table}
            stats={stats}
            sampleRows={sampleRows}
            selectedColumnId={selectedColumnId}
            openSections={openSections}
            onToggleSection={toggleSection}
            onSelectColumn={onSelectColumn}
          />
        ) : null}
      </div>

      {/* ── Actions (enabled only when a table is ready) ───────────────── */}
      <div className="shrink-0 space-y-sm border-t border-outline-variant p-md">
        <ActionButton
          label="Create stitch job"
          primary
          disabled={!table || status !== 'ready'}
          onClick={() => table && onAddToJob?.(table.id)}
        />
        <div className="grid grid-cols-2 gap-sm">
          <ActionButton
            label="Preview Data"
            disabled={!table || status !== 'ready'}
            onClick={() => table && onPreviewData?.(table.id)}
          />
          <ActionButton
            label="Show Lineage"
            disabled={!table || status !== 'ready'}
            onClick={() => table && onShowLineage?.(table.id)}
          />
        </div>
      </div>
    </aside>
  )
}

/* ── Body when table is selected ───────────────────────────────────────────── */

interface TableDetailBodyProps {
  table: SchemaTable
  stats: TableDetailStats
  sampleRows: SampleDataRow[]
  selectedColumnId: string | null
  openSections: Record<SectionKey, boolean>
  onToggleSection: (key: SectionKey) => void
  onSelectColumn?: (columnId: string) => void
}

function TableDetailBody({
  table,
  stats,
  sampleRows,
  selectedColumnId,
  openSections,
  onToggleSection,
  onSelectColumn,
}: TableDetailBodyProps) {
  return (
    <div className="space-y-0 p-md">
      {/* Title + data source */}
      <div className="mb-md">
        <h2 className="font-headline text-[22px] font-semibold leading-tight text-on-surface">
          {table.name}
        </h2>
        <div className="mt-sm flex items-center gap-sm text-on-surface-variant">
          <SourceTypeIcon type={table.sourceType} className="h-4 w-4" />
          <span className="font-label text-[10px] font-bold tracking-widest uppercase">
            {table.sourceLabel || sourceTypeLabel(table.sourceType)}
          </span>
          <span className="font-body text-[10px] opacity-50">·</span>
          <span className="font-label text-[10px] tracking-widest uppercase opacity-70">
            {table.entityKind ?? 'TABLE'}
          </span>
        </div>
        {stats.description ? (
          <p className="mt-sm font-body text-xs leading-relaxed text-on-surface-variant">
            {stats.description}
          </p>
        ) : null}
      </div>

      {/* Quick stats */}
      <div className="mb-md grid grid-cols-2 gap-sm">
        <StatCard
          label="Row count"
          value={
            stats.rowCount != null
              ? stats.rowCount.toLocaleString()
              : '—'
          }
        />
        <StatCard label="Storage" value={stats.storageLabel ?? '—'} />
      </div>

      {/* Expandable: Schema */}
      <ExpandableSection
        title="Schema"
        open={openSections.schema}
        onToggle={() => onToggleSection('schema')}
      >
        <ul className="space-y-xs">
          {table.columns.map((col) => (
            <ColumnRow
              key={col.id}
              column={col}
              selected={selectedColumnId === col.id}
              onSelect={() => onSelectColumn?.(col.id)}
            />
          ))}
        </ul>
      </ExpandableSection>

      {/* Expandable: Details */}
      <ExpandableSection
        title="Details"
        open={openSections.details}
        onToggle={() => onToggleSection('details')}
      >
        <dl className="space-y-sm font-body text-xs">
          <DetailRow label="Table ID" value={table.id} />
          <DetailRow label="Source ID" value={table.sourceId} />
          <DetailRow label="Source type" value={sourceTypeLabel(table.sourceType)} />
          <DetailRow
            label="Columns"
            value={String(table.columns.length)}
          />
          <DetailRow
            label="Primary keys"
            value={
              table.columns
                .filter((c) => c.keyKind === 'pk')
                .map((c) => c.name)
                .join(', ') || '—'
            }
          />
          <DetailRow
            label="Foreign keys"
            value={
              table.columns
                .filter((c) => c.keyKind === 'fk')
                .map((c) =>
                  c.references ? `${c.name} → ${c.references}` : c.name,
                )
                .join('; ') || '—'
            }
          />
        </dl>
      </ExpandableSection>

      {/* Expandable: Sample data */}
      <ExpandableSection
        title="Sample data"
        open={openSections.sample}
        onToggle={() => onToggleSection('sample')}
      >
        {sampleRows.length === 0 ? (
          <p className="font-body text-xs text-on-surface-variant opacity-70">
            No sample rows available.
          </p>
        ) : (
          <SampleDataTable table={table} rows={sampleRows} />
        )}
      </ExpandableSection>
    </div>
  )
}

/* ── Subcomponents ─────────────────────────────────────────────────────────── */

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-outline-variant bg-surface-container p-sm">
      <span className="mb-xs block font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
        {label}
      </span>
      <span className="font-body text-sm text-primary-fixed">{value}</span>
    </div>
  )
}

function ExpandableSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className="mb-sm border border-outline-variant bg-surface-container">
      <button
        type="button"
        className="flex w-full items-center justify-between px-sm py-sm text-left hover:bg-surface-container-high"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="font-label text-[11px] font-bold tracking-widest text-on-surface-variant uppercase">
          {title}
        </span>
        <span
          className="text-primary-fixed transition-transform"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
          aria-hidden
        >
          ▸
        </span>
      </button>
      {open ? (
        <div className="border-t border-outline-variant px-sm py-sm">{children}</div>
      ) : null}
    </section>
  )
}

function ColumnRow({
  column,
  selected,
  onSelect,
}: {
  column: SchemaColumn
  selected: boolean
  onSelect: () => void
}) {
  const key = keyKindLabel(column.keyKind)
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full items-start gap-sm px-xs py-xs text-left transition-colors ${
          selected
            ? 'bg-primary-fixed/10 outline outline-1 outline-primary-fixed/40'
            : 'hover:bg-surface-container-high'
        }`}
      >
        <span className="mt-0.5 text-on-surface-variant">
          <ColumnTypeIcon dataType={column.dataType} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-body text-xs text-on-surface">
            {column.name}
            <span className="ml-sm text-on-surface-variant opacity-50">
              {column.dataType}
            </span>
          </span>
          {key ? (
            <span className="mt-0.5 block font-label text-[9px] tracking-wider text-primary-fixed">
              {key}
              {column.references ? ` · ${column.references}` : ''}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 text-primary-fixed">
          <ColumnKeyIcon kind={column.keyKind} />
        </span>
      </button>
    </li>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-sm">
      <dt className="shrink-0 font-label text-[10px] tracking-wider text-on-surface-variant uppercase">
        {label}
      </dt>
      <dd className="truncate text-right text-on-surface">{value}</dd>
    </div>
  )
}

function SampleDataTable({
  table,
  rows,
}: {
  table: SchemaTable
  rows: SampleDataRow[]
}) {
  const cols = table.columns
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse font-body text-[11px]">
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.id}
                className="border-b border-outline-variant px-xs py-xs text-left font-label text-[9px] tracking-wider text-on-surface-variant uppercase"
              >
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-outline-variant/50">
              {cols.map((c) => (
                <td
                  key={c.id}
                  className="max-w-[120px] truncate px-xs py-xs text-on-surface"
                  title={String(row[c.name] ?? '')}
                >
                  {row[c.name] == null ? (
                    <span className="opacity-40">null</span>
                  ) : (
                    String(row[c.name])
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

function ActionButton({
  label,
  onClick,
  disabled,
  primary,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        primary
          ? 'w-full bg-primary-container py-md font-label text-[11px] font-bold tracking-widest text-on-primary-container transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'
          : 'w-full border border-outline-variant py-sm font-label text-[10px] font-bold tracking-widest text-on-surface-variant transition-colors hover:border-primary-fixed hover:text-primary-fixed disabled:cursor-not-allowed disabled:opacity-40'
      }
    >
      {label}
    </button>
  )
}

function EmptyState() {
  return (
    <div className="p-md">
      <p className="font-headline text-lg font-semibold text-on-surface">
        No table selected
      </p>
      <p className="mt-sm font-body text-xs text-on-surface-variant">
        Select a table on the canvas to inspect schema, details, and sample
        data.
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center gap-sm p-lg" role="status">
      <div className="h-8 w-8 animate-pulse border-2 border-primary-fixed border-t-transparent" />
      <p className="font-label text-[11px] tracking-widest text-on-surface-variant">
        LOADING DETAILS…
      </p>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="m-md border border-[#FF0055]/60 bg-[#FF0055]/10 p-md" role="alert">
      <p className="font-label text-[11px] font-bold tracking-widest text-[#FF0055]">
        ERROR
      </p>
      <p className="mt-sm font-body text-xs text-on-surface">{message}</p>
    </div>
  )
}

/** Synthesize sample rows when callers only have column.sampleValues */
export { buildSampleRowsFromColumns }

export default RightSidebar
