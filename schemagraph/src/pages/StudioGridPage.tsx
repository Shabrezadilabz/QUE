import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { PdfPageHeader, PdfGhostButton, PdfPrimaryButton } from '@/components/pdf/PdfUi'
import { PageAutofillBanner } from '@/components/autofill/PageAutofill'
import { usePageAutofill } from '@/hooks/usePageAutofill'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  compileQueExprApi,
  executeGridExploreApi,
  fetchGridExploreTables,
  fetchGridTableColumns,
  type GridExploreTable,
} from '@/services/stitchApi'

type CalcFormula = {
  id: string
  alias: string
  expr: string
}

type ColPick = {
  field: string
  alias: string
  agg: '' | 'sum' | 'count' | 'avg' | 'min' | 'max'
  visible: boolean
}

const AGG_OPTIONS = [
  { id: '', label: '—' },
  { id: 'sum', label: 'SUM' },
  { id: 'count', label: 'COUNT' },
  { id: 'avg', label: 'AVG' },
  { id: 'min', label: 'MIN' },
  { id: 'max', label: 'MAX' },
] as const

/** Sigma-class spreadsheet explore on Que Warehouse SQL. */
export function StudioGridPage() {
  const { canWrite } = useWorkspaceRole()
  const { page: autofillPage } = usePageAutofill('studio')
  const [tables, setTables] = useState<GridExploreTable[]>([])
  const [tableName, setTableName] = useState<string>('')
  const [columns, setColumns] = useState<ColPick[]>([])
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sortField, setSortField] = useState('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [formula, setFormula] = useState('')
  const [calcFormulas, setCalcFormulas] = useState<CalcFormula[]>([])
  const [formulaPreview, setFormulaPreview] = useState<string | null>(null)
  const [formulaError, setFormulaError] = useState<string | null>(null)
  const [sqlMode, setSqlMode] = useState(false)
  const [rawSql, setRawSql] = useState('')
  const [previewSql, setPreviewSql] = useState('')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [gridCols, setGridCols] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ rowCount: number; durationMs?: number } | null>(
    null,
  )

  const visibleCols = useMemo(
    () => columns.filter((c) => c.visible),
    [columns],
  )

  const reloadTables = useCallback(async () => {
    const items = await fetchGridExploreTables()
    setTables(items)
    if (!tableName && items[0]?.name) setTableName(items[0].name)
  }, [tableName])

  useEffect(() => {
    void reloadTables().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }, [reloadTables])

  useEffect(() => {
    if (!tableName) return
    void fetchGridTableColumns(tableName)
      .then((cols) =>
        setColumns(
          cols.map((c) => ({
            field: c.name,
            alias: c.name,
            agg: '' as ColPick['agg'],
            visible: true,
          })),
        ),
      )
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
    setFilters({})
    setSortField('')
    setCalcFormulas([])
    setFormula('')
    setFormulaPreview(null)
    setFormulaError(null)
  }, [tableName])

  const compileFormulaPreview = useCallback(async () => {
    if (!formula.trim()) {
      setFormulaPreview(null)
      setFormulaError(null)
      return null
    }
    try {
      const out = await compileQueExprApi({
        formula,
        table: tableName || undefined,
      })
      setFormulaPreview(out.previewSql || out.compiled.expr || null)
      setFormulaError(null)
      if (out.compiled.mode === 'sql' && out.compiled.sql) {
        setSqlMode(true)
        setRawSql(out.compiled.sql)
      }
      return out
    } catch (e) {
      setFormulaError(e instanceof Error ? e.message : String(e))
      setFormulaPreview(null)
      return null
    }
  }, [formula, tableName])

  const runGrid = useCallback(async () => {
    if (!tableName && !sqlMode) return
    setBusy(true)
    setError(null)
    try {
      const filterList = Object.entries(filters)
        .filter(([, v]) => v.trim())
        .map(([field, value]) => ({ field, op: 'contains', value }))
      const spec = sqlMode
        ? {
            sql: rawSql,
            filters: filterList,
            limit: 200,
          }
        : {
            table: tableName,
            columns: visibleCols.map((c) => ({
              field: c.field,
              alias: c.alias,
              ...(c.agg ? { agg: c.agg } : {}),
            })),
            formulas: calcFormulas.map((f) => ({
              id: f.id,
              alias: f.alias,
              expr: f.expr,
            })),
            ...(formula.trim() && visibleCols.length === 0
              ? { formula, formulaAlias: 'calc' }
              : {}),
            filters: filterList,
            orderBy: sortField
              ? { field: sortField, dir: sortDir }
              : undefined,
            limit: 200,
          }
      const result = await executeGridExploreApi(spec)
      setRows(result.rows)
      setGridCols(
        result.columns.length
          ? result.columns
          : result.rows[0]
            ? Object.keys(result.rows[0])
            : [],
      )
      setPreviewSql(result.sql)
      setMeta({ rowCount: result.rowCount, durationMs: result.durationMs })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [
    tableName,
    visibleCols,
    calcFormulas,
    formula,
    filters,
    sortField,
    sortDir,
    sqlMode,
    rawSql,
  ])

  const applyFormulaColumn = useCallback(async () => {
    if (!formula.trim() || !tableName) return
    const out = await compileFormulaPreview()
    if (!out || out.compiled.mode === 'sql') return
    const alias = `calc_${calcFormulas.length + 1}`
    setCalcFormulas((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        alias,
        expr: formula.trim().startsWith('=') ? formula.trim().slice(1) : formula.trim(),
      },
    ])
    setFormula('')
    setFormulaPreview(null)
  }, [formula, tableName, calcFormulas.length, compileFormulaPreview])

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  return (
    <QueAppChrome flush>
      <div className="flex h-full min-h-0 flex-col bg-[#111416]">
        <PdfPageHeader
          title={
            <span className="inline-flex items-center gap-[10px]">
              Grid Explore
              <span className="rounded border border-[#c3f400]/30 bg-[#c3f400]/10 px-[8px] py-[2px] font-mono text-[10px] uppercase tracking-wider text-[#c3f400]">
                Sigma mode
              </span>
            </span>
          }
          subtitle="Spreadsheet-style explore on live Que Warehouse SQL"
          actions={
            <div className="flex flex-wrap items-center gap-[8px]">
              <Link to="/bi">
                <PdfGhostButton type="button">Board studio</PdfGhostButton>
              </Link>
              <PdfPrimaryButton
                type="button"
                disabled={busy || (!tableName && !sqlMode)}
                onClick={() => void runGrid()}
              >
                {busy ? 'Running…' : '▶ Run in Warehouse'}
              </PdfPrimaryButton>
            </div>
          }
        />

        {autofillPage ? (
          <div className="shrink-0 px-[16px] pt-[8px]">
            <PageAutofillBanner page={autofillPage} compact />
          </div>
        ) : null}

        {/* QueExpr formula bar */}
        <div className="border-b border-[#2a2f33] bg-[#0d0f10] px-[16px] py-[8px]">
          <div className="flex flex-wrap items-center gap-[8px]">
            <span className="font-mono text-[11px] uppercase tracking-wider text-[#888]">
              QueExpr
            </span>
            <input
              className="min-w-[200px] flex-1 rounded border border-[#333] bg-[#1a1d1f] px-[10px] py-[6px] font-mono text-[13px] text-[#e8e8e8] outline-none focus:border-[#c3f400]"
              placeholder="=SUM(revenue) · =AVG(price) · or full SELECT …"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              onBlur={() => void compileFormulaPreview()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void compileFormulaPreview().then(() => void runGrid())
                }
              }}
              disabled={!canWrite}
            />
            <PdfGhostButton
              type="button"
              disabled={!canWrite || !formula.trim()}
              onClick={() => void compileFormulaPreview()}
            >
              Preview SQL
            </PdfGhostButton>
            <PdfGhostButton
              type="button"
              disabled={!canWrite || !formula.trim() || !tableName}
              onClick={() => void applyFormulaColumn()}
            >
              + Calc column
            </PdfGhostButton>
            <label className="flex items-center gap-[6px] text-[11px] text-[#aaa]">
              <input
                type="checkbox"
                checked={sqlMode}
                onChange={(e) => setSqlMode(e.target.checked)}
              />
              SQL editor
            </label>
          </div>
          {formulaError ? (
            <p className="mt-[6px] text-[11px] text-[#ff6b6b]">{formulaError}</p>
          ) : formulaPreview ? (
            <pre className="mt-[6px] max-h-[56px] overflow-auto font-mono text-[10px] text-[#7aecd0] whitespace-pre-wrap">
              {formulaPreview}
            </pre>
          ) : null}
          {calcFormulas.length > 0 ? (
            <div className="mt-[8px] flex flex-wrap gap-[6px]">
              {calcFormulas.map((f) => (
                <span
                  key={f.id}
                  className="inline-flex items-center gap-[6px] rounded-full border border-[#7aecd0]/30 bg-[#7aecd0]/10 px-[10px] py-[3px] font-mono text-[10px] text-[#7aecd0]"
                >
                  {f.alias} = {f.expr}
                  <button
                    type="button"
                    className="text-[#a3afbe] hover:text-[#ff6b6b]"
                    onClick={() =>
                      setCalcFormulas((prev) => prev.filter((x) => x.id !== f.id))
                    }
                    aria-label={`Remove ${f.alias}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {sqlMode && (
          <div className="border-b border-[#2a2f33] px-[16px] py-[8px]">
            <textarea
              className="h-[72px] w-full resize-y rounded border border-[#333] bg-[#1a1d1f] p-[10px] font-mono text-[12px] text-[#e8e8e8] outline-none focus:border-[#c3f400]"
              value={rawSql}
              onChange={(e) => setRawSql(e.target.value)}
              placeholder={`SELECT * FROM ${tableName || 'raw_your_table'} LIMIT 100`}
            />
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {/* Table picker */}
          <aside className="w-[220px] shrink-0 overflow-y-auto border-r border-[#2a2f33] bg-[#0d0f10] p-[12px]">
            <div className="mb-[8px] font-mono text-[10px] uppercase tracking-wider text-[#888]">
              Warehouse tables
            </div>
            {tables.length === 0 && (
              <p className="text-[12px] text-[#666]">
                No replicated tables yet. Sync a source from Load.
              </p>
            )}
            <ul className="flex flex-col gap-[4px]">
              {tables.map((t) => (
                <li key={t.name}>
                  <button
                    type="button"
                    className={`w-full rounded px-[8px] py-[6px] text-left text-[12px] ${
                      tableName === t.name
                        ? 'bg-[#c3f400]/15 text-[#c3f400]'
                        : 'text-[#ccc] hover:bg-[#1a1d1f]'
                    }`}
                    onClick={() => setTableName(t.name)}
                  >
                    <div className="truncate font-mono">{t.name}</div>
                    <div className="text-[10px] text-[#666]">
                      {t.rowCount.toLocaleString()} rows
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            {!sqlMode && calcFormulas.length > 0 && (
              <>
                <div className="mb-[8px] mt-[16px] font-mono text-[10px] uppercase tracking-wider text-[#888]">
                  Calc columns
                </div>
                <ul className="mb-[12px] flex flex-col gap-[4px]">
                  {calcFormulas.map((f) => (
                    <li
                      key={f.id}
                      className="rounded border border-[#7aecd0]/25 bg-[#7aecd0]/5 px-[8px] py-[6px] font-mono text-[10px] text-[#7aecd0]"
                    >
                      {f.alias}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {!sqlMode && columns.length > 0 && (
              <>
                <div className="mb-[8px] mt-[16px] font-mono text-[10px] uppercase tracking-wider text-[#888]">
                  Columns
                </div>
                <ul className="flex max-h-[240px] flex-col gap-[6px] overflow-y-auto">
                  {columns.map((c, i) => (
                    <li
                      key={c.field}
                      className="rounded border border-[#2a2f33] bg-[#1a1d1f] p-[6px]"
                    >
                      <label className="flex items-center gap-[6px] text-[11px]">
                        <input
                          type="checkbox"
                          checked={c.visible}
                          onChange={(e) => {
                            const next = [...columns]
                            next[i] = { ...c, visible: e.target.checked }
                            setColumns(next)
                          }}
                        />
                        <span className="truncate font-mono">{c.field}</span>
                      </label>
                      <select
                        className="mt-[4px] w-full rounded border border-[#333] bg-[#111] px-[4px] py-[2px] text-[10px]"
                        value={c.agg}
                        onChange={(e) => {
                          const next = [...columns]
                          next[i] = {
                            ...c,
                            agg: e.target.value as ColPick['agg'],
                          }
                          setColumns(next)
                        }}
                      >
                        {AGG_OPTIONS.map((o) => (
                          <option key={o.id || 'none'} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>

          {/* Grid */}
          <main className="flex min-w-0 flex-1 flex-col">
            {error && (
              <div className="border-b border-red-900/50 bg-red-950/30 px-[16px] py-[8px] text-[13px] text-red-300">
                {error}
              </div>
            )}

            {previewSql && (
              <div className="border-b border-[#2a2f33] bg-[#0d0f10] px-[16px] py-[6px]">
                <pre className="overflow-x-auto font-mono text-[11px] text-[#888] whitespace-pre-wrap">
                  {previewSql}
                </pre>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[640px] border-collapse text-[12px]">
                <thead className="sticky top-0 z-10 bg-[#1a1d1f]">
                  <tr>
                    {gridCols.map((col) => (
                      <th
                        key={col}
                        className="cursor-pointer border border-[#333] px-[10px] py-[8px] text-left font-mono text-[11px] uppercase tracking-wide text-[#c3f400]"
                        onClick={() => toggleSort(col)}
                      >
                        {col}
                        {sortField === col && (
                          <span className="ml-[4px] text-[#888]">
                            {sortDir === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {gridCols.map((col) => (
                      <th key={`f-${col}`} className="border border-[#333] p-[4px]">
                        <input
                          className="w-full rounded border border-[#444] bg-[#111] px-[6px] py-[4px] font-mono text-[11px] text-[#ccc]"
                          placeholder="filter…"
                          value={filters[col] || ''}
                          onChange={(e) =>
                            setFilters((f) => ({ ...f, [col]: e.target.value }))
                          }
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && !busy && (
                    <tr>
                      <td
                        colSpan={Math.max(gridCols.length, 1)}
                        className="border border-[#333] px-[16px] py-[32px] text-center text-[#666]"
                      >
                        Pick a table, add QueExpr calc columns or columns, then Run in Warehouse
                      </td>
                    </tr>
                  )}
                  {rows.map((row, ri) => (
                    <tr
                      key={ri}
                      className={ri % 2 === 0 ? 'bg-[#141618]' : 'bg-[#111416]'}
                    >
                      {gridCols.map((col) => (
                        <td
                          key={`${ri}-${col}`}
                          className="max-w-[280px] truncate border border-[#2a2f33] px-[10px] py-[6px] font-mono text-[#ddd]"
                          title={String(row[col] ?? '')}
                        >
                          {String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {meta && (
              <div className="border-t border-[#2a2f33] px-[16px] py-[8px] font-mono text-[11px] text-[#666]">
                {meta.rowCount} rows
                {meta.durationMs != null && ` · ${meta.durationMs}ms`}
                {' · que_warehouse'}
              </div>
            )}
          </main>
        </div>
      </div>
    </QueAppChrome>
  )
}
