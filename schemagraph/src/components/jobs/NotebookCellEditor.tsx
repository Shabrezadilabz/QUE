import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import type { JobNotebookCell } from '@/services/stitchApi'

const darkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#0e0e0e',
      color: '#e2e2e2',
      fontSize: '12px',
      minHeight: '120px',
    },
    '.cm-content': {
      fontFamily: 'ui-monospace, JetBrains Mono, Consolas, monospace',
      padding: '12px 0',
    },
    '.cm-gutters': {
      backgroundColor: '#0e0e0e',
      color: 'rgba(226,226,226,0.35)',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(195,244,0,0.08)',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(195,244,0,0.05)',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#c3f400',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(195,244,0,0.18)',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
  },
  { dark: true },
)

interface NotebookCellEditorProps {
  cell: JobNotebookCell
  index: number
  active: boolean
  disabled?: boolean
  onFocus: () => void
  onChangeContent: (content: string) => void
  onChangeTitle: (title: string) => void
  onChangeKind: (kind: 'markdown' | 'sql') => void
  onDelete: () => void
  onMove: (dir: -1 | 1) => void
  onRunStub: () => void
  canDelete: boolean
  canMoveUp: boolean
  canMoveDown: boolean
}

/** Editable notebook cell — CodeMirror for SQL / markdown. */
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
}: NotebookCellEditorProps) {
  const extensions = [
    darkTheme,
    EditorView.lineWrapping,
    cell.kind === 'sql' ? sql() : markdown(),
  ]

  return (
    <article
      className={[
        'border bg-surface-container-low transition-colors',
        active ? 'border-primary-fixed' : 'border-outline-variant',
      ].join(' ')}
      onFocusCapture={onFocus}
    >
      <div className="flex flex-wrap items-center justify-between gap-sm border-b border-outline-variant bg-surface-container-highest/40 px-sm py-xs">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-sm">
          <span className="font-label text-[10px] text-on-surface-variant">
            [{String(index + 1).padStart(2, '0')}]
          </span>
          <select
            value={cell.kind}
            disabled={disabled}
            onChange={(e) =>
              onChangeKind(e.target.value === 'sql' ? 'sql' : 'markdown')
            }
            className="border border-outline-variant bg-surface-container px-xs py-[2px] font-label text-[9px] tracking-widest text-primary-fixed uppercase outline-none disabled:opacity-40"
          >
            <option value="sql">SQL</option>
            <option value="markdown">MD</option>
          </select>
          <input
            type="text"
            value={cell.title || ''}
            disabled={disabled}
            onChange={(e) => onChangeTitle(e.target.value)}
            placeholder="Cell title"
            className="min-w-0 flex-1 border border-transparent bg-transparent px-xs py-[2px] font-body text-xs text-on-surface outline-none focus:border-outline-variant disabled:opacity-40"
          />
        </div>
        <div className="flex shrink-0 items-center gap-xs">
          <button
            type="button"
            disabled={disabled || !canMoveUp}
            onClick={() => onMove(-1)}
            className="px-xs font-label text-[9px] tracking-widest text-on-surface-variant hover:text-primary-fixed disabled:opacity-30"
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={disabled || !canMoveDown}
            onClick={() => onMove(1)}
            className="px-xs font-label text-[9px] tracking-widest text-on-surface-variant hover:text-primary-fixed disabled:opacity-30"
            title="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            disabled={disabled}
            title="Schema-only dry-run"
            onClick={onRunStub}
            className="font-label text-[9px] tracking-widest text-on-surface-variant hover:text-primary-fixed disabled:opacity-40"
          >
            ▶ RUN
          </button>
          <button
            type="button"
            disabled={disabled || !canDelete}
            onClick={onDelete}
            className="font-label text-[9px] tracking-widest text-error/80 hover:text-error disabled:opacity-30"
            title="Delete cell"
          >
            DEL
          </button>
        </div>
      </div>

      <div className="cm-notebook-cell">
        {disabled ? (
          <pre
            className={[
              'overflow-x-auto p-md font-mono text-[12px] leading-relaxed whitespace-pre-wrap',
              cell.kind === 'sql' ? 'text-primary-fixed' : 'text-on-surface',
            ].join(' ')}
          >
            {cell.content || ' '}
          </pre>
        ) : (
          <CodeMirror
            value={cell.content}
            height="auto"
            minHeight="120px"
            maxHeight="420px"
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
          />
        )}
      </div>

      <p className="border-t border-outline-variant px-sm py-xs font-label text-[8px] tracking-widest text-on-surface-variant/70">
        {cell.kind === 'sql' ? 'SQL · EDITABLE' : 'MARKDOWN · EDITABLE'}
        {disabled ? ' · READ-ONLY' : ''}
      </p>
    </article>
  )
}

export function newNotebookCell(
  kind: 'markdown' | 'sql',
): JobNotebookCell {
  return {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `cell-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title: kind === 'sql' ? 'stitch.sql' : 'Notes',
    content:
      kind === 'sql'
        ? '-- New SQL cell\nSELECT 1;\n'
        : '## New markdown cell\n\nDescribe this step…\n',
  }
}

export function notebooksEqual(
  a: JobNotebookCell[] | undefined,
  b: JobNotebookCell[] | undefined,
): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
}
