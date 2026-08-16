import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { WorkInProgressOverlay } from '@/components/WorkInProgressOverlay'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  createCatalogAssetApi,
  fetchCatalogAssets,
  fetchWorkspaceSettings,
  type CatalogAsset,
} from '@/services/stitchApi'

/**
 * Phase 4 — Catalog assets (dashboards / metrics / pipelines).
 */
export function CatalogPage() {
  const { canWrite } = useWorkspaceRole()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [assets, setAssets] = useState<CatalogAsset[]>([])
  const [name, setName] = useState('')
  const [kind, setKind] = useState('dashboard')
  const [dependsOn, setDependsOn] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    setAssets(await fetchCatalogAssets())
  }

  useEffect(() => {
    fetchWorkspaceSettings()
      .then((s) => setEnabled(s.settings.enableCatalogGovernance === true))
      .catch(() => setEnabled(false))
    reload().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }, [])

  async function create() {
    if (!canWrite || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await createCatalogAssetApi({
        name: name.trim(),
        kind,
        dependsOn: dependsOn
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      })
      setName('')
      setDependsOn('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <QueAppChrome eyebrow="CATALOG · PHASE 4">
      <div className="relative flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-canvas">
        <WorkInProgressOverlay
          feature="Catalog"
          blurb="Asset catalog (dashboards, metrics, pipelines) is not fully wired yet. Use Jobs, Lineage, and Report Studio for production stitch work."
        />
        <main className="pointer-events-none min-h-0 flex-1 select-none overflow-y-auto px-md py-lg opacity-50 md:px-lg lg:px-margin-desktop">
          <div className="mb-xl flex flex-col justify-between gap-md sm:flex-row sm:items-end">
            <div>
              <h1 className="font-headline text-xl font-semibold tracking-tight text-on-surface">
                Catalog assets
              </h1>
              <p className="mt-xs max-w-[42rem] font-body text-[13px] text-on-surface-variant">
                Dashboards, metrics, and pipelines as first-class nodes linked to
                tables — optional catalog expansion beside the stitch wedge.
              </p>
            </div>
            <div className="flex flex-wrap gap-md">
              <Link to="/glossary" className="font-label text-[12px] text-secondary hover:underline">
                Glossary
              </Link>
              <Link to="/steward" className="font-label text-[12px] text-secondary hover:underline">
                Steward
              </Link>
              <Link to="/lineage" className="font-label text-[12px] text-secondary hover:underline">
                Column lineage
              </Link>
            </div>
          </div>

          {enabled === false ? (
            <p className="mb-md rounded-xl border border-secondary/40 bg-secondary/5 p-md font-body text-[13px]">
              Catalog governance is off. Enable{' '}
              <strong>enableCatalogGovernance</strong> in Settings → AI & Policy.
            </p>
          ) : null}
          {error ? (
            <p className="mb-md rounded-xl border border-error/40 bg-error/10 px-md py-sm font-body text-[13px] text-error">
              {error}
            </p>
          ) : null}

          <section className="mb-lg rounded-xl border border-outline-variant/30 bg-surface-container-low p-lg">
            <h2 className="font-headline text-base font-semibold text-on-surface-variant">
              Add asset
            </h2>
            <div className="mt-md grid gap-md sm:grid-cols-2">
              <label className="block">
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
              <label className="block">
                <span className="mb-xs block font-label text-[11px] uppercase tracking-widest text-on-surface-variant">
                  Kind
                </span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  className="w-full rounded-lg border border-outline-variant/40 bg-canvas px-md py-sm font-body text-[13px]"
                  disabled={!canWrite || busy}
                >
                  <option value="dashboard">dashboard</option>
                  <option value="metric">metric</option>
                  <option value="pipeline">pipeline</option>
                  <option value="ml_feature">ml_feature</option>
                  <option value="other">other</option>
                </select>
              </label>
            </div>
            <label className="mt-md block">
              <span className="mb-xs block font-label text-[11px] uppercase tracking-widest text-on-surface-variant">
                Depends on tables (comma / newline)
              </span>
              <textarea
                value={dependsOn}
                onChange={(e) => setDependsOn(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-outline-variant/40 bg-canvas px-md py-sm font-body text-[13px]"
                disabled={!canWrite || busy}
                placeholder="orders, customers"
              />
            </label>
            <button
              type="button"
              disabled={!canWrite || busy || !name.trim()}
              onClick={() => void create()}
              className="mt-md rounded bg-secondary px-lg py-2 font-label text-[12px] font-semibold text-on-secondary disabled:opacity-40"
            >
              Create asset
            </button>
          </section>

          <ul className="space-y-sm">
            {assets.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-outline-variant/30 bg-surface-container-low px-lg py-md"
              >
                <p className="font-label text-[11px] uppercase tracking-widest text-on-surface-variant">
                  {a.kind} · {a.depCount} dep(s)
                </p>
                <p className="mt-1 font-body text-[14px] font-medium text-on-surface">
                  {a.name}
                </p>
                {a.description ? (
                  <p className="mt-1 font-body text-[12px] text-on-surface-variant">
                    {a.description}
                  </p>
                ) : null}
              </li>
            ))}
            {!assets.length ? (
              <p className="font-body text-[13px] text-on-surface-variant">
                No catalog assets yet.
              </p>
            ) : null}
          </ul>
        </main>
      </div>
    </QueAppChrome>
  )
}
