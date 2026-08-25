import { useMemo, useState } from 'react'
import type { ChatSessionRecord } from '@/services/stitchApi'

function formatWhen(iso: string) {
  try {
    const d = new Date(iso)
    const now = new Date()
    const sameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export interface ChatHistorySidebarProps {
  open: boolean
  onToggle: () => void
  sessions: ChatSessionRecord[]
  archivedSessions: ChatSessionRecord[]
  activeSessionId: string | null
  loading?: boolean
  canWrite: boolean
  onNewChat: () => void
  onSelectSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onDeleteSession: (sessionId: string) => void
  onRestoreSession: (sessionId: string) => void
}

export function ChatHistorySidebar({
  open,
  onToggle,
  sessions,
  archivedSessions,
  activeSessionId,
  loading,
  canWrite,
  onNewChat,
  onSelectSession,
  onArchiveSession,
  onDeleteSession,
  onRestoreSession,
}: ChatHistorySidebarProps) {
  const [showArchived, setShowArchived] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)

  const hasArchived = archivedSessions.length > 0

  const sortedActive = useMemo(
    () =>
      [...sessions].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [sessions],
  )

  return (
    <aside
      className={`que-chat-history-sidebar ${open ? 'is-open' : 'is-collapsed'}`}
      aria-label="Chat history"
    >
      <button
        type="button"
        className="que-chat-history-sidebar__toggle"
        onClick={onToggle}
        aria-expanded={open}
        title={open ? 'Hide chat history' : 'Show chat history'}
      >
        <ChevronIcon direction={open ? 'left' : 'right'} />
      </button>

      <div
        className="que-chat-history-sidebar__panel"
        hidden={!open}
        aria-hidden={!open}
      >
        <div className="que-chat-history-sidebar__head">
          <h2 className="que-chat-history-sidebar__title">Chats</h2>
          <button
            type="button"
            disabled={!canWrite}
            onClick={onNewChat}
            className="que-chat-history-sidebar__new"
            title="New chat"
          >
            +
          </button>
        </div>

        <div className="que-chat-history-sidebar__scroll pdf-chat-scroll-region">
          {loading ? (
            <p className="que-chat-history-sidebar__empty">Loading…</p>
          ) : sortedActive.length === 0 ? (
            <p className="que-chat-history-sidebar__empty">
              No chats yet — start a new conversation.
            </p>
          ) : (
            <ul className="que-chat-history-sidebar__list">
              {sortedActive.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  active={s.id === activeSessionId}
                  menuOpen={menuId === s.id}
                  canWrite={canWrite}
                  onSelect={() => onSelectSession(s.id)}
                  onToggleMenu={() =>
                    setMenuId((prev) => (prev === s.id ? null : s.id))
                  }
                  onCloseMenu={() => setMenuId(null)}
                  onArchive={() => {
                    setMenuId(null)
                    onArchiveSession(s.id)
                  }}
                  onDelete={() => {
                    setMenuId(null)
                    onDeleteSession(s.id)
                  }}
                />
              ))}
            </ul>
          )}

          {hasArchived ? (
            <div className="que-chat-history-sidebar__archived">
              <button
                type="button"
                className="que-chat-history-sidebar__archived-toggle"
                onClick={() => setShowArchived((v) => !v)}
              >
                {showArchived ? '▾' : '▸'} Archived ({archivedSessions.length})
              </button>
              {showArchived ? (
                <ul className="que-chat-history-sidebar__list">
                  {archivedSessions.map((s) => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      active={s.id === activeSessionId}
                      archived
                      menuOpen={menuId === s.id}
                      canWrite={canWrite}
                      onSelect={() => onSelectSession(s.id)}
                      onToggleMenu={() =>
                        setMenuId((prev) => (prev === s.id ? null : s.id))
                      }
                      onCloseMenu={() => setMenuId(null)}
                      onRestore={() => {
                        setMenuId(null)
                        onRestoreSession(s.id)
                      }}
                      onDelete={() => {
                        setMenuId(null)
                        onDeleteSession(s.id)
                      }}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  )
}

function SessionRow({
  session,
  active,
  archived,
  menuOpen,
  canWrite,
  onSelect,
  onToggleMenu,
  onCloseMenu,
  onArchive,
  onDelete,
  onRestore,
}: {
  session: ChatSessionRecord
  active: boolean
  archived?: boolean
  menuOpen: boolean
  canWrite: boolean
  onSelect: () => void
  onToggleMenu: () => void
  onCloseMenu: () => void
  onArchive?: () => void
  onDelete: () => void
  onRestore?: () => void
}) {
  return (
    <li className="que-chat-history-sidebar__item">
      <button
        type="button"
        className={`que-chat-history-sidebar__row${active ? ' is-active' : ''}`}
        onClick={onSelect}
      >
        <span className="que-chat-history-sidebar__row-title">{session.title}</span>
        <span className="que-chat-history-sidebar__row-preview">
          {session.preview || 'No messages yet'}
        </span>
        <span className="que-chat-history-sidebar__row-meta">
          {formatWhen(session.updatedAt)}
          {session.messageCount > 0 ? ` · ${session.messageCount}` : ''}
        </span>
      </button>
      {canWrite ? (
        <div className="que-chat-history-sidebar__menu-wrap">
          <button
            type="button"
            className="que-chat-history-sidebar__menu-btn"
            aria-label="Chat actions"
            onClick={(e) => {
              e.stopPropagation()
              onToggleMenu()
            }}
          >
            ⋯
          </button>
          {menuOpen ? (
            <>
              <button
                type="button"
                className="que-chat-history-sidebar__menu-backdrop"
                aria-label="Close menu"
                onClick={onCloseMenu}
              />
              <div className="que-chat-history-sidebar__menu">
                {archived && onRestore ? (
                  <button type="button" onClick={onRestore}>
                    Restore
                  </button>
                ) : onArchive ? (
                  <button type="button" onClick={onArchive}>
                    Archive
                  </button>
                ) : null}
                <button
                  type="button"
                  className="que-chat-history-sidebar__menu-danger"
                  onClick={onDelete}
                >
                  Delete
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {direction === 'left' ? (
        <path d="M15 18l-6-6 6-6" />
      ) : (
        <path d="M9 18l6-6-6-6" />
      )}
    </svg>
  )
}
