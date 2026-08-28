import { useState } from 'react'
import { compileQueExprApi } from '@/services/stitchApi'

type Props = {
  value: string
  xField?: string
  table?: string
  disabled?: boolean
  onChange: (expr: string) => void
  onApply: (expr: string, previewSql?: string | null) => void
}

/** Phase 4 — QueExpr formula bar (SUM/AVG/COUNT or full SELECT). */
export function StudioQueExprPanel({
  value,
  xField,
  table,
  disabled,
  onChange,
  onApply,
}: Props) {
  const [previewSql, setPreviewSql] = useState<string | null>(null)
  const [compileError, setCompileError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function compilePreview() {
    if (!value.trim()) {
      setPreviewSql(null)
      setCompileError(null)
      return
    }
    setBusy(true)
    setCompileError(null)
    try {
      const out = await compileQueExprApi({
        formula: value,
        xField: xField || undefined,
        table: table || undefined,
      })
      setPreviewSql(out.previewSql || null)
    } catch (e) {
      setCompileError(e instanceof Error ? e.message : String(e))
      setPreviewSql(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[4px] border border-solid border-[#424850] bg-[#121619] p-[10px]">
      <p className="text-[10px] font-bold tracking-[0.6px] text-[#8a9099] uppercase">
        QueExpr measure
      </p>
      <p className="mt-[4px] text-[9px] text-[#6b7380]">
        e.g. <span className="font-mono">SUM(revenue)</span>,{' '}
        <span className="font-mono">AVG(price)</span>, or full SELECT
      </p>
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => void compilePreview()}
        placeholder="=SUM(revenue)"
        className="mt-[8px] w-full rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] px-[8px] py-[7px] font-mono text-[11px] text-[#d4dbe3] placeholder:text-[#6b7380] disabled:opacity-50"
      />
      {compileError ? (
        <p className="mt-[6px] text-[10px] text-[#ff6b6b]">{compileError}</p>
      ) : null}
      {previewSql ? (
        <pre className="mt-[8px] max-h-[88px] overflow-auto whitespace-pre-wrap font-mono text-[9px] text-[#a3afbe]">
          {previewSql}
        </pre>
      ) : null}
      <div className="mt-[8px] flex flex-wrap gap-[6px]">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void compilePreview()}
          className="rounded border border-[#424850] px-[8px] py-[4px] text-[10px] text-[#a3afbe] hover:border-[#6b7380] disabled:opacity-40"
        >
          {busy ? 'Compiling…' : 'Preview SQL'}
        </button>
        <button
          type="button"
          disabled={disabled || !value.trim()}
          onClick={() => onApply(value.trim(), previewSql)}
          className="pdf-btn-primary px-[8px] py-[4px] text-[10px] disabled:opacity-40"
        >
          Apply measure
        </button>
      </div>
    </div>
  )
}
