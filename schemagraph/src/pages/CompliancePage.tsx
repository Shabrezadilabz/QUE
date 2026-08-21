import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CatalogDetailBody,
  CatalogDetailHeader,
  CatalogDetailPane,
  CatalogDetailTabs,
  CatalogDirectory,
  CatalogDirectoryCard,
  CatalogFilterChip,
  CatalogMetaItem,
  CatalogSection,
  CatalogSplitPage,
  PdfGhostButton,
  PdfPrimaryButton,
  type CatalogBadgeTone,
} from '@/components/catalog/CatalogSplitLayout'
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

type DirectoryItem = {
  id: string
  kind: 'control' | 'ops' | 'digest'
  title: string
  description: string
  badge: string
  badgeTone: CatalogBadgeTone
  meta: string
  control?: Control
  ops?: ChecklistItem
  digest?: { id: string; summary: string; failedCount: number; createdAt: string }
}

type Filter = 'all' | 'controls' | 'ops' | 'digests'

function controlTone(status: string): CatalogBadgeTone {
  const s = status.toLowerCase()
  if (s.includes('pass') || s.includes('ok') || s.includes('implemented')) return 'approved'
  if (s.includes('review') || s.includes('partial')) return 'review'
  return 'draft'
}

/** Compliance — PDF page-07 split directory + evidence detail. */
export function CompliancePage() {
  const { canAdmin } = useWorkspaceRole()
  const [pack, setPack] = useState<Pack | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [ops, setOps] = useState<{ progressPct: number; checklist: ChecklistItem[] } | null>(null)
  const [digests, setDigests] = useState<
    { id: string; summary: string; failedCount: number; createdAt: string }[]
  >([])
  const [reliability, setReliability] = useState<{ summary: Record<string, number> } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState('evidence')

  async function load() {
    setBusy(true)
    setError(null)
    try {
      const ws = getActiveWorkspaceId()
      const res = await apiFetch(`/workspaces/${ws}/enterprise/soc2-evidence`)
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
      setOps({ progressPct: opsOut.progressPct, checklist: opsOut.checklist })
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

  const directory = useMemo(() => {
    const items: DirectoryItem[] = []
    for (const c of pack?.controls || []) {
      items.push({
        id: `control-${c.id}`,
        kind: 'control',
        title: c.title,
        description: c.evidence.slice(0, 120),
        badge: c.status.toUpperCase(),
        badgeTone: controlTone(c.status),
        meta: `SOC2 · ${c.id}`,
        control: c,
      })
    }
    for (const o of ops?.checklist || []) {
      items.push({
        id: `ops-${o.id}`,
        kind: 'ops',
        title: o.title,
        description: o.evidence,
        badge: o.done ? 'Done' : 'Todo',
        badgeTone: o.done ? 'approved' : 'review',
        meta: 'Ops checklist',
        ops: o,
      })
    }
    for (const d of digests) {
      items.push({
        id: `digest-${d.id}`,
        kind: 'digest',
        title: d.summary,
        description: `${d.failedCount} failed runs`,
        badge: d.failedCount > 0 ? 'Alert' : 'Clear',
        badgeTone: d.failedCount > 0 ? 'review' : 'approved',
        meta: d.createdAt ? new Date(d.createdAt).toLocaleDateString() : 'Digest',
        digest: d,
      })
    }
    return items
  }, [pack, ops, digests])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return directory.filter((item) => {
      if (filter === 'controls' && item.kind !== 'control') return false
      if (filter === 'ops' && item.kind !== 'ops') return false
      if (filter === 'digests' && item.kind !== 'digest') return false
      if (!q) return true
      return item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
    })
  }, [directory, query, filter])

  const selected = filtered.find((i) => i.id === selectedId) ?? directory.find((i) => i.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId && filtered.length) setSelectedId(filtered[0].id)
  }, [filtered, selectedId])

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
    <CatalogSplitPage
      title="Compliance & Evidence"
      subtitle="Engineering evidence for auditor diligence — not a SOC 2 Type II certification letter."
      headerActions={
        <>
          <PdfGhostButton type="button" disabled={busy} onClick={() => void load()}>
            {busy ? 'Loading…' : 'Refresh'}
          </PdfGhostButton>
          {markdown ? (
            <PdfGhostButton type="button" onClick={downloadMd}>
              Download pack
            </PdfGhostButton>
          ) : null}
          {canAdmin ? (
            <Link to="/settings/enterprise" className="pdf-btn-primary rounded-[4px] px-[14px] py-[8px] text-[12px] font-semibold">
              Enterprise
            </Link>
          ) : null}
        </>
      }
      banner={
        <>
          {error ? (
            <p className="shrink-0 border-b border-solid border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.1)] px-[24px] py-[8px] text-[12px] text-[#ff6b6b]">
              {error}
            </p>
          ) : null}
          {toast ? (
            <p className="shrink-0 border-b border-solid border-[#424850] px-[24px] py-[8px] text-[12px] text-[#7aecd0]">
              {toast}
            </p>
          ) : null}
        </>
      }
    >
      <CatalogDirectory
        title="Controls Directory"
        search={query}
        onSearch={setQuery}
        searchPlaceholder="Filter controls…"
        filters={
          <>
            <CatalogFilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
            <CatalogFilterChip label="SOC2" active={filter === 'controls'} onClick={() => setFilter('controls')} />
            <CatalogFilterChip label="Ops" active={filter === 'ops'} onClick={() => setFilter('ops')} />
            <CatalogFilterChip label="Digests" active={filter === 'digests'} onClick={() => setFilter('digests')} />
          </>
        }
        footer={
          ops ? (
            <span>
              Ops {ops.progressPct}% · {pack?.controls.length ?? 0} controls · {digests.length} digests
            </span>
          ) : null
        }
      >
        {!filtered.length ? (
          <p className="px-[8px] py-[16px] text-[12px] text-[#a3afbe]">No items match this filter.</p>
        ) : null}
        {filtered.map((item) => (
          <CatalogDirectoryCard
            key={item.id}
            title={item.title}
            badge={item.badge}
            badgeTone={item.badgeTone}
            description={item.description}
            meta={<span>{item.meta}</span>}
            active={selectedId === item.id}
            onClick={() => setSelectedId(item.id)}
          />
        ))}
      </CatalogDirectory>

      <CatalogDetailPane empty="Select a control or checklist item to view evidence.">
        {selected ? (
          <>
            <CatalogDetailHeader
              title={selected.title}
              badge={selected.badge}
              badgeTone={selected.badgeTone}
              meta={
                <>
                  <CatalogMetaItem label="Category" value={selected.meta} />
                  {pack ? (
                    <CatalogMetaItem label="Region" value={pack.region} />
                  ) : null}
                  {pack ? (
                    <CatalogMetaItem
                      label="Generated"
                      value={new Date(pack.generatedAt).toLocaleDateString()}
                    />
                  ) : null}
                </>
              }
              description={
                selected.control?.note ||
                selected.ops?.evidence ||
                selected.digest?.summary ||
                pack?.disclaimer
              }
              actions={
                canAdmin && selected.kind === 'ops' ? (
                  <div className="flex gap-[8px]">
                    <PdfGhostButton
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void createBackupApi()
                          .then(() => {
                            setToast('Metadata backup created')
                            return load()
                          })
                          .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                      }
                    >
                      Run backup
                    </PdfGhostButton>
                    <PdfPrimaryButton
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void runDrDrillApi()
                          .then((r) => {
                            setToast(r.summary)
                            return load()
                          })
                          .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                      }
                    >
                      DR drill
                    </PdfPrimaryButton>
                  </div>
                ) : selected.kind === 'digest' ? (
                  <PdfPrimaryButton
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void buildWarehouseDigestApi()
                        .then((d) => {
                          setToast(d.summary)
                          return load()
                        })
                        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
                    }
                  >
                    Build digest
                  </PdfPrimaryButton>
                ) : null
              }
            />

            <CatalogDetailTabs
              tabs={[
                { id: 'evidence', label: 'Evidence' },
                { id: 'sla', label: 'SLA & Residency' },
                { id: 'next', label: 'Type II Steps' },
              ]}
              active={detailTab}
              onChange={setDetailTab}
            />

            <CatalogDetailBody>
              {detailTab === 'evidence' ? (
                <CatalogSection title="Evidence">
                  <p className="text-[13px] leading-[20px] text-[#c8cdd3]">
                    {selected.control?.evidence ||
                      selected.ops?.evidence ||
                      `Failed runs: ${selected.digest?.failedCount ?? 0}`}
                  </p>
                  {reliability ? (
                    <p className="mt-[12px] text-[12px] text-[#a3afbe]">
                      Connector SLA: {reliability.summary.ok ?? 0} ok ·{' '}
                      {reliability.summary.degraded ?? 0} degraded ·{' '}
                      {reliability.summary.breached ?? 0} breached
                    </p>
                  ) : null}
                </CatalogSection>
              ) : null}
              {detailTab === 'sla' && pack ? (
                <div className="grid gap-[12px] sm:grid-cols-2">
                  <InfoCard label="Uptime target" value={pack.slaTargets.uptimeTarget} />
                  <InfoCard
                    label="RPO / RTO"
                    value={`${pack.slaTargets.rpoHours}h / ${pack.slaTargets.rtoHours}h`}
                  />
                  <InfoCard label="Residency" value={pack.residencyNote} />
                  <InfoCard label="SLA note" value={pack.slaTargets.note} />
                </div>
              ) : null}
              {detailTab === 'next' && pack ? (
                <ol className="list-decimal space-y-[8px] pl-[20px] text-[13px] text-[#c8cdd3]">
                  {pack.nextStepsForTypeII.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              ) : null}
            </CatalogDetailBody>
          </>
        ) : null}
      </CatalogDetailPane>
    </CatalogSplitPage>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[4px] border border-solid border-[#424850] bg-[#121619] p-[14px]">
      <p className="text-[10px] font-bold tracking-[0.6px] text-[#8a9099] uppercase">{label}</p>
      <p className="mt-[6px] text-[13px] text-[#d4dbe3]">{value}</p>
    </div>
  )
}

export default CompliancePage
