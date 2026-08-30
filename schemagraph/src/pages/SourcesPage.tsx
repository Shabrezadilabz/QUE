import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom'
import {
  SourceTypeIcon,
  sourceTypeLabel,
} from '@/components/sidebar/SourceTypeIcon'
import {
  PostSyncJoinBanner,
  type PostSyncJoinSummary,
} from '@/components/sources/PostSyncJoinBanner'
import { ConnectorCatalogGrid } from '@/components/sources/ConnectorCatalogGrid'
import { SourcesTableView } from '@/components/sources/SourcesTableView'
import {
  PocPackInstallDialog,
  type PackInstallSelection,
} from '@/components/sources/PocPackInstallDialog'
import { PdfPageHeader, PdfPrimaryButton, PdfGhostButton } from '@/components/pdf/PdfUi'
import { FIGMA_NAV } from '@/components/figma/figmaNavAssets'
import {
  CONNECTOR_CATALOG,
  filterConnectorCatalog,
  POC_PACKS,
  type PocPackDefinition,
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
  type SyncConnectionResult,
} from '@/services/stitchApi'
import { notifySchemaChanged } from '@/utils/schemaChangeBus'
import type {
  DataSource,
  DataSourceStatus,
  DataSourceType,
  DataLandingMode,
} from '@/types/dataSource'
import {
  canSyncSource,
  formatConnectorKeyLabel,
  isPendingSource,
  pendingPackConfig,
  relativeLastSyncLabel,
  statusBadgeForSource,
} from '@/sources/sourceSetup'

const CREATABLE: DataSourceType[] = [
  'postgresql',
  'excel',
  'csv',
  'mongodb',
  'databricks',
  'snowflake',
  'bigquery',
  'salesforce',
]

const STATUS_DOT: Record<DataSourceStatus, string> = {
  active: 'bg-[#d0d8e0]',
  warning: 'bg-[#f0a020]',
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
  /** BigQuery project id */
  projectId: string
  /** BigQuery location */
  location: string
  /** Salesforce instance URL */
  instanceUrl: string
}

const WIZARD_STEPS = ['Choose', 'Configure'] as const

const FIXTURE_CONNECTOR_DEFAULTS: Partial<
  Record<DataSourceType, string>
> = {
  snowflake: 'fixtures/snowflake_demo.json',
  bigquery: 'fixtures/bigquery_demo.json',
  salesforce: 'fixtures/salesforce_demo.json',
  shopify: 'fixtures/shopify_demo.json',
  razorpay: 'fixtures/razorpay_demo.json',
  zoho: 'fixtures/zoho_demo.json',
  stripe: 'fixtures/stripe_demo.json',
  hubspot: 'fixtures/hubspot_demo.json',
  chargebee: 'fixtures/chargebee_demo.json',
  google_ads: 'fixtures/google_ads_demo.json',
  databricks: 'fixtures/databricks_unity_demo.json',
  mysql: 'fixtures/mysql_demo.json',
}

function defaultFixturesPath(type: DataSourceType): string {
  return FIXTURE_CONNECTOR_DEFAULTS[type] ?? 'fixtures/databricks_unity_demo.json'
}

function isFixtureCommerceType(type: DataSourceType): boolean {
  return (
    type === 'shopify' ||
    type === 'razorpay' ||
    type === 'zoho' ||
    type === 'stripe' ||
    type === 'hubspot' ||
    type === 'chargebee' ||
    type === 'google_ads'
  )
}

type SourcesView = 'home' | 'catalog' | 'form' | 'detail'

const emptyForm = (type: DataSourceType = 'postgresql'): FormState => ({
  name: '',
  type,
  description: '',
  host: type === 'databricks' ? '' : 'localhost',
  port: type === 'mongodb' ? '27017' : type === 'mysql' ? '3306' : '5432',
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
  dbxMode: type === 'mysql' ? 'fixture' : 'fixture',
  fixturesPath: defaultFixturesPath(type),
  warehouseId: '',
  token: '',
  catalog: 'main',
  account: '',
  warehouse: 'COMPUTE_WH',
  projectId: 'que-demo',
  location: 'US',
  instanceUrl: '',
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
      c.schema ??
        c.dataset ??
        (s.type === 'databricks'
          ? 'analytics'
          : s.type === 'bigquery'
            ? 'analytics'
            : s.type === 'salesforce'
              ? 'salesforce'
              : 'public'),
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
    dbxMode:
      c.mode === 'live' || c.mode === 'pending' ? 'live' : 'fixture',
    fixturesPath: String(
      c.fixturesPath ?? defaultFixturesPath(s.type),
    ),
    warehouseId: String(c.warehouseId ?? ''),
    token:
      typeof c.token === 'string' && c.token !== '••••••••' ? c.token : '',
    catalog: String(c.catalog ?? 'main'),
    account: String(c.account ?? ''),
    warehouse: String(c.warehouse ?? c.warehouseId ?? 'COMPUTE_WH'),
    projectId: String(c.projectId ?? c.project ?? 'que-demo'),
    location: String(c.location ?? 'US'),
    instanceUrl: String(c.instanceUrl ?? c.host ?? ''),
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
  if (form.type === 'mysql') {
    if (form.dbxMode === 'live') {
      return {
        mode: 'live',
        host: form.host,
        port: Number(form.port) || 3306,
        database: form.database,
        user: form.user,
        password: form.password,
        schema: form.schema || form.database || 'customer_demo',
        ssl: form.host && !/localhost|127\.0\.0\.1/i.test(form.host),
        includeSamples: true,
        sampleLimit: 5,
      }
    }
    return {
      mode: 'fixture',
      fixturesPath: form.fixturesPath || 'fixtures/mysql_demo.json',
      database: form.database || 'customer_demo',
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
  if (form.type === 'bigquery') {
    if (form.dbxMode === 'live') {
      return {
        mode: 'live',
        projectId: form.projectId,
        dataset: form.schema || 'analytics',
        location: form.location || 'US',
        token: form.token,
        includeSamples: false,
        sampleLimit: 5,
      }
    }
    return {
      mode: 'fixture',
      fixturesPath: form.fixturesPath || 'fixtures/bigquery_demo.json',
      projectId: form.projectId || 'que-demo',
      dataset: form.schema || 'analytics',
      includeSamples: true,
      sampleLimit: 5,
    }
  }
  if (form.type === 'salesforce') {
    if (form.dbxMode === 'live') {
      return {
        mode: 'live',
        instanceUrl: form.instanceUrl || form.host,
        token: form.token,
        includeSamples: false,
        sampleLimit: 3,
        maxObjects: 40,
      }
    }
    return {
      mode: 'fixture',
      fixturesPath: form.fixturesPath || 'fixtures/salesforce_demo.json',
      includeSamples: true,
      sampleLimit: 5,
    }
  }
  if (isFixtureCommerceType(form.type)) {
    if (form.dbxMode === 'live' && form.token) {
      return {
        mode: 'live',
        fixturesPath: form.fixturesPath || defaultFixturesPath(form.type),
        token: form.token,
        includeSamples: true,
        sampleLimit: 5,
      }
    }
    return {
      mode: 'fixture',
      fixturesPath: form.fixturesPath || defaultFixturesPath(form.type),
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
  return relativeLastSyncLabel(iso)
}

/**
 * Sources — connect / sync / catalog (dark IDE).
 */
export function SourcesPage() {
  const { canWrite, canAdmin } = useWorkspaceRole()
  const { workspaceId, workspaces } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { sourceId: routeSourceId, connector: routeConnector } = useParams<{
    sourceId?: string
    connector?: string
  }>()
  const view: SourcesView = location.pathname.startsWith('/sources/new')
    ? routeConnector
      ? 'form'
      : 'catalog'
    : routeSourceId
      ? 'detail'
      : 'home'
  const deepLinkId = routeSourceId ?? null
  const workspaceName =
    workspaces.find((w) => w.id === workspaceId)?.name || 'Workspace'
  const [sources, setSources] = useState<DataSource[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkId)
  const [creating, setCreating] = useState(
    () => view === 'catalog' || view === 'form',
  )
  const [wizardStep, setWizardStep] = useState(view === 'form' ? 2 : 1)
  const [catalogKey, setCatalogKey] = useState<string | null>(
    routeConnector ?? null,
  )
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogCategory, setCatalogCategory] =
    useState<ConnectorCategoryId>('all')
  const [form, setForm] = useState<FormState>(() => {
    const item = CONNECTOR_CATALOG.find((c) => c.key === routeConnector)
    return emptyForm(item?.type ?? 'postgresql')
  })
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [installingPackId, setInstallingPackId] = useState<string | null>(null)
  const [packDialog, setPackDialog] = useState<PocPackDefinition | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [postSyncJoins, setPostSyncJoins] = useState<PostSyncJoinSummary[] | null>(
    null,
  )
  const [postSyncSuggestedCount, setPostSyncSuggestedCount] = useState(0)
  const [postSyncMonkQueued, setPostSyncMonkQueued] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [tableNameOverrides, setTableNameOverrides] = useState('')
  const prevWorkspaceIdRef = useRef<string | null>(null)

  function goView(
    next: SourcesView,
    opts?: { id?: string | null; connector?: string | null },
  ) {
    if (next === 'home') {
      navigate('/sources')
      return
    }
    if (next === 'catalog') {
      navigate('/sources/new')
      return
    }
    if (next === 'form') {
      navigate(`/sources/new/${opts?.connector || catalogKey || 'postgresql'}`)
      return
    }
    if (next === 'detail' && opts?.id) {
      navigate(`/sources/${opts.id}`)
    }
  }

  async function reload(preferId?: string | null, forceHome = false) {
    const list = await fetchWorkspaceSources()
    setSources(list)
    const nextId = forceHome
      ? null
      : preferId && list.some((x) => x.id === preferId)
        ? preferId
        : selectedId && list.some((x) => x.id === selectedId)
          ? selectedId
          : null
    setSelectedId(nextId)
    if (preferId && !forceHome) {
      const s = list.find((x) => x.id === preferId)
      if (s) {
        setCreating(false)
        setWizardStep(1)
        setForm(formFromSource(s))
      }
    }
  }

  async function setSourceLandingMode(id: string, mode: DataLandingMode) {
    const source = sources.find((s) => s.id === id)
    if (!source) return
    setBusy(true)
    try {
      await updateConnection(id, {
        config: { ...(source.config || {}), dataLandingMode: mode },
      })
      await reload(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const switched =
      prevWorkspaceIdRef.current !== null &&
      prevWorkspaceIdRef.current !== workspaceId
    prevWorkspaceIdRef.current = workspaceId

    void reload().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )

    if (!switched) return

    setSelectedId(null)
    setCreating(false)
    setWizardStep(1)
    setCatalogKey(null)
    goView('home')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  useEffect(() => {
    if (view === 'catalog' || view === 'form') {
      setCreating(true)
      setSelectedId(null)
      setWizardStep(view === 'form' ? 2 : 1)
      const key = routeConnector || null
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
  }, [view, deepLinkId, routeConnector])

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
    : Boolean(selected && canSyncSource(selected))

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
        (item.type === 'snowflake' ||
          item.type === 'databricks' ||
          item.type === 'bigquery' ||
          item.type === 'salesforce' ||
          item.type === 'mysql' ||
          (item.type != null && isFixtureCommerceType(item.type))) &&
        item.preferredAuth === 'fixture'
      ) {
        next.dbxMode = 'fixture'
        next.fixturesPath = defaultFixturesPath(item.type)
      }
      if (item.defaultLive) {
        next.dbxMode = 'live'
      }
      if (item.defaultConfig?.port != null) {
        next.port = String(item.defaultConfig.port)
      }
      return next
    })
    setWizardStep(2)
    goView('form', { connector: item.key })
  }

  async function installPocPack(
    pack: PocPackDefinition,
    selection: PackInstallSelection,
  ) {
    if (!canAdmin) {
      setToast('Admin required to install a POC pack')
      return
    }
    const chosen = pack.connectors.filter((c) =>
      selection.selectedKeys.includes(c.key),
    )
    if (chosen.length === 0) {
      setToast('Select at least one connector (or cancel)')
      return
    }

    setInstallingPackId(pack.id)
    setBusy(true)
    setError(null)
    try {
      const existing = await fetchWorkspaceSources()
      const createdIds: string[] = []

      for (const conn of chosen) {
        const needle = conn.key.toLowerCase()
        const already = existing.some(
          (s) =>
            s.type === conn.type &&
            (s.name.toLowerCase().includes('poc') ||
              s.name.toLowerCase().includes('pack')) &&
            (s.name.toLowerCase().includes(needle) ||
              String(s.config?.packKey ?? '').toLowerCase() === needle),
        )
        if (already) continue

        const label = formatConnectorKeyLabel(conn.key)
        if (selection.dataMode === 'demo') {
          const row = await createConnection({
            name: conn.spec.name.replace(/\bfixture\b/gi, 'demo'),
            type: conn.type,
            description: conn.spec.description,
            status: 'warning',
            config: { ...conn.spec.config },
          })
          createdIds.push(row.id)
        } else {
          const row = await createConnection({
            name: `Pack · ${label}`,
            type: conn.type,
            description: `From ${pack.title} — add credentials or Use demo`,
            status: 'warning',
            config: pendingPackConfig({
              packId: pack.id,
              packKey: conn.key,
            }),
          })
          createdIds.push(row.id)
        }
      }

      let tables = 0
      let joins = 0
      if (selection.dataMode === 'demo' && createdIds.length) {
        for (const id of createdIds) {
          const result = await syncConnection(id)
          tables += result.tablesSynced ?? 0
          joins += result.suggestedJoins ?? 0
        }
        notifySchemaChanged('sync')
      }

      goView('home')
      await reload(null, true)
      setPackDialog(null)

      if (selection.dataMode === 'demo') {
        setToast(
          createdIds.length
            ? `${pack.title}: ${createdIds.length} demo connector(s) · ${tables} tables · ${joins} join suggestions`
            : `${pack.title}: connectors already present — open Sources to Sync or edit`,
        )
      } else {
        setToast(
          createdIds.length
            ? `${pack.title}: ${createdIds.length} slot(s) ready — Connect, Use demo, or Skip each row. Workspace stays empty until you sync.`
            : `${pack.title}: selected connectors already exist`,
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      setInstallingPackId(null)
    }
  }

  async function useDemoOnSource(id: string) {
    if (!canAdmin) return
    const source = sources.find((s) => s.id === id)
    if (!source) return
    setBusy(true)
    setError(null)
    try {
      const packId = String(source.config?.packId ?? '')
      const packKey = String(source.config?.packKey ?? '')
      const pack = POC_PACKS.find((p) => p.id === packId)
      const conn = pack?.connectors.find((c) => c.key === packKey)
      const fixtureConfig = conn
        ? { ...conn.spec.config }
        : {
            mode: 'fixture',
            fixturesPath: defaultFixturesPath(source.type),
            includeSamples: true,
            sampleLimit: 5,
          }
      const label = formatConnectorKeyLabel(packKey || source.type)
      await updateConnection(id, {
        name: `POC · ${label} demo`,
        description: conn?.spec.description || source.description,
        status: 'warning',
        config: fixtureConfig,
      })
      const result = await syncConnection(id)
      showPostSyncBanner(result)
      setToast(
        `Demo ready · ${result.tablesSynced ?? 0} tables · ${result.suggestedJoins ?? 0} suggestions`,
      )
      notifySchemaChanged('sync')
      await reload(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function skipSource(id: string) {
    if (!canAdmin) return
    const source = sources.find((s) => s.id === id)
    if (!source) return
    const ok = window.confirm(
      `Remove “${source.name}”? You can re-install the pack or Add connector later.`,
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await deleteConnection(id)
      setToast(`Removed ${source.name}`)
      if (selectedId === id) {
        setSelectedId(null)
        goView('home')
      }
      await reload(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function showPostSyncBanner(result: SyncConnectionResult) {
    const count = result.suggestedJoins ?? result.postSync?.topJoins?.length ?? 0
    if (count > 0 || result.postSync?.topJoins?.length) {
      setPostSyncJoins(result.postSync?.topJoins ?? [])
      setPostSyncSuggestedCount(count)
      setPostSyncMonkQueued(Boolean(result.postSync?.monkQueued))
    }
  }

  async function syncById(id: string) {
    const src = sources.find((s) => s.id === id)
    if (src && !canSyncSource(src)) {
      setToast('Add credentials or Use demo before Sync')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await syncConnection(id)
      showPostSyncBanner(result)
      setToast(
        `Synced ${result.tablesSynced} tables · ${result.suggestedJoins ?? 0} suggestions`,
      )
      notifySchemaChanged('sync')
      await reload(id)
      if (result.showMonkPrompt !== false) {
        navigate(
          `/workspace?synced=${encodeURIComponent(id)}&tables=${result.tablesSynced ?? 0}`,
        )
      }
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
    if (!selected || creating || !canSyncSource(selected)) return
    setBusy(true)
    setError(null)
    try {
      const result = await syncConnection(selected.id)
      showPostSyncBanner(result)
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
      if (result.showMonkPrompt !== false) {
        navigate(
          `/workspace?synced=${encodeURIComponent(selected.id)}&tables=${result.tablesSynced ?? 0}`,
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const banners = (
    <>
      {postSyncJoins !== null ? (
        <PostSyncJoinBanner
          joins={postSyncJoins}
          suggestedCount={postSyncSuggestedCount}
          monkQueued={postSyncMonkQueued}
          onDismiss={() => setPostSyncJoins(null)}
        />
      ) : null}
      {error ? (
        <p className="border-b border-error/40 bg-error/10 px-md py-sm font-body text-sm text-error">
          {error}
        </p>
      ) : null}
      {toast ? (
        <p className="border-b border-[#424850] bg-[rgba(170,181,192,0.08)] px-md py-sm font-body text-sm text-[#d0d8e0]">
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
                      goView('catalog')
                    } else {
                      cancelWizard()
                    }
                  }}
                  className="text-[12px] font-medium text-[#a3afbe] hover:text-[#d0d8e0] hover:underline"
                >
                  {wizardStep === 2 ? '← Back to connectors' : '← All sources'}
                </button>
                <div className="flex items-center gap-1 rounded-lg border border-outline-variant/25 bg-surface-container-low p-0.5">
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
                            ? 'bg-[#d0d8e0] text-[#323840]'
                            : done
                              ? 'text-[#c8cdd3]'
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
                    <div className="sticky top-4 rounded-lg border border-outline-variant/20 bg-surface-container-low p-lg">
                      <div className="pdf-shine mb-md flex h-16 w-16 items-center justify-center rounded-[8px] text-[#c8cdd3]">
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
                              className="rounded-full border border-solid border-[#424850] bg-[#252a30] px-2 py-0.5 text-[10px] text-[#c8cdd3]"
                            >
                              {cap}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-lg rounded-xl bg-surface-container p-md">
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
                    <div className="rounded-lg border border-outline-variant/20 bg-surface-container-low p-lg">
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
                          className="pdf-btn-primary rounded-[4px] px-lg py-2 text-[12px] font-semibold disabled:opacity-40"
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
    )
  }

  /* List + detail */
  return (
      <div className="flex min-h-0 flex-1 overflow-hidden bg-[#111416]">
        {packDialog ? (
          <PocPackInstallDialog
            pack={packDialog}
            busy={
              installingPackId === packDialog.id ||
              (busy && installingPackId != null)
            }
            onCancel={() => {
              if (!installingPackId) setPackDialog(null)
            }}
            onConfirm={(selection) =>
              void installPocPack(packDialog, selection)
            }
          />
        ) : null}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {banners}
          {!selected ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <PdfPageHeader
                title="Sources"
                subtitle="Connected systems sync schema into Que. Add a connector, then Promote joins on Workspace."
                actions={
                  <div className="flex flex-wrap items-center gap-[12px]">
                    <div className="relative w-[220px]">
                      <input
                        type="search"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Filter sources..."
                        className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] py-[10px] pl-[37px] pr-[13px] text-[12px] text-[#d4dbe3] outline-none placeholder:text-[#8a9099]"
                      />
                      <img
                        alt=""
                        className="pointer-events-none absolute left-[12px] top-1/2 size-[13.5px] -translate-y-1/2 opacity-70"
                        src={FIGMA_NAV.search}
                      />
                    </div>
                    {canAdmin ? (
                      <PdfPrimaryButton type="button" onClick={startCreate}>
                        + Add connector
                      </PdfPrimaryButton>
                    ) : null}
                  </div>
                }
              />

              <main className="min-h-0 flex-1 overflow-y-auto p-[24px]">
                {canAdmin ? (
                  <div className="mb-[24px] grid gap-[12px] lg:grid-cols-2">
                    {POC_PACKS.map((pack) => (
                      <div
                        key={pack.id}
                        className="pdf-shine flex flex-col gap-[12px] rounded-[8px] p-[16px] sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <h2 className="text-[13px] font-semibold text-[#d4dbe3]">
                            {pack.title}
                          </h2>
                          <p className="mt-[4px] max-w-[36rem] text-[12px] text-[#a3afbe]">
                            {pack.body}
                          </p>
                        </div>
                        <PdfGhostButton
                          type="button"
                          disabled={installingPackId === pack.id || busy}
                          onClick={() => setPackDialog(pack)}
                          className="shrink-0"
                        >
                          {installingPackId === pack.id
                            ? 'Installing…'
                            : 'Install pack'}
                        </PdfGhostButton>
                      </div>
                    ))}
                  </div>
                ) : null}

                <SourcesTableView
                  sources={filtered}
                  onSelect={(id) => {
                    setSelectedId(id)
                    goView('detail', { id })
                  }}
                  onSync={canWrite ? (id) => void syncById(id) : undefined}
                  onUseDemo={canAdmin ? (id) => void useDemoOnSource(id) : undefined}
                  onSkip={canAdmin ? (id) => void skipSource(id) : undefined}
                  onLandingModeChange={
                    canWrite ? (id, mode) => void setSourceLandingMode(id, mode) : undefined
                  }
                  canEditLanding={canWrite}
                  canSync={canWrite}
                  canAdd={canAdmin}
                  canAdmin={canAdmin}
                  onAdd={startCreate}
                />
              </main>
            </div>
          ) : (
          <main className="min-h-0 flex-1 overflow-y-auto px-md py-lg md:px-lg lg:px-margin-desktop">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null)
                    goView('home')
                  }}
                  className="mb-md text-[12px] font-medium text-[#a3afbe] hover:text-[#d0d8e0] hover:underline"
                >
                  ← Back to Sources
                </button>
                <div className="mb-lg flex flex-wrap items-start gap-md">
                  <div className="pdf-shine flex h-14 w-14 items-center justify-center rounded-[8px] text-[#c8cdd3]">
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
                        className={`inline-flex items-center gap-xs rounded-full px-sm py-1 font-label text-[11px] font-semibold ${statusBadgeForSource(selected).className}`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full ${STATUS_DOT[selected.status]}`}
                        />
                        {statusBadgeForSource(selected).label}
                      </span>
                      <span className="font-body text-[12px] text-on-surface-variant">
                        {relativeLastSyncLabel(selected.lastSyncAt)}
                      </span>
                    </div>
                    {isPendingSource(selected) ? (
                      <div className="mt-md max-w-[40rem] rounded-xl border border-[rgba(240,160,32,0.35)] bg-[rgba(240,160,32,0.08)] px-md py-sm">
                        <p className="font-label text-[11px] font-bold tracking-wider text-amber-300 uppercase">
                          Needs credentials
                        </p>
                        <p className="mt-1 font-body text-[12px] leading-snug text-on-surface">
                          This pack slot has no connection yet. Fill live
                          credentials below and Save, or go back and click{' '}
                          <strong>Use demo</strong> for Que fixture data.
                        </p>
                        {canAdmin ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void useDemoOnSource(selected.id)}
                            className="mt-sm pdf-btn-ghost rounded-[4px] px-[10px] py-[4px] text-[11px] font-bold disabled:opacity-40"
                          >
                            Use demo data
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {selected.status === 'error' || selected.needsReauth ? (
                      <div className="mt-md max-w-[40rem] rounded-xl border border-error/30 bg-error/5 px-md py-sm">
                        <p className="font-label text-[11px] font-bold tracking-wider text-error uppercase">
                          {selected.needsReauth ||
                          selected.lastSyncErrorKind === 'auth'
                            ? 'Re-auth required'
                            : selected.lastSyncErrorKind === 'network'
                              ? 'Network issue'
                              : selected.lastSyncErrorKind === 'config'
                                ? 'Config issue'
                                : 'Sync failed'}
                        </p>
                        <p className="mt-1 font-body text-[12px] leading-snug text-on-surface">
                          {selected.lastSyncError ||
                            'Last schema sync failed. Update credentials if needed, then Sync Schema.'}
                        </p>
                        <div className="mt-sm flex flex-wrap gap-sm">
                          {canAdmin &&
                          (selected.needsReauth ||
                            selected.lastSyncErrorKind === 'auth') ? (
                            <a
                              href="#connector-credentials"
                              className="rounded-md bg-error/10 px-sm py-1 font-label text-[11px] font-bold text-error"
                            >
                              Update credentials
                            </a>
                          ) : null}
                          {syncable && canWrite ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void sync()}
                              className="pdf-btn-ghost rounded-[4px] px-[10px] py-[4px] text-[11px] font-bold disabled:opacity-40"
                            >
                              Retry sync
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div
                  id="connector-credentials"
                  className="rounded-lg border border-outline-variant/20 bg-surface-container-low p-lg"
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

                {syncable ? (
                  <div className="mt-lg rounded-lg border border-outline-variant/20 bg-surface-container-low p-lg">
                    <h3 className="font-label text-[11px] font-semibold tracking-[0.12em] text-on-surface-variant uppercase">
                      Sync schedule
                    </h3>
                    <p className="mt-xs max-w-[36rem] font-body text-[12px] text-on-surface-variant">
                      Wave 2.5 — schema introspect only (hourly or daily). Not
                      full ETL.
                    </p>
                    <div className="mt-md flex flex-wrap items-end gap-md">
                      <label className="block">
                        <span className="font-label text-[10px] tracking-wider text-on-surface-variant uppercase">
                          Cadence
                        </span>
                        <select
                          disabled={!canAdmin || busy}
                          value={selected.syncSchedule || 'off'}
                          onChange={(e) => {
                            const syncSchedule = e.target.value as
                              | 'off'
                              | 'hourly'
                              | 'daily'
                            void (async () => {
                              setBusy(true)
                              setError(null)
                              try {
                                const updated = await updateConnection(
                                  selected.id,
                                  { syncSchedule },
                                )
                                setSources((prev) =>
                                  prev.map((s) =>
                                    s.id === updated.id ? updated : s,
                                  ),
                                )
                                setToast(
                                  syncSchedule === 'off'
                                    ? 'Scheduled sync off'
                                    : `Scheduled ${syncSchedule} introspect`,
                                )
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : String(err),
                                )
                              } finally {
                                setBusy(false)
                              }
                            })()
                          }}
                          className="mt-1 block rounded-lg border border-outline-variant/40 bg-surface-container px-sm py-1.5 font-body text-[13px] text-on-surface disabled:opacity-40"
                        >
                          <option value="off">Off</option>
                          <option value="hourly">Hourly</option>
                          <option value="daily">Daily</option>
                        </select>
                      </label>
                      <div className="font-body text-[12px] text-on-surface-variant">
                        {selected.syncSchedule &&
                        selected.syncSchedule !== 'off' ? (
                          <>
                            Next:{' '}
                            {selected.syncNextAt
                              ? new Date(selected.syncNextAt).toLocaleString()
                              : '—'}
                            {selected.lastScheduledSyncAt ? (
                              <>
                                {' '}
                                · last scheduled{' '}
                                {relativeSyncLabel(selected.lastScheduledSyncAt)}
                              </>
                            ) : null}
                          </>
                        ) : (
                          'Manual Sync Schema only'
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-lg flex flex-wrap gap-sm">
                  {canAdmin ? (
                    <button
                      type="button"
                      disabled={busy || !form.name.trim()}
                      onClick={() => void save()}
                      className="pdf-btn-primary rounded-[4px] px-md py-1.5 text-[12px] font-semibold disabled:opacity-40"
                    >
                      Save
                    </button>
                  ) : null}
                  {syncable && canWrite ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void sync()}
                      className="pdf-btn-ghost rounded-[4px] px-md py-1.5 text-[12px] font-semibold disabled:opacity-40"
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
                    className="ml-auto pdf-btn-ghost rounded-[4px] px-md py-1.5 text-[12px] font-semibold"
                  >
                    Open Workspace
                  </Link>
                </div>
          </main>
          )}
        </div>
      </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-outline-variant bg-surface-container-low px-sm py-1.5 font-body text-[13px] text-on-surface outline-none focus:border-secondary'

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
      {form.type === 'mysql' ? (
        <MysqlFields form={form} setForm={setForm} />
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
      {form.type === 'bigquery' ? (
        <BigQueryFields form={form} setForm={setForm} />
      ) : null}
      {form.type === 'salesforce' ? (
        <SalesforceFields form={form} setForm={setForm} />
      ) : null}
      {isFixtureCommerceType(form.type) ? (
        <FixtureCommerceFields form={form} setForm={setForm} />
      ) : null}
      {form.type === 'excel' || form.type === 'csv' ? (
        <div className="space-y-md">
          <div className="rounded-xl border border-dashed border-[#424850] bg-[rgba(170,181,192,0.06)] p-md">
            <p className="text-[10px] font-bold tracking-widest text-[#d0d8e0]">
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

function MysqlFields({
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
        <>
          <Field label="Fixtures path">
            <input
              value={form.fixturesPath}
              onChange={(e) =>
                setForm((f) => ({ ...f, fixturesPath: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Database label">
            <input
              value={form.database}
              onChange={(e) =>
                setForm((f) => ({ ...f, database: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
        </>
      ) : (
        <div className="grid gap-md md:grid-cols-2">
          <Field label="Host">
            <input
              value={form.host}
              placeholder="my-db.xxxxx.ap-south-1.rds.amazonaws.com"
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
      )}
      <p className="font-body text-[11px] text-on-surface-variant">
        Fixture mode loads India SMB demo schema (customers, orders, line items).
        Live mode introspects information_schema on your MySQL / RDS instance.
      </p>
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
              ? 'bg-[#d0d8e0] text-[#323840]'
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
              ? 'bg-[#d0d8e0] text-[#323840]'
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

function BigQueryFields({
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
        <>
          <Field label="Fixtures path">
            <input
              value={form.fixturesPath}
              onChange={(e) =>
                setForm((f) => ({ ...f, fixturesPath: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
          <div className="grid gap-md md:grid-cols-2">
            <Field label="Project id (label)">
              <input
                value={form.projectId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, projectId: e.target.value }))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Dataset">
              <input
                value={form.schema}
                onChange={(e) =>
                  setForm((f) => ({ ...f, schema: e.target.value }))
                }
                className={inputClass}
              />
            </Field>
          </div>
        </>
      ) : (
        <div className="grid gap-md md:grid-cols-2">
          <Field label="Project id">
            <input
              value={form.projectId}
              placeholder="my-gcp-project"
              onChange={(e) =>
                setForm((f) => ({ ...f, projectId: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Dataset">
            <input
              value={form.schema}
              placeholder="analytics"
              onChange={(e) =>
                setForm((f) => ({ ...f, schema: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Location">
            <input
              value={form.location}
              placeholder="US"
              onChange={(e) =>
                setForm((f) => ({ ...f, location: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
          <Field label="OAuth access token">
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
    </div>
  )
}

function SalesforceFields({
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
          <Field label="Instance URL">
            <input
              value={form.instanceUrl}
              placeholder="https://yourorg.my.salesforce.com"
              onChange={(e) =>
                setForm((f) => ({ ...f, instanceUrl: e.target.value }))
              }
              className={inputClass}
            />
          </Field>
          <Field label="Access token">
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
      <p className="font-body text-[11px] text-on-surface-variant">
        Live mode uses describeGlobal + describe (schema only). Prefer a
        Connected App access token; OAuth UI flow is still roadmap.
      </p>
    </div>
  )
}

function FixtureCommerceFields({
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
        <Field label="API token / secret key">
          <input
            type="password"
            value={form.token}
            placeholder="leave blank to keep"
            onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
            className={inputClass}
          />
        </Field>
      )}
      <p className="font-body text-[11px] text-on-surface-variant">
        Fixture mode loads demo schema instantly — ideal for India D2C stack POC
        (Shopify + Razorpay + Stripe). Live OAuth/API ingest remains partner
        stack; Que wins post-sync joins and Monk cert.
      </p>
    </div>
  )
}

export default SourcesPage
