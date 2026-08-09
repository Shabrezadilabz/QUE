import { useMemo } from 'react'
import type { MainDiagramLayoutProps } from '@/types/diagram'
import { MainCanvas } from '@/components/MainCanvas'
import { RightSidebar } from '@/components/RightSidebar'
import { TopBar } from '@/components/TopBar'
import { IdeStatusBar } from '@/components/IdeStatusBar'
import { useDiagram } from '@/context/DiagramContext'
import { useToast } from '@/context/ToastContext'
import type { DiagramAction } from '@/types/schema'
import { findTable } from '@/data/dummyTableDetail'
import { DUMMY_RELATIONSHIPS, DUMMY_TABLES } from '@/data/dummySchema'
import { filterDiagramData } from '@/utils/filterDiagram'
import type { ExportFormat } from '@/types/topBar'

/**
 * MainDiagramLayout — top-level shell for the Que diagram workspace.
 */
export function MainDiagramLayout({
  topBar,
  leftSidebar,
  mainCanvas,
  rightSidebar,
  miniMap,
  showRightSidebar: showRightSidebarProp,
  className = '',
  tables: tablesProp,
  relationships: relationshipsProp,
  sources: _sourcesProp,
  fromApi = false,
  readOnly = false,
  statusBanner = null,
  onDismissBanner,
  onPromoteRelationship,
  onRejectRelationship,
  onSyncSource: _onSyncSource,
  onCreateStitchJob,
  onOpenStitchSession,
  stitchSessionLabel,
  syncing: _syncing = false,
}: MainDiagramLayoutProps) {
  const tables = tablesProp ?? DUMMY_TABLES
  const relationships = relationshipsProp ?? DUMMY_RELATIONSHIPS
  void _sourcesProp
  void _onSyncSource
  void _syncing
  const { pushToast } = useToast()

  const {
    showRightSidebar: showRightSidebarCtx,
    selection,
    selectTable,
    selectColumn,
    setViewport,
    setShowRightSidebar,
    filters,
    setFilters,
    tablePositions,
  } = useDiagram()
  const showRight = showRightSidebarProp ?? showRightSidebarCtx

  const selectedTable = findTable(tables, selection.tableId)

  const { visibleTables, visibleRelationships } = useMemo(
    () =>
      filterDiagramData(tables, relationships, filters, {
        connectionId: selection.connectionId,
      }),
    [tables, relationships, filters, selection.connectionId],
  )

  const handleDiagramAction = (action: DiagramAction) => {
    if (action.viewport && (action.type === 'pan' || action.type === 'zoom')) {
      setViewport(action.viewport)
    }
  }

  const handleExport = (format: ExportFormat) => {
    const payload = {
      format,
      exportedAt: new Date().toISOString(),
      fromApi,
      filters,
      connectionId: selection.connectionId,
      tables: visibleTables.map((t) => ({
        id: t.id,
        name: t.name,
        sourceId: t.sourceId,
        sourceType: t.sourceType,
        position: tablePositions[t.id] ?? t.position,
        columns: t.columns.map((c) => ({
          id: c.id,
          name: c.name,
          dataType: c.dataType,
          keyKind: c.keyKind,
        })),
      })),
      relationships: visibleRelationships.map((r) => ({
        id: r.id,
        type: r.type ?? r.kind,
        status: r.status,
        confidence: r.confidence,
        fromTableId: r.fromTableId,
        toTableId: r.toTableId,
        fromColumnId: r.fromColumnId,
        toColumnId: r.toColumnId,
      })),
    }

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'que-export.json'
      a.click()
      URL.revokeObjectURL(url)
      pushToast('Downloaded que-export.json', 'success')
      return
    }

    if (format === 'png') {
      const svg = buildExportSvg(payload.tables, payload.relationships)
      const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1200, img.width)
        canvas.height = Math.max(800, img.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          pushToast('PNG export failed', 'error')
          URL.revokeObjectURL(url)
          return
        }
        ctx.fillStyle = '#031427'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(url)
          if (!blob) {
            pushToast('PNG export failed', 'error')
            return
          }
          const dl = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = dl
          a.download = 'que-export.png'
          a.click()
          URL.revokeObjectURL(dl)
          pushToast('Downloaded que-export.png', 'success')
        }, 'image/png')
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        pushToast('PNG export failed', 'error')
      }
      img.src = url
      return
    }

    // PDF — open printable JSON summary via print dialog
    const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
    if (!w) {
      pushToast('Allow pop-ups to export PDF', 'error')
      return
    }
    w.document.write(`<!doctype html><html><head><title>Que export</title>
      <style>
        body{font-family:Inter,system-ui,sans-serif;background:#031427;color:#d3e4fe;padding:24px}
        h1{font-family:Inter,system-ui,sans-serif;color:#7bd0ff}
        pre{white-space:pre-wrap;font-size:11px;border:1px solid #45464d;padding:16px}
      </style></head><body>
      <h1>Que schema export</h1>
      <p>${payload.tables.length} tables · ${payload.relationships.length} relationships</p>
      <pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
      <script>window.onload=()=>setTimeout(()=>window.print(),200)<\\/script>
      </body></html>`)
    w.document.close()
    pushToast('Print dialog opened for PDF', 'info')
  }

  const defaultTopBar = (
    <TopBar
      visibleTableCount={visibleTables.length}
      visibleRelationshipCount={visibleRelationships.length}
      searchQuery={filters.searchQuery}
      filters={filters}
      onSearchChange={(query) => setFilters({ ...filters, searchQuery: query })}
      onFiltersChange={setFilters}
      onExport={handleExport}
    />
  )

  const defaultCanvas = (
    <MainCanvas
      tables={tables}
      relationships={relationships}
      miniMap={miniMap}
      filters={filters}
      readOnly={readOnly}
      selectedTableId={selection.tableId}
      selectedColumnId={selection.columnId}
      onTableSelect={selectTable}
      onColumnSelect={(tableId, columnId) => {
        selectTable(tableId)
        selectColumn(columnId)
      }}
      onDiagramAction={handleDiagramAction}
      onPromoteRelationship={onPromoteRelationship}
      onRejectRelationship={onRejectRelationship}
      onOpenStitchSession={onOpenStitchSession}
      stitchSessionLabel={stitchSessionLabel}
    />
  )

  const defaultRightSidebar = (
    <RightSidebar
      table={selectedTable}
      selectedColumnId={selection.columnId}
      onClose={() => {
        selectTable(null)
        setShowRightSidebar(false)
      }}
      onSelectColumn={selectColumn}
      onAddToJob={() => {
        if (!selectedTable) return
        if (!onCreateStitchJob) {
          pushToast('Create stitch job requires member access', 'info')
          return
        }
        // Include this table + neighbors linked by accepted/suggested edges
        const neighborIds = new Set<string>([selectedTable.id])
        for (const r of relationships) {
          if (r.fromTableId === selectedTable.id) neighborIds.add(r.toTableId)
          if (r.toTableId === selectedTable.id) neighborIds.add(r.fromTableId)
        }
        const names = tables
          .filter((t) => neighborIds.has(t.id))
          .map((t) => t.name)
        void onCreateStitchJob(names)
      }}
      onPreviewData={() => pushToast('Preview — metadata samples only (coming soon)', 'info')}
      onShowLineage={() => pushToast('Lineage view — coming soon', 'info')}
    />
  )

  return (
    <div
      data-layout="main-diagram"
      className={`relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-canvas ${className}`}
    >
      <div data-slot="top-bar">{topBar ?? defaultTopBar}</div>
      {statusBanner ? (
        <div className="shrink-0 border-b border-error/30 bg-error-container px-md py-xs text-center font-label text-[10px] tracking-widest text-error">
          {statusBanner}
          {onDismissBanner ? (
            <button
              type="button"
              className="ml-md underline"
              onClick={onDismissBanner}
            >
              dismiss
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        data-slot="diagram-body"
        className="flex min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
      >
        <div className="flex h-full min-w-[720px] flex-1 md:min-w-[960px]">
          {leftSidebar ? (
            <div data-slot="left-sidebar" className="relative z-10">
              {leftSidebar}
            </div>
          ) : null}

          <div
            data-slot="main-canvas"
            className="relative flex min-h-0 min-w-0 flex-1"
          >
            {mainCanvas ?? defaultCanvas}
          </div>

          {showRight ? (
            <div data-slot="right-sidebar" className="relative z-20">
              {rightSidebar ?? defaultRightSidebar}
            </div>
          ) : null}
        </div>
      </div>

      <IdeStatusBar
        extra={`${visibleTables.length} tables · ${visibleRelationships.length} edges${fromApi ? ' · live' : ' · demo'}`}
      />
    </div>
  )
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildExportSvg(
  tables: {
    id: string
    name: string
    position: { x: number; y: number }
  }[],
  relationships: {
    fromTableId: string
    toTableId: string
  }[],
) {
  const byId = new Map(tables.map((t) => [t.id, t]))
  const width = 1600
  const height = 1000
  const nodes = tables
    .map((t) => {
      const x = t.position?.x ?? 40
      const y = t.position?.y ?? 40
      return `<rect x="${x}" y="${y}" width="220" height="56" rx="4" fill="#0b1c30" stroke="#7bd0ff" stroke-width="1.5"/>
      <text x="${x + 12}" y="${y + 34}" fill="#d3e4fe" font-family="Inter,sans-serif" font-size="13">${escapeHtml(t.name)}</text>`
    })
    .join('\n')
  const edges = relationships
    .map((r) => {
      const a = byId.get(r.fromTableId)
      const b = byId.get(r.toTableId)
      if (!a || !b) return ''
      const x1 = (a.position?.x ?? 0) + 110
      const y1 = (a.position?.y ?? 0) + 28
      const x2 = (b.position?.x ?? 0) + 110
      const y2 = (b.position?.y ?? 0) + 28
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#64748b" stroke-width="1.5"/>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="100%" height="100%" fill="#020617"/>
${edges}
${nodes}
</svg>`
}
