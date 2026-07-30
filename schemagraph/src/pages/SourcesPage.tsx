import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import {
  SourceTypeIcon,
  sourceTypeLabel,
} from '@/components/sidebar/SourceTypeIcon'
import {
  ConnectorCatalogGrid,
  SourcesBranchMark,
} from '@/components/sources/ConnectorCatalogGrid'
import {
  ConnectionHealthPanel,
} from '@/components/sources/ConnectionHealthPanel'
import {
  CONNECTOR_CATALOG,
  filterConnectorCatalog,
  POC_PACK,
  type CatalogItem,
  type ConnectorCategoryId,
} from '@/connectors/connectorCatalog'
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
  'snowflake',
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
  /** Snowflake account locator (without .snowflakecomputing.com) */
  account: string
  warehouse: string
}

const WIZARD_STEPS = ['Choose', 'Configure'] as const

type SourcesView = 'home' | 'catalog' | 'form' | 'detail'

function parseSourcesView(raw: string | null): SourcesView {
  if (raw === 'catalog' || raw === 'form' || raw === 'detail') return raw
  return 'home'
}

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
  fixturesPath:
    type === 'snowflake'
      ? 'fixtures/snowflake_demo.json'
      : 'fixtures/databricks_unity_demo.json',
  warehouseId: '',
  token: '',
  catalog: 'main',
  account: '',
  warehouse: 'COMPUTE_WH',
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
      c.fixturesPath ??
        (s.type === 'snowflake'
          ? 'fixtures/snowflake_demo.json'
          : 'fixtures/databricks_unity_demo.json'),
    ),
    warehouseId: String(c.warehouseId ?? ''),
    token:
      typeof c.token === 'string' && c.token !== '••••••••' ? c.token : '',
    catalog: String(c.catalog ?? 'main'),
    account: String(c.account ?? ''),
    warehouse: String(c.warehouse ?? c.warehouseId ?? 'COMPUTE_WH'),
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
        includeSamples: false,
        sampleLimit: 5,
      }
    }
    return {
      mode: 'fixture',
      fixturesPath: form.fixturesPath || 'fixtures/databricks_unity_demo.json',
      catalog: form.catalog || 'main',
      schema: form.schema || 'analytics',
      includeSamples: false,
      sampleLimit: 5,
    }
  }
  if (form.type === 'snowflake') {
    if (form.dbxMode === 'live') {
      return {
        mode: 'live',
        account: form.account,
        warehouse: form.warehouse || form.warehouseId,
        database: form.database,
        schema: form.schema || 'PUBLIC',
        user: form.user,
        password: form.password,
        token: form.token,
        includeSamples: false,
        sampleLimit: 5,
      }
    }
    return {
      mode: 'fixture',
      fixturesPath: form.fixturesPath || 'fixtures/snowflake_demo.json',
      schema: form.schema || 'PUBLIC',
      includeSamples: false,
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
  const [searchParams, setSearchParams] = useSearchParams()
  const view = parseSourcesView(searchParams.get('view'))
  const deepLinkId = searchParams.get('id')
  const workspaceName =
    workspaces.find((w) => w.id === workspaceId)?.name || 'Workspace'
  const [sources, setSources] = useState<DataSource[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkId)
  const [creating, setCreating] = useState(
    () => view === 'catalog' || view === 'form',
  )
  const [wizardStep, setWizardStep] = useState(view === 'form' ? 2 : 1)
  const [catalogKey, setCatalogKey] = useState<string | null>(
    searchParams.get('connector'),
  )
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogCategory, setCatalogCategory] =
    useState<ConnectorCategoryId>('all')
  const [form, setForm] = useState<FormState>(() => {
    const key = searchParams.get('connector')
    const item = CONNECTOR_CATALOG.find((c) => c.key === key)
    return emptyForm(item?.type ?? 'postgresql')
  })
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [tableNameOverrides, setTableNameOverrides] = useState('')

  function goView(
    next: SourcesView,
    opts?: { id?: string | null; connector?: string | null },
  ) {
    const params: Record<string, string> = {}
    if (next !== 'home') params.view = next
    if (opts?.id) params.id = opts.id
    if (opts?.connector) params.connector = opts.connector
    setSearchParams(params)
  }

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
    setCatalogKey(null)
    goView('home')
    reload().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  useEffect(() => {
    if (view === 'catalog' || view === 'form') {
      setCreating(true)
      setSelectedId(null)
      setWizardStep(view === 'form' ? 2 : 1)
      const key = searchParams.get('connector')
      if (key) {
        setCatalogKey(key)
        const item = CONNECTOR_CATALOG.find((c) => c.key === key)
        if (item?.type) {
          setForm((f) =>
            f.type === item.type
              ? f
              : {
                  ...emptyForm(item.type!),
                  name: f.name,
                  description: f.description || item.purpose,
                },
          )
        }
      }
      return
    }
    if (view === 'detail' && deepLinkId) {
      setCreating(false)
      setSelectedId(deepLinkId)
      return
    }
    if (view === 'home') {
      setCreating(false)
      if (!deepLinkId) setSelectedId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, deepLinkId, searchParams])

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

  const catalogFiltered = useMemo(
    () =>
      filterConnectorCatalog(CONNECTOR_CATALOG, {
        query: catalogQuery,
        categoryId: catalogCategory,
      }),
    [catalogQuery, catalogCategory],
  )

  const selected = sources.find((s) => s.id === selectedId) ?? null
  const syncable = creating
    ? CREATABLE.includes(form.type)
    : Boolean(selected?.syncable)

  const selectedCatalog = CONNECTOR_CATALOG.find((c) => c.key === catalogKey)
  const canAdvanceFromSources = Boolean(
    selectedCatalog?.creatable && selectedCatalog.type,
  )

  function startCreate() {
    setCreating(true)
    setSelectedId(null)
    setWizardStep(1)
    setCatalogKey(null)
    setCatalogQuery('')
    setCatalogCategory('all')
    setForm(emptyForm('postgresql'))
    setPendingFiles([])
    setTableNameOverrides('')
    setError(null)
    goView('catalog')
  }

  function cancelWizard() {
    setCreating(false)
    setWizardStep(1)
    setCatalogKey(null)
    setError(null)
    goView('home')
  }

  function continueToForm() {
    const item = CONNECTOR_CATALOG.find((c) => c.key === catalogKey)
    if (!item?.creatable || !item.type) {
      setToast(
        `${item?.title ?? 'Connector'} — request access, or use CSV / Excel as a bridge`,
      )
      return
    }
    setWizardStep(2)
    goView('form', { connector: item.key })
  }

  function pickCatalog(item: CatalogItem) {
    setCatalogKey(item.key)
    if (!item.creatable || !item.type) {
      setToast(
        `${item.title} — request access, or use CSV / Excel as a bridge today`,
      )
      return
    }
    setForm((f) => {
      const next = {
        ...emptyForm(item.type!),
        name: f.name || `${item.title} connection`,
        description: f.description || item.purpose,
        type: item.type!,
      }
      if (
        (item.type === 'snowflake' || item.type === 'databricks') &&
        item.preferredAuth === 'fixture'
      ) {
        next.dbxMode = 'fixture'
      }
      return next
    })
  }

  async function installPocPack() {
    if (!canAdmin) {
      setToast('Admin required to install the POC pack')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const existing = await fetchWorkspaceSources()
      const hasSf = existing.some(
        (s) =>
          s.type === 'snowflake' &&
          s.name.toLowerCase().includes('poc') &&
          s.name.toLowerCase().includes('snowflake'),
      )
      const hasDbx = existing.some(
        (s) =>
          s.type === 'databricks' &&
          s.name.toLowerCase().includes('poc') &&
          s.name.toLowerCase().includes('databricks'),
      )
      const createdIds: string[] = []
      if (!hasSf) {
        const sf = await createConnection({
          name: POC_PACK.snowflake.name,
          type: 'snowflake',
          description: POC_PACK.snowflake.description,
          status: 'warning',
          config: { ...POC_PACK.snowflake.config },
        })
        createdIds.push(sf.id)
      }
      if (!hasDbx) {
        const dbx = await createConnection({
          name: POC_PACK.databricks.name,
          type: 'databricks',
          description: POC_PACK.databricks.description,
          status: 'warning',
          config: { ...POC_PACK.databricks.config },
        })
        createdIds.push(dbx.id)
      }
      const list = await fetchWorkspaceSources()
      const toSync = list.filter(
        (s) =>
          createdIds.includes(s.id) ||
          (s.name.toLowerCase().includes('poc') &&
            (s.type === 'snowflake' || s.type === 'databricks')),
      )
      let tables = 0
      let joins = 0
      for (const s of toSync) {
        if (!s.syncable) continue
        const result = await syncConnection(s.id)
        tables += result.tablesSynced ?? 0
        joins += result.suggestedJoins ?? 0
      }
      notifySchemaChanged('sync')
      await reload(toSync[0]?.id ?? null)
      setToast(
        `POC pack ready · ${tables} tables · ${joins} join suggestions. Open Workspace → Promote a join (HITL — never auto-accept).`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function syncById(id: string) {
    setBusy(true)
    setError(null)
    try {
      const result = await syncConnection(id)
      setToast(
        `Synced ${result.tablesSynced} tables · ${result.suggestedJoins ?? 0} suggestions`,
      )
      notifySchemaChanged('sync')
      await reload(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
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
        goView('detail', { id: result.connection.id })
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
        goView('detail', { id: created.id })
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
        goView('detail', { id: updated.id })
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
      goView('home')
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
        <p className="border-b border-error/40 bg-error/10 px-md py-sm font-body text-sm text-error">
          {error}
        </p>
      ) : null}
      {toast ? (
        <p className="border-b border-primary/20 bg-primary-container/10 px-md py-sm font-body text-sm text-primary">
          {toast}
          <button
            type="button"
            className="ml-md font-label text-sm underline"
            onClick={() => setToast(null)}
          >
            dismiss
          </button>
        </p>
      ) : null}
    </>
  )

  if (creating) {
    const catalogItem = CONNECTOR_CATALOG.find((c) => c.key === catalogKey)
    return (
      <QueAppChrome eyebrow="SOURCES · CONNECT">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
          {banners}
          <div className="min-h-0 flex-1 overflow-y-auto px-md py-lg md:px-lg lg:px-margin-desktop">
            <div className="mx-auto w-full max-w-[64rem]">
              <div className="mb-lg flex flex-wrap items-center justify-between gap-md">
                <button
                  type="button"
                  onClick={() => {
                    if (wizardStep === 2) {
                      setWizardStep(1)
                      goView('catalog', { connector: catalogKey })
                    } else {
                      cancelWizard()
                    }
                  }}
                  className="font-label text-[12px] font-medium text-primary hover:underline"
                >
                  {wizardStep === 2 ? '← Back to connectors' : '← All sources'}
                </button>
                <div className="flex items-center gap-1 rounded-lg border border-outline-variant/25 bg-white p-0.5">
                  {WIZARD_STEPS.map((label, i) => {
                    const n = i + 1
                    const active = n === wizardStep
                    const done = n < wizardStep
                    return (
                      <span
                        key={label}
                        className={[
                          'rounded-md px-3 py-1 font-label text-[11px]',
                          active
                            ? 'bg-primary text-on-primary'
                            : done
                              ? 'text-primary'
                              : 'text-on-surface-variant/50',
                        ].join(' ')}
                      >
                        {n}. {label}
                      </span>
                    )
                  })}
                </div>
              </div>

              {wizardStep === 1 ? (
                <ConnectorCatalogGrid
                  items={catalogFiltered}
                  selectedKey={catalogKey}
                  query={catalogQuery}
                  categoryId={catalogCategory}
                  onQueryChange={setCatalogQuery}
                  onCategoryChange={setCatalogCategory}
                  onPick={pickCatalog}
                  onRequest={() =>
                    setToast(
                      'Connector request noted — use CSV/Excel as a bridge, or ask your Que admin.',
                    )
                  }
                  onUseCsv={() => {
                    const csv = CONNECTOR_CATALOG.find((c) => c.key === 'csv')
                    if (csv) pickCatalog(csv)
                    setCatalogCategory('files')
                  }}
                  onContinue={continueToForm}
                  continueLabel="Continue to setup →"
                  continueDisabled={!canAdvanceFromSources}
                />
              ) : null}

              {wizardStep === 2 ? (
                <div className="grid grid-cols-1 items-start gap-lg lg:grid-cols-12">
                  <aside className="lg:col-span-4">
                    <div className="sticky top-4 rounded-2xl border border-outline-variant/20 bg-white p-lg">
                      <div className="mb-md flex h-16 w-16 items-center justify-center rounded-xl border border-primary/30 bg-primary/5 text-primary">
                        {form.type ? (
                          <SourceTypeIcon type={form.type} className="h-8 w-8" />
                        ) : null}
                      </div>
                      <h2 className="font-headline text-lg font-semibold text-on-surface">
                        {catalogItem?.title ?? sourceTypeLabel(form.type)}
                      </h2>
                      <p className="mt-xs font-body text-[13px] text-on-surface-variant">
                        {catalogItem?.purpose ?? 'Configure connection details'}
                      </p>
                      <p className="mt-sm font-body text-[12px] leading-snug text-on-surface-variant">
                        {catalogItem?.blurb}
                      </p>
                      {catalogItem ? (
                        <div className="mt-md flex flex-wrap gap-1.5">
                          {catalogItem.capabilities.map((cap) => (
                            <span
                              key={cap}
                              className="rounded-full bg-secondary-container/80 px-2 py-0.5 font-label text-[10px] text-on-secondary-container"
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-lg rounded-xl bg-[#FBF8F4] p-md">
                        <p className="font-label text-[11px] font-semibold text-on-surface">
                          Destination
                        </p>
                        <p className="mt-1 font-body text-[12px] text-on-surface-variant">
                          {workspaceName} · Que metadata graph (schema-only)
                        </p>
                      </div>
                    </div>
                  </aside>

                  <div className="lg:col-span-8">
                    <div className="rounded-2xl border border-outline-variant/20 bg-white p-lg shadow-sm">
                      <h3 className="mb-xs font-headline text-base font-semibold text-on-surface">
                        Connection setup
                      </h3>
                      <p className="mb-lg font-body text-[12px] text-on-surface-variant">
                        Fill the form below. Fixtures skip live tokens for demos.
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
                      <div className="mt-xl flex flex-wrap items-center justify-between gap-md border-t border-outline-variant/20 pt-lg">
                        <button
                          type="button"
                          onClick={cancelWizard}
                          className="rounded-lg px-md py-2 font-label text-[12px] text-on-surface-variant hover:bg-surface-container"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={busy || !form.name.trim() || !canAdmin}
                          onClick={() => void save()}
                          className="rounded-lg bg-primary px-lg py-2 font-label text-[12px] font-semibold text-on-primary disabled:opacity-40"
                        >
                          {form.type === 'excel' || form.type === 'csv'
                            ? busy
                              ? 'Uploading…'
                              : 'Upload & sync'
                            : busy
                              ? 'Creating…'
                              : 'Create connection'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
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
                <div className="mb-xl flex flex-col items-start gap-md sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex items-start gap-md">
                    <SourcesBranchMark className="mt-1 hidden h-10 w-10 shrink-0 text-primary sm:block" />
                    <div>
                      <h1 className="font-headline text-xl font-semibold tracking-tight text-primary">
                        Sources
                      </h1>
                      <p className="mt-xs max-w-[36rem] font-body text-[13px] text-on-surface-variant">
                        Connected systems sync schema into Que. Add a connector
                        from the tile catalog, then Promote joins on Workspace.
                      </p>
                    </div>
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-sm sm:w-auto">
                    <input
                      type="search"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="Filter sources…"
                      className="min-w-0 flex-1 rounded-lg border border-outline-variant/30 bg-white px-md py-1.5 font-body text-[13px] outline-none focus:border-primary sm:w-52 sm:flex-none"
                    />
                    {canAdmin ? (
                      <button
                        type="button"
                        onClick={startCreate}
                        className="rounded-lg bg-primary px-md py-1.5 font-label text-[12px] font-semibold text-on-primary"
                      >
                        + Add connector
                      </button>
                    ) : null}
                  </div>
                </div>

                {canAdmin ? (
                  <div className="mb-lg flex flex-col gap-md rounded-2xl border border-primary/15 bg-white p-md sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="font-label text-[13px] font-semibold text-on-surface">
                        {POC_PACK.title}
                      </h2>
                      <p className="mt-1 max-w-[36rem] font-body text-[12px] text-on-surface-variant">
                        {POC_PACK.body}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void installPocPack()}
                      className="shrink-0 rounded-lg border border-primary px-md py-1.5 font-label text-[12px] font-semibold text-primary disabled:opacity-40"
                    >
                      Install POC pack
                    </button>
                  </div>
                ) : null}

                <div className="mb-md">
                  <h2 className="font-label text-[11px] font-semibold tracking-[0.12em] text-on-surface-variant uppercase">
                    Connected · {filtered.length}
                  </h2>
                </div>

                <div className="grid grid-cols-2 gap-md sm:grid-cols-3 lg:grid-cols-4">
                  {filtered.map((s) => {
                    const badge = statusBadge(s.status)
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(s.id)
                          goView('detail', { id: s.id })
                        }}
                        className="group flex flex-col items-center gap-sm rounded-2xl border border-outline-variant/25 bg-white p-md text-center transition-all hover:border-primary/40 hover:shadow-md"
                      >
                        <div className="relative">
                          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-outline-variant/30 bg-[#FBF8F4] text-primary transition-colors group-hover:border-primary/40">
                            <SourceTypeIcon type={s.type} className="h-7 w-7" />
                          </div>
                          <span
                            className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${STATUS_DOT[s.status]}`}
                            title={badge.label}
                          />
                        </div>
                        <div className="min-w-0 w-full">
                          <p className="truncate font-label text-[13px] font-semibold text-on-surface">
                            {s.name}
                          </p>
                          <p className="mt-0.5 truncate font-label text-[10px] text-on-surface-variant uppercase">
                            {sourceTypeLabel(s.type)} ·{' '}
                            {relativeSyncLabel(s.updatedAt)}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                  {canAdmin ? (
                    <button
                      type="button"
                      onClick={startCreate}
                      className="flex min-h-[160px] flex-col items-center justify-center gap-sm rounded-2xl border border-dashed border-outline-variant/50 bg-transparent p-md text-center hover:border-primary/40 hover:bg-white/70"
                    >
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-outline-variant/40 text-2xl text-on-surface-variant">
                        +
                      </div>
                      <span className="font-label text-[13px] font-semibold text-on-surface">
                        Add connector
                      </span>
                    </button>
                  ) : null}
                </div>

                {filtered.length === 0 && !canAdmin ? (
                  <p className="mt-lg font-body text-[13px] text-on-surface-variant">
                    No sources yet — ask an admin to add a connection.
                  </p>
                ) : null}

                <div className="mt-xl">
                  <ConnectionHealthPanel
                    sources={sources}
                    onSelect={(id) => {
                      setSelectedId(id)
                      goView('detail', { id })
                    }}
                    onSync={canWrite ? (id) => void syncById(id) : undefined}
                    canSync={canWrite}
                  />
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null)
                    goView('home')
                  }}
                  className="mb-md font-label text-[12px] font-medium text-primary hover:underline"
                >
                  ← Back to Sources
                </button>
                <div className="mb-lg flex flex-wrap items-start gap-md">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-primary/30 bg-primary/5 text-primary">
                    <SourceTypeIcon type={selected.type} className="h-7 w-7" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="font-headline text-lg font-semibold tracking-tight text-on-surface">
                      {form.name || selected.name}
                    </h1>
                    <p className="mt-1 font-body text-[13px] text-on-surface-variant">
                      {CONNECTOR_CATALOG.find((c) => c.type === selected.type)
                        ?.purpose || sourceTypeLabel(form.type)}
                    </p>
                    <div className="mt-sm flex flex-wrap items-center gap-sm">
                      <span
                        className={`inline-flex items-center gap-xs rounded-full px-sm py-1 font-label text-[11px] font-semibold ${statusBadge(selected.status).className}`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${STATUS_DOT[selected.status]}`}
                        />
                        {statusBadge(selected.status).label}
                      </span>
                      <span className="font-body text-[12px] text-on-surface-variant">
                        {relativeSyncLabel(selected.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-outline-variant/20 bg-white p-lg shadow-sm">
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
                      className="rounded-lg bg-primary px-md py-1.5 font-label text-[12px] font-semibold text-on-primary disabled:opacity-40"
                    >
                      Save
                    </button>
                  ) : null}
                  {syncable && canWrite ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void sync()}
                      className="rounded-lg border border-primary px-md py-1.5 font-label text-[12px] font-semibold text-primary disabled:opacity-40"
                    >
                      Sync Schema
                    </button>
                  ) : null}
                  {canAdmin ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove()}
                      className="rounded-lg border border-outline-variant px-md py-1.5 font-label text-[12px] font-semibold text-error disabled:opacity-40"
                    >
                      Delete
                    </button>
                  ) : null}
                  <Link
                    to="/workspace"
                    className="ml-auto rounded-lg border border-outline-variant px-md py-1.5 font-label text-[12px] font-semibold text-on-surface-variant hover:border-primary"
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

const inputClass =
  'w-full rounded-lg border border-outline-variant bg-surface-container-low px-sm py-1.5 font-body text-[13px] text-on-surface outline-none focus:border-primary'

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-label text-[11px] font-medium text-on-surface-variant">
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
      {form.type === 'snowflake' ? (
        <SnowflakeFields form={form} setForm={setForm} />
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

function AuthModeToggle({
  mode,
  onChange,
}: {
  mode: 'fixture' | 'live'
  onChange: (m: 'fixture' | 'live') => void
}) {
  return (
    <div>
      <p className="mb-sm font-label text-sm font-medium text-on-surface-variant">
        Connect with
      </p>
      <div className="flex gap-sm rounded-lg border border-outline-variant/40 p-xs">
        <button
          type="button"
          onClick={() => onChange('fixture')}
          className={[
            'flex-1 rounded-md py-2.5 font-label text-sm font-semibold',
            mode === 'fixture'
              ? 'bg-primary-container text-on-primary'
              : 'text-on-surface-variant hover:bg-surface-container',
          ].join(' ')}
        >
          One-click fixture
        </button>
        <button
          type="button"
          onClick={() => onChange('live')}
          className={[
            'flex-1 rounded-md py-2.5 font-label text-sm font-semibold',
            mode === 'live'
              ? 'bg-primary-container text-on-primary'
              : 'text-on-surface-variant hover:bg-surface-container',
          ].join(' ')}
        >
          Live credentials
        </button>
      </div>
      <p className="mt-sm font-body text-sm text-on-surface-variant">
        {mode === 'fixture'
          ? 'Demo JSON loads instantly — no warehouse token required.'
          : 'Enter credentials. Secrets are encrypted at rest.'}
      </p>
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
      <AuthModeToggle
        mode={form.dbxMode}
        onChange={(m) => setForm((f) => ({ ...f, dbxMode: m }))}
      />
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

function SnowflakeFields({
  form,
  setForm,
}: {
  form: FormState
  setForm: Dispatch<SetStateAction<FormState>>
}) {
  return (
    <div className="grid gap-md">
      <AuthModeToggle
        mode={form.dbxMode}
        onChange={(m) => setForm((f) => ({ ...f, dbxMode: m }))}
      />
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
          <Field label="Account">
            <input
              value={form.account}
              placeholder="xy12345.us-east-1"
              onChange={(e) =>
                setForm((f) => ({ ...f, account: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Warehouse">
            <input
              value={form.warehouse}
              onChange={(e) =>
                setForm((f) => ({ ...f, warehouse: e.target.value }))
              }
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
              onChange={(e) =>
                setForm((f) => ({ ...f, schema: e.target.value }))
              }
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
          <Field label="Token (PAT preferred)">
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
          <Field label="Password (if no token)">
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
      )}
      {form.dbxMode === 'fixture' ? (
        <Field label="Schema">
          <input
            value={form.schema}
            onChange={(e) => setForm((f) => ({ ...f, schema: e.target.value }))}
            className={inputClass}
          />
        </Field>
      ) : null}
    </div>
  )
}

export default SourcesPage
