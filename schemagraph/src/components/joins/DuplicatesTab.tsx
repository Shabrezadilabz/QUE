import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchDuplicateProfile, type DuplicateTableProfile } from '@/services/stitchApi'
import { PdfGhostButton } from '@/components/pdf/PdfUi'

function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === 'high'
      ? 'border-[#ff6b6b]/40 bg-[#ff6b6b]/10 text-[#ff6b6b]'
      : severity === 'medium'
        ? 'border-[#f0a020]/40 bg-[#f0a020]/10 text-[#f0a020]'
        : 'border-[#7aecd0]/30 bg-[#7aecd0]/10 text-[#7aecd0]'
  return (
    <span className={`rounded-full border px-[8px] py-[2px] text-[9px] font-bold uppercase ${cls}`}>
      {severity}
    </span>
  )
}

function actionLink(action: string) {
  if (action === 'monk_dedupe') return { to: '/monk', label: 'Monk dedupe' }
  if (action === 'steward_nulls') return { to: '/steward', label: 'Steward inbox' }
  if (action === 'review_joins') return { to: '/joins', label: 'Review joins' }
  return null
}

/** Phase 5.2 — duplicates overview tab on Joins. */
export function DuplicatesTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<{
    tableCount: number
    highRisk: number
    mediumRisk: number
    tables: DuplicateTableProfile[]
  } | null>(null)

  useEffect(() => {
    void fetchDuplicateProfile()
      .then(setProfile)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <p className="p-[24px] text-[13px] text-[#a3afbe]">Profiling duplicates…</p>
  }
  if (error) {
    return <p className="p-[24px] text-[13px] text-[#ff6b6b]">{error}</p>
  }
  if (!profile) return null

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#111416]">
      <div className="shrink-0 border-b border-solid border-[#424850] px-[24px] py-[14px]">
        <h2 className="text-[16px] font-semibold text-[#d4dbe3]">Duplicate & quality profile</h2>
        <p className="mt-[4px] text-[12px] text-[#a3afbe]">
          {profile.tableCount} tables · {profile.highRisk} high · {profile.mediumRisk} medium risk
          (sample-based heuristics)
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-[16px]">
        <div className="overflow-hidden rounded-[4px] border border-solid border-[#424850]">
          <table className="min-w-full text-left text-[11px]">
            <thead className="bg-[#121619] text-[#8a9099]">
              <tr>
                <th className="px-[12px] py-[8px]">Table</th>
                <th className="px-[12px] py-[8px]">Dup key %</th>
                <th className="px-[12px] py-[8px]">Dup row %</th>
                <th className="px-[12px] py-[8px]">Null %</th>
                <th className="px-[12px] py-[8px]">Risk</th>
                <th className="px-[12px] py-[8px]">Action</th>
              </tr>
            </thead>
            <tbody>
              {profile.tables.map((t) => {
                const act = actionLink(t.suggestedAction)
                return (
                  <tr key={t.tableName} className="border-t border-solid border-[#424850]/60">
                    <td className="px-[12px] py-[10px]">
                      <p className="font-medium text-[#d4dbe3]">{t.tableName}</p>
                      <p className="text-[9px] text-[#6b7380]">{t.connection}</p>
                    </td>
                    <td className="px-[12px] py-[10px] font-mono text-[#d4dbe3]">
                      {t.dupKeyPct != null ? `${t.dupKeyPct}%` : '—'}
                    </td>
                    <td className="px-[12px] py-[10px] font-mono text-[#d4dbe3]">
                      {t.dupRowPct != null ? `${t.dupRowPct}%` : '—'}
                    </td>
                    <td className="px-[12px] py-[10px] font-mono text-[#d4dbe3]">
                      {t.nullPct != null ? `${t.nullPct}%` : '—'}
                    </td>
                    <td className="px-[12px] py-[10px]">
                      <SeverityBadge severity={t.severity} />
                    </td>
                    <td className="px-[12px] py-[10px]">
                      {act ? (
                        <Link to={act.to} className="text-[#7aecd0] underline">
                          {act.label}
                        </Link>
                      ) : (
                        <span className="text-[#6b7380]">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-[16px] flex flex-wrap gap-[8px]">
          <PdfGhostButton type="button" onClick={() => window.location.reload()}>
            Refresh profile
          </PdfGhostButton>
          <Link to="/proposals" className="pdf-btn-ghost px-[12px] py-[6px] text-[11px]">
            Transform proposals
          </Link>
        </div>
      </div>
    </div>
  )
}
