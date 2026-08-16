import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  createDomainApi,
  deleteDomainApi,
  fetchDomains,
  fetchWorkspaceMembers,
  fetchWorkspaceSources,
  updateDomainApi,
  type WorkspaceDomain,
  type WorkspaceMember,
} from '@/services/stitchApi'
import type { DataSource } from '@/types/dataSource'

const STARTER_DOMAINS = [
  {
    name: 'Orders',
    description: 'Orders, customers, and fulfillment tables.',
    tableGlobs: ['*order*', '*sales*', '*customer*', '*fulfill*'],
  },
  {
    name: 'Finance',
    description: 'Invoices, payments, and ledger products.',
    tableGlobs: ['*invoice*', '*payment*', '*ledger*', '*billing*'],
  },
  {
    name: 'Growth',
    description: 'Campaign, funnel, and product analytics.',
    tableGlobs: ['*campaign*', '*event*', '*funnel*', '*metric*'],
  },
] as const

function activeDomainKey(workspaceId: string) {
  return `que.activeDomain.${workspaceId}`
}

/**
 * Settings → Domains — owned data products (sources, globs, steward).
 */
export function DomainsSettingsPage() {
  const { workspaceId, user } = useAuth()
  const { canWrite, canAdmin } = useWorkspaceRole()
  const [domains, setDomains] = useState<WorkspaceDomain[]>([])
  const [sources, setSources] = useState<DataSource[]>([])
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [ownerUserId, setOwnerUserId] = useState<string>('')
  const [connectionIds, setConnectionIds] = useState<string[]>([])
  const [globsText, setGlobsText] = useState('')

  const selected = useMemo(
    () => domains.find((d) => d.id === selectedId) ?? null,
    [domains, selectedId],
  )

  const sourceById = useMemo(() => {
    const m = new Map<string, DataSource>()
    for (const s of sources) m.set(s.id, s)
    return m
  }, [sources])

  const claimedConnectionIds = useMemo(() => {
    const claimed = new Map<string, string>()
    for (const d of domains) {
      if (selected && d.id === selected.id) continue
      for (const id of d.connectionIds) claimed.set(id, d.name)
    }
    return claimed
  }, [domains, selected])

  const unscopedSources = useMemo(() => {
    const linked = new Set(domains.flatMap((d) => d.connectionIds))
    return sources.filter((s) => !linked.has(s.id))
  }, [domains, sources])

  async function reload(preferId?: string | null) {
    const [d, s, m] = await Promise.all([
      fetchDomains(),
      fetchWorkspaceSources().catch(() => [] as DataSource[]),
      fetchWorkspaceMembers().catch(() => ({
        members: [] as WorkspaceMember[],
        summary: null,
      })),
    ])
    setDomains(d)
    setSources(s)
    setMembers(m.members)
    const nextId =
      preferId && d.some((x) => x.id === preferId)
        ? preferId
        : selectedId && d.some((x) => x.id === selectedId)
          ? selectedId
          : d[0]?.id ?? null
    setSelectedId(nextId)
    return d
  }

  useEffect(() => {
    reload()
      .then((d) => {
        if (!workspaceId || d.length === 0) return
        const stored = localStorage.getItem(activeDomainKey(workspaceId))
        if (stored && d.some((x) => x.id === stored)) setSelectedId(stored)
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + workspace
  }, [workspaceId])

  useEffect(() => {
    if (!selected || creating) return
    setName(selected.name)
    setDescription(selected.description || '')
    setOwnerUserId(selected.ownerUserId || '')
    setConnectionIds([...selected.connectionIds])
    setGlobsText((selected.tableGlobs || []).join('\n'))
  }, [selected, creating])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(t)
  }, [toast])

  function parseGlobs(raw: string) {
    return raw
      .split(/[\n,]+/)
      .map((g) => g.trim())
      .filter(Boolean)
      .slice(0, 80)
  }

  function beginCreate(preset?: (typeof STARTER_DOMAINS)[number]) {
    setCreating(true)
    setSelectedId(null)
    setName(preset?.name || '')
    setDescription(preset?.description || '')
    setOwnerUserId(user?.id || '')
    setConnectionIds([])
    setGlobsText(preset?.tableGlobs.join('\n') || '')
    setError(null)
  }

  function cancelCreate() {
    setCreating(false)
    if (domains[0]) setSelectedId(domains[0].id)
  }

  async function saveCreate() {
    if (!canWrite || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const domain = await createDomainApi({
        name: name.trim(),
        description: description.trim(),
        connectionIds,
        tableGlobs: parseGlobs(globsText),
        ownerUserId: ownerUserId || null,
      })
      setCreating(false)
      setToast(`Created ${domain.name}`)
      await reload(domain.id)
      if (workspaceId) {
        localStorage.setItem(activeDomainKey(workspaceId), domain.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    if (!canWrite || !selected || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const domain = await updateDomainApi(selected.id, {
        name: name.trim(),
        description: description.trim(),
        connectionIds,
        tableGlobs: parseGlobs(globsText),
        ownerUserId: ownerUserId || null,
      })
      setToast(`Saved ${domain.name}`)
      await reload(domain.id)
      if (workspaceId) {
        localStorage.setItem(activeDomainKey(workspaceId), domain.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function removeDomain(d: WorkspaceDomain) {
    if (!canAdmin) return
    if (!window.confirm(`Delete domain “${d.name}”? This cannot be undone.`)) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await deleteDomainApi(d.id)
      setToast(`Deleted ${d.name}`)
      if (workspaceId) {
        const key = activeDomainKey(workspaceId)
        if (localStorage.getItem(key) === d.id) localStorage.removeItem(key)
      }
      setSelectedId(null)
      await reload(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function seedStarters() {
    if (!canWrite) return
    setBusy(true)
    setError(null)
    try {
      const existing = new Set(domains.map((d) => d.name.toLowerCase()))
      let lastId: string | null = null
      for (const starter of STARTER_DOMAINS) {
        if (existing.has(starter.name.toLowerCase())) continue
        const created = await createDomainApi({
          name: starter.name,
          description: starter.description,
          tableGlobs: [...starter.tableGlobs],
          ownerUserId: user?.id || null,
        })
        lastId = created.id
      }
      setToast('Starter domains ready')
      setCreating(false)
      await reload(lastId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function toggleConnection(id: string) {
    setConnectionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const formTitle = creating
    ? 'New domain'
    : selected
      ? `Edit · ${selected.name}`
      : 'Select a domain'

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <main className="min-h-0 flex-1 overflow-y-auto px-md py-lg pb-32 md:px-lg lg:px-margin-desktop">
        <div className="mb-xl flex flex-col justify-between gap-md sm:flex-row sm:items-end">
          <div>
            <h1 className="font-headline text-xl font-semibold tracking-tight text-on-surface">
              Domains
            </h1>
            <p className="mt-xs max-w-[42rem] font-body text-[13px] leading-snug text-on-surface-variant">
              Owned data products that scope sources and table patterns for
              stitch, jobs, and review. Assign a steward so Promote stays
              accountable.
            </p>
          </div>
          <div className="flex flex-wrap gap-sm">
            {canWrite && domains.length === 0 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void seedStarters()}
                className="rounded-lg border border-secondary/40 px-md py-sm font-label text-[12px] text-secondary disabled:opacity-40"
              >
                Seed Orders / Finance / Growth
              </button>
            ) : null}
            <button
              type="button"
              disabled={!canWrite}
              onClick={() => beginCreate()}
              className="inline-flex items-center justify-center gap-sm rounded bg-secondary px-lg py-sm font-label text-[12px] font-medium text-on-secondary transition-all hover:shadow-md active:scale-95 disabled:opacity-40"
            >
              <span aria-hidden>+</span>
              New domain
            </button>
          </div>
        </div>

        {error ? (
          <p className="mb-md rounded-xl border border-error/40 bg-error-container px-md py-sm font-body text-[13px] text-error">
            {error}
          </p>
        ) : null}
        {toast ? (
          <p className="mb-md rounded-xl border border-secondary/25 bg-secondary/15 px-md py-sm font-label text-[12px] text-secondary">
            {toast}
          </p>
        ) : null}

        <div className="mb-lg grid gap-md sm:grid-cols-3">
          <Stat label="Domains" value={String(domains.length)} />
          <Stat
            label="Linked sources"
            value={String(
              new Set(domains.flatMap((d) => d.connectionIds)).size,
            )}
          />
          <Stat
            label="Unscoped sources"
            value={String(unscopedSources.length)}
            hint={
              unscopedSources.length
                ? unscopedSources
                    .slice(0, 3)
                    .map((s) => s.name)
                    .join(', ')
                : 'All sources assigned'
            }
          />
        </div>

        <div className="grid gap-lg lg:grid-cols-12">
          <section className="lg:col-span-4">
            <p className="mb-sm font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
              Data products
            </p>
            {domains.length === 0 && !creating ? (
              <div className="rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-low p-lg">
                <p className="font-body text-[13px] text-on-surface-variant">
                  No domains yet. Seed the common team OS trio or create your
                  first product boundary.
                </p>
                <div className="mt-md flex flex-wrap gap-sm">
                  {STARTER_DOMAINS.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      disabled={!canWrite}
                      onClick={() => beginCreate(p)}
                      className="rounded-lg border border-outline-variant/40 px-md py-1.5 font-label text-[11px] text-on-surface-variant disabled:opacity-40"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="space-y-sm">
                {domains.map((d) => {
                  const active = !creating && d.id === selectedId
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCreating(false)
                          setSelectedId(d.id)
                          if (workspaceId) {
                            localStorage.setItem(
                              activeDomainKey(workspaceId),
                              d.id,
                            )
                          }
                        }}
                        className={[
                          'w-full rounded-xl border px-md py-md text-left transition-colors',
                          active
                            ? 'border-secondary/50 bg-secondary/10'
                            : 'border-outline-variant/30 bg-surface-container-low hover:border-outline-variant/60',
                        ].join(' ')}
                      >
                        <span className="block font-headline text-[14px] font-semibold text-on-surface">
                          {d.name}
                        </span>
                        <span className="mt-xs block font-label text-[11px] text-on-surface-variant">
                          {d.slug}
                          {d.ownerEmail || d.ownerDisplayName
                            ? ` · ${d.ownerDisplayName || d.ownerEmail}`
                            : ' · no steward'}
                        </span>
                        <span className="mt-xs block font-body text-[11px] text-on-surface-variant">
                          {d.connectionIds.length} source
                          {d.connectionIds.length === 1 ? '' : 's'} ·{' '}
                          {d.tableGlobs.length} glob
                          {d.tableGlobs.length === 1 ? '' : 's'}
                        </span>
                      </button>
                    </li>
                  )
                })}
                {creating ? (
                  <li className="rounded-xl border border-secondary/40 bg-secondary/5 px-md py-md font-label text-[12px] text-secondary">
                    Drafting new domain…
                  </li>
                ) : null}
              </ul>
            )}

            <div className="mt-lg rounded-xl border border-outline-variant/25 bg-surface-container-low/60 p-md">
              <p className="font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                Team OS
              </p>
              <p className="mt-sm font-body text-[12px] text-on-surface-variant">
                Domains organize ownership. Propose/Promote roles and digests
                stay under Team OS.
              </p>
              <Link
                to="/settings/team"
                className="mt-sm inline-block font-label text-[12px] text-secondary hover:underline"
              >
                Open Team OS →
              </Link>
            </div>
          </section>

          <section className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-lg lg:col-span-8">
            <div className="flex items-start justify-between gap-md">
              <h2 className="font-headline text-base font-semibold text-on-surface">
                {formTitle}
              </h2>
              {creating ? (
                <button
                  type="button"
                  onClick={cancelCreate}
                  className="font-label text-[11px] text-on-surface-variant hover:underline"
                >
                  Cancel
                </button>
              ) : null}
            </div>

            {!creating && !selected ? (
              <p className="mt-md font-body text-[13px] text-on-surface-variant">
                Select a domain from the list, or create one.
              </p>
            ) : (
              <>
                <div className="mt-md grid gap-md sm:grid-cols-2">
                  <label className="block sm:col-span-1">
                    <span className="mb-xs block font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                      Name
                    </span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={!canWrite}
                      className="w-full rounded-lg border border-outline-variant/40 bg-canvas px-md py-sm font-body text-[13px]"
                      placeholder="Orders"
                    />
                  </label>
                  <label className="block sm:col-span-1">
                    <span className="mb-xs block font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                      Steward (owner)
                    </span>
                    <select
                      value={ownerUserId}
                      onChange={(e) => setOwnerUserId(e.target.value)}
                      disabled={!canWrite}
                      className="w-full rounded-lg border border-outline-variant/40 bg-canvas px-md py-sm font-body text-[13px]"
                    >
                      <option value="">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName || m.email} · {m.role}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="mt-md block">
                  <span className="mb-xs block font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                    Description
                  </span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    disabled={!canWrite}
                    className="w-full rounded-lg border border-outline-variant/40 bg-canvas px-md py-sm font-body text-[13px]"
                    placeholder="What this data product covers"
                  />
                </label>

                <div className="mt-md">
                  <p className="mb-xs font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                    Linked sources
                  </p>
                  {sources.length === 0 ? (
                    <p className="font-body text-[12px] text-on-surface-variant">
                      No sources yet.{' '}
                      <Link to="/sources" className="text-secondary hover:underline">
                        Connect sources
                      </Link>
                    </p>
                  ) : (
                    <ul className="max-h-44 space-y-xs overflow-y-auto rounded-lg border border-outline-variant/25 bg-canvas p-sm">
                      {sources.map((s) => {
                        const on = connectionIds.includes(s.id)
                        const other = claimedConnectionIds.get(s.id)
                        return (
                          <li key={s.id}>
                            <label className="flex cursor-pointer items-start gap-sm font-body text-[12px]">
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={on}
                                disabled={!canWrite}
                                onChange={() => toggleConnection(s.id)}
                              />
                              <span>
                                <span className="text-on-surface">{s.name}</span>
                                {other ? (
                                  <span className="ml-sm text-on-surface-variant">
                                    (also in {other})
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                <label className="mt-md block">
                  <span className="mb-xs block font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                    Table globs
                  </span>
                  <textarea
                    value={globsText}
                    onChange={(e) => setGlobsText(e.target.value)}
                    rows={4}
                    disabled={!canWrite}
                    className="w-full rounded-lg border border-outline-variant/40 bg-canvas px-md py-sm font-mono text-[12px]"
                    placeholder={'*order*\n*customer*'}
                  />
                  <span className="mt-xs block font-body text-[11px] text-on-surface-variant">
                    One pattern per line (or comma-separated). Used to hint
                    which tables belong to this product.
                  </span>
                </label>

                {!creating && selected ? (
                  <div className="mt-md">
                    <p className="mb-xs font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                      Linked now
                    </p>
                    <div className="flex flex-wrap gap-xs">
                      {selected.connectionIds.length === 0 ? (
                        <span className="font-body text-[12px] text-on-surface-variant">
                          None
                        </span>
                      ) : (
                        selected.connectionIds.map((id) => (
                          <span
                            key={id}
                            className="rounded-md border border-outline-variant/30 px-sm py-0.5 font-label text-[11px] text-on-surface-variant"
                          >
                            {sourceById.get(id)?.name || id.slice(0, 8)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="mt-lg flex flex-wrap items-center gap-sm">
                  {creating ? (
                    <button
                      type="button"
                      disabled={!canWrite || busy || !name.trim()}
                      onClick={() => void saveCreate()}
                      className="rounded bg-secondary px-lg py-2 font-label text-[12px] font-semibold text-on-secondary disabled:opacity-40"
                    >
                      {busy ? 'Creating…' : 'Create domain'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!canWrite || busy || !name.trim()}
                      onClick={() => void saveEdit()}
                      className="rounded bg-secondary px-lg py-2 font-label text-[12px] font-semibold text-on-secondary disabled:opacity-40"
                    >
                      {busy ? 'Saving…' : 'Save changes'}
                    </button>
                  )}
                  {!creating && selected && canAdmin ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeDomain(selected)}
                      className="rounded-lg border border-error/40 px-md py-2 font-label text-[12px] text-error disabled:opacity-40"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>

                {!creating && selected ? (
                  <div className="mt-lg flex flex-wrap gap-sm border-t border-outline-variant/20 pt-lg">
                    <Link
                      to="/joins"
                      className="rounded-lg border border-secondary/40 px-md py-1.5 font-label text-[11px] text-secondary"
                    >
                      Review joins
                    </Link>
                    <Link
                      to="/jobs"
                      className="rounded-lg border border-outline-variant/40 px-md py-1.5 font-label text-[11px] text-on-surface-variant"
                    >
                      Jobs
                    </Link>
                    <Link
                      to="/chat?agent=1"
                      className="rounded-lg border border-outline-variant/40 px-md py-1.5 font-label text-[11px] text-on-surface-variant"
                    >
                      Agent stitch
                    </Link>
                    <Link
                      to="/chat"
                      className="rounded-lg border border-outline-variant/40 px-md py-1.5 font-label text-[11px] text-on-surface-variant"
                    >
                      Assistant
                    </Link>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-md py-md">
      <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
        {label}
      </p>
      <p className="mt-xs font-headline text-xl font-semibold text-on-surface">
        {value}
      </p>
      {hint ? (
        <p className="mt-xs truncate font-body text-[11px] text-on-surface-variant">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
