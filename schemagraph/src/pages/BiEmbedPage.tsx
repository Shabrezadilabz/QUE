import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BiChartPreview } from '@/components/BiChartPreview'
import { getApiBase } from '@/services/stitchApi'

type EmbedPayload = {
  chart?: {
    title?: string
    chartType?: string
    certified?: boolean
    config?: { xField?: string; yField?: string }
  }
  rows?: Record<string, unknown>[]
  error?: string
}

/**
 * Public certified BI embed viewer — token in URL, no workspace session.
 */
export function BiEmbedPage() {
  const { token } = useParams()
  const [data, setData] = useState<EmbedPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    void fetch(`${getApiBase()}/bi/embed/${encodeURIComponent(token)}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as EmbedPayload & {
          ok?: boolean
          error?: string
        }
        if (!res.ok) throw new Error(body.error || `embed ${res.status}`)
        setData(body)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [token])

  const chart = data?.chart
  const cfg = chart?.config || {}

  return (
    <div className="min-h-screen bg-canvas px-md py-lg md:px-lg">
      <div className="mx-auto max-w-3xl">
        <p className="font-label text-[11px] tracking-[0.2em] text-on-surface-variant uppercase">
          Que · certified embed
        </p>
        <h1 className="mt-sm font-headline text-2xl font-semibold text-on-surface">
          {error ? 'Embed unavailable' : chart?.title || 'Loading…'}
        </h1>
        {error ? (
          <p className="mt-md text-[13px] text-error">{error}</p>
        ) : null}
        {data && !error ? (
          <div className="mt-lg rounded-2xl border border-outline-variant/30 bg-white p-lg">
            <div className="mb-md flex flex-wrap items-center gap-sm text-[11px] text-on-surface-variant">
              <span className="rounded-full bg-secondary-container px-md py-0.5 font-label uppercase">
                {chart?.chartType || 'chart'}
              </span>
              {chart?.certified ? (
                <span className="rounded-full bg-primary/10 px-md py-0.5 font-label text-primary uppercase">
                  certified
                </span>
              ) : null}
            </div>
            <BiChartPreview
              chartType={String(chart?.chartType || 'table')}
              rows={data.rows || []}
              xField={cfg.xField}
              yField={cfg.yField}
            />
          </div>
        ) : null}
        <p className="mt-lg text-[11px] text-on-surface-variant">
          Read-only embed. Que does not expose managed row payloads to AI.
        </p>
      </div>
    </div>
  )
}

export default BiEmbedPage
