import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import {
  JobsMonitorView,
  type LiveLogRow,
} from '@/components/jobs/JobsMonitorView'
import { TransformDraftsPanel } from '@/components/jobs/TransformDraftsPanel'
import { JobDeployPanel } from '@/components/jobs/JobDeployPanel'
import { JobManagedDataLayer } from '@/components/jobs/JobManagedDataLayer'
import { JobValidationLayer } from '@/components/jobs/JobValidationLayer'
import { JobScheduleControls } from '@/components/jobs/JobScheduleControls'
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
  fetchWorkspaceJobRuns,
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
  draft: 'bg-secondary-container text-on-secondary-container',
  ready: 'bg-tertiary/10 text-tertiary',
  exported: 'bg-secondary/10 text-secondary',
  archived: 'bg-outline-variant/20 text-on-surface-variant/50',
}

type ProcessTab = 'process' | 'output' | 'logs'
type JobViewTab = 'notebook' | 'results' | 'deploy'

function parseJobTab(raw: string | null): JobViewTab {
  if (raw === 'results' || raw === 'deploy') return raw
  return 'notebook'
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
 * Jobs — list (monitor) · notebook · results · deploy as separate focused views.
 */
export function JobsPage() {
  const { canWrite } = useWorkspaceRole()
  const { workspaceId } = useAuth()
  const navigate = useNavigate()
  const { jobId: routeJobId, tab: routeTab } = useParams<{
    jobId?: string
    tab?: string
  }>()
  const deepLinkJobId = routeJobId ?? null
  const jobTab = parseJobTab(routeTab ?? null)
  const [jobs, setJobs] = useState<StitchJob[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkJobId)
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
  const [liveLogs, setLiveLogs] = useState<LiveLogRow[]>([])
  const [recentRuns, setRecentRuns] = useState<JobRun[]>([])
  const [logQuery, setLogQuery] = useState('')
  const [streamPaused, setStreamPaused] = useState(false)
  const [githubReady, setGithubReady] = useState<{
    token: boolean
    owner: string
    repo: string
  } | null>(null)

  function goJobView(jobId: string, tab: JobViewTab = 'notebook') {
    navigate(`/jobs/${jobId}/${tab}`)
  }

  function goJobsList() {
    navigate('/jobs')
  }

  async function reload() {
    try {
      const [list, drift, runs] = await Promise.all([
        fetchJobs(),
        fetchDrift().catch(() => ({
          events: [],
          openHigh: [],
          hasBlockingRisk: false,
        })),
        fetchWorkspaceJobRuns({ limit: 40 }).catch(() => [] as JobRun[]),
      ])
      setJobs(list)
      setOpenDrift(drift.openHigh || [])
      setRecentRuns(runs)
      setError(null)
      setSelectedId((prev) => {
        if (deepLinkJobId && list.some((j) => j.id === deepLinkJobId)) {
          return deepLinkJobId
        }
        if (prev && list.some((j) => j.id === prev)) return prev
        return null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    setSelectedId(deepLinkJobId)
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
  }, [workspaceId, deepLinkJobId])

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

  // Load live stream from recent runs (monitor view)
  useEffect(() => {
    if (selectedId || streamPaused) return
    let cancelled = false
    async function loadLogs() {
      const top = jobs.slice(0, 6)
      const runsLists = await Promise.all(
        top.map((j) => fetchJobRuns(j.id).catch(() => [] as JobRun[])),
      )
      if (cancelled) return
      const rows: LiveLogRow[] = []
      runsLists.forEach((runs, i) => {
        const job = top[i]
        const run = runs[0]
        if (!run) return
        for (const log of run.logs || []) {
          rows.push({
            id: `${run.id}-${log.ts}-${rows.length}`,
            ts: log.ts,
            level: log.level,
            message: log.message,
            jobTitle: job.title,
          })
        }
        if (run.summary) {
          rows.push({
            id: `${run.id}-summary`,
            ts: run.finishedAt || run.startedAt || run.createdAt,
            level: run.status === 'failed' ? 'error' : 'info',
            message: run.summary,
            jobTitle: job.title,
          })
        }
      })
      rows.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
      setLiveLogs(rows.slice(0, 60))
    }
    void loadLogs()
    return () => {
      cancelled = true
    }
  }, [jobs, selectedId, streamPaused])

  /** Poll monitor + active runs while jobs are in flight. */
  useEffect(() => {
    const monitorActive = !selectedId && !streamPaused
    const runActive =
      running ||
      latestRun?.status === 'running' ||
      recentRuns.some(
        (r) => r.status === 'running' || r.status === 'queued',
      )
    if (!monitorActive && !runActive) return
    const id = window.setInterval(() => {
      void reload()
      if (selectedId) {
        void fetchJobRuns(selectedId)
          .then((runs) => {
            if (runs[0]) setLatestRun(runs[0])
          })
          .catch(() => undefined)
      }
    }, 8000)
    return () => window.clearInterval(id)
  }, [
    selectedId,
    streamPaused,
    running,
    latestRun?.status,
    recentRuns,
  ])

  function closeEditor() {
    if (
      notebookDirty &&
      !window.confirm(
        'Discard unsaved notebook changes and return to Sync Jobs?',
      )
    ) {
      return
    }
    setSelectedId(null)
    setDbtFiles(null)
    setDbtGithub(null)
    goJobsList()
  }

  function openJob(jobId: string) {
    if (
      notebookDirty &&
      selectedId &&
      jobId !== selectedId &&
      !window.confirm('Discard unsaved notebook changes?')
    ) {
      return
    }
    setSelectedId(jobId)
    setDbtFiles(null)
    setDbtGithub(null)
    goJobView(jobId, 'notebook')
  }

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
      goJobView(job.id, 'notebook')
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
      const { job, export: payload, artifact } = await exportJobArtifact(
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
      if (artifact?.downloadUrl) {
        try {
          await navigator.clipboard.writeText(artifact.downloadUrl)
          setToast(
            `Exported ${format.toUpperCase()} · signed URL copied (${artifact.expiresAt ? 'expires ' + new Date(artifact.expiresAt).toLocaleString() : 'timed'})`,
          )
        } catch {
          setToast(`Exported ${format.toUpperCase()} · signed URL minted`)
        }
      } else {
        setToast(`Exported ${format.toUpperCase()}`)
      }
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
      goJobView(selected.id, 'deploy')

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
      setLiveLogs((prev) => {
        const extra: LiveLogRow[] = (run.logs || []).map((log, i) => ({
          id: `${run.id}-${log.ts}-${i}`,
          ts: log.ts,
          level: log.level,
          message: log.message,
          jobTitle: selected.title,
        }))
        if (run.summary) {
          extra.unshift({
            id: `${run.id}-summary`,
            ts: run.finishedAt || run.startedAt || new Date().toISOString(),
            level: run.status === 'failed' ? 'error' : 'info',
            message: run.summary,
            jobTitle: selected.title,
          })
        }
        return [...extra, ...prev].slice(0, 60)
      })
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
      ? 'text-secondary'
      : latestRun?.status === 'failed'
        ? 'text-error'
        : latestRun?.status === 'succeeded'
          ? 'text-secondary'
          : 'text-on-surface-variant'

  return (
    <>
        {!selected ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {error ? (
            <p className="shrink-0 border-b border-error/40 bg-error/10 px-md py-sm font-body text-[12px] text-error">
              {error}
            </p>
          ) : null}
          {toast ? (
            <p className="shrink-0 border-b border-[#424850] bg-[rgba(170,181,192,0.08)] px-md py-sm text-[12px] text-[#d0d8e0]">
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
            <TransformDraftsPanel
              canWrite={canWrite}
              onApplied={(jobId) => {
                void reload()
                openJob(jobId)
              }}
            />
            <JobsMonitorView
              jobs={jobs}
              filtered={filtered}
              filter={filter}
              onFilterChange={setFilter}
              onRefresh={() => void reload()}
              onOpenJob={openJob}
              onCreate={() => openCreateDialog()}
              canWrite={canWrite}
              liveLogs={liveLogs}
              logQuery={logQuery}
              onLogQueryChange={setLogQuery}
              openDrift={openDrift}
              streamPaused={streamPaused}
              onToggleStreamPause={() => setStreamPaused((v) => !v)}
              recentRuns={recentRuns}
            />
          </div>
        ) : (
          <>
            <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
          {error ? (
            <p className="shrink-0 border-b border-error/40 bg-error/10 px-md py-sm font-body text-[12px] text-error">
              {error}
            </p>
          ) : null}
          {toast ? (
            <p className="shrink-0 border-b border-[#424850] bg-[rgba(170,181,192,0.08)] px-md py-sm text-[12px] text-[#d0d8e0]">
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
              <div className="flex h-14 shrink-0 items-center justify-between gap-md border-b border-outline-variant/20 bg-surface-container-low/70 px-lg">
                <div className="flex min-w-0 items-center gap-md">
                  <button
                    type="button"
                    onClick={closeEditor}
                    className="shrink-0 rounded-lg px-2 py-1.5 font-label text-[12px] text-on-surface-variant transition-colors hover:bg-secondary-container hover:text-secondary"
                    title="Back to Sync Jobs"
                  >
                    ←
                  </button>
                  <div className="flex min-w-0 items-center gap-2 rounded-xl border border-outline-variant/15 bg-secondary-container/80 px-3 py-1.5">
                    <span className="shrink-0 text-secondary" aria-hidden>
                      ⟨/⟩
                    </span>
                    <span className="truncate font-label text-[12px] font-medium text-on-secondary-container">
                      {selected.title}
                    </span>
                  </div>
                  <div className="hidden items-center gap-1.5 sm:flex">
                    <span
                      className={`rounded-md px-2 py-0.5 font-label text-[10px] font-bold uppercase ${STATUS_STYLE[selected.status]}`}
                    >
                      {selected.status === 'exported'
                        ? 'Production'
                        : selected.status}
                    </span>
                    {notebookDirty ? (
                      <span className="rounded-md bg-secondary/10 px-2 py-0.5 font-label text-[10px] font-bold text-secondary uppercase">
                        Modified
                      </span>
                    ) : (
                      <span className="rounded-md bg-tertiary/10 px-2 py-0.5 font-label text-[10px] font-bold text-tertiary uppercase">
                        Saved
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-sm">
                  <div className="mr-sm hidden items-center rounded-lg border border-outline-variant/25 bg-surface-container p-0.5 sm:flex">
                    {(
                      [
                        ['notebook', 'Notebook'],
                        ['results', 'Results'],
                        ['deploy', 'Deploy'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => goJobView(selected.id, id)}
                        className={[
                          'rounded-md px-2.5 py-1 font-label text-[11px] font-medium transition-colors',
                          jobTab === id
                            ? 'bg-surface-container-low text-secondary'
                            : 'text-on-surface-variant hover:text-secondary',
                        ].join(' ')}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {canWrite && jobTab === 'notebook' ? (
                    <>
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
                        className="hidden rounded-lg border border-outline-variant/30 bg-surface-container-low px-sm py-1.5 font-label text-[11px] text-on-surface outline-none disabled:opacity-40 md:block"
                        title="Run mode"
                      >
                        <option value="dry_run">Dry-run · ≤10</option>
                        <option value="validate">Validate · ≤20</option>
                      </select>
                      <button
                        type="button"
                        disabled={!canWrite || running}
                        onClick={() => void startRun('all')}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-label text-[12px] text-on-surface-variant transition-colors hover:bg-secondary-container disabled:opacity-40"
                      >
                        ▶ {running ? 'Running…' : 'Run Test'}
                      </button>
                      <button
                        type="button"
                        disabled={!notebookDirty || savingNotebook}
                        onClick={() => void saveNotebook()}
                        className="rounded bg-secondary px-3 py-1.5 font-label text-[12px] font-semibold text-on-secondary transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        {savingNotebook ? 'Saving…' : 'Commit'}
                      </button>
                    </>
                  ) : null}
                  {jobTab === 'notebook' ? (
                    <button
                      type="button"
                      onClick={() => goJobView(selected.id, 'deploy')}
                      className="rounded-lg border border-outline-variant/30 px-3 py-1.5 font-label text-[11px] text-on-surface-variant hover:bg-surface-container-highest"
                    >
                      Deploy →
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1 border-b border-outline-variant/15 bg-surface-container-low px-lg py-1 sm:hidden">
                {(
                  [
                    ['notebook', 'Notebook'],
                    ['results', 'Results'],
                    ['deploy', 'Deploy'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => goJobView(selected.id, id)}
                    className={[
                      'rounded-md px-2.5 py-1 font-label text-[11px]',
                      jobTab === id
                        ? 'bg-secondary/10 font-semibold text-secondary'
                        : 'text-on-surface-variant',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {jobTab === 'deploy' ? (
                <div className="flex min-h-0 flex-1 flex-col gap-md overflow-y-auto p-md">
                  <JobScheduleControls
                    job={selected}
                    canWrite={canWrite}
                    onUpdated={(job) => {
                      setJobs((prev) =>
                        prev.map((j) => (j.id === job.id ? job : j)),
                      )
                    }}
                  />
                  <JobDeployPanel
                  job={selected}
                  canWrite={canWrite}
                  busy={busy}
                  openDrift={openDrift}
                  githubReady={githubReady}
                  dbtFiles={dbtFiles}
                  dbtGithub={dbtGithub}
                  onAcknowledgeDrift={(id) =>
                    void acknowledgeDriftEvent(id)
                      .then(() => reload())
                      .catch((err) =>
                        setError(
                          err instanceof Error ? err.message : String(err),
                        ),
                      )
                  }
                  onJobUpdated={(job) => {
                    setJobs((prev) =>
                      prev.map((j) => (j.id === job.id ? job : j)),
                    )
                  }}
                  onError={(message) => setError(message)}
                  onToast={(message) => setToast(message)}
                  onBusy={setBusy}
                  onMarkReady={() => void markReady()}
                  onDbtPr={() => void doDbtExport('dbt-pr')}
                  onDbtBundle={() => void doDbtExport('dbt')}
                  onExportSql={() => void doExport('sql')}
                  onExportJson={() => void doExport('json')}
                  onDownloadDbtFile={downloadDbtFile}
                  onBackToNotebook={() => goJobView(selected.id, 'notebook')}
                />
                </div>
              ) : null}

              {jobTab === 'results' ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-container-low">
                  <div className="shrink-0 border-b border-outline-variant/15 px-lg py-md">
                    <h2 className="font-headline text-base font-semibold text-on-surface">
                      Results · Preview
                    </h2>
                    <p className="mt-1 font-body text-[12px] text-on-surface-variant">
                      Run output, managed preview/certify, and validation checks
                      under the same job — no separate Validation page.
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 space-y-lg overflow-y-auto p-lg">
                    <div className="mx-auto max-w-[64rem] space-y-lg">
                      <JobPreviewPanel latestRun={latestRun} />
                      <JobManagedDataLayer
                        jobId={selected.id}
                        canWrite={canWrite}
                      />
                      <JobValidationLayer
                        jobId={selected.id}
                        canWrite={canWrite}
                      />
                    </div>
                  </div>
                  <div className="shrink-0 border-t border-outline-variant/20 bg-surface-container px-lg py-sm">
                    <div className="mx-auto flex max-w-[64rem] flex-wrap items-center gap-sm">
                      <ExecStat
                        label="Latency"
                        value={
                          latestRun?.output?.liveResults?.[0]?.durationMs !=
                          null
                            ? `${latestRun.output.liveResults[0].durationMs}ms`
                            : '—'
                        }
                        tint="border border-outline-variant/15 bg-surface-container-low"
                      />
                      <ExecStat
                        label="State"
                        value={runStateLabel}
                        tint="border border-outline-variant/15 bg-secondary-container/50"
                      />
                      <ExecStat
                        label="Mode"
                        value={(latestRun?.mode || runMode).replace('_', ' ')}
                        tint="border border-outline-variant/15 bg-surface-container-low"
                      />
                      {canWrite ? (
                        <button
                          type="button"
                          disabled={running}
                          onClick={() => void startRun('all')}
                          className="ml-auto rounded bg-secondary px-md py-1.5 font-label text-[12px] font-semibold text-on-secondary disabled:opacity-40"
                        >
                          {running ? 'Running…' : 'Run again'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {jobTab === 'notebook' && canWrite ? (
                <div className="flex shrink-0 flex-wrap items-center gap-xs border-b border-outline-variant/15 bg-surface-container-low/80 px-lg py-1.5">
                  <button
                    type="button"
                    onClick={() => addCell('sql')}
                    className="rounded-lg px-2.5 py-1 font-label text-[11px] text-secondary hover:bg-surface-container-highest"
                  >
                    + SQL
                  </button>
                  <button
                    type="button"
                    onClick={() => addCell('markdown')}
                    className="rounded-lg px-2.5 py-1 font-label text-[11px] text-on-surface-variant hover:bg-surface-container-highest"
                  >
                    + Markdown
                  </button>
                  <button
                    type="button"
                    disabled={!activeCellId || running}
                    onClick={() => void startRun('cell')}
                    className="rounded-lg px-2.5 py-1 font-label text-[11px] text-on-surface-variant hover:bg-surface-container-highest disabled:opacity-40"
                  >
                    Run cell
                  </button>
                  <button
                    type="button"
                    disabled={!notebookDirty || savingNotebook}
                    onClick={() => discardNotebook()}
                    className="rounded-lg px-2.5 py-1 font-label text-[11px] text-on-surface-variant hover:bg-surface-container-highest disabled:opacity-40"
                  >
                    Discard
                  </button>
                  <span className="ml-auto font-label text-[11px] text-on-surface-variant/70">
                    {cells.length} cell{cells.length === 1 ? '' : 's'}
                    {notebookDirty ? ' · unsaved' : ''}
                    <button
                      type="button"
                      className="ml-sm text-secondary underline"
                      onClick={() => goJobView(selected.id, 'results')}
                    >
                      View results
                    </button>
                  </span>
                </div>
              ) : null}

              {jobTab === 'notebook' ? (
              <>
              <div className="flex min-h-0 flex-1 overflow-hidden">
                <div className="flex min-w-0 flex-1 flex-col bg-surface-container-low">
                  <div className="flex h-9 shrink-0 items-center justify-between border-b border-outline-variant/10 bg-surface-container/80 px-4">
                    <span className="font-label text-[11px] tracking-[0.12em] text-on-surface-variant/70 uppercase">
                      Notebook
                    </span>
                    <span className="font-label text-[10px] text-on-surface-variant/50">
                      {cells.length} cell{cells.length === 1 ? '' : 's'} · SQL ·
                      Markdown
                    </span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto bg-surface-container-low/55 p-lg">
                    <div className="mx-auto max-w-[48rem] space-y-md">
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
                          onChangeTitle={(title) =>
                            patchCell(cell.id, { title })
                          }
                          onChangeKind={(kind) =>
                            patchCell(cell.id, { kind })
                          }
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
                        <div className="flex flex-wrap justify-center gap-md rounded-lg border border-dashed border-outline-variant/35 bg-surface-container-low/50 py-lg">
                          <button
                            type="button"
                            onClick={() => addCell('sql')}
                            className="rounded-xl bg-secondary/10 px-md py-sm font-label text-[12px] font-medium text-secondary hover:bg-secondary/15"
                          >
                            + SQL cell
                          </button>
                          <button
                            type="button"
                            onClick={() => addCell('markdown')}
                            className="rounded-xl bg-secondary-container/80 px-md py-sm font-label text-[12px] font-medium text-on-secondary-container hover:bg-secondary-container"
                          >
                            + Markdown
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Process / output panel */}
              <div
                className={[
                  'shrink-0 border-t border-outline-variant/20 bg-surface-container-low flex flex-col',
                  processOpen ? 'h-[26%]' : 'h-9',
                ].join(' ')}
              >
                <div className="flex h-9 shrink-0 items-center justify-between border-b border-outline-variant/15 bg-surface-container-low/40 px-md">
                  <div className="flex items-center gap-md">
                    {(
                      [
                        ['process', 'Process'],
                        ['output', 'Output'],
                        ['logs', 'Logs'],
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
                          'font-label text-[11px]',
                          processTab === id && processOpen
                            ? 'font-semibold text-secondary'
                            : 'text-on-surface-variant hover:text-on-surface',
                        ].join(' ')}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-md">
                    <span
                      className={`font-label text-[11px] ${runStateClass}`}
                    >
                      {runStateLabel}
                      {latestRun?.mode ? ` · ${latestRun.mode}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => setProcessOpen((v) => !v)}
                      className="font-label text-[11px] text-on-surface-variant hover:text-secondary"
                    >
                      {processOpen ? 'Collapse' : 'Expand'}
                    </button>
                  </div>
                </div>
                {processOpen ? (
                  <div className="min-h-0 flex-1 overflow-y-auto bg-surface-container p-md font-mono text-[11px] leading-relaxed text-on-surface-variant">
                    {processTab === 'process' ? (
                      <>
                        <div className="font-medium text-secondary">
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
                          <div className="mt-sm text-on-surface-variant/60">
                            No runs yet — press Run Test for a dry-run.
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
                                  className="overflow-hidden rounded-xl border border-outline-variant/25 bg-surface-container-low"
                                >
                                  <div className="border-b border-outline-variant/15 bg-secondary-container/40 px-sm py-xs font-label text-[10px] tracking-wide text-secondary">
                                    Validate ·{' '}
                                    {pv.cellTitle || pv.cellId.slice(0, 8)} ·{' '}
                                    {pv.rowCount} row
                                    {pv.rowCount === 1 ? '' : 's'}
                                    {pv.durationMs != null
                                      ? ` · ${pv.durationMs}ms`
                                      : ''}
                                    {pv.truncated ? ' · capped ≤20' : ' · ≤20'}
                                  </div>
                                  <div className="overflow-x-auto p-sm">
                                    {pv.columns.length === 0 ? (
                                      <p className="text-on-surface-variant/60">
                                        Empty result set
                                      </p>
                                    ) : (
                                      <table className="min-w-full text-left text-[10px]">
                                        <thead>
                                          <tr>
                                            {pv.columns.map((c) => (
                                              <th
                                                key={c.name}
                                                className="border-b border-outline-variant/20 px-sm py-xs text-on-surface-variant/55"
                                              >
                                                {c.name}
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {pv.rows.map((row, ri) => (
                                            <tr
                                              key={ri}
                                              className="hover:bg-secondary-container/20"
                                            >
                                              {pv.columns.map((c) => (
                                                <td
                                                  key={c.name}
                                                  className="border-b border-outline-variant/10 px-sm py-xs text-on-surface"
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
                                Schema sample previews (capped).
                              </p>
                              {samples.map((pv, i) => (
                                <div
                                  key={`${pv.table}-${i}`}
                                  className="overflow-hidden rounded-xl border border-outline-variant/25 bg-surface-container-low"
                                >
                                  <div className="border-b border-outline-variant/15 bg-secondary-container/40 px-sm py-xs font-label text-[10px] tracking-wide text-secondary">
                                    {pv.table} · {pv.rowCount} rows
                                  </div>
                                  <div className="overflow-x-auto p-sm">
                                    <table className="min-w-full text-left text-[10px]">
                                      <thead>
                                        <tr>
                                          {pv.columns.map((c) => (
                                            <th
                                              key={c.name}
                                              className="border-b border-outline-variant/20 px-sm py-xs text-on-surface-variant/55"
                                            >
                                              {c.name}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {pv.rows.map((row, ri) => (
                                          <tr
                                            key={ri}
                                            className="hover:bg-secondary-container/20"
                                          >
                                            {pv.columns.map((c) => (
                                              <td
                                                key={c.name}
                                                className="border-b border-outline-variant/10 px-sm py-xs text-on-surface"
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
                          <div className="text-on-surface-variant/60">
                            No output yet — run a test to see samples.
                          </div>
                        )
                      })()
                    ) : null}
                    {processTab === 'logs' ? (
                      latestRun?.logs?.length ? (
                        <div className="space-y-1">
                          {latestRun.logs.map((log, i) => (
                            <div key={`${log.ts}-${i}`}>
                              <span className="text-on-surface-variant/45">
                                [{new Date(log.ts).toLocaleTimeString()}]
                              </span>{' '}
                              <span
                                className={
                                  log.level === 'error'
                                    ? 'text-error'
                                    : log.level === 'warn'
                                      ? 'text-secondary'
                                      : 'text-on-surface-variant/75'
                                }
                              >
                                {log.level}
                              </span>{' '}
                              {log.message}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-on-surface-variant/60">
                          No logs yet.
                        </div>
                      )
                    ) : null}
                  </div>
                ) : null}
              </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-md border-t border-outline-variant/20 bg-surface-container-low/90 px-lg py-sm">
                <div className="mr-sm hidden font-label text-[10px] tracking-[0.14em] text-on-surface-variant/55 uppercase sm:block">
                  Execution
                </div>
                <ExecStat
                  label="Latency"
                  value={
                    latestRun?.output?.liveResults?.[0]?.durationMs != null
                      ? `${latestRun.output.liveResults[0].durationMs}ms`
                      : '—'
                  }
                  tint="border border-outline-variant/15 bg-surface-container-low/80"
                />
                <ExecStat
                  label="State"
                  value={runStateLabel}
                  tint="border border-outline-variant/15 bg-secondary-container/50"
                />
                <ExecStat
                  label="Mode"
                  value={(latestRun?.mode || runMode).replace('_', ' ')}
                  tint="border border-outline-variant/15 bg-surface-container-low"
                />
                <button
                  type="button"
                  onClick={() => goJobView(selected.id, 'results')}
                  className="rounded-lg px-2 py-1 font-label text-[11px] text-secondary hover:underline"
                >
                  Open results →
                </button>
                <div className="ml-auto flex items-center gap-3 font-label text-[11px] text-on-surface-variant">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] tracking-wide text-on-surface-variant/55 uppercase">
                      Auto-save
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-tertiary" />
                      Cloud sync active
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProcessOpen((v) => !v)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
                    title={processOpen ? 'Collapse process' : 'Expand process'}
                  >
                    {processOpen ? '▾' : '▴'}
                  </button>
                </div>
              </div>
              </>
              ) : null}
            </main>
          </>
        )}

      {createOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[300] flex items-center justify-center bg-[#161a32]/50 p-md backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="que-new-job-title"
              onClick={(e) => {
                if (e.target === e.currentTarget && !creating) {
                  setCreateOpen(false)
                }
              }}
            >
              <div className="flex w-[min(100%,32rem)] flex-col rounded-lg border border-outline-variant/30 bg-surface-container-lowest">
                <div className="border-b border-outline-variant px-md py-sm">
                  <h3
                    id="que-new-job-title"
                    className="font-label text-[11px] font-bold tracking-widest text-secondary"
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
                      className="mt-xs w-full border border-outline-variant bg-surface-container px-sm py-sm font-body text-[13px] text-on-surface outline-none focus:border-secondary-fixed"
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
                      <p className="font-body text-[12px] leading-relaxed text-on-surface-variant">
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
                                    ? 'border-secondary bg-secondary/20 text-secondary'
                                    : 'border-outline-variant text-on-surface-variant hover:border-secondary-fixed',
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
                    className="bg-secondary px-md py-sm font-label text-[10px] font-bold tracking-widest text-on-secondary-fixed disabled:opacity-40"
                  >
                    {creating ? 'CREATING…' : 'CREATE'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function ExecStat({
  label,
  value,
  tint,
}: {
  label: string
  value: string
  tint: string
}) {
  return (
    <div
      className={`flex min-w-[7.5rem] items-center gap-3 rounded-xl px-3 py-2 ${tint}`}
    >
      <div>
        <p className="font-label text-[10px] tracking-wide text-on-surface-variant/60 uppercase">
          {label}
        </p>
        <p className="font-label text-[12px] font-semibold capitalize text-on-surface">
          {value}
        </p>
      </div>
    </div>
  )
}

function JobPreviewPanel({ latestRun }: { latestRun: JobRun | null }) {
  const live = latestRun?.output?.liveResults || []
  const samples = latestRun?.output?.samplePreviews || []
  if (!latestRun) {
    return (
      <p className="font-body text-[13px] text-on-surface-variant">
        Run Test to populate input samples and output results.
      </p>
    )
  }
  return (
    <>
      <div className="space-y-sm">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-label text-[12px] text-on-surface-variant">
            <span className="text-secondary">⇩</span> Input Sample
          </h3>
          <span className="font-label text-[10px] text-on-surface-variant/50">
            {samples[0]
              ? `${samples[0].rowCount} rows`
              : live[0]
                ? `${live[0].rowCount} rows`
                : '—'}
          </span>
        </div>
        <PreviewTable
          columns={
            samples[0]?.columns ||
            live[0]?.columns ||
            []
          }
          rows={samples[0]?.rows || live[0]?.rows || []}
          headerClass="bg-surface-container-low text-on-surface-variant/60"
        />
      </div>
      <div className="space-y-sm">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-label text-[12px] text-on-surface-variant">
            <span className="text-tertiary">⇧</span> Output Result
          </h3>
          <span
            className={`rounded px-2 py-0.5 font-label text-[10px] font-bold uppercase ${ latestRun.status === 'succeeded' ? 'bg-tertiary/10 text-tertiary' : latestRun.status === 'failed' ? 'bg-error/10 text-error' : 'bg-secondary/10 text-secondary' }`}
          >
            {latestRun.status}
          </span>
        </div>
        <PreviewTable
          columns={live[0]?.columns || samples[0]?.columns || []}
          rows={live[0]?.rows || samples[0]?.rows || []}
          headerClass="bg-tertiary/10 text-tertiary"
          wrapClass="rounded-xl border border-tertiary/30 bg-tertiary/5"
        />
        <p className="font-body text-[12px] text-on-surface-variant">
          {latestRun.summary}
        </p>
      </div>
    </>
  )
}

function PreviewTable({
  columns,
  rows,
  headerClass,
  wrapClass = 'overflow-x-auto rounded-xl border border-outline-variant/20',
}: {
  columns: { name: string }[]
  rows: Record<string, unknown>[]
  headerClass: string
  wrapClass?: string
}) {
  if (!columns.length) {
    return (
      <div className={`${wrapClass} p-3 font-body text-[12px] text-on-surface-variant`}>
        No preview rows yet
      </div>
    )
  }
  return (
    <div className={wrapClass}>
      <table className="w-full text-left font-label text-[11px]">
        <thead className={`${headerClass} uppercase tracking-widest`}>
          <tr>
            {columns.slice(0, 4).map((c) => (
              <th key={c.name} className="border-b border-outline-variant/10 p-3">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-on-surface-variant">
          {rows.slice(0, 5).map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-outline-variant/5 hover:bg-secondary-container/20"
            >
              {columns.slice(0, 4).map((c) => (
                <td key={c.name} className="p-3 font-mono text-[11px]">
                  {row[c.name] == null ? 'null' : String(row[c.name])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default JobsPage
