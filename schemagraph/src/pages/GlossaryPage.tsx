import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  createGlossaryTermApi,
  fetchGlossaryTerms,
  linkGlossaryTermApi,
  type GlossaryTerm,
} from '@/services/stitchApi'

/**
 * Phase 4 — Business glossary + term↔table links.
 */
export function GlossaryPage() {
  const { canWrite } = useWorkspaceRole()
  const [terms, setTerms] = useState<GlossaryTerm[]>([])
  const [name, setName] = useState('')
  const [definition, setDefinition] = useState('')
  const [linkTable, setLinkTable] = useState('')
  const [linkColumn, setLinkColumn] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  async function reload() {
    const list = await fetchGlossaryTerms()
    setTerms(list)
    if (!activeId && list[0]) setActiveId(list[0].id)
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
      const term = await createGlossaryTermApi({
        name: name.trim(),
        definition: definition.trim(),
      })
      setName('')
      setDefinition('')
      setActiveId(term.id)
      setToast('Term created')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function link() {
    if (!canWrite || !activeId || !linkTable.trim()) return
    setBusy(true)
    setError(null)
    try {
      await linkGlossaryTermApi(activeId, {
        tableName: linkTable.trim(),
        columnName: linkColumn.trim() || undefined,
      })
      setToast('Linked to schema')
      setLinkTable('')
      setLinkColumn('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const active = terms.find((t) => t.id === activeId) || null

  return (
    <QueAppChrome eyebrow="GLOSSARY · PHASE 4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
        <main className="min-h-0 flex-1 overflow-y-auto px-md py-lg md:px-lg lg:px-margin-desktop">
          <div className="mb-xl flex flex-col justify-between gap-md sm:flex-row sm:items-end">
            <div>
              <h1 className="font-headline text-xl font-semibold tracking-tight text-on-surface">
                Business glossary
              </h1>
              <p className="mt-xs max-w-[42rem] font-body text-[13px] text-on-surface-variant">
                Define business terms and link them to tables/columns for
                steward-readable catalog coverage.
              </p>
            </div>
            <Link to="/catalog" className="font-label text-[12px] text-secondary hover:underline">
              Catalog assets
            </Link>
          </div>

          {error ? (
            <p className="mb-md rounded-xl border border-error/40 bg-error/10 px-md py-sm font-body text-[13px] text-error">
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
                New term
              </h2>
              <label className="mt-md block">
                <span className="mb-xs block font-label text-[11px] uppercase tracking-widest text-on-surface-variant">
                  Name
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant/40 bg-canvas px-md py-sm font-body text-[13px]"
                  disabled={!canWrite || busy}
                />
              </label>
              <label className="mt-md block">
                <span className="mb-xs block font-label text-[11px] uppercase tracking-widest text-on-surface-variant">
                  Definition
                </span>
                <textarea
                  value={definition}
                  onChange={(e) => setDefinition(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-outline-variant/40 bg-canvas px-md py-sm font-body text-[13px]"
                  disabled={!canWrite || busy}
                />
              </label>
              <button
                type="button"
                disabled={!canWrite || busy || !name.trim()}
                onClick={() => void create()}
                className="mt-md rounded bg-secondary px-lg py-2 font-label text-[12px] font-semibold text-on-secondary disabled:opacity-40"
              >
                Create term
              </button>
              <ul className="mt-lg space-y-sm">
                {terms.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(t.id)}
                      className={[
                        'w-full rounded-lg border px-md py-sm text-left font-body text-[12px]',
                        activeId === t.id
                          ? 'border-secondary bg-secondary/5 text-secondary'
                          : 'border-outline-variant/30 text-on-surface',
                      ].join(' ')}
                    >
                      <span className="font-medium">{t.name}</span>
                      <span className="mt-0.5 block text-on-surface-variant">
                        {t.status} · {t.linkCount} link(s)
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-lg lg:col-span-7">
              {!active ? (
                <p className="font-body text-[13px] text-on-surface-variant">
                  Select or create a term.
                </p>
              ) : (
                <div>
                  <p className="font-label text-[11px] uppercase tracking-widest text-on-surface-variant">
                    {active.status}
                  </p>
                  <h2 className="mt-xs font-headline text-lg font-semibold text-on-surface">
                    {active.name}
                  </h2>
                  <p className="mt-sm font-body text-[13px] text-on-surface-variant">
                    {active.definition || 'No definition yet.'}
                  </p>
                  <div className="mt-lg border-t border-outline-variant/20 pt-lg">
                    <h3 className="font-label text-[11px] uppercase tracking-widest text-on-surface-variant">
                      Link to schema
                    </h3>
                    <div className="mt-sm grid gap-sm sm:grid-cols-2">
                      <input
                        placeholder="table"
                        value={linkTable}
                        onChange={(e) => setLinkTable(e.target.value)}
                        className="rounded-lg border border-outline-variant/40 bg-canvas px-md py-sm font-body text-[13px]"
                        disabled={!canWrite || busy}
                      />
                      <input
                        placeholder="column (optional)"
                        value={linkColumn}
                        onChange={(e) => setLinkColumn(e.target.value)}
                        className="rounded-lg border border-outline-variant/40 bg-canvas px-md py-sm font-body text-[13px]"
                        disabled={!canWrite || busy}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!canWrite || busy || !linkTable.trim()}
                      onClick={() => void link()}
                      className="mt-sm rounded-lg border border-secondary px-md py-2 font-label text-[12px] text-secondary disabled:opacity-40"
                    >
                      Link
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </QueAppChrome>
  )
}
