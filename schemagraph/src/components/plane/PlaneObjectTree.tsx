import type { ManagedDataset } from '@/services/stitchApi'

interface PlaneObjectTreeProps {
  datasets: ManagedDataset[]
  loading: boolean
  selectedId: string | null
  onSelect: (dataset: ManagedDataset) => void
  schemaTables: { id: string; name: string; schema?: string }[]
}

/** Left rail — managed datasets + workspace schema objects. */
export function PlaneObjectTree({
  datasets,
  loading,
  selectedId,
  onSelect,
  schemaTables,
}: PlaneObjectTreeProps) {
  return (
    <aside className="flex h-full min-h-0 w-[240px] shrink-0 flex-col border-r border-solid border-[var(--pdf-border)] bg-[var(--pdf-bg-shell)]">
      <div className="shrink-0 border-b border-solid border-[var(--pdf-border)] px-[12px] py-[10px]">
        <p className="text-[10px] font-semibold tracking-[0.6px] text-[var(--pdf-text-faint)] uppercase">
          Objects
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-[8px]">
        <section className="mb-[12px]">
          <p className="mb-[6px] px-[4px] text-[10px] font-semibold tracking-[0.5px] text-[var(--pdf-text-muted)] uppercase">
            Managed datasets
          </p>
          {loading ? (
            <p className="px-[4px] text-[11px] text-[var(--pdf-text-faint)]">Loading…</p>
          ) : datasets.length === 0 ? (
            <p className="px-[4px] text-[11px] leading-[16px] text-[var(--pdf-text-faint)]">
              No datasets yet. Land from Jobs or enable source sync (Phase 4).
            </p>
          ) : (
            <ul className="flex flex-col gap-[2px]">
              {datasets.map((ds) => (
                <li key={ds.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(ds)}
                    className={[
                      'flex w-full flex-col gap-[2px] rounded-[4px] px-[8px] py-[6px] text-left transition-colors',
                      selectedId === ds.id
                        ? 'bg-[var(--pdf-accent-surface)] text-[var(--pdf-accent)]'
                        : 'text-[var(--pdf-text-secondary)] hover:bg-[var(--pdf-bg-muted)]',
                    ].join(' ')}
                  >
                    <span className="truncate text-[12px] font-medium">{ds.name}</span>
                    <span className="font-mono text-[10px] opacity-80">{ds.slug}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <p className="mb-[6px] px-[4px] text-[10px] font-semibold tracking-[0.5px] text-[var(--pdf-text-muted)] uppercase">
            Schema catalog
          </p>
          {schemaTables.length === 0 ? (
            <p className="px-[4px] text-[11px] text-[var(--pdf-text-faint)]">
              Sync sources to see tables.
            </p>
          ) : (
            <ul className="flex max-h-[240px] flex-col gap-[2px] overflow-y-auto">
              {schemaTables.slice(0, 40).map((t) => (
                <li
                  key={t.id}
                  className="truncate rounded-[4px] px-[8px] py-[4px] font-mono text-[11px] text-[var(--pdf-text-muted)]"
                  title={t.schema ? `${t.schema}.${t.name}` : t.name}
                >
                  {t.schema ? `${t.schema}.` : ''}
                  {t.name}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  )
}
