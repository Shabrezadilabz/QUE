import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ToastTone = 'info' | 'error' | 'success'

export interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

interface ToastContextValue {
  toasts: ToastItem[]
  pushToast: (message: string, tone?: ToastTone) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const pushToast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setToasts((prev) => [...prev.slice(-4), { id, message, tone }])
      window.setTimeout(() => dismissToast(id), 4500)
    },
    [dismissToast],
  )

  const value = useMemo(
    () => ({ toasts, pushToast, dismissToast }),
    [toasts, pushToast, dismissToast],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-md bottom-md z-[200] flex w-[min(100%-2rem,22rem)] flex-col gap-sm"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => dismissToast(t.id)}
            className={[
              'pointer-events-auto rounded border px-md py-sm text-left font-body text-[13px] transition-opacity',
              t.tone === 'error'
                ? 'border-error/50 bg-error/15 text-error'
                : t.tone === 'success'
                  ? 'border-tertiary/40 bg-tertiary/15 text-tertiary'
                  : 'border-outline-variant bg-surface-container-high text-on-surface',
            ].join(' ')}
          >
            {t.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast requires ToastProvider')
  return ctx
}
