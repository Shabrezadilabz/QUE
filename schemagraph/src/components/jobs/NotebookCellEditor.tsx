import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { EditorView } from '@codemirror/view'
import type { JobNotebookCell } from '@/services/stitchApi'
import { RunInWarehouseButton } from '@/components/warehouse/RunInWarehouseButton'
import {
  NotebookCellResult,
  type NotebookCellRunSlice,
} from '@/components/jobs/NotebookCellResult'
import {
  defaultNotebookCellContent,
  defaultNotebookCellTitle,
  extractExecutableSql,
  type NotebookCellKind,
} from '@/utils/notebookSql'

/** Databricks-like dark editor theme for notebook cells */
const notebookEditorTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#1a1a1a',
      color: '#e8e8e8',
      fontSize: '13px',
      minHeight: '112px',
    },
    '.cm-content': {
      fontFamily:
        '"JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace',
      padding: '10px 0',
      caretColor: '#ff3621',
    },
    '.cm-gutters': {
      backgroundColor: '#161616',
      color: '#5c5c5c',
      border: 'none',
      borderRight: '1px solid #2e2e2e',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(255, 54, 33, 0.1)',
      color: '#ff8a7a',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.035)',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#ff3621',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(255, 54, 33, 0.22)',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
  },
  { dark: true },
)

function languageExtension(kind: NotebookCellKind) {
  switch (kind) {
    case 'markdown':
      return markdown()
    case 'python':
      return python()
    case 'scala':
      // No dedicated Scala package — Python highlighter is a close stand-in.
      return python()
    case 'sql':
    default:
      return sql()
  }
}

interface NotebookCellEditorProps {
  cell: JobNotebookCell
  index: number
  active: boolean
  disabled?: boolean
  /** @deprecated Always uses Databricks dark theme */
  dark?: boolean
  onFocus: () => void
  onChangeContent: (content: string) => void
  onChangeTitle: (title: string) => void
  onChangeKind: (kind: NotebookCellKind) => void
  onDelete: () => void
  onMove: (dir: -1 | 1) => void
  onRunStub: () => void
  canDelete: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  /** Latest run output for this command (inline Databricks-style). */
  runSlice?: NotebookCellRunSlice | null
}

/** Editable notebook cell — Databricks-style command chrome + CodeMirror. */
export function NotebookCellEditor({
  cell,
  index,
  active,
  disabled = false,
  onFocus,
  onChangeContent,
  onChangeTitle,
  onChangeKind,
  onDelete,
  onMove,
  onRunStub,
  canDelete,
  canMoveUp,
  canMoveDown,
  runSlice = null,
}: NotebookCellEditorProps) {
  const kind = (cell.kind || 'sql') as NotebookCellKind
  const extensions = [
    notebookEditorTheme,
    EditorView.lineWrapping,
    languageExtension(kind),
  ]
  const warehouseSql = extractExecutableSql(cell.content, kind)

  return (
    <article
      className={['que-nb-cell', active ? 'is-active' : ''].join(' ')}
      onFocusCapture={onFocus}
    >
      <div className="que-nb-cell-gutter">
        <span className="que-nb-cmd" title={`Command ${index + 1}`}>
          Cmd {index + 1}
        </span>
        <button
          type="button"
          disabled={disabled || kind === 'markdown'}
          title="Run this command"
          onClick={onRunStub}
          className="que-nb-run-btn"
        >
          ▶
        </button>
      </div>

      <div className="que-nb-cell-main">
        <div className="que-nb-cell-chrome">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <select
              value={kind}
              disabled={disabled}
              onChange={(e) =>
                onChangeKind(e.target.value as NotebookCellKind)
              }
              className="que-nb-lang"
              title="Cell language"
            >
              <option value="sql">SQL</option>
              <option value="python">Python</option>
              <option value="scala">Scala</option>
              <option value="markdown">Markdown</option>
            </select>
            <input
              type="text"
              value={cell.title || ''}
              disabled={disabled}
              onChange={(e) => onChangeTitle(e.target.value)}
              placeholder="Command title"
              className="que-nb-title"
            />
          </div>
          <div className="que-nb-cell-actions">
            <button
              type="button"
              disabled={disabled || !canMoveUp}
              onClick={() => onMove(-1)}
              className="que-nb-icon-btn"
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={disabled || !canMoveDown}
              onClick={() => onMove(1)}
              className="que-nb-icon-btn"
              title="Move down"
            >
              ↓
            </button>
            <button
              type="button"
              disabled={disabled || !canDelete}
              onClick={onDelete}
              className="que-nb-icon-btn que-nb-icon-btn--danger"
              title="Delete command"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="que-nb-editor-wrap cm-notebook-cell">
          {disabled ? (
            <pre className="overflow-x-auto p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap text-[#e8e8e8]">
              {cell.content || ' '}
            </pre>
          ) : (
            <CodeMirror
              value={cell.content}
              height="auto"
              minHeight="112px"
              maxHeight="480px"
              theme="none"
              basicSetup={{
                lineNumbers: true,
                foldGutter: false,
                highlightActiveLine: true,
                bracketMatching: true,
                autocompletion: false,
              }}
              extensions={extensions}
              onChange={onChangeContent}
              onFocus={onFocus}
              editable={!disabled}
            />
          )}
        </div>

        {kind !== 'markdown' && warehouseSql ? (
          <div className="border-t border-[#2e2e2e] px-3 py-1.5">
            <RunInWarehouseButton sql={warehouseSql} compact />
            {kind === 'python' || kind === 'scala' ? (
              <p className="mt-1 font-label text-[10px] text-[#6e6e6e]">
                Runs extracted SQL only (spark.sql / %sql) — not a full{' '}
                {kind} runtime.
              </p>
            ) : null}
          </div>
        ) : null}

        {runSlice ? <NotebookCellResult slice={runSlice} /> : null}

        <div className="que-nb-footer">
          <span>
            {kind === 'sql'
              ? 'SQL command'
              : kind === 'python'
                ? 'Python · SQL via spark.sql / %sql'
                : kind === 'scala'
                  ? 'Scala · SQL via spark.sql'
                  : 'Markdown'}
            {disabled ? ' · read-only' : ''}
          </span>
          <span>Shift+Enter to run · Esc command mode</span>
        </div>
      </div>
    </article>
  )
}

export function newNotebookCell(kind: NotebookCellKind): JobNotebookCell {
  return {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `cell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title: defaultNotebookCellTitle(kind),
    content: defaultNotebookCellContent(kind),
  }
}

export function notebooksEqual(
  a: JobNotebookCell[] | undefined,
  b: JobNotebookCell[] | undefined,
): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
}
