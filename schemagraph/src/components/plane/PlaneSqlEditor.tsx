import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { EditorView } from '@codemirror/view'
import { useMemo } from 'react'
import { useTheme } from '@/context/ThemeContext'

function buildEditorTheme(isDark: boolean) {
  return EditorView.theme(
    {
      '&': {
        backgroundColor: 'var(--pdf-bg-panel)',
        color: 'var(--pdf-text-primary)',
        fontSize: '13px',
        height: '100%',
      },
      '.cm-content': {
        fontFamily: '"JetBrains Mono", ui-monospace, Consolas, monospace',
        padding: '12px 0',
        caretColor: 'var(--pdf-accent)',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--pdf-bg-muted)',
        color: 'var(--pdf-text-faint)',
        border: 'none',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--pdf-accent-surface)',
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--pdf-accent-surface)',
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: 'var(--pdf-accent)',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: 'var(--pdf-accent-surface)',
      },
      '.cm-scroller': {
        overflow: 'auto',
      },
    },
    { dark: isDark },
  )
}

interface PlaneSqlEditorProps {
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
  placeholder?: string
}

/** SQL editor for Managed Plane — theme-aware CodeMirror. */
export function PlaneSqlEditor({
  value,
  onChange,
  readOnly = false,
  placeholder,
}: PlaneSqlEditorProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const editorTheme = useMemo(() => buildEditorTheme(isDark), [isDark])

  return (
    <CodeMirror
      value={value}
      height="100%"
      theme={editorTheme}
      extensions={[sql(), EditorView.lineWrapping]}
      onChange={onChange}
      readOnly={readOnly}
      placeholder={placeholder}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        autocompletion: true,
      }}
    />
  )
}
