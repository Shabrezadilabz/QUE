import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import {
  fetchColumnLineage,
  fetchWorkspaceLineage,
  type ColumnLineageResult,
  type LineagePath,
  type WorkspaceLineage,
} from '@/services/stitchApi'

/**
 * Wave 3.4 + Phase 4 — Lineage lite + multi-hop column lineage.
 */
export function LineagePage() {
  const [data, setData] = useState<WorkspaceLineage | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [colTable, setColTable] = useState('')
  const [colColumn, setColColumn] = useState('')
  const [colLineage, setColLineage] = useState<ColumnLineageResult | null>(null)
  const [colBusy, setColBusy] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchWorkspaceLineage({ limit: 40 })
      setData(next)
      setSelectedId((prev) => {
        if (prev && next.paths.some((p) => p.job.id === prev)) return prev
        return next.paths[0]?.job.id ?? null
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const selected: LineagePath | null =
    data?.paths.find((p) => p.job.id === selectedId) ?? null

  return (
    <QueAppChrome eyebrow="LINEAGE LITE · METADATA ONLY">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F2EDE4]">
        <div className="shrink-0 border-b border-outline-variant/20 bg-white px-lg py-md">
          <div className="flex flex-wrap items-start justify-between gap-md">
            <div>
              <h1 className="font-headline text-lg font-semibold text-on-surface">
                Lineage
              </h1>
              <p className="mt-1 max-w-[40rem] font-body text-[13px] text-on-surface-variant">
                Sources → promoted joins → stitch jobs → attested export or
                customer warehouse objects. Phase 4 adds multi-hop column hops
                from joins + dbt/BI/catalog metadata.
              </p>
            </div>
            <div className="flex flex-wrap gap-sm">
              <Link
                to="/catalog"
                className="rounded-lg border border-outline-variant/40 px-md py-1.5 font-label text-[12px] text-on-surface-variant hover:border-primary hover:text-primary"
              >
                Catalog
              </Link>
              <button
                type="button"
                onClick={() => void reload()}
                disabled={loading}
                className="rounded-lg border border-outline-variant/40 px-md py-1.5 font-label text-[12px] text-on-surface-variant hover:border-primary hover:text-primary disabled:opacity-40"
              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="mt-md rounded-xl border border-outline-variant/20 bg-[#FBF8F4] p-md">
            <p className="font-label text-[11px] uppercase tracking-widest text-on-surface-variant">
              Column lineage (multi-hop)
            </p>
            <div className="mt-sm flex flex-wrap items-end gap-sm">
              <label className="block">
                <span className="mb-1 block font-label text-[10px] text-on-surface-variant">
                  Table
                </span>
                <input
                  value={colTable}
                  onChange={(e) => setColTable(e.target.value)}
                  placeholder="orders"
                  className="rounded-lg border border-outline-variant/40 bg-white px-sm py-1.5 font-body text-[12px]"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-label text-[10px] text-on-surface-variant">
                  Column
                </span>
                <input
                  value={colColumn}
                  onChange={(e) => setColColumn(e.target.value)}
                  placeholder="customer_id"
                  className="rounded-lg border border-outline-variant/40 bg-white px-sm py-1.5 font-body text-[12px]"
                />
              </label>
              <button
                type="button"
                disabled={colBusy || !colTable.trim()}
                onClick={() => {
                  setColBusy(true)
                  fetchColumnLineage({
                    table: colTable.trim(),
                    column: colColumn.trim() || undefined,
                    direction: 'both',
                    maxHops: 4,
                  })
                    .then(setColLineage)
                    .catch((e) =>
                      setError(e instanceof Error ? e.message : String(e)),
                    )
                    .finally(() => setColBusy(false))
                }}
                className="rounded-lg bg-primary px-md py-1.5 font-label text-[12px] text-on-primary disabled:opacity-40"
              >
                {colBusy ? 'Tracing…' : 'Trace'}
              </button>
            </div>
            {colLineage ? (
              <div className="mt-sm grid gap-sm sm:grid-cols-2">
                <div>
                  <p className="font-label text-[10px] uppercase text-on-surface-variant">
                    Upstream · {colLineage.upstream?.nodes?.length || 0}
                  </p>
                  <ul className="mt-1 max-h-28 overflow-y-auto font-mono text-[11px] text-on-surface">
                    {(colLineage.upstream?.nodes || []).slice(0, 20).map((n) => (
                      <li key={`u-${n.key}`}>
                        {n.key}
                        {n.hop != null ? ` · hop ${n.hop}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-label text-[10px] uppercase text-on-surface-variant">
                    Downstream · {colLineage.downstream?.nodes?.length || 0}
                  </p>
                  <ul className="mt-1 max-h-28 overflow-y-auto font-mono text-[11px] text-on-surface">
                    {(colLineage.downstream?.nodes || [])
                      .slice(0, 20)
                      .map((n) => (
                        <li key={`d-${n.key}`}>
                          {n.key}
                          {n.hop != null ? ` · hop ${n.hop}` : ''}
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>

          {data ? (
            <div className="mt-md flex flex-wrap gap-md font-body text-[13px] text-on-surface-variant">
              <span>
                <strong className="text-on-surface">{data.summary.sources}</strong>{' '}
                sources
              </span>
              <span>
                <strong className="text-on-surface">
                  {data.summary.acceptedJoins}
                </strong>{' '}
                joins
              </span>
              <span>
                <strong className="text-on-surface">{data.summary.jobs}</strong>{' '}
                jobs
              </span>
              <span>
                <strong className="text-on-surface">
                  {data.summary.exported}
                </strong>{' '}
                exported
              </span>
              <span>
                <strong className="text-on-surface">
                  {data.summary.materialized}
                </strong>{' '}
                materialized
              </span>
              <span>
                <strong className="text-tertiary">
                  {data.summary.completePaths}
                </strong>{' '}
                complete paths
              </span>
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="px-lg py-sm font-body text-[13px] text-error">{error}</p>
        ) : null}

        <div className="mx-auto grid min-h-0 w-full max-w-[72rem] flex-1 gap-md overflow-hidden p-lg lg:grid-cols-[minmax(0,20rem)_1fr]">
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-outline-variant/20 bg-white">
            <div className="shrink-0 border-b border-outline-variant/15 px-md py-sm">
              <h2 className="font-label text-[11px] font-semibold tracking-[0.12em] text-on-surface-variant uppercase">
                Job paths
              </h2>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {!data?.paths.length && !loading ? (
                <li className="px-md py-md font-body text-[13px] text-on-surface-variant">
                  No jobs yet. Create a stitch job from promoted joins to see
                  lineage paths.
                </li>
              ) : null}
              {data?.paths.map((p) => (
                <li key={p.job.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.job.id)}
                    className={`flex w-full flex-col gap-1 border-b border-outline-variant/10 px-md py-sm text-left hover:bg-[#FBF8F4] ${
                      selectedId === p.job.id ? 'bg-primary/5' : ''
                    }`}
                  >
                    <span className="truncate font-label text-[13px] font-semibold text-on-surface">
                      {p.job.title}
                    </span>
                    <span className="font-body text-[11px] text-on-surface-variant">
                      {p.job.status}
                      {p.complete ? ' · complete' : ' · in progress'}
                    </span>
                    <StageDots stages={p.stages} />
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <main className="min-h-0 overflow-y-auto rounded-xl border border-outline-variant/20 bg-white p-md">
            {!selected ? (
              <p className="font-body text-[13px] text-on-surface-variant">
                Select a job path to inspect Sources → Joins → Job → Export /
                table.
              </p>
            ) : (
              <PathDetail path={selected} />
            )}
          </main>
        </div>
      </div>
    </QueAppChrome>
  )
}

function StageDots({
  stages,
}: {
  stages: LineagePath['stages']
}) {
  return (
    <span className="mt-1 flex items-center gap-1">
      {stages.map((s, i) => (
        <span key={s.key} className="flex items-center gap-1">
          <span
            className={`h-2 w-2 rounded-full ${
              s.ready ? 'bg-tertiary' : 'bg-outline-variant/40'
            }`}
            title={`${s.label}: ${s.count}`}
          />
          {i < stages.length - 1 ? (
            <span className="h-px w-2 bg-outline-variant/40" />
          ) : null}
        </span>
      ))}
    </span>
  )
}

function PathDetail({ path }: { path: LineagePath }) {
  return (
    <div className="space-y-md">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <h2 className="font-headline text-base font-semibold text-on-surface">
            {path.job.title}
          </h2>
          <p className="mt-1 font-body text-[12px] text-on-surface-variant">
            Status {path.job.status}
            {path.job.updatedAt
              ? ` · updated ${new Date(path.job.updatedAt).toLocaleString()}`
              : ''}
          </p>
        </div>
        <Link
          to={`/jobs/${path.job.id}/deploy`}
          className="rounded-lg border border-primary/30 bg-primary/5 px-md py-1.5 font-label text-[12px] text-primary hover:bg-primary/10"
        >
          Open Deploy
        </Link>
      </div>

      <ol className="space-y-md">
        <StageCard
          step={1}
          title="Sources"
          ready={path.stages[0]?.ready}
          action={
            <Link to="/sources" className="font-label text-[11px] text-primary underline">
              Sources
            </Link>
          }
        >
          {path.sources.length === 0 ? (
            <p className="font-body text-[12px] text-on-surface-variant">
              No sources linked on this job yet.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-xs">
              {path.sources.map((s) => (
                <li
                  key={`${s.id || s.name}`}
                  className="rounded-md border border-outline-variant/30 bg-[#FBF8F4] px-2 py-0.5 font-body text-[11px] text-on-surface"
                >
                  {s.name}
                  {s.type ? ` · ${s.type}` : ''}
                </li>
              ))}
            </ul>
          )}
        </StageCard>

        <StageCard
          step={2}
          title="Promoted joins"
          ready={path.stages[1]?.ready}
          action={
            <Link to="/joins" className="font-label text-[11px] text-primary underline">
              Join Review
            </Link>
          }
        >
          {path.joins.length === 0 ? (
            <p className="font-body text-[12px] text-on-surface-variant">
              No frozen / accepted joins on this job.
            </p>
          ) : (
            <ul className="space-y-xs">
              {path.joins.map((j, i) => (
                <li
                  key={j.id || `${j.label}-${i}`}
                  className="rounded-lg border border-outline-variant/20 bg-[#FBF8F4] px-sm py-1.5 font-body text-[12px] text-on-surface"
                >
                  {j.label}
                  {j.frozen ? (
                    <span className="ml-sm font-label text-[10px] tracking-wider text-tertiary uppercase">
                      frozen
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </StageCard>

        <StageCard step={3} title="Stitch job" ready>
          <p className="font-body text-[12px] text-on-surface-variant">
            Tables:{' '}
            {path.tables.length
              ? path.tables.join(', ')
              : '—'}
          </p>
        </StageCard>

        <StageCard
          step={4}
          title="Export / warehouse object"
          ready={path.stages[3]?.ready}
          action={
            <Link
              to="/verify"
              className="font-label text-[11px] text-primary underline"
            >
              Verify
            </Link>
          }
        >
          {!path.export && path.materializations.length === 0 ? (
            <p className="font-body text-[12px] text-on-surface-variant">
              Not shipped yet — export an attested pack or materialize a view /
              table from Deploy.
            </p>
          ) : null}
          {path.export ? (
            <div className="mb-sm rounded-lg border border-primary/20 bg-primary/5 px-sm py-sm">
              <p className="font-label text-[11px] font-semibold text-primary uppercase">
                Latest export · {path.export.format}
              </p>
              <p className="mt-1 font-mono text-[11px] text-on-surface-variant">
                {path.export.fingerprint?.slice(0, 16) || path.export.id}
              </p>
              <p className="mt-1 font-body text-[11px] text-on-surface-variant">
                {new Date(path.export.createdAt).toLocaleString()}
              </p>
              {path.export.githubPrUrl ? (
                <a
                  href={path.export.githubPrUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate font-body text-[12px] text-primary underline"
                >
                  {path.export.githubPrUrl}
                </a>
              ) : null}
            </div>
          ) : null}
          {path.materializations.map((m) => (
            <div
              key={m.id}
              className="mb-xs rounded-lg border border-tertiary/25 bg-tertiary/5 px-sm py-sm"
            >
              <p className="font-label text-[11px] font-semibold text-tertiary uppercase">
                Materialized {m.kind}
              </p>
              <p className="mt-1 font-mono text-[12px] text-on-surface">
                {m.qualifiedName}
              </p>
              <p className="mt-1 font-body text-[11px] text-on-surface-variant">
                {new Date(m.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
          {path.artifacts.length > 0 ? (
            <div className="mt-sm">
              <p className="mb-xs font-label text-[10px] tracking-wider text-on-surface-variant uppercase">
                Signed artifacts
              </p>
              <ul className="space-y-xs">
                {path.artifacts.map((a) => (
                  <li
                    key={a.id}
                    className="font-body text-[12px] text-on-surface-variant"
                  >
                    {a.format} · {a.active ? 'active' : 'inactive'} ·{' '}
                    {a.downloadCount} downloads
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </StageCard>
      </ol>
    </div>
  )
}

function StageCard({
  step,
  title,
  ready,
  action,
  children,
}: {
  step: number
  title: string
  ready?: boolean
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <li className="relative rounded-xl border border-outline-variant/20 bg-[#FBF8F4] p-md">
      <div className="mb-sm flex items-center justify-between gap-sm">
        <div className="flex items-center gap-sm">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full font-label text-[11px] font-bold ${
              ready
                ? 'bg-tertiary/15 text-tertiary'
                : 'bg-outline-variant/20 text-on-surface-variant'
            }`}
          >
            {step}
          </span>
          <h3 className="font-label text-[12px] font-semibold tracking-wide text-on-surface uppercase">
            {title}
          </h3>
        </div>
        {action}
      </div>
      {children}
    </li>
  )
}

export default LineagePage
