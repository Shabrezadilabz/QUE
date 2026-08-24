import { useEffect, useState } from 'react'
import { PdfGhostButton, PdfPrimaryButton } from '@/components/pdf/PdfUi'
import {
  generatePlaneSqlFromNlpApi,
  type PlaneNlpScope,
  type PlaneNlpToSqlResult,
} from '@/services/stitchApi'

const SCOPE_LABEL: Record<
  PlaneNlpScope,
  { label: string; hint: string; className: string }
> = {
  in_scope: {
    label: 'In scope',
    hint: 'Single-table or simple aggregate — safe to preview in Managed Plane.',
    className: 'pdf-badge pdf-badge-success',
  },
  complex: {
    label: 'Complex',
    hint: 'Multi-table or analytics — review SQL carefully; use AI Chat for join planning.',
    className: 'pdf-badge pdf-badge-warn',
  },
  blocked: {
    label: 'Blocked',
    hint: 'Read-only SELECT only — writes and unsafe SQL are not allowed.',
    className: 'pdf-badge pdf-badge-danger',
  },
}

interface PlaneNlpComposerProps {
  datasetId?: string | null
  datasetName?: string | null
  initialPrompt?: string | null
  onSqlGenerated: (result: PlaneNlpToSqlResult) => void
}

/** Bounded plane assistant — NLP to read-only SQL with scope badge. */
export function PlaneNlpComposer({
  datasetId,
  datasetName,
  initialPrompt,
  onSqlGenerated,
}: PlaneNlpComposerProps) {
  const [prompt, setPrompt] = useState(initialPrompt?.trim() ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<PlaneNlpToSqlResult | null>(null)

  useEffect(() => {
    if (initialPrompt?.trim()) {
      setPrompt(initialPrompt.trim())
    }
  }, [initialPrompt])

  async function generate() {
    const question = prompt.trim()
    if (!question || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await generatePlaneSqlFromNlpApi({
        question,
        datasetId: datasetId ?? null,
      })
      setLastResult(result)
      if (result.sql) {
        onSqlGenerated(result)
      } else {
        setError(result.explanation || 'No SQL generated')
      }
      window.dispatchEvent(new CustomEvent('que-plane-activity'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  const scopeMeta = lastResult ? SCOPE_LABEL[lastResult.scope] : null

  return (
    <div className="flex h-full flex-col gap-[10px] p-[12px]">
      <div className="flex flex-wrap items-start justify-between gap-[8px]">
        <div>
          <p className="text-[12px] font-semibold text-[var(--pdf-text-primary)]">
            Plane SSM — ask in plain language
          </p>
          <p className="mt-[2px] text-[11px] text-[var(--pdf-text-muted)]">
            Uses schema + managed dataset metadata only — never row payloads. Review SQL
            before Run preview.
          </p>
        </div>
        {scopeMeta && lastResult ? (
          <span className={scopeMeta.className} title={scopeMeta.hint}>
            {scopeMeta.label}
          </span>
        ) : null}
      </div>

      {datasetName ? (
        <p className="text-[11px] text-[var(--pdf-text-faint)]">
          Target: <span className="font-mono text-[var(--pdf-text-secondary)]">{datasetName}</span>
        </p>
      ) : (
        <p className="text-[11px] text-[var(--pdf-text-faint)]">
          Tip: select a managed dataset on the left to focus the draft.
        </p>
      )}

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void generate()
          }
        }}
        placeholder="e.g. Top 20 customers by order count, or count rows in this dataset"
        className="min-h-[120px] flex-1 resize-none rounded-[4px] border border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-input)] p-[10px] text-[13px] text-[var(--pdf-text-primary)] outline-none placeholder:text-[var(--pdf-text-faint)]"
      />

      {error ? (
        <p className="text-[11px] text-[var(--pdf-danger)]">{error}</p>
      ) : null}

      {lastResult?.explanation && !error ? (
        <p className="rounded-[4px] border border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-muted)] px-[10px] py-[8px] text-[11px] text-[var(--pdf-text-secondary)]">
          {lastResult.explanation}
          {lastResult.mode === 'llm' && lastResult.model ? (
            <span className="ml-1 text-[var(--pdf-text-faint)]">· {lastResult.model}</span>
          ) : (
            <span className="ml-1 text-[var(--pdf-text-faint)]">· heuristic</span>
          )}
        </p>
      ) : null}

      {lastResult?.scope === 'complex' ? (
        <p className="text-[10px] text-[var(--pdf-text-faint)]">
          Larger questions belong in Managed Plane or Jobs — AI Chat stays schema-only and
          cannot run this query.
        </p>
      ) : null}

      <div className="flex shrink-0 flex-wrap gap-[8px]">
        <PdfPrimaryButton type="button" disabled={busy || !prompt.trim()} onClick={() => void generate()}>
          {busy ? 'Generating…' : 'Generate SQL draft'}
        </PdfPrimaryButton>
        <PdfGhostButton type="button" disabled={!prompt.trim()} onClick={() => setPrompt('')}>
          Clear
        </PdfGhostButton>
        <span className="self-center text-[10px] text-[var(--pdf-text-faint)]">
          Ctrl+Enter to generate
        </span>
      </div>
    </div>
  )
}
