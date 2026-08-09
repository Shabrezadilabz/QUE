import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type {
  JobContractStatus,
  StitchJob,
} from '@/services/stitchApi'
import {
  fetchJobContract,
  freezeJobContract,
  validateJobContract,
} from '@/services/stitchApi'

type Props = {
  job: StitchJob
  canWrite: boolean
  busy: boolean
  onJobUpdated: (job: StitchJob) => void
  onError: (message: string) => void
  onToast: (message: string) => void
}

/**
 * Wave 2.2 — Contract freeze panel: lock promoted joins for a job.
 */
export function ContractFreezePanel({
  job,
  canWrite,
  busy,
  onJobUpdated,
  onError,
  onToast,
}: Props) {
  const [status, setStatus] = useState<JobContractStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  async function reload() {
    setLoading(true)
    try {
      const data = await fetchJobContract(job.id)
      setStatus(data.status)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, job.updatedAt, job.contract?.frozenAt])

  async function onFreeze() {
    if (!canWrite) return
    setActing(true)
    try {
      const { job: next, status: st } = await freezeJobContract(job.id)
      setStatus(st)
      onJobUpdated(next)
      onToast(
        st.frozenJoinCount
          ? `Contract frozen · ${st.frozenJoinCount} join(s) locked`
          : 'Contract frozen · no accepted joins yet (schema tables pinned)',
      )
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setActing(false)
    }
  }

  async function onValidate() {
    setActing(true)
    try {
      const data = await validateJobContract(job.id)
      setStatus(data.status)
      if (data.validation.ok) {
        onToast('Contract valid against live schema')
      } else {
        onError(
          `Contract issues: ${data.validation.errors.slice(0, 3).join('; ')}`,
        )
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setActing(false)
    }
  }

  const disabled = busy || acting || loading

  return (
    <section className="rounded-xl border border-secondary/25 bg-surface-container-low p-md lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div>
          <h3 className="font-label text-[11px] tracking-[0.12em] text-secondary uppercase">
            Contract freeze
          </h3>
          <p className="mt-xs max-w-[40rem] font-body text-[12px] text-on-surface-variant">
            Wave 2.2 — lock promoted joins + schema snapshot for this job.
            Export uses the frozen contract, not live suggested edges.
          </p>
        </div>
        {status?.hasContract ? (
          <span
            className={[
              'rounded-full px-sm py-1 font-label text-[11px] font-semibold',
              status.stale || !status.validation.ok
                ? 'bg-error/10 text-error'
                : 'bg-tertiary/15 text-tertiary',
            ].join(' ')}
          >
            {status.stale
              ? 'Stale snapshot'
              : status.validation.ok
                ? 'Frozen'
                : 'Needs attention'}
          </span>
        ) : (
          <span className="rounded-full bg-secondary-container/60 px-sm py-1 font-label text-[11px] text-on-secondary-container">
            Not frozen
          </span>
        )}
      </div>

      {loading && !status ? (
        <p className="mt-md font-body text-[12px] text-on-surface-variant">
          Loading contract…
        </p>
      ) : status ? (
        <div className="mt-md space-y-md">
          <div className="grid gap-sm sm:grid-cols-4">
            <Metric
              label="Frozen joins"
              value={String(status.frozenJoinCount)}
            />
            <Metric
              label="Accepted available"
              value={String(status.acceptedJoinsAvailable)}
            />
            <Metric
              label="Unreviewed"
              value={String(status.unreviewedJoins)}
              warn={status.unreviewedJoins > 0}
            />
            <Metric
              label="Frozen at"
              value={
                status.frozenAt
                  ? new Date(status.frozenAt).toLocaleString()
                  : '—'
              }
            />
          </div>

          {status.unreviewedJoins > 0 ? (
            <p className="rounded-lg border border-secondary/25 bg-secondary/5 px-md py-sm font-body text-[12px] text-on-surface">
              {status.unreviewedJoins} suggested join(s) touch this job&apos;s
              tables.{' '}
              <Link to="/joins" className="font-semibold text-secondary underline">
                Review in Joins
              </Link>{' '}
              before freezing if you need them locked.
            </p>
          ) : null}

          {status.stale ? (
            <p className="rounded-lg border border-error/30 bg-error/5 px-md py-sm font-body text-[12px] text-error">
              Schema snapshot drifted since freeze — re-freeze to pin the latest
              metadata.
            </p>
          ) : null}

          {status.validation.errors.length > 0 ? (
            <ul className="space-y-xs rounded-lg border border-error/25 bg-error/5 px-md py-sm">
              {status.validation.errors.slice(0, 6).map((e) => (
                <li key={e} className="font-body text-[12px] text-error">
                  {e}
                </li>
              ))}
            </ul>
          ) : null}

          {status.validation.warnings.length > 0 ? (
            <ul className="space-y-xs rounded-lg border border-outline-variant/30 bg-surface-container px-md py-sm">
              {status.validation.warnings.slice(0, 4).map((w) => (
                <li
                  key={w}
                  className="font-body text-[12px] text-on-surface-variant"
                >
                  {w}
                </li>
              ))}
            </ul>
          ) : null}

          {status.joins && status.joins.length > 0 ? (
            <div>
              <h4 className="mb-sm font-label text-[11px] tracking-wider text-on-surface-variant uppercase">
                Locked joins · {status.joins.length}
              </h4>
              <ul className="max-h-40 space-y-xs overflow-y-auto">
                {status.joins.map((j) => (
                  <li
                    key={j.id}
                    className="rounded-md bg-secondary-container/40 px-2 py-1 font-body text-[12px] text-on-surface"
                  >
                    {j.fromTable}.{j.fromColumn}
                    {j.fromType ? (
                      <span className="text-on-surface-variant">
                        {' '}
                        ({j.fromType})
                      </span>
                    ) : null}
                    <span className="mx-1 text-on-surface-variant">→</span>
                    {j.toTable}.{j.toColumn}
                    {j.toType ? (
                      <span className="text-on-surface-variant">
                        {' '}
                        ({j.toType})
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="font-body text-[12px] text-on-surface-variant">
              No joins locked yet. Promote joins on{' '}
              <Link to="/joins" className="text-secondary underline">
                Join Review
              </Link>
              , then Freeze.
            </p>
          )}

          {status.claim ? (
            <p className="font-body text-[11px] italic text-on-surface-variant">
              {status.claim}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-sm">
            {canWrite ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => void onFreeze()}
                className="rounded bg-secondary px-md py-2 font-label text-[12px] font-semibold text-on-secondary disabled:opacity-40"
              >
                {acting
                  ? 'Working…'
                  : status.hasContract
                    ? 'Re-freeze contract'
                    : 'Freeze contract'}
              </button>
            ) : null}
            <button
              type="button"
              disabled={disabled || !status.hasContract}
              onClick={() => void onValidate()}
              className="rounded-lg border border-outline-variant/40 px-md py-2 font-label text-[12px] text-on-surface disabled:opacity-40"
            >
              Validate
            </button>
            <Link
              to="/joins"
              className="rounded-lg border border-outline-variant/40 px-md py-2 font-label text-[12px] text-on-surface-variant hover:border-secondary"
            >
              Open Joins
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function Metric({
  label,
  value,
  warn,
}: {
  label: string
  value: string
  warn?: boolean
}) {
  return (
    <div className="rounded-lg border border-outline-variant/20 bg-surface-container px-sm py-sm">
      <p className="font-label text-[10px] tracking-wider text-on-surface-variant uppercase">
        {label}
      </p>
      <p
        className={[
          'mt-1 font-label text-[13px] font-semibold',
          warn ? 'text-error' : 'text-on-surface',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  )
}
