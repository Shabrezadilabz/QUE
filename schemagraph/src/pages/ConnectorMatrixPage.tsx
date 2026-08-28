import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueLogo } from '@/components/QueLogo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { fetchConnectorMatrix, type ConnectorMatrixData } from '@/services/stitchApi'

function DepthBadge({ depth }: { depth: string }) {
  const tone =
    depth === 'differentiator'
      ? 'bg-emerald-500/15 text-emerald-300'
      : depth === 'strong'
        ? 'bg-sky-500/15 text-sky-300'
        : depth === 'planned'
          ? 'bg-amber-500/15 text-amber-300'
          : 'bg-[#2e343b] text-[#9aa3ad]'
  return (
    <span className={`rounded-full px-[8px] py-[2px] text-[10px] font-semibold uppercase ${tone}`}>
      {depth}
    </span>
  )
}

/** S5.3 — Honest connector matrix vs Fivetran / Hevo (public). */
export function ConnectorMatrixPage() {
  const [matrix, setMatrix] = useState<ConnectorMatrixData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchConnectorMatrix()
      .then(setMatrix)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  return (
    <div className="que-auth-bg relative min-h-screen overflow-hidden">
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle compact />
      </div>
      <div className="relative mx-auto max-w-5xl px-md py-xl md:px-lg">
        <QueLogo
          size={40}
          withWordmark
          wordmarkClassName="font-label text-[12px] tracking-[0.22em] text-on-surface-variant uppercase"
        />
        <h1 className="mt-md font-headline text-3xl font-semibold tracking-tight text-on-surface md:text-4xl">
          Connector matrix
        </h1>
        <p className="mt-md max-w-3xl font-body text-[15px] leading-relaxed text-on-surface-variant">
          Honest comparison for India mid-market — Que wins <strong>after load</strong> (joins,
          Monk, cert KPIs). Stack on Hevo or Fivetran; don&apos;t rip-and-replace on day one.
        </p>

        {error ? (
          <p className="mt-md rounded-lg border border-rose-500/40 bg-rose-500/10 px-md py-sm text-[13px] text-rose-200">
            {error}
          </p>
        ) : null}

        {matrix ? (
          <>
            <p className="mt-lg text-[12px] text-on-surface-variant">{matrix.disclaimer}</p>

            <div className="mt-lg overflow-x-auto rounded-xl border border-outline-variant">
              <table className="min-w-full text-left text-[13px]">
                <thead className="bg-surface-container-high/80 text-[11px] uppercase tracking-wide text-on-surface-variant">
                  <tr>
                    <th className="px-md py-sm font-semibold">Capability</th>
                    <th className="px-md py-sm font-semibold">Que</th>
                    <th className="px-md py-sm font-semibold">Fivetran</th>
                    <th className="px-md py-sm font-semibold">Hevo</th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-outline-variant/60 align-top"
                    >
                      <td className="px-md py-sm">
                        <p className="font-medium text-on-surface">{row.label}</p>
                        <p className="mt-[2px] text-[11px] text-on-surface-variant">
                          {row.category}
                        </p>
                        {row.indiaNote ? (
                          <p className="mt-[6px] text-[11px] italic text-on-surface-variant">
                            {row.indiaNote}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-md py-sm text-on-surface">
                        <div className="flex flex-wrap items-center gap-[6px]">
                          <span>{row.que}</span>
                          {row.queDepth ? <DepthBadge depth={row.queDepth} /> : null}
                        </div>
                      </td>
                      <td className="px-md py-sm text-on-surface-variant">{row.fivetran}</td>
                      <td className="px-md py-sm text-on-surface-variant">{row.hevo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <section className="mt-xl">
              <h2 className="font-headline text-xl font-semibold">Que connector depth (live)</h2>
              <ul className="mt-md grid gap-sm sm:grid-cols-2">
                {matrix.queConnectors.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg border border-outline-variant bg-surface-container/50 px-md py-sm"
                  >
                    <div className="flex items-center justify-between gap-sm">
                      <span className="font-semibold text-on-surface">{c.name}</span>
                      <span className="text-[11px] font-bold text-primary">{c.depth}</span>
                    </div>
                    <p className="mt-[4px] text-[12px] text-on-surface-variant">
                      {c.incremental}
                      {c.live ? ' · live sync' : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}

        <div className="mt-xl flex flex-wrap gap-sm">
          <Link
            to="/sales"
            className="rounded-lg border border-outline-variant px-lg py-2.5 font-label text-[13px] font-semibold text-on-surface"
          >
            ← Sales
          </Link>
          <Link
            to="/login?sandbox=1"
            className="rounded bg-primary px-lg py-2.5 font-label text-[13px] font-semibold text-on-primary"
          >
            Try sandbox
          </Link>
        </div>
      </div>
    </div>
  )
}

export default ConnectorMatrixPage
