import { Link } from 'react-router-dom'
import type {
  DbtExportFile,
  DbtGithubResult,
  DriftEvent,
  StitchJob,
} from '@/services/stitchApi'

type Props = {
  job: StitchJob
  canWrite: boolean
  busy: boolean
  openDrift: DriftEvent[]
  githubReady: { token: boolean; owner: string; repo: string } | null
  dbtFiles: DbtExportFile[] | null
  dbtGithub: DbtGithubResult | null
  onAcknowledgeDrift: (id: string) => void
  onRefreeze: () => void
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
  onRefreeze,
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
                No open high-risk drift events. Safe to export if joins are
                promoted.
              </p>
            </section>
          )}

          {job.contract || job.schemaSnapshotId ? (
            <section className="rounded-xl border border-outline-variant/25 bg-white p-md">
              <h3 className="font-label text-[11px] tracking-[0.12em] text-primary uppercase">
                Frozen contract
              </h3>
              <p className="mt-xs break-all font-body text-[12px] text-on-surface-variant">
                {job.schemaSnapshotId?.slice(0, 12) ||
                  job.contract?.schemaSnapshotId?.slice(0, 12) ||
                  '—'}
                …
                {job.contract?.frozenAt
                  ? ` · ${new Date(job.contract.frozenAt).toLocaleString()}`
                  : ''}
              </p>
              {canWrite ? (
                <button
                  type="button"
                  disabled={busy}
                  className="mt-sm rounded-lg border border-outline-variant/40 bg-[#FBF8F4] px-sm py-1.5 font-label text-[12px] text-on-surface disabled:opacity-40"
                  onClick={onRefreeze}
                >
                  Re-freeze
                </button>
              ) : null}
            </section>
          ) : null}

          {job.joinsSnapshot && job.joinsSnapshot.length > 0 ? (
            <section className="rounded-xl border border-outline-variant/20 bg-white p-md">
              <h3 className="mb-sm font-label text-[11px] tracking-[0.12em] text-on-surface-variant uppercase">
                Joins · {job.joinsSnapshot.length}
              </h3>
              <ul className="space-y-xs">
                {job.joinsSnapshot.map((j) => (
                  <li
                    key={j.id}
                    className="rounded-md bg-secondary-container/40 px-2 py-1 font-body text-[12px] text-on-surface"
                  >
                    {j.fromTable}.{j.fromColumn} → {j.toTable}.{j.toColumn}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-xl border border-primary/20 bg-primary/5 p-md lg:col-span-2">
            <h3 className="font-label text-[11px] tracking-[0.12em] text-primary uppercase">
              Production path
            </h3>
            <p className="mt-xs max-w-[42rem] font-body text-[12px] leading-relaxed text-on-surface-variant">
              Notebook is a review sandbox. Ship via promoted joins → attested
              dbt PR. HITL joins are never auto-accepted.
            </p>
            {canWrite ? (
              <div className="mt-md flex flex-wrap gap-sm">
                <button
                  type="button"
                  disabled={busy || job.status === 'ready'}
                  onClick={onMarkReady}
                  className="rounded-lg border border-outline-variant/40 bg-white px-md py-2 font-label text-[12px] text-on-surface disabled:opacity-40"
                >
                  Mark ready
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onDbtPr}
                  className="rounded-lg bg-primary px-md py-2 font-label text-[12px] font-semibold text-on-primary disabled:opacity-40"
                >
                  Open dbt PR
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onDbtBundle}
                  className="rounded-lg border border-primary/40 px-md py-2 font-label text-[12px] text-primary disabled:opacity-40"
                >
                  Export dbt bundle
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onExportSql}
                  className="rounded-lg border border-outline-variant/30 px-md py-2 font-label text-[12px] text-on-surface-variant disabled:opacity-40"
                >
                  Download SQL
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onExportJson}
                  className="rounded-lg border border-outline-variant/30 px-md py-2 font-label text-[12px] text-on-surface-variant disabled:opacity-40"
                >
                  Download JSON
                </button>
              </div>
            ) : (
              <p className="mt-sm font-label text-[12px] text-on-surface-variant">
                Read-only
              </p>
            )}
            {githubReady ? (
              <p className="mt-sm font-label text-[11px] text-on-surface-variant/70">
                GitHub {githubReady.token ? 'connected' : 'no token'}
                {githubReady.owner && githubReady.repo
                  ? ` · ${githubReady.owner}/${githubReady.repo}`
                  : ' · set owner/repo in Settings'}
              </p>
            ) : null}
            {dbtGithub?.opened && dbtGithub.prUrl ? (
              <a
                href={dbtGithub.prUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-sm block truncate font-body text-[12px] text-primary underline"
              >
                {dbtGithub.prUrl}
              </a>
            ) : null}
            {dbtFiles && dbtFiles.length > 0 ? (
              <ul className="mt-sm space-y-xs rounded-lg border border-outline-variant/25 bg-white p-sm">
                {dbtFiles.map((f) => (
                  <li
                    key={f.path}
                    className="flex items-center justify-between gap-xs"
                  >
                    <code className="truncate font-body text-[11px] text-on-surface">
                      {f.path.split('/').pop()}
                    </code>
                    <button
                      type="button"
                      onClick={() => onDownloadDbtFile(f)}
                      className="shrink-0 font-label text-[11px] text-primary underline"
                    >
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <div className="lg:col-span-2">
            <Link
              to="/workspace"
              className="inline-flex rounded-lg bg-secondary-container/70 px-md py-2 font-label text-[12px] text-on-secondary-container hover:bg-secondary-container"
            >
              Open workspace canvas
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
