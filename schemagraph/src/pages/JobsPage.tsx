import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import { useAuth } from '@/context/AuthContext'
import {
  acknowledgeDriftEvent,
  exportJobArtifact,
  fetchDrift,
  fetchJobs,
  fetchWorkspaceSettings,
  updateJob,
  type DbtExportFile,
  type DbtGithubResult,
  type DriftEvent,
  type JobStatus,
  type StitchJob,
} from '@/services/stitchApi'

const STATUS_STYLE: Record<JobStatus, string> = {
  draft: 'border-outline-variant text-on-surface-variant',
  ready: 'border-primary-fixed text-primary-fixed',
  exported: 'border-primary-container bg-primary-container/10 text-primary-fixed',
  archived: 'border-outline-variant text-on-surface-variant/50',
}

function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function safeSlug(title: string) {
  return title.replace(/[^\w.-]+/g, '_').toLowerCase() || 'que_job'
}

/**
 * Jobs — review AI drafts, mark ready, export SQL/JSON (base) + dbt/GitHub PR (additive layer).
 */
export function JobsPage() {
  const { canWrite } = useWorkspaceRole()
  const { workspaceId } = useAuth()
  const [jobs, setJobs] = useState<StitchJob[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [dbtFiles, setDbtFiles] = useState<DbtExportFile[] | null>(null)
  const [dbtGithub, setDbtGithub] = useState<DbtGithubResult | null>(null)
  const [openDrift, setOpenDrift] = useState<DriftEvent[]>([])
  const [githubReady, setGithubReady] = useState<{
    token: boolean
    owner: string
    repo: string
  } | null>(null)

  async function reload() {
    try {
      const [list, drift] = await Promise.all([
        fetchJobs(),
        fetchDrift().catch(() => ({
          events: [],
          openHigh: [],
          hasBlockingRisk: false,
        })),
      ])
      setJobs(list)
      setOpenDrift(drift.openHigh || [])
      setError(null)
      setSelectedId((prev) => {
        if (prev && list.some((j) => j.id === prev)) return prev
        return list[0]?.id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    setSelectedId(null)
    setDbtFiles(null)
    setDbtGithub(null)
    void reload()
    fetchWorkspaceSettings()
      .then((s) => {
        setGithubReady({
          token: Boolean(s.capabilities.github?.tokenConfigured),
          owner: s.settings.githubOwner || '',
          repo: s.settings.githubRepo || '',
        })
      })
      .catch(() => {
        /* settings optional for jobs list */
      })
  }, [workspaceId])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.status.includes(q) ||
        j.tables.some((t) => t.toLowerCase().includes(q)),
    )
  }, [jobs, filter])

  const selected = jobs.find((j) => j.id === selectedId) ?? null

  async function markReady() {
    if (!selected || !canWrite) return
    setBusy(true)
    try {
      const job = await updateJob(selected.id, { status: 'ready' })
      setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)))
      setToast('Marked ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function doExport(format: 'json' | 'sql') {
    if (!selected || !canWrite) return
    setBusy(true)
    try {
      const { job, export: payload } = await exportJobArtifact(
        selected.id,
        format,
      )
      setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)))
      const text =
        format === 'sql'
          ? String(payload.sql ?? '')
          : JSON.stringify(payload, null, 2)
      downloadText(
        `${safeSlug(job.title)}.${format === 'sql' ? 'sql' : 'json'}`,
        text,
        format === 'sql' ? 'text/sql' : 'application/json',
      )
      setToast(`Exported ${format.toUpperCase()}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function doDbtExport(format: 'dbt' | 'dbt-pr') {
    if (!selected || !canWrite) return
    setBusy(true)
    setError(null)
    try {
      const { job, export: payload } = await exportJobArtifact(
        selected.id,
        format,
      )
      setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)))
      const files = (payload.files as DbtExportFile[] | undefined) ?? []
      const github = (payload.github as DbtGithubResult | undefined) ?? null
      setDbtFiles(files)
      setDbtGithub(github)

      downloadText(
        `${safeSlug(job.title)}-dbt-bundle.json`,
        JSON.stringify(payload, null, 2),
        'application/json',
      )

      if (github?.opened && github.prUrl) {
        setToast(`dbt PR opened · ${github.prUrl}`)
      } else if (format === 'dbt-pr' && github && !github.opened) {
        setToast(
          `dbt bundle ready · PR not opened (${github.reason || 'check Settings / GITHUB_TOKEN'})`,
        )
      } else {
        setToast(
          `dbt bundle exported · ${files.length} file(s) · promote joins improve SQL`,
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function downloadDbtFile(file: DbtExportFile) {
    const name = file.path.split('/').pop() || 'que_model.sql'
    const mime = name.endsWith('.json')
      ? 'application/json'
      : name.endsWith('.yml') || name.endsWith('.yaml')
        ? 'text/yaml'
        : name.endsWith('.md')
          ? 'text/markdown'
          : 'text/plain'
    downloadText(name, file.content, mime)
  }

  return (
    <QueAppChrome eyebrow="JOBS · DRAFT → READY → EXPORT → DBT">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* List */}
        <aside className="flex w-80 shrink-0 flex-col border-r border-outline-variant bg-surface-container">
          <div className="border-b border-outline-variant p-md">
            <h1 className="font-headline text-xl font-semibold text-on-surface">
              Jobs
            </h1>
            <p className="mt-xs font-label text-[10px] tracking-widest text-on-surface-variant">
              {jobs.length} ARTIFACT{jobs.length === 1 ? '' : 'S'}
            </p>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter title / table…"
              className="mt-md w-full border border-outline-variant bg-surface-container-low px-sm py-xs font-body text-xs text-on-surface outline-none focus:border-primary-fixed"
            />
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto p-sm">
            {filtered.length === 0 ? (
              <li className="p-md font-body text-xs text-on-surface-variant">
                No jobs yet. In{' '}
                <Link to="/chat" className="text-primary-fixed underline">
                  AI Chat
                </Link>
                , ask for a job draft and click Save.
              </li>
            ) : (
              filtered.map((job) => (
                <li key={job.id} className="mb-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(job.id)
                      setDbtFiles(null)
                      setDbtGithub(null)
                    }}
                    className={[
                      'w-full border p-sm text-left transition-colors',
                      selectedId === job.id
                        ? 'border-primary-fixed bg-secondary-container border-l-4'
                        : 'border-outline-variant bg-surface-container-low hover:border-primary-fixed',
                    ].join(' ')}
                  >
                    <span className="block truncate font-body text-xs text-on-surface">
                      {job.title}
                    </span>
                    <span
                      className={`mt-xs inline-block border px-xs py-[2px] font-label text-[9px] tracking-widest uppercase ${STATUS_STYLE[job.status]}`}
                    >
                      {job.status}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        {/* Detail */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {error ? (
            <p className="border-b border-error/40 bg-error/10 px-md py-sm font-body text-xs text-error">
              {error}
            </p>
          ) : null}
          {toast ? (
            <p className="border-b border-primary-fixed/30 bg-primary-container/10 px-md py-sm font-label text-[10px] tracking-widest text-primary-fixed">
              {toast}
              <button
                type="button"
                className="ml-md underline"
                onClick={() => setToast(null)}
              >
                dismiss
              </button>
            </p>
          ) : null}

          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-md p-xl text-center">
              <h2 className="font-headline text-2xl text-on-surface">
                Review Que jobs
              </h2>
              <p className="max-w-[28rem] font-body text-sm text-on-surface-variant">
                Job drafts from chat land here. Mark ready, export SQL/JSON, or
                use the dbt layer to ship a reviewable model / GitHub PR.
              </p>
              <Link
                to="/chat"
                className="bg-primary-container px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-primary-fixed"
              >
                OPEN AI CHAT
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-end justify-between border-b border-outline-variant bg-surface-container-lowest px-md py-lg">
                <div>
                  <h2 className="font-headline text-2xl tracking-tight text-on-surface">
                    {selected.title}
                  </h2>
                  <p className="mt-xs font-label text-[10px] tracking-widest text-on-surface-variant">
                    UPDATED {new Date(selected.updatedAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`border px-sm py-xs font-label text-[10px] tracking-widest uppercase ${STATUS_STYLE[selected.status]}`}
                >
                  {selected.status}
                </span>
              </div>

              <div className="min-h-0 flex-1 space-y-lg overflow-y-auto p-md">
                <section>
                  <h3 className="mb-sm font-label text-[11px] font-bold tracking-widest text-primary-fixed">
                    TABLES
                  </h3>
                  <div className="flex flex-wrap gap-sm">
                    {selected.tables.length === 0 ? (
                      <span className="font-body text-xs text-on-surface-variant">
                        —
                      </span>
                    ) : (
                      selected.tables.map((t) => (
                        <span
                          key={t}
                          className="border border-outline-variant bg-surface-container px-sm py-xs font-body text-xs text-on-surface"
                        >
                          {t}
                        </span>
                      ))
                    )}
                  </div>
                </section>

                <section>
                  <h3 className="mb-sm font-label text-[11px] font-bold tracking-widest text-primary-fixed">
                    SOURCES
                  </h3>
                  <p className="font-body text-xs text-on-surface-variant">
                    {selected.sources.length
                      ? selected.sources.join(' · ')
                      : '—'}
                  </p>
                </section>

                <section>
                  <h3 className="mb-sm font-label text-[11px] font-bold tracking-widest text-primary-fixed">
                    STEPS
                  </h3>
                  <ol className="space-y-sm border border-outline-variant bg-surface-container p-md">
                    {selected.steps.map((s) => (
                      <li
                        key={s.id}
                        className="flex gap-md border-b border-outline-variant pb-sm last:border-0 last:pb-0"
                      >
                        <span className="font-label text-[10px] text-primary-fixed">
                          {String(s.id).padStart(2, '0')}
                        </span>
                        <div>
                          <p className="font-body text-xs font-bold text-on-surface">
                            {s.action}
                          </p>
                          <p className="font-body text-xs text-on-surface-variant">
                            {s.detail}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>

                {selected.sqlText ? (
                  <section>
                    <h3 className="mb-sm font-label text-[11px] font-bold tracking-widest text-primary-fixed">
                      SQL DRAFT
                    </h3>
                    <pre className="overflow-x-auto border-l-2 border-primary-fixed bg-surface-container-lowest p-md font-body text-xs text-primary-fixed whitespace-pre-wrap">
                      {selected.sqlText}
                    </pre>
                  </section>
                ) : null}

                {selected.notes ? (
                  <p className="font-body text-xs text-on-surface-variant">
                    {selected.notes}
                  </p>
                ) : null}

                {openDrift.length > 0 ? (
                  <section className="border border-error/40 bg-error/10 p-md">
                    <h3 className="font-label text-[11px] font-bold tracking-widest text-error">
                      DRIFT ALARM · BLOCKS EXPORT
                    </h3>
                    <ul className="mt-sm space-y-sm">
                      {openDrift.map((d) => (
                        <li
                          key={d.id}
                          className="flex items-start justify-between gap-sm font-body text-xs text-on-surface"
                        >
                          <span>
                            [{d.code}] {d.summary}
                          </span>
                          {canWrite ? (
                            <button
                              type="button"
                              className="shrink-0 border border-outline-variant px-sm py-xs font-label text-[9px] tracking-widest"
                              onClick={() =>
                                void acknowledgeDriftEvent(d.id)
                                  .then(() => reload())
                                  .catch((err) =>
                                    setError(
                                      err instanceof Error
                                        ? err.message
                                        : String(err),
                                    ),
                                  )
                              }
                            >
                              ACK
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {selected.contract || selected.schemaSnapshotId ? (
                  <section className="border border-outline-variant bg-surface-container p-md">
                    <h3 className="font-label text-[11px] font-bold tracking-widest text-primary-fixed">
                      FROZEN CONTRACT
                    </h3>
                    <p className="mt-xs font-body text-xs text-on-surface-variant">
                      Snapshot:{' '}
                      <code className="text-primary-fixed">
                        {selected.schemaSnapshotId?.slice(0, 8) ||
                          selected.contract?.schemaSnapshotId?.slice(0, 8) ||
                          '—'}
                        …
                      </code>
                      {selected.contract?.schemaSnapshotLabel
                        ? ` · ${selected.contract.schemaSnapshotLabel}`
                        : ''}
                      {selected.contract?.frozenAt
                        ? ` · frozen ${new Date(selected.contract.frozenAt).toLocaleString()}`
                        : ''}
                    </p>
                    {canWrite ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="mt-sm border border-outline-variant px-sm py-xs font-label text-[10px] tracking-widest disabled:opacity-40"
                        onClick={() =>
                          void updateJob(selected.id, {
                            refreezeContract: true,
                          })
                            .then((job) => {
                              setJobs((prev) =>
                                prev.map((j) => (j.id === job.id ? job : j)),
                              )
                              setToast('Contract re-frozen from live schema')
                            })
                            .catch((err) =>
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : String(err),
                              ),
                            )
                        }
                      >
                        RE-FREEZE CONTRACT
                      </button>
                    ) : null}
                  </section>
                ) : null}

                {selected.joinsSnapshot && selected.joinsSnapshot.length > 0 ? (
                  <section>
                    <h3 className="mb-sm font-label text-[11px] font-bold tracking-widest text-primary-fixed">
                      FROZEN JOINS · {selected.joinsSnapshot.length}
                    </h3>
                    <ul className="space-y-sm border border-outline-variant bg-surface-container p-md">
                      {selected.joinsSnapshot.map((j) => (
                        <li
                          key={j.id}
                          className="font-body text-xs text-on-surface"
                        >
                          {j.fromTable}.{j.fromColumn}
                          {j.fromType ? (
                            <span className="text-on-surface-variant">
                              {' '}
                              ({j.fromType})
                            </span>
                          ) : null}{' '}
                          → {j.toTable}.{j.toColumn}
                          {j.toType ? (
                            <span className="text-on-surface-variant">
                              {' '}
                              ({j.toType})
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {/* Additive production layer — does not replace SQL/JSON */}
                <section className="border border-primary-fixed/40 bg-primary-container/5 p-md">
                  <h3 className="font-label text-[11px] font-bold tracking-widest text-primary-fixed">
                    PRODUCTION LAYER · DBT / GITHUB PR
                  </h3>
                  <p className="mt-xs font-body text-xs text-on-surface-variant">
                    Mergeable export: stitch model + staging stubs + sources.yml
                    + orphan-key tests + CI workflow from the{' '}
                    <strong className="text-on-surface">frozen contract</strong>.
                    Export is blocked while high drift is open.
                  </p>
                  {githubReady ? (
                    <p className="mt-sm font-label text-[10px] tracking-widest text-on-surface-variant">
                      GITHUB TOKEN{' '}
                      {githubReady.token ? 'SET' : 'NOT SET'}
                      {' · '}
                      REPO{' '}
                      {githubReady.owner && githubReady.repo
                        ? `${githubReady.owner}/${githubReady.repo}`
                        : 'NOT SET — configure in Settings'}
                    </p>
                  ) : null}
                  {canWrite ? (
                    <div className="mt-md flex flex-wrap gap-sm">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void doDbtExport('dbt')}
                        className="bg-primary-container px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-primary-fixed disabled:opacity-40"
                      >
                        EXPORT DBT BUNDLE
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void doDbtExport('dbt-pr')}
                        className="border border-primary-fixed px-md py-sm font-label text-[11px] font-bold tracking-widest text-primary-fixed disabled:opacity-40"
                      >
                        OPEN DBT GITHUB PR
                      </button>
                      <Link
                        to="/settings"
                        className="border border-outline-variant px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-surface-variant hover:border-primary-fixed"
                      >
                        DBT SETTINGS
                      </Link>
                    </div>
                  ) : null}

                  {dbtGithub?.opened && dbtGithub.prUrl ? (
                    <p className="mt-md font-body text-xs text-primary-fixed">
                      PR:{' '}
                      <a
                        href={dbtGithub.prUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {dbtGithub.prUrl}
                      </a>
                      {dbtGithub.branch ? ` · branch ${dbtGithub.branch}` : ''}
                    </p>
                  ) : null}
                  {dbtGithub && !dbtGithub.opened && dbtGithub.reason ? (
                    <p className="mt-md font-body text-xs text-on-surface-variant">
                      PR skipped: {dbtGithub.reason}
                    </p>
                  ) : null}

                  {dbtFiles && dbtFiles.length > 0 ? (
                    <ul className="mt-md space-y-sm border border-outline-variant bg-surface-container-lowest p-sm">
                      {dbtFiles.map((f) => (
                        <li
                          key={f.path}
                          className="flex items-center justify-between gap-sm"
                        >
                          <code className="truncate font-body text-[11px] text-on-surface">
                            {f.path}
                          </code>
                          <button
                            type="button"
                            onClick={() => downloadDbtFile(f)}
                            className="shrink-0 font-label text-[10px] tracking-widest text-primary-fixed underline"
                          >
                            DOWNLOAD
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              </div>

              <div className="flex flex-wrap gap-sm border-t border-outline-variant p-md">
                {canWrite ? (
                  <>
                    <button
                      type="button"
                      disabled={busy || selected.status === 'ready'}
                      onClick={() => void markReady()}
                      className="bg-primary-container px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-primary-fixed disabled:opacity-40"
                    >
                      MARK READY
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void doExport('sql')}
                      className="border border-outline-variant px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-surface hover:border-primary-fixed disabled:opacity-40"
                    >
                      EXPORT SQL
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void doExport('json')}
                      className="border border-outline-variant px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-surface hover:border-primary-fixed disabled:opacity-40"
                    >
                      EXPORT JSON
                    </button>
                  </>
                ) : (
                  <p className="font-label text-[10px] tracking-widest text-on-surface-variant">
                    READ-ONLY · VIEWER
                  </p>
                )}
                <Link
                  to="/workspace"
                  className="ml-auto border border-outline-variant px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-surface-variant hover:border-primary-fixed"
                >
                  OPEN WORKSPACE
                </Link>
              </div>
            </>
          )}
        </main>
      </div>
    </QueAppChrome>
  )
}

export default JobsPage
