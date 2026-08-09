import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  createDomainApi,
  deleteDomainApi,
  fetchDomains,
  fetchWorkspaceSources,
  type WorkspaceDomain,
} from '@/services/stitchApi'
import type { DataSource } from '@/types/dataSource'

/**
 * Phase 2 — Domains / data products for the team workflow OS.
 */
export function DomainsPage() {
  const { canWrite, canAdmin } = useWorkspaceRole()
  const [domains, setDomains] = useState<WorkspaceDomain[]>([])
  const [sources, setSources] = useState<DataSource[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedConnections, setSelectedConnections] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  async function reload() {
    const [d, s] = await Promise.all([
      fetchDomains(),
      fetchWorkspaceSources().catch(() => [] as DataSource[]),
    ])
    setDomains(d)
    setSources(s)
  }

  useEffect(() => {
    reload().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }, [])

  async function create() {
    if (!canWrite || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await createDomainApi({
        name: name.trim(),
        description: description.trim(),
        connectionIds: selectedConnections,
      })
      setName('')
      setDescription('')
      setSelectedConnections([])
      setToast('Domain created')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <QueAppChrome eyebrow="DOMAINS · DATA PRODUCTS">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
        <main className="min-h-0 flex-1 overflow-y-auto px-md py-lg md:px-lg lg:px-margin-desktop">
          <div className="mb-xl flex flex-col justify-between gap-md sm:flex-row sm:items-end">
            <div>
              <h1 className="font-headline text-xl font-semibold tracking-tight text-on-surface">
                Domains
              </h1>
              <p className="mt-xs max-w-[42rem] font-body text-[13px] text-on-surface-variant">
                Organize sources into owned data products (orders, finance,
                growth). Team OS step beyond a single canvas.
              </p>
            </div>
            <Link
              to="/settings/team"
              className="font-label text-[12px] text-secondary hover:underline"
            >
              Team notify &amp; roles
            </Link>
          </div>

          {error ? (
            <p className="mb-md rounded-xl border border-error/40 bg-error/10 px-md py-sm text-[13px] text-error">
              {error}
            </p>
          ) : null}
          {toast ? (
            <p className="mb-md rounded-xl border border-secondary/25 bg-secondary/5 px-md py-sm font-label text-[12px] text-secondary">
              {toast}
            </p>
          ) : null}

          <div className="grid gap-lg lg:grid-cols-12">
            <section className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-lg lg:col-span-5">
              <h2 className="font-headline text-base font-semibold text-on-surface-variant">
                New domain
              </h2>
              <label className="mt-md block">
                <span className="mb-xs block font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                  Name
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant/40 bg-canvas px-md py-sm font-body text-[13px]"
                  placeholder="Orders"
                  disabled={!canWrite}
                />
              </label>
              <label className="mt-md block">
                <span className="mb-xs block font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                  Description
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-outline-variant/40 bg-canvas px-md py-sm font-body text-[13px]"
                  disabled={!canWrite}
                />
              </label>
              <p className="mt-md font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                Linked sources
              </p>
              <ul className="mt-sm max-h-40 space-y-xs overflow-y-auto">
                {sources.map((s) => {
                  const on = selectedConnections.includes(s.id)
                  return (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-sm font-body text-[12px]">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={!canWrite}
                          onChange={() =>
                            setSelectedConnections((prev) =>
                              on
                                ? prev.filter((id) => id !== s.id)
                                : [...prev, s.id],
                            )
                          }
                        />
                        {s.name}
                      </label>
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                disabled={!canWrite || busy || !name.trim()}
                onClick={() => void create()}
                className="mt-md rounded bg-secondary px-lg py-2 font-label text-[12px] font-semibold text-on-secondary disabled:opacity-40"
              >
                {busy ? 'Creating…' : 'Create domain'}
              </button>
            </section>

            <section className="lg:col-span-7">
              {domains.length === 0 ? (
                <p className="rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-low p-lg font-body text-[13px] text-on-surface-variant">
                  No domains yet. Create Orders / Finance / Growth to scope
                  stitch work for the team.
                </p>
              ) : (
                <ul className="space-y-md">
                  {domains.map((d) => (
                    <li
                      key={d.id}
                      className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-lg"
                    >
                      <div className="flex items-start justify-between gap-md">
                        <div>
                          <h3 className="font-headline text-base font-semibold text-on-surface">
                            {d.name}
                          </h3>
                          <p className="mt-xs font-label text-[11px] text-on-surface-variant">
                            {d.slug}
                            {d.ownerEmail ? ` · owner ${d.ownerEmail}` : ''}
                          </p>
                          {d.description ? (
                            <p className="mt-sm font-body text-[13px] text-on-surface-variant">
                              {d.description}
                            </p>
                          ) : null}
                          <p className="mt-sm font-body text-[12px] text-on-surface-variant">
                            {d.connectionIds.length} linked source(s)
                          </p>
                        </div>
                        {canAdmin ? (
                          <button
                            type="button"
                            className="font-label text-[11px] text-error hover:underline"
                            onClick={() => {
                              if (!window.confirm(`Delete domain ${d.name}?`))
                                return
                              void deleteDomainApi(d.id)
                                .then(() => reload())
                                .catch((err) =>
                                  setError(
                                    err instanceof Error
                                      ? err.message
                                      : String(err),
                                  ),
                                )
                            }}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-md flex flex-wrap gap-sm">
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
                          to="/agent"
                          className="rounded-lg border border-outline-variant/40 px-md py-1.5 font-label text-[11px] text-on-surface-variant"
                        >
                          Agent stitch
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </main>
      </div>
    </QueAppChrome>
  )
}
