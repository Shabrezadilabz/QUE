import { useEffect, useState } from 'react'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  apiFetch,
  buildWarehouseDigestApi,
  createBackupApi,
  fetchConnectorReliability,
  fetchSaasOps,
  fetchWarehouseDigests,
  getActiveWorkspaceId,
  runDrDrillApi,
} from '@/services/stitchApi'

type Control = {
  id: string
  title: string
  status: string
  evidence: string
  note?: string
}

type Pack = {
  disclaimer: string
  generatedAt: string
  region: string
  residencyNote: string
  slaTargets: {
    uptimeTarget: string
    rpoHours: number
    rtoHours: number
    note: string
  }
  controls: Control[]
  nextStepsForTypeII: string[]
}

type ChecklistItem = {
  id: string
  title: string
  done: boolean
  evidence: string
}

/**
 * Compliance process UI — evidence pack + SaaS ops checklist + Offer A digests.
 */
export function CompliancePage() {
  const { canAdmin } = useWorkspaceRole()
  const [pack, setPack] = useState<Pack | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [ops, setOps] = useState<{
    progressPct: number
    checklist: ChecklistItem[]
  } | null>(null)
  const [digests, setDigests] = useState<
    { id: string; summary: string; failedCount: number; createdAt: string }[]
  >([])
  const [reliability, setReliability] = useState<{
    summary: Record<string, number>
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setBusy(true)
    setError(null)
    try {
      const ws = getActiveWorkspaceId()
      const res = await apiFetch(
        `/workspaces/${ws}/enterprise/soc2-evidence`,
      )
      const body = (await res.json().catch(() => ({}))) as {
        pack?: Pack
        markdown?: string
        error?: string
      }
      if (!res.ok) throw new Error(body.error || `evidence ${res.status}`)
      setPack(body.pack || null)
      setMarkdown(body.markdown || '')
      const [opsOut, digOut, rel] = await Promise.all([
        fetchSaasOps(),
        fetchWarehouseDigests(),
        fetchConnectorReliability(),
      ])
      setOps({
        progressPct: opsOut.progressPct,
        checklist: opsOut.checklist,
      })
      setDigests(digOut)
      setReliability({ summary: rel.summary })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  function downloadMd() {
    const blob = new Blob([markdown || ''], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'que-soc2-evidence-pack.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <QueAppChrome eyebrow="COMPLIANCE · EVIDENCE">
      <div className="mx-auto min-h-0 flex-1 overflow-y-auto px-md py-lg md:px-lg lg:max-w-4xl">
        <h1 className="font-headline text-xl font-semibold text-on-surface">
          Compliance evidence
        </h1>
        <p className="mt-xs font-body text-[13px] text-on-surface-variant">
          Engineering evidence for auditor diligence. This is{' '}
          <strong>not</strong> a SOC 2 Type II certification letter.
        </p>

        {error ? (
          <p className="mt-md rounded-lg bg-error/10 px-md py-sm text-[13px] text-error">
            {error}
          </p>
        ) : null}
        {toast ? (
          <p className="mt-md text-[12px] text-secondary">{toast}</p>
        ) : null}

        <div className="mt-md flex flex-wrap gap-sm">
          <button
            type="button"
            disabled={busy}
            onClick={() => void load()}
            className="rounded-lg border border-secondary px-md py-1.5 text-[12px] font-semibold text-secondary disabled:opacity-40"
          >
            {busy ? 'Loading…' : 'Refresh pack'}
          </button>
          {markdown ? (
            <button
              type="button"
              onClick={downloadMd}
              className="rounded bg-secondary px-md py-1.5 text-[12px] font-semibold text-on-secondary"
            >
              Download markdown
            </button>
          ) : null}
          {canAdmin ? (
            <a
              href="/settings/enterprise"
              className="rounded-lg border border-outline-variant px-md py-1.5 text-[12px]"
            >
              Enterprise controls
            </a>
          ) : null}
        </div>

        {ops ? (
          <section className="mt-xl">
            <div className="flex flex-wrap items-end justify-between gap-md">
              <div>
                <h2 className="font-headline text-base font-semibold">
                  Ops checklist
                </h2>
                <p className="mt-xs text-[12px] text-on-surface-variant">
                  Backup · DR drill · isolation — {ops.progressPct}% complete
                </p>
              </div>
              {canAdmin ? (
                <div className="flex flex-wrap gap-sm">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void createBackupApi()
                        .then(() => {
                          setToast('Metadata backup created')
                          return load()
                        })
                        .catch((e) =>
                          setError(e instanceof Error ? e.message : String(e)),
                        )
                    }
                    className="rounded-lg border border-secondary px-md py-1.5 text-[12px] text-secondary"
                  >
                    Run backup
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void runDrDrillApi()
                        .then((r) => {
                          setToast(r.summary)
                          return load()
                        })
                        .catch((e) =>
                          setError(e instanceof Error ? e.message : String(e)),
                        )
                    }
                    className="rounded bg-secondary px-md py-1.5 text-[12px] font-semibold text-on-secondary"
                  >
                    Run DR drill
                  </button>
                </div>
              ) : null}
            </div>
            <ul className="mt-md space-y-sm">
              {ops.checklist.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-sm rounded-xl border border-outline-variant/30 bg-surface-container-low px-md py-md"
                >
                  <div>
                    <p className="font-label text-[13px] font-semibold">
                      {c.title}
                    </p>
                    <p className="text-[12px] text-on-surface-variant">
                      {c.evidence}
                    </p>
                  </div>
                  <span
                    className={[
                      'rounded-full px-md py-0.5 font-label text-[11px] uppercase',
                      c.done
                        ? 'bg-secondary/10 text-secondary'
                        : 'bg-surface-container-low text-on-surface-variant',
                    ].join(' ')}
                  >
                    {c.done ? 'done' : 'todo'}
                  </span>
                </li>
              ))}
            </ul>
            {reliability ? (
              <p className="mt-md text-[12px] text-on-surface-variant">
                Connector SLA: {reliability.summary.ok ?? 0} ok ·{' '}
                {reliability.summary.degraded ?? 0} degraded ·{' '}
                {reliability.summary.breached ?? 0} breached
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="mt-xl">
          <div className="flex flex-wrap items-end justify-between gap-md">
            <div>
              <h2 className="font-headline text-base font-semibold">
                Offer A · warehouse digests
              </h2>
              <p className="mt-xs text-[12px] text-on-surface-variant">
                Aggregated customer-hosted / external job failure digests.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void buildWarehouseDigestApi()
                  .then((d) => {
                    setToast(d.summary)
                    return load()
                  })
                  .catch((e) =>
                    setError(e instanceof Error ? e.message : String(e)),
                  )
              }
              className="rounded-lg border border-secondary px-md py-1.5 text-[12px] text-secondary"
            >
              Build digest
            </button>
          </div>
          <ul className="mt-md space-y-sm">
            {digests.length === 0 ? (
              <li className="text-[13px] text-on-surface-variant">
                No digests yet.
              </li>
            ) : (
              digests.map((d) => (
                <li
                  key={d.id}
                  className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-md py-md text-[13px]"
                >
                  <p className="font-semibold">{d.summary}</p>
                  <p className="mt-1 text-[11px] text-on-surface-variant">
                    failed={d.failedCount} ·{' '}
                    {d.createdAt
                      ? new Date(d.createdAt).toLocaleString()
                      : ''}
                  </p>
                </li>
              ))
            )}
          </ul>
        </section>

        {pack ? (
          <div className="mt-lg space-y-lg">
            <div className="rounded-xl border border-secondary/40 bg-secondary/5 p-md text-[13px] text-on-surface">
              {pack.disclaimer}
            </div>
            <div className="grid gap-md sm:grid-cols-2">
              <Info
                label="Generated"
                value={new Date(pack.generatedAt).toLocaleString()}
              />
              <Info label="Region" value={pack.region} />
              <Info label="Residency" value={pack.residencyNote} />
              <Info
                label="SLA targets (non-contractual)"
                value={`${pack.slaTargets.uptimeTarget} · RPO ${pack.slaTargets.rpoHours}h · RTO ${pack.slaTargets.rtoHours}h`}
              />
            </div>

            <section>
              <h2 className="font-headline text-base font-semibold">Controls</h2>
              <ul className="mt-md space-y-sm">
                {pack.controls.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-md py-md"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-sm">
                      <p className="font-label text-[13px] font-semibold">
                        {c.id} · {c.title}
                      </p>
                      <span className="rounded-full bg-surface-container-low px-md py-0.5 font-label text-[11px] uppercase">
                        {c.status}
                      </span>
                    </div>
                    <p className="mt-sm text-[12px] text-on-surface-variant">
                      {c.evidence}
                    </p>
                    {c.note ? (
                      <p className="mt-1 text-[11px] text-on-surface-variant">
                        {c.note}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="font-headline text-base font-semibold">
                Next steps for Type II
              </h2>
              <ol className="mt-md list-decimal space-y-sm pl-lg text-[13px] text-on-surface-variant">
                {pack.nextStepsForTypeII.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </section>
          </div>
        ) : null}
      </div>
    </QueAppChrome>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-md py-md">
      <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
        {label}
      </p>
      <p className="mt-1 font-body text-[13px] text-on-surface">{value}</p>
    </div>
  )
}

export default CompliancePage
