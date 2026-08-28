import { useCallback, useEffect, useState } from 'react'
import { fetchQueMlForReport, type QueMlBoardBundle } from '@/services/stitchApi'
import { PdfGhostButton } from '@/components/pdf/PdfUi'

type Props = {
  reportId: string
}

/**
 * Studio v3 — QueML semantic YAML for the active board.
 */
export function StudioQueMlPanel({ reportId }: Props) {
  const [bundle, setBundle] = useState<QueMlBoardBundle | null>(null)
  const [expanded, setExpanded] = useState(false)

  const reload = useCallback(async () => {
    const b = await fetchQueMlForReport(reportId)
    setBundle(b)
  }, [reportId])

  useEffect(() => {
    void reload().catch(() => setBundle(null))
  }, [reload])

  if (!bundle) return null

  function downloadYaml() {
    if (!bundle) return
    const blob = new Blob([bundle.yaml], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `que-ml-${reportId}.yaml`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mt-[10px] rounded-[8px] border border-[#424850] bg-[#121619] p-[12px]">
      <div className="flex flex-wrap items-center justify-between gap-[8px]">
        <p className="text-[10px] font-bold tracking-[0.8px] text-[#8a9099] uppercase">
          QueML · {reportId}
        </p>
        <div className="flex gap-[6px]">
          <PdfGhostButton
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="px-[8px] py-[4px] text-[10px]"
          >
            {expanded ? 'Hide YAML' : 'Show YAML'}
          </PdfGhostButton>
          <PdfGhostButton
            type="button"
            onClick={downloadYaml}
            className="px-[8px] py-[4px] text-[10px]"
          >
            Download
          </PdfGhostButton>
        </div>
      </div>
      <p className="mt-[6px] text-[11px] text-[#a3afbe]">
        {bundle.dimensionCount} dimensions · {bundle.measureCount} measures ·{' '}
        {bundle.metricCount} certified metrics · {bundle.warehouseBound}/
        {bundle.chartCount} WH-bound
      </p>
      {bundle.warehouseUnbound > 0 ? (
        <p className="mt-[4px] text-[10px] text-[#f0a020]">
          {bundle.warehouseUnbound} visual(s) need sqlFallback or a certified dataset
        </p>
      ) : null}
      {expanded ? (
        <pre className="mt-[8px] max-h-[200px] overflow-auto rounded-[4px] border border-[#424850] bg-[#0f1215] p-[8px] font-mono text-[10px] text-[#c8cdd3]">
          {bundle.yaml}
        </pre>
      ) : null}
    </div>
  )
}
