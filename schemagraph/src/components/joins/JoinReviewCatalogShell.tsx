import type { ReactNode } from 'react'
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
  CatalogSplitPage,
  PdfGhostButton,
  PdfPrimaryButton,
  type CatalogBadgeTone,
} from '@/components/catalog/CatalogSplitLayout'
import type { JoinReviewItem } from '@/services/stitchApi'

export function joinBadge(status: string): { label: string; tone: CatalogBadgeTone } {
  if (status === 'accepted') return { label: 'Approved', tone: 'approved' }
  if (status === 'rejected') return { label: 'Draft', tone: 'draft' }
  return { label: 'Review', tone: 'review' }
}

export function joinTitle(item: JoinReviewItem) {
  return `${item.from.table}.${item.from.column} → ${item.to.table}.${item.to.column}`
}

type JoinReviewCatalogShellProps = {
  filter: string
  summary: { pending: number; accepted: number; rejected: number }
  onFilter: (f: 'suggested' | 'accepted' | 'rejected' | 'all') => void
  query: string
  onQuery: (v: string) => void
  items: JoinReviewItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  selected: JoinReviewItem | null
  detailTab: string
  onDetailTab: (t: string) => void
  headerActions?: ReactNode
  detailActions?: ReactNode
  banner?: ReactNode
  detailBody: ReactNode
  footer?: ReactNode
}

export function JoinReviewCatalogShell({
  filter,
  summary,
  onFilter,
  query,
  onQuery,
  items,
  selectedId,
  onSelect,
  selected,
  detailTab,
  onDetailTab,
  headerActions,
  detailActions,
  banner,
  detailBody,
  footer,
}: JoinReviewCatalogShellProps) {
  return (
    <CatalogSplitPage
      title="Join Review"
      subtitle="Suggested joins wait here with evidence. Promote to make them explicit — never auto-accept AI edges."
      headerActions={
        <>
          {headerActions}
          <Link to="/workspace" className="pdf-btn-ghost rounded-[4px] px-[13px] py-[7px] text-[12px] font-semibold">
            Workspace
          </Link>
        </>
      }
      banner={banner}
    >
      <CatalogDirectory
        title="Join Directory"
        search={query}
        onSearch={onQuery}
        searchPlaceholder="Filter joins…"
        filters={
          <>
            <CatalogFilterChip
              label={`Pending · ${summary.pending}`}
              active={filter === 'suggested'}
              onClick={() => onFilter('suggested')}
            />
            <CatalogFilterChip
              label={`Accepted · ${summary.accepted}`}
              active={filter === 'accepted'}
              onClick={() => onFilter('accepted')}
            />
            <CatalogFilterChip
              label={`Rejected · ${summary.rejected}`}
              active={filter === 'rejected'}
              onClick={() => onFilter('rejected')}
            />
            <CatalogFilterChip label="All" active={filter === 'all'} onClick={() => onFilter('all')} />
          </>
        }
        footer={footer}
      >
        {!items.length ? (
          <p className="px-[8px] py-[16px] text-[12px] text-[#a3afbe]">
            {filter === 'suggested'
              ? 'No pending suggestions. Sync sources or re-run inference.'
              : 'Nothing in this filter.'}
          </p>
        ) : null}
        {items.map((item) => {
          const b = joinBadge(item.status)
          return (
            <CatalogDirectoryCard
              key={item.id}
              title={joinTitle(item)}
              badge={b.label}
              badgeTone={b.tone}
              description={item.evidence.summary || `${item.type}${item.crossSource ? ' · cross-source' : ''}`}
              meta={
                <>
                  <span>{Math.round(item.confidence * 100)}%</span>
                  <span>
                    {item.from.connection} → {item.to.connection}
                  </span>
                </>
              }
              active={selectedId === item.id}
              onClick={() => onSelect(item.id)}
            />
          )
        })}
      </CatalogDirectory>

      <CatalogDetailPane empty="Select a join suggestion to review evidence.">
        {selected ? (
          <>
            <CatalogDetailHeader
              title={joinTitle(selected)}
              badge={joinBadge(selected.status).label}
              badgeTone={joinBadge(selected.status).tone}
              meta={
                <>
                  <CatalogMetaItem label="Confidence" value={`${Math.round(selected.confidence * 100)}%`} />
                  <CatalogMetaItem label="Type" value={selected.type} />
                  <CatalogMetaItem
                    label="Sources"
                    value={`${selected.from.connection} → ${selected.to.connection}`}
                  />
                </>
              }
              description={
                selected.evidence.pinnedOverlap?.label ||
                selected.aiNotes ||
                'Review column overlap evidence and SQL before promoting into workspace truth.'
              }
              actions={detailActions}
            />
            <CatalogDetailTabs
              tabs={[
                { id: 'evidence', label: 'Evidence' },
                { id: 'columns', label: 'Columns' },
                { id: 'discussion', label: 'History & Comments' },
              ]}
              active={detailTab}
              onChange={onDetailTab}
            />
            <CatalogDetailBody>{detailBody}</CatalogDetailBody>
          </>
        ) : null}
      </CatalogDetailPane>
    </CatalogSplitPage>
  )
}

export { PdfGhostButton, PdfPrimaryButton }
