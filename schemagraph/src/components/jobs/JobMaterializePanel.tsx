import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchMaterializations,
  fetchWorkspaceSettings,
  materializeJob,
  type JobMaterializationResult,
  type JobRun,
} from '@/services/stitchApi'

type Props = {
  jobId: string
  jobTitle: string
  canWrite: boolean
  latestRun: JobRun | null
}

function slugObjectName(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48) || 'que_mart'
  )
}

/**
 * Phase 3.3 — one-click materialize from job results + graph refresh banner.
 */
export function JobMaterializePanel({
  jobId,
  jobTitle,
  canWrite,
  latestRun,
}: Props) {
  const [enabled, setEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<JobMaterializationResult | null>(null)
  const [objectName, setObjectName] = useState(() => slugObjectName(jobTitle))
  const [kind, setKind] = useState<'table' | 'view'>('view')

  const runOk = latestRun?.status === 'succeeded'

  const reload = useCallback(async () => {
    try {
      const ws = await fetchWorkspaceSettings()
      setEnabled(ws.settings?.enableMaterialize !== false)
      const mats = await fetchMaterializations({ jobId, limit: 1 })
      if (mats[0]) {
        setResult({
          ok: true,
          materialization: {
            id: mats[0].id,
            kind: mats[0].kind as 'table' | 'view',
            qualifiedName: mats[0].qualifiedName,
            connectionName: mats[0].connectionName,
            engine: mats[0].engine,
            durationMs: 0,
            createdAt: mats[0].createdAt,
          },
        } as JobMaterializationResult)
      }
    } catch {
      /* optional */
    }
  }, [jobId])

  useEffect(() => {
    void reload()
  }, [reload])

  async function materialize() {
    if (!canWrite || !runOk || busy) return
    setBusy(true)
    setError(null)
    try {
      const out = await materializeJob(jobId, {
        confirm: true,
        objectName: objectName.trim() || slugObjectName(jobTitle),
        kind,
        replace: true,
      })
      setResult(out)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!enabled) {
    return (
      <section className="rounded-xl border border-outline-variant/25 bg-surface-container-low/60 p-md">
        <p className="font-label text-[11px] font-semibold text-on-surface">
          Materialize (disabled)
        </p>
        <p className="mt-1 font-body text-[12px] text-on-surface-variant">
          Enable materialize in Settings → Feature flags to write job SQL as a
          table/view in the customer warehouse.
        </p>
      </section>
    )
  }

  const graphOk = result?.graphRegistration?.registered === true
  const qualified =
    result?.materialization?.qualifiedName ||
    result?.graphRegistration?.name ||
    null

  return (
    <section className="rounded-xl border border-outline-variant/25 bg-surface-container-low p-md">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <p className="font-label text-[11px] font-semibold tracking-wide text-on-surface uppercase">
            Materialize to warehouse
          </p>
          <p className="mt-1 font-body text-[12px] text-on-surface-variant">
            HITL write — creates a {kind} from the job SQL in the customer
            warehouse. Que stores metadata only; rows stay in your warehouse.
          </p>
        </div>
        {qualified ? (
          <span className="rounded-md border border-tertiary/30 bg-tertiary/10 px-2 py-0.5 font-mono text-[10px] text-tertiary">
            {qualified}
          </span>
        ) : null}
      </div>

      {!runOk ? (
        <p className="mt-md font-body text-[12px] text-on-surface-variant">
          Run the job successfully first — then materialize appears here.
        </p>
      ) : (
        <div className="mt-md flex flex-wrap items-end gap-sm">
          <label className="block font-body text-[11px] text-on-surface-variant">
            Object name
            <input
              value={objectName}
              onChange={(e) => setObjectName(e.target.value)}
              disabled={!canWrite || busy}
              className="mt-1 block w-[180px] rounded-lg border border-outline-variant/40 bg-surface-container px-2 py-1.5 font-mono text-[12px] text-on-surface"
            />
          </label>
          <label className="block font-body text-[11px] text-on-surface-variant">
            Kind
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as 'table' | 'view')}
              disabled={!canWrite || busy}
              className="mt-1 block rounded-lg border border-outline-variant/40 bg-surface-container px-2 py-1.5 text-[12px] text-on-surface"
            >
              <option value="view">VIEW</option>
              <option value="table">TABLE</option>
            </select>
          </label>
          {canWrite ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void materialize()}
              className="rounded-lg bg-secondary px-md py-2 font-label text-[12px] font-semibold text-on-secondary disabled:opacity-40"
            >
              {busy ? 'Materializing…' : '▶ Materialize now'}
            </button>
          ) : null}
        </div>
      )}

      {error ? (
        <p className="mt-sm font-body text-[12px] text-error">{error}</p>
      ) : null}

      {graphOk ? (
        <div className="mt-md rounded-lg border border-[#7aecd0]/30 bg-[#7aecd0]/10 px-md py-sm">
          <p className="font-body text-[12px] text-[#7aecd0]">
            Graph updated — materialized object registered on workspace graph.
          </p>
          <Link
            to="/workspace"
            className="mt-1 inline-block font-label text-[11px] font-semibold text-[#7aecd0] underline"
          >
            Open workspace graph →
          </Link>
        </div>
      ) : result && !graphOk ? (
        <p className="mt-sm font-body text-[11px] text-on-surface-variant">
          Materialized — refresh the workspace graph if the new object is slow
          to appear.
          <Link to="/workspace" className="ml-1 text-secondary underline">
            View graph
          </Link>
        </p>
      ) : null}
    </section>
  )
}
