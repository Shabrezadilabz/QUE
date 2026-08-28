import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import type { JobNotebookCell } from '@/services/stitchApi'
import { RunInWarehouseButton } from '@/components/warehouse/RunInWarehouseButton'

const lightTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#0b1c30',
      color: '#d3e4fe',
      fontSize: '12px',
      minHeight: '120px',
    },
    '.cm-content': {
      fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace',
      padding: '12px 0',
    },
    '.cm-gutters': {
      backgroundColor: '#000f21',
      color: 'rgba(198,198,205,0.55)',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(123,208,255,0.1)',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(123,208,255,0.06)',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#7bd0ff',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(123,208,255,0.18)',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
  },
  { dark: true },
)

const darkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#000f21',
      color: '#d3e4fe',
      fontSize: '12px',
      minHeight: '140px',
    },
    '.cm-content': {
      fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace',
      padding: '12px 0',
    },
    '.cm-gutters': {
      backgroundColor: '#031427',
      color: 'rgba(198,198,205,0.4)',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(123,208,255,0.15)',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(123,208,255,0.08)',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#7bd0ff',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(123,208,255,0.28)',
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
  /** Dark code-editor look (jobs notebook) */
  dark?: boolean
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
  dark = false,
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
    dark ? darkTheme : lightTheme,
    EditorView.lineWrapping,
    cell.kind === 'sql' ? sql() : markdown(),
  ]

  return (
    <article
      className={[
        'overflow-hidden rounded border transition-colors',
        dark
          ? active
            ? 'border-secondary bg-surface-container-lowest shadow-[0_0_0_1px_rgba(123,208,255,0.2)]'
            : 'border-outline-variant bg-surface-container-lowest'
          : active
            ? 'border-secondary/50 bg-surface-container-low'
            : 'border-outline-variant bg-surface-container-low',
      ].join(' ')}
      onFocusCapture={onFocus}
    >
      <div
        className={[
          'flex flex-wrap items-center justify-between gap-sm border-b px-sm py-xs',
          dark
            ? 'border-outline-variant bg-surface-dim'
            : 'border-outline-variant bg-surface-container',
        ].join(' ')}
      >
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
            className="rounded border border-outline-variant bg-transparent px-xs py-[2px] font-label text-[9px] tracking-widest text-secondary uppercase outline-none disabled:opacity-40"
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
            className="min-w-0 flex-1 border border-transparent bg-transparent px-xs py-[2px] font-body text-[12px] text-on-surface outline-none focus:border-outline-variant disabled:opacity-40"
          />
        </div>
        <div className="flex shrink-0 items-center gap-xs">
          <button
            type="button"
            disabled={disabled || !canMoveUp}
            onClick={() => onMove(-1)}
            className="px-xs font-label text-[9px] tracking-widest text-on-surface-variant hover:text-secondary disabled:opacity-30"
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={disabled || !canMoveDown}
            onClick={() => onMove(1)}
            className="px-xs font-label text-[9px] tracking-widest text-on-surface-variant hover:text-secondary disabled:opacity-30"
            title="Move down"
          >
            ↓
          </button>
          <button
            type="button"
            disabled={disabled}
            title="Schema-only dry-run"
            onClick={onRunStub}
            className="rounded px-1.5 py-0.5 font-label text-[10px] text-on-surface-variant hover:bg-secondary/15 hover:text-secondary disabled:opacity-40"
          >
            ▶ Run
          </button>
          <button
            type="button"
            disabled={disabled || !canDelete}
            onClick={onDelete}
            className="rounded px-1.5 py-0.5 font-label text-[10px] text-error/70 hover:bg-error/5 hover:text-error disabled:opacity-30"
            title="Delete cell"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="cm-notebook-cell">
        {disabled ? (
          <pre
            className={[
              'overflow-x-auto p-md font-mono text-[12px] leading-relaxed whitespace-pre-wrap',
              dark
                ? 'text-on-surface/90'
                : cell.kind === 'sql'
                  ? 'text-secondary'
                  : 'text-on-surface',
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
            editable={!disabled}
          />
        )}
      </div>

      {cell.kind === 'sql' && cell.content?.trim() ? (
        <div className="border-t border-outline-variant px-sm py-xs">
          <RunInWarehouseButton sql={cell.content} compact />
        </div>
      ) : null}

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
