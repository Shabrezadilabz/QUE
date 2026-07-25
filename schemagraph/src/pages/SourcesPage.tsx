import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { SourceTypeIcon, sourceTypeLabel } from '@/components/sidebar/SourceTypeIcon'
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
import type { DataSource, DataSourceStatus, DataSourceType } from '@/types/dataSource'

const CREATABLE: DataSourceType[] = [
  'postgresql',
  'excel',
  'csv',
  'mongodb',
  'databricks',
]

const STATUS_DOT: Record<DataSourceStatus, string> = {
  active: 'bg-primary-fixed',
  warning: 'bg-[#FF3E00]',
  error: 'bg-[#FF0055]',
}

type FormState = {
  name: string
  type: DataSourceType
  description: string
  // postgres / mongo
  host: string
  port: string
  database: string
  user: string
  password: string
  schema: string
  uri: string
  // spreadsheet
  filesJson: string
  // databricks
  dbxMode: 'fixture' | 'live'
  fixturesPath: string
  warehouseId: string
  token: string
  catalog: string
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
  // excel / csv
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

/**
 * Sources — manage connections, edit config, sync schema.
 */
export function SourcesPage() {
  const { canWrite, canAdmin } = useWorkspaceRole()
  const { workspaceId } = useAuth()
  const [sources, setSources] = useState<DataSource[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
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
      preferId && list.some((s) => s.id === preferId)
        ? preferId
        : selectedId && list.some((s) => s.id === selectedId)
          ? selectedId
          : list[0]?.id ?? null
    setSelectedId(nextId)
    if (preferId) {
      const s = list.find((x) => x.id === preferId)
      if (s) {
        setCreating(false)
        setForm(formFromSource(s))
      }
    }
  }

  useEffect(() => {
    setSelectedId(null)
    setCreating(false)
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

  const selected = sources.find((s) => s.id === selectedId) ?? null
  const syncable =
    creating
      ? CREATABLE.includes(form.type)
      : Boolean(selected?.syncable)

  function startCreate() {
    setCreating(true)
    setSelectedId(null)
    setForm(emptyForm('postgresql'))
    setPendingFiles([])
    setTableNameOverrides('')
    setError(null)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      // Excel/CSV create via upload → schema sync into workspace
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

  return (
    <QueAppChrome eyebrow="SOURCES · CONNECT · SYNC">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-80 shrink-0 flex-col border-r border-outline-variant bg-surface-container">
          <div className="border-b border-outline-variant p-md">
            <div className="flex items-center justify-between">
              <h1 className="font-headline text-xl font-semibold text-on-surface">
                Sources
              </h1>
              {canAdmin ? (
                <button
                  type="button"
                  onClick={startCreate}
                  className="bg-primary-container px-sm py-xs font-label text-[11px] font-bold tracking-widest text-on-primary-fixed"
                >
                  + ADD
                </button>
              ) : null}
            </div>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter name / type…"
              className="mt-md w-full border border-outline-variant bg-surface-container-low px-sm py-xs font-body text-xs text-on-surface outline-none focus:border-primary-fixed"
            />
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto p-sm">
            {filtered.map((s) => (
              <li key={s.id} className="mb-sm">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false)
                    setSelectedId(s.id)
                  }}
                  className={[
                    'flex w-full items-start gap-sm border p-sm text-left transition-colors',
                    !creating && selectedId === s.id
                      ? 'border-primary-fixed bg-secondary-container border-l-4'
                      : 'border-outline-variant bg-surface-container-low hover:border-primary-fixed',
                  ].join(' ')}
                >
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 ${STATUS_DOT[s.status]}`}
                  />
                  <span className="mt-0.5 shrink-0 text-on-surface-variant">
                    <SourceTypeIcon type={s.type} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-body text-xs text-on-surface">
                      {s.name}
                    </span>
                    <span className="mt-0.5 block font-label text-[10px] tracking-wider text-on-surface-variant uppercase">
                      {sourceTypeLabel(s.type)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

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

          {!creating && !selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-md p-xl text-center">
              <h2 className="font-headline text-2xl text-on-surface">
                Connect a source
              </h2>
              <p className="max-w-[28rem] font-body text-sm text-on-surface-variant">
                Add Postgres, Excel/CSV, or Mongo — then Sync Schema to Que
                metadata onto the canvas.
              </p>
              {canAdmin ? (
                <button
                  type="button"
                  onClick={startCreate}
                  className="bg-primary-container px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-primary-fixed"
                >
                  ADD CONNECTION
                </button>
              ) : (
                <p className="font-label text-[10px] tracking-widest text-on-surface-variant">
                  {canWrite
                    ? 'Ask an admin to add connections'
                    : 'READ-ONLY · VIEWER'}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="border-b border-outline-variant bg-surface-container-lowest px-md py-lg">
                <h2 className="font-headline text-2xl tracking-tight text-on-surface">
                  {creating ? 'New connection' : form.name || selected?.name}
                </h2>
                <p className="mt-xs font-label text-[10px] tracking-widest text-on-surface-variant">
                  {creating
                    ? 'CONFIGURE CONNECTOR'
                    : `STATUS ${selected?.status?.toUpperCase()} · ${sourceTypeLabel(form.type)}`}
                </p>
              </div>

              <div className="min-h-0 flex-1 space-y-md overflow-y-auto p-md">
                {!canAdmin ? (
                  <p className="mb-md font-label text-[10px] tracking-widest text-on-surface-variant">
                    {canWrite
                      ? 'View-only config — admin required to edit'
                      : 'READ-ONLY · VIEWER'}
                  </p>
                ) : null}
                <fieldset
                  disabled={!canAdmin}
                  className="space-y-md border-0 p-0 disabled:opacity-70"
                >
                <Field label="Name">
                  <input
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    className={inputClass}
                  />
                </Field>

                <Field label="Type">
                  <select
                    value={form.type}
                    disabled={!creating}
                    onChange={(e) => {
                      const type = e.target.value as DataSourceType
                      setForm((f) => ({
                        ...emptyForm(type),
                        name: f.name,
                        description: f.description,
                        type,
                      }))
                    }}
                    className={inputClass}
                  >
                    {(creating ? CREATABLE : [form.type]).map((t) => (
                      <option key={t} value={t}>
                        {sourceTypeLabel(t)}
                      </option>
                    ))}
                  </select>
                </Field>

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
                    <div className="border border-dashed border-primary-fixed/50 bg-primary-container/5 p-md">
                      <p className="font-label text-[10px] font-bold tracking-widest text-primary-fixed">
                        UPLOAD {form.type === 'excel' ? 'EXCEL' : 'CSV'}
                      </p>
                      <p className="mt-xs font-body text-xs text-on-surface-variant">
                        Drop files here — Que infers tables/columns (capped
                        samples), maps them into this workspace, then canvas +
                        AI chat can use them after sync.
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
                        className="mt-md block w-full font-body text-xs text-on-surface file:mr-md file:border file:border-outline-variant file:bg-surface-container file:px-sm file:py-xs file:font-label file:text-[10px] file:tracking-widest"
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
              </div>

              <div className="flex flex-wrap gap-sm border-t border-outline-variant p-md">
                {canAdmin ? (
                  <button
                    type="button"
                    disabled={busy || !form.name.trim()}
                    onClick={() => void save()}
                    className="bg-primary-container px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-primary-fixed disabled:opacity-40"
                  >
                    {creating
                      ? form.type === 'excel' || form.type === 'csv'
                        ? 'UPLOAD & ANALYZE'
                        : 'CREATE'
                      : 'SAVE'}
                  </button>
                ) : null}
                {!creating && syncable && canWrite ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void sync()}
                    className="border border-primary-fixed px-md py-sm font-label text-[11px] font-bold tracking-widest text-primary-fixed disabled:opacity-40"
                  >
                    SYNC SCHEMA
                  </button>
                ) : null}
                {!creating && selected && canAdmin ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void remove()}
                    className="border border-outline-variant px-md py-sm font-label text-[11px] font-bold tracking-widest text-error disabled:opacity-40"
                  >
                    DELETE
                  </button>
                ) : null}
                {!canAdmin && !canWrite ? (
                  <p className="font-label text-[10px] tracking-widest text-on-surface-variant">
                    READ-ONLY · VIEWER
                  </p>
                ) : null}
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

const inputClass =
  'w-full border border-outline-variant bg-surface-container-low px-sm py-sm font-body text-xs text-on-surface outline-none focus:border-primary-fixed'

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
