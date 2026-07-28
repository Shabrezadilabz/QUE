import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import type { JobNotebookCell } from '@/services/stitchApi'

const lightTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#ffffff',
      color: '#161a32',
      fontSize: '12px',
      minHeight: '120px',
    },
    '.cm-content': {
      fontFamily: 'Geist, ui-monospace, Consolas, monospace',
      padding: '12px 0',
    },
    '.cm-gutters': {
      backgroundColor: '#FBF8F4',
      color: 'rgba(85,66,62,0.55)',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(224,122,95,0.1)',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(224,122,95,0.06)',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#e07a5f',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(224,122,95,0.18)',
    },
    '.cm-scroller': {
      overflow: 'auto',
    },
  },
  { dark: false },
)

const darkTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: '#1a1512',
      color: '#f2ede4',
      fontSize: '12px',
      minHeight: '140px',
    },
    '.cm-content': {
      fontFamily: 'Geist, ui-monospace, Consolas, monospace',
      padding: '12px 0',
    },
    '.cm-gutters': {
      backgroundColor: '#14110f',
      color: 'rgba(242,237,228,0.35)',
      border: 'none',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(224,122,95,0.15)',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(224,122,95,0.08)',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#e07a5f',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: 'rgba(224,122,95,0.28)',
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
  /** Dark code-editor look (Sunset Clay job editor) */
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
        'overflow-hidden rounded-2xl border transition-colors',
        dark
          ? active
            ? 'border-primary bg-[#1a1512] shadow-md'
            : 'border-outline-variant/20 bg-[#1a1512]'
          : active
            ? 'border-primary/40 bg-white shadow-sm'
            : 'border-outline-variant/25 bg-white',
      ].join(' ')}
      onFocusCapture={onFocus}
    >
      <div
        className={[
          'flex flex-wrap items-center justify-between gap-sm border-b px-sm py-xs',
          dark
            ? 'border-white/10 bg-[#14110f]'
            : 'border-outline-variant/20 bg-[#FBF8F4]',
        ].join(' ')}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-sm">
          <span
            className={[
              'font-label text-[10px]',
              dark ? 'text-white/40' : 'text-on-surface-variant',
            ].join(' ')}
          >
            [{String(index + 1).padStart(2, '0')}]
          </span>
          <select
            value={cell.kind}
            disabled={disabled}
            onChange={(e) =>
              onChangeKind(e.target.value === 'sql' ? 'sql' : 'markdown')
            }
            className={[
              'rounded-md border px-xs py-[2px] font-label text-[9px] tracking-widest uppercase outline-none disabled:opacity-40',
              dark
                ? 'border-white/15 bg-transparent text-primary-fixed'
                : 'border-outline-variant/30 bg-white text-primary',
            ].join(' ')}
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
            className={[
              'min-w-0 flex-1 border border-transparent bg-transparent px-xs py-[2px] font-body text-xs outline-none disabled:opacity-40',
              dark
                ? 'text-[#f2ede4] focus:border-white/20'
                : 'text-on-surface focus:border-outline-variant',
            ].join(' ')}
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
            className="rounded-md px-1.5 py-0.5 font-label text-[10px] text-on-surface-variant hover:bg-white hover:text-primary disabled:opacity-40"
          >
            ▶ Run
          </button>
          <button
            type="button"
            disabled={disabled || !canDelete}
            onClick={onDelete}
            className="rounded-md px-1.5 py-0.5 font-label text-[10px] text-error/70 hover:bg-error/5 hover:text-error disabled:opacity-30"
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
                ? 'text-[#f2ede4]/90'
                : cell.kind === 'sql'
                  ? 'text-primary-fixed'
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
          />
        )}
      </div>

      <p
        className={[
          'border-t px-sm py-xs font-label text-[10px]',
          dark
            ? 'border-white/10 tracking-widest text-white/40'
            : 'border-outline-variant/20 text-on-surface-variant/55',
        ].join(' ')}
      >
        {cell.kind === 'sql' ? 'SQL · editable' : 'Markdown · editable'}
        {disabled ? ' · read-only' : ''}
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
