import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import { useAuth } from '@/context/AuthContext'
import {
  NotebookCellEditor,
  newNotebookCell,
  notebooksEqual,
} from '@/components/jobs/NotebookCellEditor'
import {
  acknowledgeDriftEvent,
  createManualJob,
  exportJobArtifact,
  fetchDrift,
  fetchJobs,
  fetchJobRuns,
  fetchWorkspaceSchema,
  fetchWorkspaceSettings,
  runJobNotebook,
  updateJob,
  type DbtExportFile,
  type DbtGithubResult,
  type DriftEvent,
  type JobNotebookCell,
  type JobRun,
  type JobStatus,
  type StitchJob,
} from '@/services/stitchApi'

const STATUS_STYLE: Record<JobStatus, string> = {
  draft: 'border-outline-variant text-on-surface-variant',
  ready: 'border-primary-fixed text-primary-fixed',
  exported: 'border-primary-container bg-primary-container/10 text-primary-fixed',
  archived: 'border-outline-variant text-on-surface-variant/50',
}

type ProcessTab = 'process' | 'output' | 'logs'

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
 * Jobs — Databricks-style notebook shell.
 * Step 4: dry-run runner + process / output / logs panel.
 */
export function JobsPage() {
  const { canWrite } = useWorkspaceRole()
  const { workspaceId } = useAuth()
  const [jobs, setJobs] = useState<StitchJob[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeCellId, setActiveCellId] = useState<string | null>(null)
  const [draftCells, setDraftCells] = useState<JobNotebookCell[]>([])
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [savingNotebook, setSavingNotebook] = useState(false)
  const [running, setRunning] = useState(false)
  const [runMode, setRunMode] = useState<'dry_run' | 'validate'>('dry_run')
  const [latestRun, setLatestRun] = useState<JobRun | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newTables, setNewTables] = useState<string[]>([])
  const [schemaTableNames, setSchemaTableNames] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [dbtFiles, setDbtFiles] = useState<DbtExportFile[] | null>(null)
  const [dbtGithub, setDbtGithub] = useState<DbtGithubResult | null>(null)
  const [openDrift, setOpenDrift] = useState<DriftEvent[]>([])
  const [processTab, setProcessTab] = useState<ProcessTab>('process')
  const [processOpen, setProcessOpen] = useState(true)
  const [railOpen, setRailOpen] = useState(true)
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
        /* settings optional */
      })
    fetchWorkspaceSchema()
      .then((schema) => {
        const names = [...new Set((schema.tables || []).map((t) => t.name))]
        names.sort((a, b) => a.localeCompare(b))
        setSchemaTableNames(names)
      })
      .catch(() => setSchemaTableNames([]))
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
  const cells = draftCells
  const notebookDirty =
    Boolean(selected) && !notebooksEqual(draftCells, selected?.notebook)

  function openCreateDialog() {
    if (!canWrite) return
    if (
      notebookDirty &&
      !window.confirm('Discard unsaved notebook changes and create a new job?')
    ) {
      return
    }
    setNewTitle('Untitled Que job')
    setNewTables([])
    setCreateOpen(true)
  }

  async function submitCreateJob() {
    if (!canWrite || creating) return
    const title = newTitle.trim() || 'Untitled Que job'
    setCreating(true)
    setError(null)
    try {
      const job = await createManualJob({
        title,
        tables: newTables,
      })
      setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)])
      setSelectedId(job.id)
      setDraftCells(
        job.notebook?.length ? job.notebook.map((c) => ({ ...c })) : [],
      )
      setLatestRun(null)
      setDbtFiles(null)
      setDbtGithub(null)
      setCreateOpen(false)
      setToast(`Created “${job.title}”`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  function toggleNewTable(name: string) {
    setNewTables((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name],
    )
  }

  /** Load draft when switching jobs (save/backfill update draft explicitly). */
  useEffect(() => {
    if (!selected) {
      setDraftCells([])
      setActiveCellId(null)
      setLatestRun(null)
      return
    }
    setDraftCells(
      selected.notebook?.length
        ? selected.notebook.map((c) => ({ ...c }))
        : [],
    )
    setLatestRun(null)
    void fetchJobRuns(selected.id)
      .then((runs) => {
        if (runs[0]) setLatestRun(runs[0])
      })
      .catch(() => {
        /* runs optional until migration */
      })
  }, [selected?.id])

  useEffect(() => {
    if (!cells.length) {
      setActiveCellId(null)
      return
    }
    setActiveCellId((prev) =>
      prev && cells.some((c) => c.id === prev) ? prev : cells[0].id,
    )
  }, [cells])

  /** One-time backfill: legacy jobs without notebook_json get persisted cells. */
  useEffect(() => {
    if (!selected || !canWrite) return
    if (selected.notebookPersisted !== false) return
    if (!selected.notebook?.length) return
    let cancelled = false
    void updateJob(selected.id, { notebook: selected.notebook })
      .then((job) => {
        if (cancelled) return
        setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)))
        setDraftCells(job.notebook?.length ? [...job.notebook] : [])
      })
      .catch(() => {
        /* non-fatal */
      })
    return () => {
      cancelled = true
    }
  }, [selected?.id, selected?.notebookPersisted, canWrite])

  function patchCell(
    cellId: string,
    patch: Partial<JobNotebookCell>,
  ) {
    setDraftCells((prev) =>
      prev.map((c) => (c.id === cellId ? { ...c, ...patch } : c)),
    )
  }

  function addCell(kind: 'markdown' | 'sql') {
    const cell = newNotebookCell(kind)
    setDraftCells((prev) => {
      if (!activeCellId) return [...prev, cell]
      const idx = prev.findIndex((c) => c.id === activeCellId)
      if (idx < 0) return [...prev, cell]
      const next = [...prev]
      next.splice(idx + 1, 0, cell)
      return next
    })
    setActiveCellId(cell.id)
  }

  function deleteCell(cellId: string) {
    setDraftCells((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((c) => c.id !== cellId)
    })
  }

  function moveCell(cellId: string, dir: -1 | 1) {
    setDraftCells((prev) => {
      const idx = prev.findIndex((c) => c.id === cellId)
      if (idx < 0) return prev
      const nextIdx = idx + dir
      if (nextIdx < 0 || nextIdx >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(idx, 1)
      next.splice(nextIdx, 0, item)
      return next
    })
  }

  function discardNotebook() {
    if (!selected) return
    setDraftCells(
      selected.notebook?.length ? [...selected.notebook] : [],
    )
    setToast('Notebook edits discarded')
  }

  async function saveNotebook() {
    if (!selected || !canWrite || !notebookDirty) return
    setSavingNotebook(true)
    setError(null)
    try {
      const job = await updateJob(selected.id, { notebook: draftCells })
      setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)))
      setDraftCells(
        job.notebook?.length ? job.notebook.map((c) => ({ ...c })) : [],
      )
      setToast('Notebook saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingNotebook(false)
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (!notebookDirty || !canWrite || !selected) return
        e.preventDefault()
        void saveNotebook()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [notebookDirty, canWrite, selected, draftCells])

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
      setRailOpen(true)

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
        setToast(`dbt bundle exported · ${files.length} file(s)`)
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

  async function startRun(scope: 'all' | 'cell', cellIdOverride?: string) {
    if (!selected || !canWrite || running) return
    const cellId =
      scope === 'cell' ? cellIdOverride || activeCellId || undefined : undefined
    if (scope === 'cell' && !cellId) {
      setToast('Select a cell to run')
      return
    }
    if (
      runMode === 'validate' &&
      !window.confirm(
        'Validate runs a read-only SELECT on your source and shows up to 20 rows (not full tables). Continue?',
      )
    ) {
      return
    }
    if (cellId) setActiveCellId(cellId)
    setRunning(true)
    setError(null)
    setProcessOpen(true)
    setProcessTab('logs')
    const apiMode = runMode === 'validate' ? 'live' : 'dry_run'
    setLatestRun({
      id: 'pending',
      workspaceId: selected.workspaceId,
      jobId: selected.id,
      status: 'running',
      scope,
      cellId: cellId || null,
      mode: apiMode,
      summary:
        runMode === 'validate'
          ? 'Validate starting (≤20 live rows)…'
          : 'Dry-run starting (≤10 schema samples)…',
      logs: [
        {
          ts: new Date().toISOString(),
          level: 'info',
          message:
            runMode === 'validate'
              ? 'Submitting validate (read-only, max 20 rows)…'
              : 'Submitting dry-run (schema samples, max 10 rows)…',
        },
      ],
      output: {},
      startedAt: new Date().toISOString(),
      finishedAt: null,
      createdAt: new Date().toISOString(),
    })
    try {
      const run = await runJobNotebook(selected.id, {
        scope,
        cellId,
        notebook: draftCells,
        mode: apiMode,
        maxRows: runMode === 'validate' ? 20 : undefined,
      })
      setLatestRun(run)
      const hasLive = Boolean(run.output?.liveResults?.length)
      const hasSamples = Boolean(run.output?.samplePreviews?.length)
      setProcessTab(hasLive || hasSamples ? 'output' : 'logs')
      setToast(run.summary || `Run ${run.status}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLatestRun((prev) =>
        prev
          ? {
              ...prev,
              status: 'failed',
              summary: err instanceof Error ? err.message : String(err),
              logs: [
                ...prev.logs,
                {
                  ts: new Date().toISOString(),
                  level: 'error',
                  message: err instanceof Error ? err.message : String(err),
                },
              ],
              finishedAt: new Date().toISOString(),
            }
          : prev,
      )
    } finally {
      setRunning(false)
    }
  }

  const runStateLabel = running
    ? 'RUNNING'
    : latestRun?.status
      ? latestRun.status.toUpperCase()
      : 'IDLE'

  const runStateClass =
    running || latestRun?.status === 'running'
      ? 'text-primary-fixed'
      : latestRun?.status === 'failed'
        ? 'text-error'
        : latestRun?.status === 'succeeded'
          ? 'text-primary-fixed'
          : 'text-on-surface-variant'

  return (
    <QueAppChrome eyebrow="JOBS · VALIDATE ≤20 · SAMPLES ≤10">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: job list */}
        <aside className="flex w-[220px] shrink-0 flex-col border-r border-outline-variant bg-surface-container-lowest sm:w-[240px]">
          <div className="border-b border-outline-variant p-md">
            <div className="flex items-center justify-between gap-sm">
              <h1 className="font-label text-[11px] font-bold tracking-widest text-on-surface-variant">
                JOBS
              </h1>
              <span className="font-label text-[9px] tracking-widest text-primary-fixed">
                {jobs.length}
              </span>
            </div>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              className="mt-sm w-full border border-outline-variant bg-surface-container px-sm py-xs font-body text-xs text-on-surface outline-none focus:border-primary-fixed"
            />
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto p-sm">
            {filtered.length === 0 ? (
              <li className="space-y-sm p-sm font-body text-xs text-on-surface-variant">
                <p>No jobs yet.</p>
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => openCreateDialog()}
                    className="text-primary-fixed underline"
                  >
                    Create one manually
                  </button>
                ) : (
                  <Link to="/chat" className="text-primary-fixed underline">
                    AI Chat
                  </Link>
                )}
              </li>
            ) : (
              filtered.map((job) => (
                <li key={job.id} className="mb-xs">
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        notebookDirty &&
                        selectedId &&
                        job.id !== selectedId &&
                        !window.confirm(
                          'Discard unsaved notebook changes?',
                        )
                      ) {
                        return
                      }
                      setSelectedId(job.id)
                      setDbtFiles(null)
                      setDbtGithub(null)
                    }}
                    className={[
                      'w-full border-l-4 p-sm text-left transition-colors',
                      selectedId === job.id
                        ? 'border-l-primary-fixed bg-primary-container/10'
                        : 'border-l-transparent hover:bg-surface-container-low',
                    ].join(' ')}
                  >
                    <span className="block truncate font-body text-xs text-on-surface">
                      {job.title}
                    </span>
                    <span
                      className={`mt-xs inline-block border px-xs py-[1px] font-label text-[8px] tracking-widest uppercase ${STATUS_STYLE[job.status]}`}
                    >
                      {job.status}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          <div className="space-y-xs border-t border-outline-variant p-sm">
            {canWrite ? (
              <button
                type="button"
                onClick={() => openCreateDialog()}
                className="block w-full bg-primary-container px-sm py-sm text-center font-label text-[10px] font-bold tracking-widest text-on-primary-fixed"
              >
                + NEW JOB
              </button>
            ) : null}
            <Link
              to="/chat"
              className="block w-full border border-outline-variant px-sm py-sm text-center font-label text-[10px] font-bold tracking-widest text-on-surface-variant hover:border-primary-fixed hover:text-primary-fixed"
            >
              + DRAFT IN CHAT
            </Link>
          </div>
        </aside>

        {/* Center: notebook + process */}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-surface">
          {error ? (
            <p className="shrink-0 border-b border-error/40 bg-error/10 px-md py-sm font-body text-xs text-error">
              {error}
            </p>
          ) : null}
          {toast ? (
            <p className="shrink-0 border-b border-primary-fixed/30 bg-primary-container/10 px-md py-sm font-label text-[10px] tracking-widest text-primary-fixed">
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
                Notebook workspace
              </h2>
              <p className="max-w-[28rem] font-body text-sm text-on-surface-variant">
                Create a job manually, from AI Chat, or from the canvas — then
                edit cells, run, and deploy.
              </p>
              <div className="flex flex-wrap justify-center gap-sm">
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => openCreateDialog()}
                    className="bg-primary-container px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-primary-fixed"
                  >
                    + NEW JOB
                  </button>
                ) : null}
                <Link
                  to="/chat"
                  className="border border-outline-variant px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-surface-variant hover:border-primary-fixed"
                >
                  OPEN AI CHAT
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Notebook toolbar */}
              <div className="flex shrink-0 flex-wrap items-center gap-sm border-b border-outline-variant bg-surface-container-lowest px-md py-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-sm">
                    <h2 className="truncate font-headline text-lg font-semibold tracking-tight text-on-surface">
                      {selected.title}
                    </h2>
                    <span
                      className={`border px-sm py-[2px] font-label text-[9px] tracking-widest uppercase ${STATUS_STYLE[selected.status]}`}
                    >
                      {selected.status}
                    </span>
                  </div>
                  <p className="mt-[2px] font-label text-[9px] tracking-widest text-on-surface-variant">
                    NOTEBOOK · {cells.length} CELL
                    {cells.length === 1 ? '' : 'S'}
                    {notebookDirty
                      ? ' · UNSAVED'
                      : selected.notebookPersisted === false
                        ? ' · BACKFILLING…'
                        : ' · SAVED'}
                  </p>
                </div>
                {canWrite ? (
                  <>
                    <button
                      type="button"
                      disabled={!notebookDirty || savingNotebook}
                      onClick={() => discardNotebook()}
                      className="border border-outline-variant px-md py-sm font-label text-[10px] font-bold tracking-widest text-on-surface-variant disabled:opacity-40"
                    >
                      DISCARD
                    </button>
                    <button
                      type="button"
                      disabled={!notebookDirty || savingNotebook}
                      onClick={() => void saveNotebook()}
                      className="bg-primary-container px-md py-sm font-label text-[10px] font-bold tracking-widest text-on-primary-fixed disabled:opacity-40"
                    >
                      {savingNotebook ? 'SAVING…' : 'SAVE'}
                    </button>
                    <button
                      type="button"
                      onClick={() => addCell('markdown')}
                      className="border border-outline-variant px-md py-sm font-label text-[10px] font-bold tracking-widest text-on-surface hover:border-primary-fixed"
                    >
                      + MD
                    </button>
                    <button
                      type="button"
                      onClick={() => addCell('sql')}
                      className="border border-outline-variant px-md py-sm font-label text-[10px] font-bold tracking-widest text-on-surface hover:border-primary-fixed"
                    >
                      + SQL
                    </button>
                  </>
                ) : null}
                {canWrite ? (
                  <label className="flex items-center gap-xs border border-outline-variant px-sm py-sm">
                    <span className="font-label text-[9px] tracking-widest text-on-surface-variant">
                      MODE
                    </span>
                    <select
                      value={runMode}
                      disabled={running}
                      onChange={(e) =>
                        setRunMode(
                          e.target.value === 'validate'
                            ? 'validate'
                            : 'dry_run',
                        )
                      }
                      className="bg-transparent font-label text-[10px] tracking-widest text-primary-fixed outline-none disabled:opacity-40"
                    >
                      <option value="dry_run">DRY-RUN · ≤10 SAMPLES</option>
                      <option value="validate">VALIDATE · ≤20 ROWS</option>
                    </select>
                  </label>
                ) : null}
                <button
                  type="button"
                  disabled={!canWrite || running}
                  title={
                    runMode === 'validate'
                      ? 'Read-only live SELECT · up to 20 rows'
                      : 'Schema dry-run · up to 10 sample rows'
                  }
                  onClick={() => void startRun('all')}
                  className="inline-flex items-center gap-xs bg-primary-container px-md py-sm font-label text-[10px] font-bold tracking-widest text-on-primary-fixed disabled:opacity-40"
                >
                  {running
                    ? 'RUNNING…'
                    : runMode === 'validate'
                      ? '▶ VALIDATE ALL'
                      : '▶ RUN ALL'}
                </button>
                <button
                  type="button"
                  disabled={!canWrite || !activeCellId || running}
                  title={
                    runMode === 'validate'
                      ? 'Read-only live SELECT · up to 20 rows'
                      : 'Schema dry-run · up to 10 sample rows'
                  }
                  onClick={() => void startRun('cell')}
                  className="border border-outline-variant px-md py-sm font-label text-[10px] font-bold tracking-widest text-on-surface hover:border-primary-fixed disabled:opacity-40"
                >
                  {runMode === 'validate' ? 'VALIDATE CELL' : 'RUN CELL'}
                </button>
                <button
                  type="button"
                  onClick={() => setRailOpen((v) => !v)}
                  className="border border-outline-variant px-md py-sm font-label text-[10px] font-bold tracking-widest text-on-surface-variant hover:border-primary-fixed"
                >
                  {railOpen ? 'HIDE RAIL' : 'DEPLOY RAIL'}
                </button>
              </div>

              {/* Cells */}
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto max-w-5xl space-y-md p-md">
                  {cells.map((cell, idx) => (
                    <NotebookCellEditor
                      key={cell.id}
                      cell={cell}
                      index={idx}
                      active={cell.id === activeCellId}
                      disabled={!canWrite}
                      onFocus={() => setActiveCellId(cell.id)}
                      onChangeContent={(content) =>
                        patchCell(cell.id, { content })
                      }
                      onChangeTitle={(title) => patchCell(cell.id, { title })}
                      onChangeKind={(kind) => patchCell(cell.id, { kind })}
                      onDelete={() => deleteCell(cell.id)}
                      onMove={(dir) => moveCell(cell.id, dir)}
                      onRunStub={() => {
                        void startRun('cell', cell.id)
                      }}
                      canDelete={cells.length > 1}
                      canMoveUp={idx > 0}
                      canMoveDown={idx < cells.length - 1}
                    />
                  ))}
                  {canWrite ? (
                    <div className="flex flex-wrap gap-sm border border-dashed border-outline-variant p-md">
                      <button
                        type="button"
                        onClick={() => addCell('sql')}
                        className="font-label text-[10px] tracking-widest text-primary-fixed hover:underline"
                      >
                        + ADD SQL CELL
                      </button>
                      <button
                        type="button"
                        onClick={() => addCell('markdown')}
                        className="font-label text-[10px] tracking-widest text-on-surface-variant hover:text-primary-fixed"
                      >
                        + ADD MARKDOWN
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Process / output panel */}
              <div
                className={[
                  'shrink-0 border-t border-outline-variant bg-black flex flex-col',
                  processOpen ? 'h-[28%]' : 'h-9',
                ].join(' ')}
              >
                <div className="flex h-9 shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-md">
                  <div className="flex items-center gap-md">
                    {(
                      [
                        ['process', 'PROCESS'],
                        ['output', 'OUTPUT'],
                        ['logs', 'LOGS'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setProcessOpen(true)
                          setProcessTab(id)
                        }}
                        className={[
                          'font-label text-[10px] tracking-widest',
                          processTab === id && processOpen
                            ? 'text-primary-fixed'
                            : 'text-on-surface-variant hover:text-on-surface',
                        ].join(' ')}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-md">
                    <span
                      className={`font-label text-[9px] tracking-widest ${runStateClass}`}
                    >
                      STATE · {runStateLabel}
                      {latestRun?.mode ? ` · ${latestRun.mode}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => setProcessOpen((v) => !v)}
                      className="font-label text-[9px] tracking-widest text-on-surface-variant hover:text-primary-fixed"
                    >
                      {processOpen ? 'COLLAPSE' : 'EXPAND'}
                    </button>
                  </div>
                </div>
                {processOpen ? (
                  <div className="min-h-0 flex-1 overflow-y-auto p-md font-mono text-[11px] leading-relaxed text-on-surface-variant">
                    {processTab === 'process' ? (
                      <>
                        <div className="text-primary-fixed">
                          Job: {selected.title}
                        </div>
                        <div>
                          Cells: {cells.length} · Mode:{' '}
                          {latestRun?.mode || runMode}
                          {latestRun?.mode === 'live' ||
                          runMode === 'validate'
                            ? ' (≤20 live rows)'
                            : ' (≤10 schema samples)'}
                        </div>
                        {latestRun ? (
                          <>
                            <div className="mt-sm">
                              Last run: {latestRun.status}
                              {latestRun.finishedAt
                                ? ` · ${new Date(latestRun.finishedAt).toLocaleTimeString()}`
                                : ''}
                            </div>
                            <div>{latestRun.summary}</div>
                            <div className="mt-sm space-y-xs">
                              {(latestRun.output?.cellResults || []).map(
                                (cr) => (
                                  <div key={cr.cellId}>
                                    [{cr.status}] {cr.kind} ·{' '}
                                    {cr.title || cr.cellId.slice(0, 8)}
                                  </div>
                                ),
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="mt-sm text-on-surface-variant/70">
                            No runs yet — press RUN ALL or RUN CELL for a
                            dry-run.
                          </div>
                        )}
                      </>
                    ) : null}
                    {processTab === 'output' ? (
                      (() => {
                        const live = latestRun?.output?.liveResults || []
                        const samples =
                          latestRun?.output?.samplePreviews || []
                        if (live.length > 0) {
                          return (
                            <div className="space-y-md">
                              <p className="text-on-surface-variant/80">
                                {latestRun?.output?.note ||
                                  'Live read-only results (capped).'}
                                {latestRun?.output?.connection
                                  ? ` · ${latestRun.output.connection.name} (${latestRun.output.connection.type})`
                                  : ''}
                              </p>
                              {live.map((pv, i) => (
                                <div
                                  key={`${pv.cellId}-${i}`}
                                  className="border border-primary-fixed/40"
                                >
                                  <div className="border-b border-outline-variant bg-surface-container-lowest px-sm py-xs font-label text-[9px] tracking-widest text-primary-fixed">
                                    VALIDATE ·{' '}
                                    {pv.cellTitle || pv.cellId.slice(0, 8)} ·{' '}
                                    {pv.rowCount} row
                                    {pv.rowCount === 1 ? '' : 's'}
                                    {pv.durationMs != null
                                      ? ` · ${pv.durationMs}ms`
                                      : ''}
                                    {pv.truncated ? ' · CAPPED ≤20' : ' · ≤20'}
                                  </div>
                                  <div className="overflow-x-auto p-sm">
                                    {pv.columns.length === 0 ? (
                                      <p className="text-on-surface-variant">
                                        Empty result set
                                      </p>
                                    ) : (
                                      <table className="min-w-full text-left text-[10px]">
                                        <thead>
                                          <tr>
                                            {pv.columns.map((c) => (
                                              <th
                                                key={c.name}
                                                className="border-b border-outline-variant px-sm py-xs text-on-surface-variant"
                                              >
                                                {c.name}
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {pv.rows.map((row, ri) => (
                                            <tr key={ri}>
                                              {pv.columns.map((c) => (
                                                <td
                                                  key={c.name}
                                                  className="border-b border-outline-variant/40 px-sm py-xs text-on-surface"
                                                >
                                                  {row[c.name] == null
                                                    ? 'null'
                                                    : String(row[c.name])}
                                                </td>
                                              ))}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        }
                        if (samples.length > 0) {
                          return (
                            <div className="space-y-md">
                              <p className="text-on-surface-variant/80">
                                {latestRun?.output?.note ||
                                  'Schema sample previews (not live warehouse).'}
                              </p>
                              {samples.map((pv, i) => (
                                <div
                                  key={`${pv.table}-${i}`}
                                  className="border border-outline-variant"
                                >
                                  <div className="border-b border-outline-variant bg-surface-container-lowest px-sm py-xs font-label text-[9px] tracking-widest text-primary-fixed">
                                    {pv.table}
                                    {pv.cellTitle ? ` · ${pv.cellTitle}` : ''}
                                  </div>
                                  <div className="overflow-x-auto p-sm">
                                    <table className="min-w-full text-left text-[10px]">
                                      <thead>
                                        <tr>
                                          {pv.columns.map((c) => (
                                            <th
                                              key={c.name}
                                              className="border-b border-outline-variant px-sm py-xs text-on-surface-variant"
                                            >
                                              {c.name}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {pv.rows.map((row, ri) => (
                                          <tr key={ri}>
                                            {pv.columns.map((c) => (
                                              <td
                                                key={c.name}
                                                className="border-b border-outline-variant/40 px-sm py-xs text-on-surface"
                                              >
                                                {row[c.name] == null
                                                  ? 'null'
                                                  : String(row[c.name])}
                                              </td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        }
                        return (
                          <>
                            <div className="text-on-surface-variant/70">
                              No output yet.
                            </div>
                            <div className="mt-sm">
                              Dry-run shows ≤10 schema samples; Validate
                              returns ≤20 live rows from PostgreSQL /
                              Databricks (never full tables).
                            </div>
                          </>
                        )
                      })()
                    ) : null}
                    {processTab === 'logs' ? (
                      latestRun?.logs?.length ? (
                        <div className="space-y-xs">
                          {latestRun.logs.map((log, i) => (
                            <div
                              key={`${log.ts}-${i}`}
                              className={
                                log.level === 'error'
                                  ? 'text-error'
                                  : log.level === 'warn'
                                    ? 'text-[#e8c07a]'
                                    : log.level === 'info'
                                      ? 'text-primary-fixed'
                                      : 'text-on-surface-variant'
                              }
                            >
                              [
                              {new Date(log.ts).toLocaleTimeString()}]{' '}
                              {log.message}
                            </div>
                          ))}
                          {running ? (
                            <div className="text-on-surface">_</div>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          <div className="text-primary-fixed">
                            Log stream idle
                          </div>
                          <div>Press RUN ALL to start a dry-run.</div>
                        </>
                      )
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </main>

        {/* Right: deploy / governance rail */}
        {selected && railOpen ? (
          <aside className="flex w-[280px] shrink-0 flex-col overflow-hidden border-l border-outline-variant bg-surface-container-lowest lg:w-[300px]">
            <div className="border-b border-outline-variant px-md py-sm">
              <h3 className="font-label text-[11px] font-bold tracking-widest text-primary-fixed">
                DEPLOY · GOVERNANCE
              </h3>
              <p className="mt-xs font-label text-[9px] tracking-widest text-on-surface-variant">
                UPDATED {new Date(selected.updatedAt).toLocaleString()}
              </p>
            </div>
            <div className="min-h-0 flex-1 space-y-md overflow-y-auto p-md">
              <section>
                <h4 className="mb-xs font-label text-[9px] tracking-widest text-on-surface-variant">
                  TABLES
                </h4>
                <div className="flex flex-wrap gap-xs">
                  {selected.tables.length === 0 ? (
                    <span className="font-body text-xs text-on-surface-variant">
                      —
                    </span>
                  ) : (
                    selected.tables.map((t) => (
                      <span
                        key={t}
                        className="border border-outline-variant px-xs py-[2px] font-body text-[10px] text-on-surface"
                      >
                        {t}
                      </span>
                    ))
                  )}
                </div>
              </section>

              <section>
                <h4 className="mb-xs font-label text-[9px] tracking-widest text-on-surface-variant">
                  SOURCES
                </h4>
                <p className="font-body text-[11px] text-on-surface-variant">
                  {selected.sources.length
                    ? selected.sources.join(' · ')
                    : '—'}
                </p>
              </section>

              {openDrift.length > 0 ? (
                <section className="border border-error/40 bg-error/10 p-sm">
                  <h4 className="font-label text-[9px] tracking-widest text-error">
                    DRIFT · BLOCKS EXPORT
                  </h4>
                  <ul className="mt-sm space-y-sm">
                    {openDrift.map((d) => (
                      <li
                        key={d.id}
                        className="font-body text-[11px] text-on-surface"
                      >
                        <span>
                          [{d.code}] {d.summary}
                        </span>
                        {canWrite ? (
                          <button
                            type="button"
                            className="mt-xs block border border-outline-variant px-sm py-[2px] font-label text-[8px] tracking-widest"
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
                <section className="border border-outline-variant p-sm">
                  <h4 className="font-label text-[9px] tracking-widest text-primary-fixed">
                    FROZEN CONTRACT
                  </h4>
                  <p className="mt-xs break-all font-body text-[10px] text-on-surface-variant">
                    {selected.schemaSnapshotId?.slice(0, 8) ||
                      selected.contract?.schemaSnapshotId?.slice(0, 8) ||
                      '—'}
                    …
                    {selected.contract?.frozenAt
                      ? ` · ${new Date(selected.contract.frozenAt).toLocaleString()}`
                      : ''}
                  </p>
                  {canWrite ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="mt-sm border border-outline-variant px-sm py-xs font-label text-[9px] tracking-widest disabled:opacity-40"
                      onClick={() =>
                        void updateJob(selected.id, {
                          refreezeContract: true,
                        })
                          .then((job) => {
                            setJobs((prev) =>
                              prev.map((j) => (j.id === job.id ? job : j)),
                            )
                            setToast('Contract re-frozen')
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
                      RE-FREEZE
                    </button>
                  ) : null}
                </section>
              ) : null}

              {selected.joinsSnapshot && selected.joinsSnapshot.length > 0 ? (
                <section>
                  <h4 className="mb-xs font-label text-[9px] tracking-widest text-on-surface-variant">
                    JOINS · {selected.joinsSnapshot.length}
                  </h4>
                  <ul className="space-y-xs">
                    {selected.joinsSnapshot.map((j) => (
                      <li
                        key={j.id}
                        className="font-body text-[10px] text-on-surface"
                      >
                        {j.fromTable}.{j.fromColumn} → {j.toTable}.{j.toColumn}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="border border-primary-fixed/30 bg-primary-container/5 p-sm">
                <h4 className="font-label text-[9px] tracking-widest text-primary-fixed">
                  DEPLOY
                </h4>
                {canWrite ? (
                  <div className="mt-sm flex flex-col gap-xs">
                    <button
                      type="button"
                      disabled={busy || selected.status === 'ready'}
                      onClick={() => void markReady()}
                      className="bg-primary-container px-sm py-sm font-label text-[10px] font-bold tracking-widest text-on-primary-fixed disabled:opacity-40"
                    >
                      MARK READY
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void doExport('sql')}
                      className="border border-outline-variant px-sm py-sm font-label text-[10px] tracking-widest text-on-surface disabled:opacity-40"
                    >
                      EXPORT SQL
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void doExport('json')}
                      className="border border-outline-variant px-sm py-sm font-label text-[10px] tracking-widest text-on-surface disabled:opacity-40"
                    >
                      EXPORT JSON
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void doDbtExport('dbt')}
                      className="border border-primary-fixed px-sm py-sm font-label text-[10px] tracking-widest text-primary-fixed disabled:opacity-40"
                    >
                      EXPORT DBT
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void doDbtExport('dbt-pr')}
                      className="border border-primary-fixed px-sm py-sm font-label text-[10px] tracking-widest text-primary-fixed disabled:opacity-40"
                    >
                      OPEN DBT PR
                    </button>
                  </div>
                ) : (
                  <p className="mt-sm font-label text-[9px] tracking-widest text-on-surface-variant">
                    READ-ONLY
                  </p>
                )}
                {githubReady ? (
                  <p className="mt-sm font-label text-[8px] tracking-widest text-on-surface-variant">
                    GH {githubReady.token ? 'TOKEN' : 'NO TOKEN'}
                    {githubReady.owner && githubReady.repo
                      ? ` · ${githubReady.owner}/${githubReady.repo}`
                      : ''}
                  </p>
                ) : null}
                {dbtGithub?.opened && dbtGithub.prUrl ? (
                  <a
                    href={dbtGithub.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-sm block truncate font-body text-[10px] text-primary-fixed underline"
                  >
                    {dbtGithub.prUrl}
                  </a>
                ) : null}
                {dbtFiles && dbtFiles.length > 0 ? (
                  <ul className="mt-sm space-y-xs border border-outline-variant p-xs">
                    {dbtFiles.map((f) => (
                      <li
                        key={f.path}
                        className="flex items-center justify-between gap-xs"
                      >
                        <code className="truncate font-body text-[9px] text-on-surface">
                          {f.path.split('/').pop()}
                        </code>
                        <button
                          type="button"
                          onClick={() => downloadDbtFile(f)}
                          className="shrink-0 font-label text-[8px] tracking-widest text-primary-fixed underline"
                        >
                          DL
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            </div>
            <div className="border-t border-outline-variant p-sm">
              <Link
                to="/workspace"
                className="block text-center font-label text-[10px] tracking-widest text-on-surface-variant hover:text-primary-fixed"
              >
                OPEN WORKSPACE
              </Link>
            </div>
          </aside>
        ) : null}
      </div>

      {createOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-md"
              role="dialog"
              aria-modal="true"
              aria-labelledby="que-new-job-title"
              onClick={(e) => {
                if (e.target === e.currentTarget && !creating) {
                  setCreateOpen(false)
                }
              }}
            >
              <div className="flex w-[min(100%,32rem)] flex-col border border-outline-variant bg-surface-container-lowest shadow-2xl">
                <div className="border-b border-outline-variant px-md py-sm">
                  <h3
                    id="que-new-job-title"
                    className="font-label text-[11px] font-bold tracking-widest text-primary-fixed"
                  >
                    NEW JOB
                  </h3>
                  <p className="mt-xs font-body text-[11px] leading-relaxed text-on-surface-variant">
                    Create a notebook manually — no AI chat required.
                  </p>
                </div>
                <div className="space-y-md p-md">
                  <label className="block">
                    <span className="font-label text-[9px] tracking-widest text-on-surface-variant">
                      TITLE
                    </span>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      autoFocus
                      className="mt-xs w-full border border-outline-variant bg-surface-container px-sm py-sm font-body text-sm text-on-surface outline-none focus:border-primary-fixed"
                      placeholder="Untitled Que job"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void submitCreateJob()
                        if (e.key === 'Escape' && !creating) setCreateOpen(false)
                      }}
                    />
                  </label>
                  <div>
                    <div className="mb-xs flex items-center justify-between gap-sm">
                      <span className="font-label text-[9px] tracking-widest text-on-surface-variant">
                        TABLES (OPTIONAL)
                      </span>
                      <span className="shrink-0 font-label text-[8px] tracking-widest text-on-surface-variant">
                        {newTables.length} SELECTED
                      </span>
                    </div>
                    {schemaTableNames.length === 0 ? (
                      <p className="font-body text-xs leading-relaxed text-on-surface-variant">
                        No synced tables yet — you can still create a blank
                        notebook and bind tables later.
                      </p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto border border-outline-variant bg-surface-container p-sm">
                        <div className="flex flex-wrap gap-xs">
                          {schemaTableNames.map((name) => {
                            const on = newTables.includes(name)
                            return (
                              <button
                                key={name}
                                type="button"
                                onClick={() => toggleNewTable(name)}
                                className={[
                                  'border px-sm py-xs font-body text-[11px]',
                                  on
                                    ? 'border-primary-fixed bg-primary-container/20 text-primary-fixed'
                                    : 'border-outline-variant text-on-surface-variant hover:border-primary-fixed',
                                ].join(' ')}
                              >
                                {name}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-sm border-t border-outline-variant p-md">
                  <button
                    type="button"
                    disabled={creating}
                    onClick={() => setCreateOpen(false)}
                    className="border border-outline-variant px-md py-sm font-label text-[10px] font-bold tracking-widest text-on-surface-variant disabled:opacity-40"
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    disabled={creating}
                    onClick={() => void submitCreateJob()}
                    className="bg-primary-container px-md py-sm font-label text-[10px] font-bold tracking-widest text-on-primary-fixed disabled:opacity-40"
                  >
                    {creating ? 'CREATING…' : 'CREATE'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </QueAppChrome>
  )
}

export default JobsPage
