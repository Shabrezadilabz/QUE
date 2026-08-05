import { Link } from 'react-router-dom'
import type {
  DbtExportFile,
  DbtGithubResult,
  DriftEvent,
  StitchJob,
} from '@/services/stitchApi'
import { ContractFreezePanel } from '@/components/jobs/ContractFreezePanel'
import { DeployDestinationPanel } from '@/components/jobs/DeployDestinationPanel'

type Props = {
  job: StitchJob
  canWrite: boolean
  busy: boolean
  openDrift: DriftEvent[]
  githubReady: { token: boolean; owner: string; repo: string } | null
  dbtFiles: DbtExportFile[] | null
  dbtGithub: DbtGithubResult | null
  onAcknowledgeDrift: (id: string) => void
  onJobUpdated: (job: StitchJob) => void
  onError: (message: string) => void
  onToast: (message: string) => void
  onBusy: (v: boolean) => void
  onMarkReady: () => void
  onDbtPr: () => void
  onDbtBundle: () => void
  onExportSql: () => void
  onExportJson: () => void
  onDownloadDbtFile: (f: DbtExportFile) => void
  onBackToNotebook: () => void
}

/**
 * Full-page Deploy · Governance — separated from the notebook editor.
 */
export function JobDeployPanel({
  job,
  canWrite,
  busy,
  openDrift,
  githubReady,
  dbtFiles,
  dbtGithub,
  onAcknowledgeDrift,
  onJobUpdated,
  onError,
  onToast,
  onBusy,
  onMarkReady,
  onDbtPr,
  onDbtBundle,
  onExportSql,
  onExportJson,
  onDownloadDbtFile,
  onBackToNotebook,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F2EDE4]">
      <div className="shrink-0 border-b border-outline-variant/20 bg-white px-lg py-md">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <h2 className="font-headline text-base font-semibold text-on-surface">
              Deploy · Governance
            </h2>
            <p className="mt-1 font-body text-[12px] text-on-surface-variant">
              {job.title} · updated {new Date(job.updatedAt).toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={onBackToNotebook}
            className="rounded-lg border border-outline-variant/40 px-sm py-1.5 font-label text-[12px] text-on-surface-variant hover:bg-secondary-container"
          >
            ← Back to notebook
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-lg">
        <div className="mx-auto grid max-w-[56rem] gap-md lg:grid-cols-2">
          <section className="rounded-xl border border-outline-variant/20 bg-white p-md">
            <h3 className="mb-sm font-label text-[11px] font-semibold tracking-[0.12em] text-on-surface-variant uppercase">
              Tables
            </h3>
            <div className="flex flex-wrap gap-xs">
              {job.tables.length === 0 ? (
                <span className="font-body text-[12px] text-on-surface-variant">
                  —
                </span>
              ) : (
                job.tables.map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-outline-variant/30 bg-[#FBF8F4] px-2 py-0.5 font-body text-[11px] text-on-surface"
                  >
                    {t}
                  </span>
                ))
              )}
            </div>
            <h3 className="mt-md mb-sm font-label text-[11px] font-semibold tracking-[0.12em] text-on-surface-variant uppercase">
              Sources
            </h3>
            <p className="font-body text-[12px] text-on-surface-variant">
              {job.sources.length ? job.sources.join(' · ') : '—'}
            </p>
          </section>

          {openDrift.length > 0 ? (
            <section className="rounded-xl border border-error/30 bg-error/5 p-md">
              <h3 className="font-label text-[11px] font-semibold tracking-wide text-error uppercase">
                Drift · blocks export
              </h3>
              <ul className="mt-sm space-y-sm">
                {openDrift.map((d) => (
                  <li key={d.id} className="font-body text-[12px] text-on-surface">
                    <span>
                      [{d.code}] {d.summary}
                    </span>
                    {canWrite ? (
                      <button
                        type="button"
                        className="mt-xs block rounded-md border border-outline-variant/40 px-sm py-[2px] font-label text-[11px]"
                        onClick={() => onAcknowledgeDrift(d.id)}
                      >
                        Acknowledge
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="rounded-xl border border-tertiary/25 bg-tertiary/5 p-md">
              <h3 className="font-label text-[11px] font-semibold tracking-wide text-tertiary uppercase">
                Drift
              </h3>
              <p className="mt-sm font-body text-[12px] text-on-surface-variant">
                No open high-risk drift events. Safe to export if the contract
                is frozen and valid.
              </p>
            </section>
          )}

          <ContractFreezePanel
            job={job}
            canWrite={canWrite}
            busy={busy}
            onJobUpdated={onJobUpdated}
            onError={onError}
            onToast={onToast}
          />

          <DeployDestinationPanel
            job={job}
            canWrite={canWrite}
            busy={busy}
            githubReady={githubReady}
            dbtFiles={dbtFiles}
            dbtGithub={dbtGithub}
            onBusy={onBusy}
            onError={onError}
            onToast={onToast}
            onMarkReady={onMarkReady}
            onDbtPr={onDbtPr}
            onDbtBundle={onDbtBundle}
            onExportSql={onExportSql}
            onExportJson={onExportJson}
            onDownloadDbtFile={onDownloadDbtFile}
          />

          <div className="flex flex-wrap gap-sm lg:col-span-2">
            <Link
              to="/joins"
              className="inline-flex rounded-lg bg-secondary-container/70 px-md py-2 font-label text-[12px] text-on-secondary-container hover:bg-secondary-container"
            >
              Open Join Review
            </Link>
            <Link
              to="/verify"
              className="inline-flex rounded-lg border border-primary/30 bg-primary/5 px-md py-2 font-label text-[12px] text-primary hover:bg-primary/10"
            >
              Verify attestation
            </Link>
            <Link
              to="/lineage"
              className="inline-flex rounded-lg border border-outline-variant/40 px-md py-2 font-label text-[12px] text-on-surface-variant hover:border-primary"
            >
              Open lineage
            </Link>
            <Link
              to="/workspace"
              className="inline-flex rounded-lg border border-outline-variant/40 px-md py-2 font-label text-[12px] text-on-surface-variant hover:border-primary"
            >
              Open workspace canvas
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
