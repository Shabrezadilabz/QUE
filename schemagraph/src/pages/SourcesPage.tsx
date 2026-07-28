import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import {
  SourceTypeIcon,
  sourceTypeLabel,
} from '@/components/sidebar/SourceTypeIcon'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import { useAuth } from '@/context/AuthContext'
import {
  createConnection,
  deleteConnection,
  fetchWorkspaceSources,
  syncConnection,
  updateConnection,
  uploadConnectionFiles,
  uploadSpreadsheetSource,
} from '@/services/stitchApi'
import { notifySchemaChanged } from '@/utils/schemaChangeBus'
import type {
  DataSource,
  DataSourceStatus,
  DataSourceType,
} from '@/types/dataSource'

const CREATABLE: DataSourceType[] = [
  'postgresql',
  'excel',
  'csv',
  'mongodb',
  'databricks',
]

const STATUS_DOT: Record<DataSourceStatus, string> = {
  active: 'bg-tertiary',
  warning: 'bg-sand',
  error: 'bg-error',
}

type FormState = {
  name: string
  type: DataSourceType
  description: string
  host: string
  port: string
  database: string
  user: string
  password: string
  schema: string
  uri: string
  filesJson: string
  dbxMode: 'fixture' | 'live'
  fixturesPath: string
  warehouseId: string
  token: string
  catalog: string
}

type CatalogItem = {
  key: string
  title: string
  category: string
  blurb: string
  type?: DataSourceType
  creatable: boolean
}

const CONNECTOR_CATALOG: CatalogItem[] = [
  {
    key: 'postgresql',
    title: 'PostgreSQL',
    category: 'Relational DB',
    blurb: 'Connect to your managed RDS or on-prem instances.',
    type: 'postgresql',
    creatable: true,
  },
  {
    key: 'snowflake',
    title: 'Snowflake',
    category: 'Data Warehouse',
    blurb: 'Cloud data platform for enterprise analytics.',
    creatable: false,
  },
  {
    key: 's3',
    title: 'AWS S3',
    category: 'Object Store',
    blurb: 'Sync JSON, CSV, or Parquet files from buckets.',
    creatable: false,
  },
  {
    key: 'mongodb',
    title: 'MongoDB',
    category: 'NoSQL',
    blurb: 'High-performance document-based database.',
    type: 'mongodb',
    creatable: true,
  },
  {
    key: 'excel',
    title: 'Excel',
    category: 'Spreadsheet',
    blurb: 'Upload workbooks — Que infers tables and columns.',
    type: 'excel',
    creatable: true,
  },
  {
    key: 'csv',
    title: 'CSV',
    category: 'Flat file',
    blurb: 'Drop CSV/TSV samples for quick schema onboarding.',
    type: 'csv',
    creatable: true,
  },
  {
    key: 'databricks',
    title: 'Databricks',
    category: 'Lakehouse',
    blurb: 'Unity Catalog fixtures or live SQL warehouse.',
    type: 'databricks',
    creatable: true,
  },
  {
    key: 'bigquery',
    title: 'BigQuery',
    category: 'Data Warehouse',
    blurb: "Google's serverless, multi-cloud data warehouse.",
    creatable: false,
  },
]

const WIZARD_STEPS = [
  'Sources',
  'Transformation',
  'Schedule',
  'Review',
] as const

const emptyForm = (type: DataSourceType = 'postgresql'): FormState => ({
  name: '',
  type,
  description: '',
  host: type === 'databricks' ? '' : 'localhost',
  port: type === 'mongodb' ? '27017' : '5432',
  database: 'customer_demo',
  user: type === 'postgresql' ? 'stitch' : '',
  password: '',
  schema: type === 'databricks' ? 'analytics' : 'public',
  uri: 'mongodb://localhost:27017',
  filesJson: JSON.stringify(
    [{ path: 'fixtures/campaigns.csv', tableName: 'campaigns' }],
    null,
    2,
  ),
  dbxMode: 'fixture',
  fixturesPath: 'fixtures/databricks_unity_demo.json',
  warehouseId: '',
  token: '',
  catalog: 'main',
})

function formFromSource(s: DataSource): FormState {
  const c = (s.config ?? {}) as Record<string, unknown>
  return {
    name: s.name,
    type: s.type,
    description: s.description ?? '',
    host: String(c.host ?? (s.type === 'databricks' ? '' : 'localhost')),
    port: String(c.port ?? (s.type === 'mongodb' ? '27017' : '5432')),
    database: String(c.database ?? 'customer_demo'),
    user: String(c.user ?? ''),
    password:
      typeof c.password === 'string' && c.password !== '••••••••'
        ? c.password
        : '',
    schema: String(
      c.schema ?? (s.type === 'databricks' ? 'analytics' : 'public'),
    ),
    uri: String(c.uri ?? 'mongodb://localhost:27017'),
    filesJson: JSON.stringify(
      c.files ??
        (c.path
          ? [{ path: c.path, tableName: c.tableName }]
          : [{ path: 'fixtures/campaigns.csv', tableName: 'campaigns' }]),
      null,
      2,
    ),
    dbxMode: c.mode === 'live' ? 'live' : 'fixture',
    fixturesPath: String(
      c.fixturesPath ?? 'fixtures/databricks_unity_demo.json',
    ),
    warehouseId: String(c.warehouseId ?? ''),
    token:
      typeof c.token === 'string' && c.token !== '••••••••' ? c.token : '',
    catalog: String(c.catalog ?? 'main'),
  }
}

function buildConfig(form: FormState): Record<string, unknown> {
  if (form.type === 'postgresql') {
    return {
      host: form.host,
      port: Number(form.port) || 5432,
      database: form.database,
      user: form.user,
      password: form.password,
      schema: form.schema || 'public',
      includeSamples: true,
      sampleLimit: 5,
    }
  }
  if (form.type === 'mongodb') {
    return {
      uri: form.uri || `mongodb://${form.host}:${form.port || 27017}`,
      database: form.database,
      sampleSize: 50,
      includeSamples: true,
      sampleLimit: 5,
      maxDepth: 3,
    }
  }
  if (form.type === 'databricks') {
    if (form.dbxMode === 'live') {
      return {
        mode: 'live',
        host: form.host,
        warehouseId: form.warehouseId,
        token: form.token,
        catalog: form.catalog || 'main',
        schema: form.schema || 'default',
        includeSamples: true,
        sampleLimit: 5,
      }
    }
    return {
      mode: 'fixture',
      fixturesPath: form.fixturesPath || 'fixtures/databricks_unity_demo.json',
      catalog: form.catalog || 'main',
      schema: form.schema || 'analytics',
      includeSamples: true,
      sampleLimit: 5,
    }
  }
  let files: unknown[] = []
  try {
    files = JSON.parse(form.filesJson)
    if (!Array.isArray(files)) files = []
  } catch {
    files = []
  }
  return {
    files,
    includeSamples: true,
    sampleLimit: 5,
  }
}

function relativeSyncLabel(iso?: string): string {
  if (!iso) return 'Never synced'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'Never synced'
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (mins < 1) return 'Synced just now'
  if (mins < 60) return `Synced ${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 48) return `Synced ${hrs}h ago`
  return `Synced ${Math.round(hrs / 24)}d ago`
}

function statusBadge(status: DataSourceStatus): {
  label: string
  className: string
} {
  if (status === 'active') {
    return {
      label: 'Connected',
      className: 'bg-tertiary/10 text-tertiary',
    }
  }
  if (status === 'warning') {
    return {
      label: 'Syncing',
      className: 'bg-primary/10 text-primary',
    }
  }
  return {
    label: 'Error',
    className: 'bg-error/10 text-error',
  }
}

/**
 * Sources — Sunset Clay list + create-sync-job wizard.
 */
export function SourcesPage() {
  const { canWrite, canAdmin } = useWorkspaceRole()
  const { workspaceId, workspaces } = useAuth()
  const workspaceName =
    workspaces.find((w) => w.id === workspaceId)?.name || 'Workspace'
  const [sources, setSources] = useState<DataSource[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [catalogKey, setCatalogKey] = useState<string | null>(null)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [scheduleMode, setScheduleMode] = useState<'ondemand' | 'manual'>(
    'ondemand',
  )
  const [form, setForm] = useState<FormState>(emptyForm())
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [tableNameOverrides, setTableNameOverrides] = useState('')

  async function reload(preferId?: string | null) {
    const list = await fetchWorkspaceSources()
    setSources(list)
    const nextId =
      preferId && list.some((x) => x.id === preferId)
        ? preferId
        : selectedId && list.some((x) => x.id === selectedId)
          ? selectedId
          : null
    setSelectedId(nextId)
    if (preferId) {
      const s = list.find((x) => x.id === preferId)
      if (s) {
        setCreating(false)
        setWizardStep(1)
        setForm(formFromSource(s))
      }
    }
  }

  useEffect(() => {
    setSelectedId(null)
    setCreating(false)
    setWizardStep(1)
    reload().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  useEffect(() => {
    if (creating) return
    const s = sources.find((x) => x.id === selectedId)
    if (s) setForm(formFromSource(s))
  }, [selectedId, sources, creating])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return sources
    return sources.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        (s.description?.toLowerCase().includes(q) ?? false),
    )
  }, [sources, filter])

  const catalogFiltered = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase()
    if (!q) return CONNECTOR_CATALOG
    return CONNECTOR_CATALOG.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.blurb.toLowerCase().includes(q),
    )
  }, [catalogQuery])

  const selected = sources.find((s) => s.id === selectedId) ?? null
  const syncable = creating
    ? CREATABLE.includes(form.type)
    : Boolean(selected?.syncable)

  const selectedCatalog = CONNECTOR_CATALOG.find((c) => c.key === catalogKey)
  const canAdvanceFromSources = Boolean(
    selectedCatalog?.creatable && selectedCatalog.type,
  )

  const healthActive = sources.filter((s) => s.status === 'active').length
  const healthPct =
    sources.length === 0
      ? 100
      : Math.round((healthActive / sources.length) * 10000) / 100

  function startCreate() {
    setCreating(true)
    setSelectedId(null)
    setWizardStep(1)
    setCatalogKey(null)
    setCatalogQuery('')
    setScheduleMode('ondemand')
    setForm(emptyForm('postgresql'))
    setPendingFiles([])
    setTableNameOverrides('')
    setError(null)
  }

  function cancelWizard() {
    setCreating(false)
    setWizardStep(1)
    setCatalogKey(null)
    setError(null)
  }

  function pickCatalog(item: CatalogItem) {
    setCatalogKey(item.key)
    if (!item.creatable || !item.type) {
      setToast(`${item.title} — request access / coming soon`)
      return
    }
    setForm((f) => ({
      ...emptyForm(item.type!),
      name: f.name,
      description: f.description,
      type: item.type!,
    }))
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (
        creating &&
        (form.type === 'excel' || form.type === 'csv') &&
        pendingFiles.length > 0
      ) {
        const names = tableNameOverrides
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        const result = await uploadSpreadsheetSource({
          files: pendingFiles,
          name: form.name.trim() || pendingFiles[0].name,
          type: form.type,
          description: form.description.trim() || undefined,
          tableNames: names.length ? names : undefined,
        })
        const sync = result.sync
        setToast(
          sync && !sync.error
            ? `Uploaded ${result.uploaded.length} file(s) · ${sync.tablesSynced ?? 0} table(s) analyzed`
            : `Uploaded ${result.uploaded.length} file(s)${sync?.error ? ` · sync: ${sync.error}` : ''}`,
        )
        setCreating(false)
        setWizardStep(1)
        setPendingFiles([])
        notifySchemaChanged('sync')
        await reload(result.connection.id)
        return
      }

      if (
        creating &&
        (form.type === 'excel' || form.type === 'csv') &&
        pendingFiles.length === 0
      ) {
        throw new Error('Choose one or more Excel/CSV files to upload')
      }

      const config = buildConfig(form)
      if (creating) {
        const created = await createConnection({
          name: form.name.trim(),
          type: form.type,
          description: form.description.trim() || undefined,
          status: 'warning',
          config,
        })
        setToast(`Created ${created.name}`)
        setCreating(false)
        setWizardStep(1)
        notifySchemaChanged('connection')
        await reload(created.id)
      } else if (selected) {
        const updated = await updateConnection(selected.id, {
          name: form.name.trim(),
          type: form.type,
          description: form.description.trim() || null,
          config,
        })
        setToast(`Saved ${updated.name}`)
        notifySchemaChanged('connection')
        await reload(updated.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function uploadMoreFiles(fileList: FileList | null) {
    if (!selected || creating || !fileList?.length) return
    if (selected.type !== 'excel' && selected.type !== 'csv') return
    setBusy(true)
    setError(null)
    try {
      const files = [...fileList]
      const names = tableNameOverrides
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const result = await uploadConnectionFiles(selected.id, files, {
        tableNames: names.length ? names : undefined,
        sync: true,
      })
      setToast(
        `Added ${result.uploaded.length} file(s) · ${result.sync?.tablesSynced ?? 0} table(s)`,
      )
      setPendingFiles([])
      notifySchemaChanged('sync')
      await reload(selected.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!selected || creating) return
    if (
      !window.confirm(
        `Delete connection “${selected.name}”? Schema objects for this source will be removed.`,
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await deleteConnection(selected.id)
      setToast(`Deleted ${selected.name}`)
      setSelectedId(null)
      notifySchemaChanged('connection')
      await reload(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function sync() {
    if (!selected || creating || !selected.syncable) return
    setBusy(true)
    setError(null)
    try {
      const result = await syncConnection(selected.id)
      const drift = result.drift as
        | { hasRisk?: boolean; summary?: string; severity?: string }
        | undefined
      setToast(
        drift?.hasRisk
          ? `Synced · DRIFT ${drift.severity?.toUpperCase() || 'RISK'}: ${drift.summary}`
          : `Synced ${result.tablesSynced} tables · ${result.relationshipsSynced} FKs · ${result.suggestedJoins ?? 0} suggestions`,
      )
      notifySchemaChanged('sync')
      await reload(selected.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const banners = (
    <>
      {error ? (
        <p className="border-b border-error/40 bg-error/10 px-md py-sm font-body text-xs text-error">
          {error}
        </p>
      ) : null}
      {toast ? (
        <p className="border-b border-primary/20 bg-primary-container/10 px-md py-sm font-label text-[10px] tracking-widest text-primary">
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
    </>
  )

  if (creating) {
    return (
      <QueAppChrome eyebrow="SOURCES · NEW SYNC">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
          {banners}
          <div className="min-h-0 flex-1 overflow-y-auto px-md py-lg md:px-lg lg:px-margin-desktop">
            <div className="mx-auto w-full max-w-5xl">
              <div className="mb-xl">
                <h1 className="font-headline text-3xl font-semibold tracking-tight text-on-surface">
                  Create New Sync Job
                </h1>
                <p className="mt-xs font-body text-base text-on-surface-variant">
                  Configure your data pipeline flow in four easy steps.
                </p>
              </div>

              <WizardStepper step={wizardStep} />

              <div className="mt-xl grid grid-cols-1 items-start gap-lg lg:grid-cols-12">
                <div className="space-y-lg lg:col-span-8">
                  {wizardStep === 1 ? (
                    <>
                      <div
                        className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-lg"
                        style={{
                          boxShadow: '0px 4px 20px rgba(61, 64, 91, 0.08)',
                        }}
                      >
                        <div className="mb-md flex flex-col justify-between gap-md sm:flex-row sm:items-center">
                          <h2 className="font-headline text-xl font-semibold text-on-surface">
                            Select Data Source
                          </h2>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">
                              ⌕
                            </span>
                            <input
                              type="search"
                              value={catalogQuery}
                              onChange={(e) => setCatalogQuery(e.target.value)}
                              placeholder="Search sources..."
                              className="w-full rounded-lg border-none bg-surface-container py-2 pl-9 pr-4 font-body text-sm text-on-surface outline-none ring-primary focus:ring-2 sm:w-56"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-md sm:grid-cols-2 md:grid-cols-3">
                          {catalogFiltered.map((item) => {
                            const selectedCard = catalogKey === item.key
                            return (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => pickCatalog(item)}
                                className={[
                                  'rounded-xl border bg-white p-md text-left transition-all active:scale-[0.98]',
                                  selectedCard
                                    ? 'border-2 border-primary shadow-lg'
                                    : 'border-secondary-container hover:border-primary/40',
                                ].join(' ')}
                              >
                                <div className="mb-sm flex items-center gap-3">
                                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container text-primary">
                                    {item.type ? (
                                      <SourceTypeIcon type={item.type} />
                                    ) : (
                                      <span className="font-label text-lg">
                                        +
                                      </span>
                                    )}
                                  </div>
                                  <div>
                                    <h3 className="font-label text-sm font-semibold text-on-surface">
                                      {item.title}
                                    </h3>
                                    <p className="font-label text-[10px] tracking-wider text-on-surface-variant uppercase">
                                      {item.category}
                                    </p>
                                  </div>
                                </div>
                                <p className="line-clamp-2 font-body text-sm text-on-surface-variant">
                                  {item.blurb}
                                </p>
                                {!item.creatable ? (
                                  <p className="mt-sm font-label text-[10px] tracking-wider text-primary uppercase">
                                    Request access
                                  </p>
                                ) : null}
                              </button>
                            )
                          })}
                          <button
                            type="button"
                            onClick={() =>
                              setToast(
                                'Send connector requests to your Que admin',
                              )
                            }
                            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-outline-variant bg-surface p-md text-center transition-all hover:bg-surface-container-high"
                          >
                            <span className="text-2xl text-on-surface-variant">
                              ⊕
                            </span>
                            <span className="font-label text-sm text-on-surface-variant">
                              Request Source
                            </span>
                          </button>
                        </div>
                      </div>

                      <div
                        className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-lg"
                        style={{
                          boxShadow: '0px 4px 20px rgba(61, 64, 91, 0.08)',
                        }}
                      >
                        <h2 className="mb-md font-headline text-xl font-semibold text-on-surface">
                          Target Destination
                        </h2>
                        <div className="flex flex-col items-stretch gap-4 rounded-xl border border-secondary-container bg-secondary-container/30 p-md sm:flex-row sm:items-center">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-secondary-container bg-white text-primary">
                            ⌂
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-sm">
                              <h3 className="font-label text-sm font-semibold text-on-surface">
                                {workspaceName} · Que metadata
                              </h3>
                              <span className="rounded-full bg-tertiary/10 px-2 py-0.5 font-label text-[10px] font-bold text-tertiary">
                                ACTIVE
                              </span>
                            </div>
                            <p className="font-body text-sm text-on-surface-variant">
                              Environment: Production · Type: Que Native
                              workspace graph
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled
                            className="rounded-lg border border-secondary-container px-4 py-2 font-label text-sm text-on-secondary-container opacity-60"
                          >
                            Change
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {wizardStep === 2 ? (
                    <div
                      className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-lg"
                      style={{
                        boxShadow: '0px 4px 20px rgba(61, 64, 91, 0.08)',
                      }}
                    >
                      <h2 className="mb-xs font-headline text-xl font-semibold text-on-surface">
                        Transformation
                      </h2>
                      <p className="mb-lg font-body text-sm text-on-surface-variant">
                        Name the connection and configure{' '}
                        {sourceTypeLabel(form.type)} credentials or uploads.
                      </p>
                      <ConnectionFields
                        form={form}
                        setForm={setForm}
                        creating
                        canAdmin={canAdmin}
                        pendingFiles={pendingFiles}
                        setPendingFiles={setPendingFiles}
                        tableNameOverrides={tableNameOverrides}
                        setTableNameOverrides={setTableNameOverrides}
                        uploadMoreFiles={uploadMoreFiles}
                      />
                    </div>
                  ) : null}

                  {wizardStep === 3 ? (
                    <div
                      className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-lg"
                      style={{
                        boxShadow: '0px 4px 20px rgba(61, 64, 91, 0.08)',
                      }}
                    >
                      <h2 className="mb-xs font-headline text-xl font-semibold text-on-surface">
                        Schedule
                      </h2>
                      <p className="mb-lg font-body text-sm text-on-surface-variant">
                        Que syncs schema on demand today. Pick how you want to
                        refresh after create.
                      </p>
                      <div className="space-y-md">
                        <ScheduleOption
                          active={scheduleMode === 'ondemand'}
                          title="On demand"
                          body="Create the connection now. Sync Schema from the Sources list or workspace when ready."
                          onClick={() => setScheduleMode('ondemand')}
                        />
                        <ScheduleOption
                          active={scheduleMode === 'manual'}
                          title="Manual after create"
                          body="Same as on demand — use Sync Schema when credentials are verified."
                          onClick={() => setScheduleMode('manual')}
                        />
                      </div>
                    </div>
                  ) : null}

                  {wizardStep === 4 ? (
                    <div
                      className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-lg"
                      style={{
                        boxShadow: '0px 4px 20px rgba(61, 64, 91, 0.08)',
                      }}
                    >
                      <h2 className="mb-lg font-headline text-xl font-semibold text-on-surface">
                        Review
                      </h2>
                      <dl className="space-y-md font-body text-sm">
                        <ReviewRow
                          label="Name"
                          value={form.name.trim() || '—'}
                        />
                        <ReviewRow
                          label="Connector"
                          value={sourceTypeLabel(form.type)}
                        />
                        <ReviewRow
                          label="Description"
                          value={form.description.trim() || '—'}
                        />
                        <ReviewRow
                          label="Destination"
                          value={`${workspaceName} · Que metadata`}
                        />
                        <ReviewRow
                          label="Schedule"
                          value={
                            scheduleMode === 'ondemand'
                              ? 'On demand'
                              : 'Manual after create'
                          }
                        />
                        {(form.type === 'excel' || form.type === 'csv') && (
                          <ReviewRow
                            label="Files"
                            value={
                              pendingFiles.length
                                ? pendingFiles.map((f) => f.name).join(', ')
                                : 'None selected'
                            }
                          />
                        )}
                      </dl>
                    </div>
                  ) : null}
                </div>

                <aside className="space-y-lg lg:sticky lg:top-24 lg:col-span-4">
                  <div
                    className="rounded-xl border border-outline-variant/20 bg-white p-lg shadow-md"
                  >
                    <h3 className="mb-md font-label text-sm tracking-widest text-on-surface-variant uppercase">
                      Sync Overview
                    </h3>
                    <div className="mb-lg space-y-4">
                      <div className="flex justify-between gap-md">
                        <span className="font-body text-sm text-on-surface-variant">
                          Selected Source:
                        </span>
                        <span className="text-right font-label text-sm font-bold text-primary">
                          {selectedCatalog?.title ?? '—'}
                        </span>
                      </div>
                      <div className="flex justify-between gap-md">
                        <span className="font-body text-sm text-on-surface-variant">
                          Destination:
                        </span>
                        <span className="text-right font-label text-sm font-bold text-on-surface">
                          {workspaceName}
                        </span>
                      </div>
                      <div className="flex justify-between gap-md border-t border-outline-variant/20 pt-4">
                        <span className="font-body text-sm text-on-surface-variant">
                          Estimated Latency:
                        </span>
                        <span className="font-body text-sm text-on-surface">
                          &lt; 150ms
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      {wizardStep < 4 ? (
                        <button
                          type="button"
                          disabled={
                            (wizardStep === 1 && !canAdvanceFromSources) ||
                            (wizardStep === 2 && !form.name.trim()) ||
                            busy
                          }
                          onClick={() => setWizardStep((s) => s + 1)}
                          className="w-full rounded-lg bg-primary-container py-3 font-label text-sm font-bold text-on-primary transition-all hover:bg-primary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Next Step:{' '}
                          {WIZARD_STEPS[wizardStep] ?? 'Done'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={
                            busy || !form.name.trim() || !canAdmin
                          }
                          onClick={() => void save()}
                          className="w-full rounded-lg bg-primary py-3 font-label text-sm font-bold text-on-primary transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {form.type === 'excel' || form.type === 'csv'
                            ? 'Upload & Analyze'
                            : 'Create Connection'}
                        </button>
                      )}
                      {wizardStep > 1 ? (
                        <button
                          type="button"
                          onClick={() => setWizardStep((s) => s - 1)}
                          className="w-full rounded-lg bg-transparent py-3 font-label text-sm font-bold text-on-surface-variant transition-all hover:bg-surface-container"
                        >
                          Back
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={cancelWizard}
                        className="w-full rounded-lg bg-transparent py-3 font-label text-sm font-bold text-on-surface-variant transition-all hover:bg-surface-container"
                      >
                        Cancel Wizard
                      </button>
                    </div>
                    <div className="mt-lg rounded-lg bg-secondary-container/40 p-md">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 text-primary">ⓘ</span>
                        <p className="font-body text-xs leading-relaxed text-on-secondary-container">
                          Selecting a source will automatically scan for
                          available schemas. You&apos;ll map tables after
                          Sync Schema.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="relative h-48 overflow-hidden rounded-xl bg-gradient-to-br from-primary-container/40 via-[#ffdbd2]/60 to-canvas shadow-sm">
                    <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-primary/50 to-transparent p-md">
                      <p className="font-headline text-lg leading-tight text-white">
                        Need help with custom connectors?
                      </p>
                      <a
                        href="https://github.com"
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 font-body text-sm text-white underline"
                      >
                        View Documentation
                      </a>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      </QueAppChrome>
    )
  }

  /* List + detail */
  return (
    <QueAppChrome eyebrow="SOURCES · CONNECT · SYNC">
      <div className="flex min-h-0 flex-1 overflow-hidden bg-canvas">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {banners}
          <main className="min-h-0 flex-1 overflow-y-auto px-md py-lg md:px-lg lg:px-margin-desktop">
            {!selected ? (
              <>
                <div className="mb-xl">
                  <div className="mb-sm flex flex-col justify-between gap-md sm:flex-row sm:items-end">
                    <div>
                      <h1 className="font-headline text-3xl font-semibold tracking-tight text-primary">
                        Data Sources
                      </h1>
                      <p className="mt-sm max-w-2xl font-body text-base text-on-surface-variant">
                        Manage your database connections and warehouse
                        integrations. Monitor sync health and schema integrity
                        across your pipeline mesh.
                      </p>
                    </div>
                    <input
                      type="search"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Filter sources…"
                      className="w-full rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-md py-sm font-body text-sm text-on-surface outline-none focus:border-primary sm:w-56"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-lg md:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((s) => {
                    const badge = statusBadge(s.status)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedId(s.id)}
                        className="group rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-lg text-left transition-all hover:scale-[1.02]"
                        style={{
                          boxShadow: '0px 4px 20px rgba(61, 64, 91, 0.08)',
                        }}
                      >
                        <div className="mb-lg flex items-start justify-between">
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary-container text-primary">
                            <SourceTypeIcon type={s.type} />
                          </div>
                          <span
                            className={`inline-flex items-center gap-xs rounded-full px-sm py-xs font-label text-[11px] ${badge.className}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s.status]}`}
                            />
                            {badge.label}
                          </span>
                        </div>
                        <h3 className="mb-xs font-headline text-xl font-semibold text-on-surface">
                          {s.name}
                        </h3>
                        <p className="mb-xl line-clamp-2 font-body text-sm text-on-surface-variant">
                          {s.description?.trim() ||
                            `${sourceTypeLabel(s.type)} connection`}
                        </p>
                        <div className="flex items-center justify-between font-label text-[11px] text-on-surface-variant">
                          <span>{relativeSyncLabel(s.updatedAt)}</span>
                          <span className="transition-transform group-hover:translate-x-1">
                            →
                          </span>
                        </div>
                      </button>
                    )
                  })}

                  {canAdmin ? (
                    <button
                      type="button"
                      onClick={startCreate}
                      className="group flex min-h-[220px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant/40 p-lg text-center transition-all hover:border-primary/50 hover:bg-primary/5"
                    >
                      <div className="mb-md flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-low text-outline transition-colors group-hover:bg-primary-container group-hover:text-white">
                        <span className="text-3xl leading-none">+</span>
                      </div>
                      <span className="font-label text-sm font-bold text-on-surface-variant group-hover:text-primary">
                        Add Data Source
                      </span>
                      <p className="mt-xs font-body text-sm text-on-surface-variant/60">
                        S3, BigQuery, Mongo, and more
                      </p>
                    </button>
                  ) : null}
                </div>

                {filtered.length === 0 && !canAdmin ? (
                  <p className="mt-lg font-body text-sm text-on-surface-variant">
                    No sources yet — ask an admin to add a connection.
                  </p>
                ) : null}

                <div className="mt-xl grid grid-cols-1 gap-lg lg:grid-cols-2">
                  <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low p-lg">
                    <h4 className="mb-lg font-label text-sm font-bold tracking-widest text-primary uppercase">
                      Connection Health
                    </h4>
                    <div className="space-y-md">
                      <div className="flex items-center justify-between">
                        <span className="font-body text-base text-on-surface">
                          Healthy sources
                        </span>
                        <span className="font-label text-sm font-bold text-tertiary">
                          {sources.length
                            ? `${healthPct}%`
                            : '—'}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-outline-variant/20">
                        <div
                          className="h-full bg-tertiary"
                          style={{
                            width: `${sources.length ? Math.min(100, healthPct) : 0}%`,
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-body text-base text-on-surface">
                          Connected / total
                        </span>
                        <span className="font-label text-sm font-bold text-primary">
                          {healthActive} / {sources.length}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-outline-variant/20">
                        <div
                          className="h-full bg-primary"
                          style={{
                            width: `${sources.length ? Math.min(100, (healthActive / sources.length) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="relative flex items-center overflow-hidden rounded-2xl border border-primary-container/20 bg-primary-container/10 p-lg">
                    <div className="relative z-10">
                      <h4 className="mb-xs font-headline text-xl font-semibold text-primary">
                        Optimization Tip
                      </h4>
                      <p className="mb-md font-body text-sm text-on-surface-variant">
                        {sources.some((s) => s.status === 'warning')
                          ? 'A connector is still warming up. Run Sync Schema after credentials verify to keep the canvas current.'
                          : 'Enable Incremental Sync on high-churn warehouses to cut duplicate schema scans and compute cost.'}
                      </p>
                      <Link
                        to="/workspace"
                        className="inline-flex items-center gap-xs font-label text-sm font-bold text-primary hover:underline"
                      >
                        Open Workspace ↗
                      </Link>
                    </div>
                    <span
                      className="pointer-events-none absolute -right-4 -bottom-4 rotate-12 text-[120px] text-primary opacity-5"
                      aria-hidden
                    >
                      ✦
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="mb-md font-label text-sm font-bold text-primary hover:underline"
                >
                  ← Back to Data Sources
                </button>
                <div className="mb-lg">
                  <h1 className="font-headline text-3xl font-semibold tracking-tight text-on-surface">
                    {form.name || selected.name}
                  </h1>
                  <p className="mt-xs font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                    Status {selected.status} · {sourceTypeLabel(form.type)}
                  </p>
                </div>

                <div
                  className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-lg"
                  style={{
                    boxShadow: '0px 4px 20px rgba(61, 64, 91, 0.08)',
                  }}
                >
                  <ConnectionFields
                    form={form}
                    setForm={setForm}
                    creating={false}
                    canAdmin={canAdmin}
                    pendingFiles={pendingFiles}
                    setPendingFiles={setPendingFiles}
                    tableNameOverrides={tableNameOverrides}
                    setTableNameOverrides={setTableNameOverrides}
                    uploadMoreFiles={uploadMoreFiles}
                    selected={selected}
                  />
                </div>

                <div className="mt-lg flex flex-wrap gap-sm">
                  {canAdmin ? (
                    <button
                      type="button"
                      disabled={busy || !form.name.trim()}
                      onClick={() => void save()}
                      className="rounded-lg bg-primary-container px-md py-sm font-label text-sm font-bold text-on-primary disabled:opacity-40"
                    >
                      Save
                    </button>
                  ) : null}
                  {syncable && canWrite ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void sync()}
                      className="rounded-lg border border-primary px-md py-sm font-label text-sm font-bold text-primary disabled:opacity-40"
                    >
                      Sync Schema
                    </button>
                  ) : null}
                  {canAdmin ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove()}
                      className="rounded-lg border border-outline-variant px-md py-sm font-label text-sm font-bold text-error disabled:opacity-40"
                    >
                      Delete
                    </button>
                  ) : null}
                  <Link
                    to="/workspace"
                    className="ml-auto rounded-lg border border-outline-variant px-md py-sm font-label text-sm font-bold text-on-surface-variant hover:border-primary"
                  >
                    Open Workspace
                  </Link>
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </QueAppChrome>
  )
}

function WizardStepper({ step }: { step: number }) {
  return (
    <div className="flex w-full items-center justify-between px-xs">
      {WIZARD_STEPS.map((label, i) => {
        const n = i + 1
        const active = n <= step
        const current = n === step
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <div
                className={[
                  'flex h-10 w-10 items-center justify-center rounded-full font-label font-bold',
                  current || active
                    ? 'bg-primary text-on-primary'
                    : 'bg-secondary-container text-on-secondary-container',
                ].join(' ')}
              >
                {n}
              </div>
              <span
                className={[
                  'font-label text-sm',
                  current || active
                    ? 'text-primary'
                    : 'text-on-surface-variant',
                ].join(' ')}
              >
                {label}
              </span>
            </div>
            {i < WIZARD_STEPS.length - 1 ? (
              <div
                className="mx-md mt-[-1.5rem] h-0.5 flex-1"
                style={{
                  backgroundColor: n < step ? '#9a442d' : '#dbc1ba',
                }}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function ScheduleOption({
  active,
  title,
  body,
  onClick,
}: {
  active: boolean
  title: string
  body: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full rounded-xl border p-md text-left transition-all',
        active
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-secondary-container hover:border-primary/40',
      ].join(' ')}
    >
      <p className="font-label text-sm font-bold text-on-surface">{title}</p>
      <p className="mt-xs font-body text-sm text-on-surface-variant">{body}</p>
    </button>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-md border-b border-outline-variant/15 pb-md">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="text-right font-medium text-on-surface">{value}</dd>
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-outline-variant bg-surface-container-low px-sm py-sm font-body text-xs text-on-surface outline-none focus:border-primary'

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-xs block font-label text-[10px] tracking-widest text-on-surface-variant">
        {label}
      </span>
      {children}
    </label>
  )
}

function ConnectionFields({
  form,
  setForm,
  creating,
  canAdmin,
  pendingFiles,
  setPendingFiles,
  tableNameOverrides,
  setTableNameOverrides,
  uploadMoreFiles,
  selected,
}: {
  form: FormState
  setForm: Dispatch<SetStateAction<FormState>>
  creating: boolean
  canAdmin: boolean
  pendingFiles: File[]
  setPendingFiles: Dispatch<SetStateAction<File[]>>
  tableNameOverrides: string
  setTableNameOverrides: Dispatch<SetStateAction<string>>
  uploadMoreFiles: (fileList: FileList | null) => void | Promise<void>
  selected?: DataSource | null
}) {
  return (
    <fieldset
      disabled={!canAdmin}
      className="space-y-md border-0 p-0 disabled:opacity-70"
    >
      {!canAdmin ? (
        <p className="font-label text-[10px] tracking-widest text-on-surface-variant">
          View-only config — admin required to edit
        </p>
      ) : null}
      <Field label="Name">
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className={inputClass}
        />
      </Field>

      {creating ? (
        <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
          Type · {sourceTypeLabel(form.type)}
        </p>
      ) : (
        <Field label="Type">
          <input
            value={sourceTypeLabel(form.type)}
            disabled
            className={inputClass}
          />
        </Field>
      )}

      <Field label="Description">
        <input
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
          className={inputClass}
        />
      </Field>

      {form.type === 'postgresql' ? (
        <PostgresFields form={form} setForm={setForm} />
      ) : null}
      {form.type === 'mongodb' ? (
        <MongoFields form={form} setForm={setForm} />
      ) : null}
      {form.type === 'databricks' ? (
        <DatabricksFields form={form} setForm={setForm} />
      ) : null}
      {form.type === 'excel' || form.type === 'csv' ? (
        <div className="space-y-md">
          <div className="rounded-xl border border-dashed border-primary/40 bg-primary-container/5 p-md">
            <p className="font-label text-[10px] font-bold tracking-widest text-primary">
              Upload {form.type === 'excel' ? 'Excel' : 'CSV'}
            </p>
            <p className="mt-xs font-body text-xs text-on-surface-variant">
              Drop files here — Que infers tables/columns (capped samples),
              maps them into this workspace, then canvas + AI chat can use them
              after sync.
            </p>
            <input
              type="file"
              multiple
              accept={
                form.type === 'excel'
                  ? '.xlsx,.xls,.csv,.tsv'
                  : '.csv,.tsv,.txt,.xlsx,.xls'
              }
              disabled={!canAdmin && creating}
              className="mt-md block w-full font-body text-xs text-on-surface file:mr-md file:rounded-lg file:border file:border-outline-variant file:bg-surface-container file:px-sm file:py-xs file:font-label file:text-[10px] file:tracking-widest"
              onChange={(e) => {
                const list = e.target.files
                if (!list?.length) return
                if (creating) {
                  setPendingFiles([...list])
                  if (!form.name.trim()) {
                    setForm((f) => ({
                      ...f,
                      name: list[0].name.replace(/\.[^.]+$/, ''),
                    }))
                  }
                } else {
                  void uploadMoreFiles(list)
                }
                e.target.value = ''
              }}
            />
            {creating && pendingFiles.length > 0 ? (
              <ul className="mt-sm space-y-xs font-body text-xs text-on-surface">
                {pendingFiles.map((f) => (
                  <li key={`${f.name}-${f.size}`}>
                    {f.name}{' '}
                    <span className="text-on-surface-variant">
                      ({Math.round(f.size / 1024)} KB)
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {!creating && selected ? (
              <p className="mt-sm font-label text-[9px] tracking-widest text-on-surface-variant">
                Pick files to append + re-sync this source
              </p>
            ) : null}
          </div>
          <Field label="Table names (optional, comma-separated, order = files)">
            <input
              value={tableNameOverrides}
              onChange={(e) => setTableNameOverrides(e.target.value)}
              placeholder="campaigns, leads"
              className={inputClass}
            />
          </Field>
          {!creating ? (
            <Field label="Mapped files (advanced JSON)">
              <textarea
                value={form.filesJson}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    filesJson: e.target.value,
                  }))
                }
                rows={5}
                className={`${inputClass} font-body`}
              />
            </Field>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  )
}

function PostgresFields({
  form,
  setForm,
}: {
  form: FormState
  setForm: Dispatch<SetStateAction<FormState>>
}) {
  return (
    <div className="grid gap-md md:grid-cols-2">
      <Field label="Host">
        <input
          value={form.host}
          onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
          className={inputClass}
        />
      </Field>
      <Field label="Port">
        <input
          value={form.port}
          onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
          className={inputClass}
        />
      </Field>
      <Field label="Database">
        <input
          value={form.database}
          onChange={(e) =>
            setForm((f) => ({ ...f, database: e.target.value }))
          }
          className={inputClass}
        />
      </Field>
      <Field label="Schema">
        <input
          value={form.schema}
          onChange={(e) => setForm((f) => ({ ...f, schema: e.target.value }))}
          className={inputClass}
        />
      </Field>
      <Field label="User">
        <input
          value={form.user}
          onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))}
          className={inputClass}
        />
      </Field>
      <Field label="Password">
        <input
          type="password"
          value={form.password}
          placeholder="leave blank to keep"
          onChange={(e) =>
            setForm((f) => ({ ...f, password: e.target.value }))
          }
          className={inputClass}
        />
      </Field>
    </div>
  )
}

function MongoFields({
  form,
  setForm,
}: {
  form: FormState
  setForm: Dispatch<SetStateAction<FormState>>
}) {
  return (
    <div className="grid gap-md">
      <Field label="URI">
        <input
          value={form.uri}
          onChange={(e) => setForm((f) => ({ ...f, uri: e.target.value }))}
          className={inputClass}
        />
      </Field>
      <Field label="Database">
        <input
          value={form.database}
          onChange={(e) =>
            setForm((f) => ({ ...f, database: e.target.value }))
          }
          className={inputClass}
        />
      </Field>
    </div>
  )
}

function DatabricksFields({
  form,
  setForm,
}: {
  form: FormState
  setForm: Dispatch<SetStateAction<FormState>>
}) {
  return (
    <div className="grid gap-md">
      <Field label="Mode">
        <select
          value={form.dbxMode}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              dbxMode: e.target.value === 'live' ? 'live' : 'fixture',
            }))
          }
          className={inputClass}
        >
          <option value="fixture">Fixture (local demo JSON)</option>
          <option value="live">Live (SQL warehouse + token)</option>
        </select>
      </Field>
      {form.dbxMode === 'fixture' ? (
        <Field label="Fixtures path">
          <input
            value={form.fixturesPath}
            onChange={(e) =>
              setForm((f) => ({ ...f, fixturesPath: e.target.value }))
            }
            className={inputClass}
          />
        </Field>
      ) : (
        <div className="grid gap-md md:grid-cols-2">
          <Field label="Host">
            <input
              value={form.host}
              placeholder="adb-xxxx.azuredatabricks.net"
              onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Warehouse ID">
            <input
              value={form.warehouseId}
              onChange={(e) =>
                setForm((f) => ({ ...f, warehouseId: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Token">
            <input
              type="password"
              value={form.token}
              placeholder="leave blank to keep"
              onChange={(e) =>
                setForm((f) => ({ ...f, token: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
        </div>
      )}
      <div className="grid gap-md md:grid-cols-2">
        <Field label="Catalog">
          <input
            value={form.catalog}
            onChange={(e) =>
              setForm((f) => ({ ...f, catalog: e.target.value }))
            }
            className={inputClass}
          />
        </Field>
        <Field label="Schema">
          <input
            value={form.schema}
            onChange={(e) => setForm((f) => ({ ...f, schema: e.target.value }))}
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  )
}

export default SourcesPage
