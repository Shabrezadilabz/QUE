import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  apiFetch,
  createMetricApi,
  fetchManagedDatasets,
  fetchMetricLineage,
  fetchMetricsDefs,
  getActiveWorkspaceId,
  publishMetricBiApi,
} from '@/services/stitchApi'

/** Semantic metrics → certified BI path for DA self-serve. */
export function MetricsPage() {
  const { canWrite } = useWorkspaceRole()
  const [items, setItems] = useState<
    {
      id: string
      name: string
      expressionSql: string
      datasetId: string | null
      certified: boolean
      sourceColumnName?: string
      tags?: string[]
    }[]
  >([])
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([])
  const [name, setName] = useState('')
  const [expr, setExpr] = useState('COUNT(*)')
  const [datasetId, setDatasetId] = useState('')
  const [sourceColumn, setSourceColumn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [lineage, setLineage] = useState<{
    nodes: { id: string; kind: string; label: string }[]
    edges: { from: string; to: string; type: string }[]
  } | null>(null)

  async function reload() {
    const [m, d, lin] = await Promise.all([
      fetchMetricsDefs(),
      fetchManagedDatasets(),
      fetchMetricLineage(),
    ])
    setItems(m)
    setDatasets(
      d.items
        .filter((x) => x.certified)
        .map((x) => ({ id: x.id, name: x.name })),
    )
    if (!datasetId && d.items[0])
      setDatasetId(d.items.filter((x) => x.certified)[0]?.id || '')
    setLineage({ nodes: lin.nodes, edges: lin.edges })
  }

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }, [])

  async function create() {
    if (!canWrite || !name.trim()) return
    await createMetricApi({
      name: name.trim(),
      expressionSql: expr,
      datasetId: datasetId || null,
      sourceColumnName: sourceColumn || undefined,
      lineage: sourceColumn
        ? { tables: [], columns: [sourceColumn] }
        : undefined,
      tags: sourceColumn ? ['lineage-linked'] : [],
    })
    setName('')
    setSourceColumn('')
    await reload()
  }

  async function certify(id: string) {
    const ws = getActiveWorkspaceId()
    const res = await apiFetch(`/workspaces/${ws}/metrics-defs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ certified: true }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error || 'certify failed')
    }
    await reload()
  }

  async function previewMetric(id: string) {
    const ws = getActiveWorkspaceId()
    const res = await apiFetch(`/workspaces/${ws}/metrics-defs/${id}/preview`)
    const body = (await res.json().catch(() => ({}))) as {
      value?: unknown
      error?: string
    }
    if (!res.ok) throw new Error(body.error || 'preview failed')
    setPreview(String(body.value ?? '—'))
  }

  async function publish(id: string) {
    await publishMetricBiApi(id)
  }

  return (
    <QueAppChrome eyebrow="METRICS · SEMANTIC LAYER">
      <div className="mx-auto min-h-0 flex-1 overflow-y-auto px-md py-lg md:max-w-3xl md:px-lg">
        <h1 className="font-headline text-xl font-semibold">Metrics</h1>
        <p className="mt-xs text-[13px] text-on-surface-variant">
          Define metrics on certified managed datasets, preview values, publish
          as certified BI KPIs — DA self-serve without giving AI the rows.
        </p>
        <p className="mt-sm text-[12px]">
          Need data?{' '}
          <Link to="/managed" className="text-secondary underline">
            Managed datasets
          </Link>
        </p>
        {error ? (
          <p className="mt-md text-[13px] text-error">{error}</p>
        ) : null}
        {preview != null ? (
          <p className="mt-md rounded-lg bg-secondary/5 px-md py-sm text-[13px] text-secondary">
            Preview value: {preview}
          </p>
        ) : null}
        {canWrite ? (
          <div className="mt-lg grid gap-sm rounded-xl border border-outline-variant/30 bg-surface-container-low p-md">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Metric name"
              className="rounded-lg border border-outline-variant/40 px-md py-2 text-[13px]"
            />
            <input
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              placeholder="COUNT(*) | SUM(amount) | field"
              className="rounded-lg border border-outline-variant/40 px-md py-2 font-mono text-[13px]"
            />
            <select
              value={datasetId}
              onChange={(e) => setDatasetId(e.target.value)}
              className="rounded-lg border border-outline-variant/40 px-md py-2 text-[13px]"
            >
              <option value="">Dataset…</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <input
              value={sourceColumn}
              onChange={(e) => setSourceColumn(e.target.value)}
              placeholder="Source column (lineage-to-metric)"
              className="rounded-lg border border-outline-variant/40 px-md py-2 font-mono text-[13px]"
            />
            <button
              type="button"
              onClick={() => void create().catch((e) => setError(String(e.message || e)))}
              className="rounded bg-secondary px-md py-1.5 text-[12px] font-semibold text-on-secondary"
            >
              Create metric
            </button>
          </div>
        ) : null}
        {lineage && lineage.nodes.length > 0 ? (
          <section className="mt-lg rounded-xl border border-outline-variant/30 bg-surface-container-low p-md">
            <h2 className="font-headline text-base font-semibold">
              Metric lineage
            </h2>
            <p className="mt-xs text-[12px] text-on-surface-variant">
              {lineage.nodes.length} nodes · {lineage.edges.length} edges
              (metadata only)
            </p>
            <ul className="mt-md max-h-40 space-y-1 overflow-y-auto font-mono text-[11px] text-on-surface-variant">
              {lineage.edges.slice(0, 40).map((e, i) => (
                <li key={i}>
                  {e.from} —{e.type}→ {e.to}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <ul className="mt-lg space-y-sm">
          {items.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-md rounded-xl border border-outline-variant/30 bg-surface-container-low px-md py-md"
            >
              <div>
                <p className="font-label text-[13px] font-semibold">{m.name}</p>
                <p className="font-mono text-[11px] text-on-surface-variant">
                  {m.expressionSql} · {m.certified ? 'certified' : 'draft'}
                </p>
              </div>
              <div className="flex flex-wrap gap-sm">
                <button
                  type="button"
                  onClick={() =>
                    void previewMetric(m.id).catch((e) =>
                      setError(String(e.message || e)),
                    )
                  }
                  className="rounded border border-outline-variant px-sm py-1 text-[11px]"
                >
                  Preview
                </button>
                {canWrite && !m.certified ? (
                  <button
                    type="button"
                    onClick={() =>
                      void certify(m.id).catch((e) =>
                        setError(String(e.message || e)),
                      )
                    }
                    className="rounded border border-secondary px-sm py-1 text-[11px] text-secondary"
                  >
                    Certify
                  </button>
                ) : null}
                {canWrite && m.certified ? (
                  <button
                    type="button"
                    onClick={() =>
                      void publish(m.id)
                        .then(() => setPreview('Published to /bi'))
                        .catch((e) => setError(String(e.message || e)))
                    }
                    className="rounded bg-secondary px-sm py-1 text-[11px] text-on-secondary"
                  >
                    Publish BI
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </QueAppChrome>
  )
}

export default MetricsPage
