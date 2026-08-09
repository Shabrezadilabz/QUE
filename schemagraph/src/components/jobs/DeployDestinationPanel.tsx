import { useEffect, useState } from 'react'
import type {
  DbtExportFile,
  DbtGithubResult,
  StitchJob,
} from '@/services/stitchApi'
import { mintJobArtifactLink } from '@/services/stitchApi'
import { MaterializePanel } from '@/components/jobs/MaterializePanel'

export type DeployDestination = 'file' | 'warehouse'

type Props = {
  job: StitchJob
  canWrite: boolean
  busy: boolean
  githubReady: { token: boolean; owner: string; repo: string } | null
  dbtFiles: DbtExportFile[] | null
  dbtGithub: DbtGithubResult | null
  onBusy: (v: boolean) => void
  onError: (message: string) => void
  onToast: (message: string) => void
  onMarkReady: () => void
  onDbtPr: () => void
  onDbtBundle: () => void
  onExportSql: () => void
  onExportJson: () => void
  onDownloadDbtFile: (f: DbtExportFile) => void
}

function storageKey(jobId: string) {
  return `que.deploy.destination.${jobId}`
}

/**
 * Wave 3.2/3.3 — deploy destination + signed artifact mint for file path.
 */
export function DeployDestinationPanel({
  job,
  canWrite,
  busy,
  githubReady,
  dbtFiles,
  dbtGithub,
  onBusy,
  onError,
  onToast,
  onMarkReady,
  onDbtPr,
  onDbtBundle,
  onExportSql,
  onExportJson,
  onDownloadDbtFile,
}: Props) {
  const [destination, setDestination] = useState<DeployDestination>('file')

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey(job.id))
      if (raw === 'warehouse' || raw === 'file') setDestination(raw)
    } catch {
      /* ignore */
    }
  }, [job.id])

  function pick(next: DeployDestination) {
    setDestination(next)
    try {
      sessionStorage.setItem(storageKey(job.id), next)
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="rounded-xl border border-secondary/25 bg-surface-container-low p-md lg:col-span-2">
      <h3 className="font-label text-[11px] tracking-[0.12em] text-secondary uppercase">
        Deploy destination
      </h3>
      <p className="mt-xs max-w-[42rem] font-body text-[12px] leading-relaxed text-on-surface-variant">
        Choose where the frozen stitch job ships. File/PR keeps attested
        artifacts offline (with optional signed download URL); warehouse
        creates a view/table in <em>their</em> cloud.
      </p>

      <div
        className="mt-md grid gap-sm sm:grid-cols-2"
        role="radiogroup"
        aria-label="Deploy destination"
      >
        <DestinationCard
          selected={destination === 'file'}
          title="File / PR artifact"
          blurb="Attested JSON, SQL, dbt, GitHub PR, or mint an external signed URL."
          onClick={() => pick('file')}
        />
        <DestinationCard
          selected={destination === 'warehouse'}
          title="Customer warehouse"
          blurb="CREATE VIEW or CTAS in Postgres / Databricks / Snowflake with their creds."
          onClick={() => pick('warehouse')}
        />
      </div>

      <div className="mt-md border-t border-outline-variant/20 pt-md">
        {destination === 'file' ? (
          <FileDestinationBody
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
        ) : (
          <MaterializePanel
            job={job}
            canWrite={canWrite}
            busy={busy}
            onBusy={onBusy}
            onError={onError}
            onToast={onToast}
            embedded
          />
        )}
      </div>
    </section>
  )
}

function DestinationCard({
  selected,
  title,
  blurb,
  onClick,
}: {
  selected: boolean
  title: string
  blurb: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`rounded-xl border px-md py-md text-left transition-colors ${ selected ? 'border-secondary bg-secondary/5' : 'border-outline-variant/30 bg-surface-container hover:border-secondary/40' }`}
    >
      <span className="flex items-center gap-sm">
        <span
          className={`flex h-4 w-4 items-center justify-center rounded-full border ${ selected ? 'border-secondary bg-secondary' : 'border-outline-variant/50 bg-surface-container-low' }`}
          aria-hidden
        >
          {selected ? (
            <span className="h-1.5 w-1.5 rounded-full bg-on-secondary" />
          ) : null}
        </span>
        <span className="font-label text-[12px] font-semibold text-on-surface">
          {title}
        </span>
      </span>
      <span className="mt-sm block font-body text-[12px] leading-relaxed text-on-surface-variant">
        {blurb}
      </span>
    </button>
  )
}

function FileDestinationBody({
  job,
  canWrite,
  busy,
  githubReady,
  dbtFiles,
  dbtGithub,
  onBusy,
  onError,
  onToast,
  onMarkReady,
  onDbtPr,
  onDbtBundle,
  onExportSql,
  onExportJson,
  onDownloadDbtFile,
}: {
  job: StitchJob
  canWrite: boolean
  busy: boolean
  githubReady: { token: boolean; owner: string; repo: string } | null
  dbtFiles: DbtExportFile[] | null
  dbtGithub: DbtGithubResult | null
  onBusy: (v: boolean) => void
  onError: (message: string) => void
  onToast: (message: string) => void
  onMarkReady: () => void
  onDbtPr: () => void
  onDbtBundle: () => void
  onExportSql: () => void
  onExportJson: () => void
  onDownloadDbtFile: (f: DbtExportFile) => void
}) {
  const [linkUrl, setLinkUrl] = useState<string | null>(null)

  async function onMintLink() {
    if (!canWrite) return
    onBusy(true)
    onError('')
    setLinkUrl(null)
    try {
      const minted = await mintJobArtifactLink(job.id, {
        format: 'json',
        ttlHours: 72,
      })
      setLinkUrl(minted.downloadUrl)
      try {
        await navigator.clipboard.writeText(minted.downloadUrl)
        onToast('Signed download URL copied (72h TTL)')
      } catch {
        onToast('Signed download URL ready — copy from the box below')
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e))
    } finally {
      onBusy(false)
    }
  }

  return (
    <div>
      <p className="max-w-[42rem] font-body text-[12px] leading-relaxed text-on-surface-variant">
        Ship via frozen contract → attested export / dbt PR. Mint a signed URL
        for external tools (no Que session required).
      </p>
      {canWrite ? (
        <div className="mt-md flex flex-wrap gap-sm">
          <button
            type="button"
            disabled={busy || job.status === 'ready'}
            onClick={onMarkReady}
            className="rounded-lg border border-outline-variant/40 bg-surface-container-low px-md py-2 font-label text-[12px] text-on-surface disabled:opacity-40"
          >
            Mark ready
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDbtPr}
            className="rounded bg-secondary px-md py-2 font-label text-[12px] font-semibold text-on-secondary disabled:opacity-40"
          >
            Open dbt PR
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDbtBundle}
            className="rounded-lg border border-secondary/40 px-md py-2 font-label text-[12px] text-secondary disabled:opacity-40"
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
          <button
            type="button"
            disabled={busy}
            onClick={() => void onMintLink()}
            className="rounded-lg border border-tertiary/40 bg-tertiary/5 px-md py-2 font-label text-[12px] text-tertiary disabled:opacity-40"
          >
            Mint signed URL
          </button>
        </div>
      ) : (
        <p className="mt-sm font-label text-[12px] text-on-surface-variant">
          Read-only
        </p>
      )}
      {linkUrl ? (
        <div className="mt-sm rounded-lg border border-tertiary/25 bg-tertiary/5 p-sm">
          <p className="font-label text-[10px] tracking-wider text-tertiary uppercase">
            External download (token once)
          </p>
          <code className="mt-1 block break-all font-mono text-[11px] text-on-surface">
            {linkUrl}
          </code>
        </div>
      ) : null}
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
          className="mt-sm block truncate font-body text-[12px] text-secondary underline"
        >
          {dbtGithub.prUrl}
        </a>
      ) : null}
      {dbtFiles && dbtFiles.length > 0 ? (
        <ul className="mt-sm space-y-xs rounded-lg border border-outline-variant/25 bg-surface-container p-sm">
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
                className="shrink-0 font-label text-[11px] text-secondary underline"
              >
                Download
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
