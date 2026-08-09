import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

/**
 * Fixed-height IDE status strip — matches training-manual footer.
 */
export function IdeStatusBar({
  extra,
}: {
  /** Optional right-side context (e.g. table counts on workspace) */
  extra?: string
}) {
  const { workspaces, workspaceId } = useAuth()
  const current = workspaces.find((w) => w.id === workspaceId)

  return (
    <footer
      className="z-40 flex h-8 shrink-0 items-center justify-between gap-md border-t border-outline-variant bg-surface-container-lowest px-md text-on-surface-variant"
      aria-label="Status"
    >
      <div className="flex min-w-0 items-center gap-md font-mono text-[11px]">
        <span className="shrink-0">Que · schema-first</span>
        {current ? (
          <span
            className="hidden truncate text-secondary sm:inline"
            title={current.name}
          >
            {current.name}
          </span>
        ) : null}
        {extra ? (
          <span className="hidden truncate md:inline">{extra}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-md font-mono text-[11px]">
        <span className="hidden items-center gap-1 sm:inline-flex">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-tertiary"
            aria-hidden
          />
          SCHEMA-ONLY
        </span>
        <Link
          to="/status"
          className="hover:text-secondary transition-colors"
        >
          API status
        </Link>
        <Link
          to="/product"
          className="hidden hover:text-secondary transition-colors md:inline"
        >
          Docs
        </Link>
      </div>
    </footer>
  )
}
