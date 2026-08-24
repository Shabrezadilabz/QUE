import { useEffect, useState } from 'react'
import type { DataSource } from '@/types/dataSource'
import type { StitchJob } from '@/services/stitchApi'
import {
  fetchWorkspaceSources,
  fetchMaterializations,
  materializeJob,
} from '@/services/stitchApi'

type Props = {
  job: StitchJob
  canWrite: boolean
  busy: boolean
  onBusy: (v: boolean) => void
  onError: (message: string) => void
  onToast: (message: string) => void
  /** When true, omit outer section chrome (used inside destination picker). */
  embedded?: boolean
}

const LIVE_TYPES = new Set(['postgresql', 'databricks', 'snowflake'])

/**
 * Wave 3.1 — opt-in CTAS/VIEW in the customer warehouse (not Que lake).
 */
export function MaterializePanel({
  job,
  canWrite,
  busy,
  onBusy,
  onError,
  onToast,
  embedded = false,
}: Props) {
  const [sources, setSources] = useState<DataSource[]>([])
  const [connectionId, setConnectionId] = useState('')
  const [kind, setKind] = useState<'view' | 'table'>('view')
  const [objectName, setObjectName] = useState('')
  const [schema, setSchema] = useState('')
  const [replace, setReplace] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [planned, setPlanned] = useState<
    { id: string; connectionName: string | null; createdAt: string }[]
  >([])

  useEffect(() => {
    let cancelled = false
    void fetchMaterializations({ jobId: job.id, limit: 10 })
      .then((events) => {
        if (cancelled) return
        setPlanned(
          events
            .filter((e) => e.status === 'planned')
            .map((e) => ({
              id: e.id,
              connectionName: e.connectionName,
              createdAt: e.createdAt,
            })),
        )
      })
      .catch(() => {
        if (!cancelled) setPlanned([])
      })
    return () => {
      cancelled = true
    }
  }, [job.id])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await fetchWorkspaceSources()
        if (cancelled) return
        const live = list.filter((s) => LIVE_TYPES.has(s.type))
        setSources(live)
        setConnectionId((prev) => prev || live[0]?.id || '')
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [job.id])

  async function onMaterialize() {
    if (!canWrite) return
    onBusy(true)
    onError('')
    try {
      const result = await materializeJob(job.id, {
        confirm: true,
        connectionId: connectionId || undefined,
        kind,
        objectName: objectName.trim() || undefined,
        schema: schema.trim() || undefined,
        replace: kind === 'table' ? replace : false,
      })
      onToast(
        `Materialized ${result.materialization.kind} ${result.materialization.qualifiedName} on ${result.materialization.connectionName}`,
      )
      setConfirm(false)
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      onBusy(false)
    }
  }

  const body = (
    <>
      {!embedded ? (
        <>
          <h3 className="font-label text-[11px] font-semibold tracking-[0.12em] text-secondary uppercase">
            Materialize · customer warehouse
          </h3>
          <p className="mt-xs max-w-[42rem] font-body text-[12px] leading-relaxed text-on-surface-variant">
            Create a view or table in their Postgres / Databricks / Snowflake.
            Que keeps metadata only — not a Que-hosted lake.
          </p>
        </>
      ) : (
        <p className="max-w-[42rem] font-body text-[12px] leading-relaxed text-on-surface-variant">
          Runs CREATE in the selected customer warehouse with their credentials.
          Result rows stay there — Que stores audit metadata only.
        </p>
      )}

      {planned.length > 0 ? (
        <div className="mt-md rounded-lg border border-secondary/30 bg-secondary/5 px-md py-sm">
          <p className="font-label text-[11px] font-semibold text-secondary">
            Sync queued materialize ({planned.length})
          </p>
          <p className="mt-1 font-body text-[12px] text-on-surface-variant">
            Source sync planned CTAS/VIEW for this job — review SQL, pick destination,
            then confirm below (no silent DDL).
          </p>
          <ul className="mt-sm space-y-1 font-body text-[11px] text-on-surface-variant">
            {planned.map((p) => (
              <li key={p.id}>
                · {p.connectionName || 'connection'} ·{' '}
                {new Date(p.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!sources.length ? (
        <p className="mt-md font-body text-[12px] text-on-surface-variant">
          Add a PostgreSQL, Databricks (live), or Snowflake connection in
          Sources to materialize.
        </p>
      ) : (
        <div className="mt-md grid gap-sm sm:grid-cols-2">
          <label className="block">
            <span className="font-label text-[10px] tracking-wider text-on-surface-variant uppercase">
              Destination connection
            </span>
            <select
              disabled={!canWrite || busy}
              value={connectionId}
              onChange={(e) => setConnectionId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-outline-variant/40 bg-surface-container px-sm py-1.5 font-body text-[13px] disabled:opacity-40"
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.type}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-label text-[10px] tracking-wider text-on-surface-variant uppercase">
              Object kind
            </span>
            <select
              disabled={!canWrite || busy}
              value={kind}
              onChange={(e) =>
                setKind(e.target.value === 'table' ? 'table' : 'view')
              }
              className="mt-1 w-full rounded-lg border border-outline-variant/40 bg-surface-container px-sm py-1.5 font-body text-[13px] disabled:opacity-40"
            >
              <option value="view">View (CREATE OR REPLACE)</option>
              <option value="table">Table (CTAS)</option>
            </select>
          </label>
          <label className="block">
            <span className="font-label text-[10px] tracking-wider text-on-surface-variant uppercase">
              Schema (optional)
            </span>
            <input
              disabled={!canWrite || busy}
              value={schema}
              onChange={(e) => setSchema(e.target.value)}
              placeholder="public / PUBLIC"
              className="mt-1 w-full rounded-lg border border-outline-variant/40 bg-surface-container px-sm py-1.5 font-body text-[13px] disabled:opacity-40"
            />
          </label>
          <label className="block">
            <span className="font-label text-[10px] tracking-wider text-on-surface-variant uppercase">
              Object name (optional)
            </span>
            <input
              disabled={!canWrite || busy}
              value={objectName}
              onChange={(e) => setObjectName(e.target.value)}
              placeholder="que_job_…"
              className="mt-1 w-full rounded-lg border border-outline-variant/40 bg-surface-container px-sm py-1.5 font-body text-[13px] disabled:opacity-40"
            />
          </label>
        </div>
      )}

      {kind === 'table' && canWrite ? (
        <label className="mt-sm flex items-center gap-sm font-body text-[12px] text-on-surface-variant">
          <input
            type="checkbox"
            checked={replace}
            disabled={busy}
            onChange={(e) => setReplace(e.target.checked)}
          />
          Replace existing table (DROP IF EXISTS before CTAS)
        </label>
      ) : null}

      {canWrite && sources.length > 0 ? (
        <div className="mt-md space-y-sm">
          <label className="flex items-start gap-sm font-body text-[12px] text-on-surface">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirm}
              disabled={busy}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            <span>
              I confirm Que may run CREATE in the selected customer warehouse.
              Result rows stay there — not in Que.
            </span>
          </label>
          <button
            type="button"
            disabled={busy || !confirm}
            onClick={() => void onMaterialize()}
            className="rounded bg-secondary px-md py-2 font-label text-[12px] font-semibold text-on-secondary disabled:opacity-40"
          >
            {busy ? 'Materializing…' : `Create ${kind} in warehouse`}
          </button>
        </div>
      ) : null}
    </>
  )

  if (embedded) return <div>{body}</div>

  return (
    <section className="rounded-xl border border-secondary/30 bg-surface-container-low p-md lg:col-span-2">
      {body}
    </section>
  )
}
