import { useCallback, useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  QUE_ROADMAP_STORAGE_KEY,
  ROADMAP_STEPS,
} from '@/onboarding/roadmapSteps'

type Stored = {
  dismissed: boolean
  completed: boolean
  stepIndex?: number
}

function readStored(): Stored {
  try {
    const raw = localStorage.getItem(QUE_ROADMAP_STORAGE_KEY)
    if (!raw) return { dismissed: false, completed: false }
    return JSON.parse(raw) as Stored
  } catch {
    return { dismissed: false, completed: false }
  }
}

function writeStored(next: Stored) {
  try {
    localStorage.setItem(QUE_ROADMAP_STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota */
  }
}

/**
 * Step-by-step product roadmap dialog — first visit + reopen via header ?.
 */
export function OnboardingRoadmapDialog({
  forceOpen,
  onCloseForce,
}: {
  /** When true (e.g. user clicked ?), open even if previously skipped */
  forceOpen?: boolean
  onCloseForce?: () => void
}) {
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (forceOpen) {
      setStep(0)
      setOpen(true)
      return
    }
    const stored = readStored()
    if (!stored.dismissed && !stored.completed) {
      setStep(
        typeof stored.stepIndex === 'number'
          ? Math.min(stored.stepIndex, ROADMAP_STEPS.length - 1)
          : 0,
      )
      setOpen(true)
    }
  }, [forceOpen])

  const close = useCallback(
    (opts: { skipped?: boolean; completed?: boolean } = {}) => {
      const prev = readStored()
      writeStored({
        dismissed: opts.skipped === true || prev.dismissed || opts.completed === true,
        completed: opts.completed === true || prev.completed,
        stepIndex: step,
      })
      setOpen(false)
      onCloseForce?.()
    },
    [onCloseForce, step],
  )

  if (!open) return null

  const current = ROADMAP_STEPS[step]
  const isFirst = step === 0
  const isLast = step === ROADMAP_STEPS.length - 1
  const progress = ((step + 1) / ROADMAP_STEPS.length) * 100

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-[#2a211c]/45 p-md backdrop-blur-[2px] sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close({ skipped: true })
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="que-card flex w-full max-w-[32rem] flex-col overflow-hidden shadow-2xl"
      >
        <header className="flex items-start justify-between gap-md border-b border-secondary-container/40 bg-surface-container-low px-md py-md sm:px-lg">
          <div>
            <p className="font-label text-xs font-bold tracking-[0.14em] text-on-surface-variant">
              QUE ROADMAP · {step + 1} / {ROADMAP_STEPS.length}
            </p>
            <h2
              id={titleId}
              className="mt-xs font-headline text-xl font-semibold tracking-tight text-on-surface sm:text-2xl"
            >
              {current.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => close({ skipped: true })}
            className="shrink-0 rounded-lg px-sm py-xs font-label text-sm text-on-surface-variant hover:bg-secondary-container/60 hover:text-primary"
          >
            SKIP
          </button>
        </header>

        <div className="h-1 w-full bg-secondary-container/40">
          <div
            className="h-full bg-primary-container transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="space-y-md px-md py-lg sm:px-lg">
          <p className="font-body text-base leading-relaxed text-on-surface-variant">
            {current.body}
          </p>
          {current.href && current.ctaLabel ? (
            <Link
              to={current.href}
              onClick={() => {
                writeStored({
                  dismissed: false,
                  completed: false,
                  stepIndex: step,
                })
                setOpen(false)
                onCloseForce?.()
              }}
              className="inline-flex rounded-lg border border-outline-variant/50 bg-white px-md py-sm font-label text-sm tracking-wide text-primary hover:border-primary hover:bg-[#ffdbd2]/40"
            >
              {current.ctaLabel} →
            </Link>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-md border-t border-outline-variant/30 bg-surface-container-low/80 px-md py-md sm:px-lg">
          <button
            type="button"
            disabled={isFirst}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="rounded-lg px-md py-sm font-label text-sm tracking-widest text-on-surface-variant disabled:opacity-30 hover:text-primary"
          >
            BACK
          </button>
          <div className="flex gap-1" aria-hidden>
            {ROADMAP_STEPS.map((s, i) => (
              <span
                key={s.id}
                className={[
                  'h-1.5 w-1.5 rounded-full transition-colors',
                  i === step
                    ? 'bg-primary'
                    : i < step
                      ? 'bg-primary-container'
                      : 'bg-outline-variant/50',
                ].join(' ')}
              />
            ))}
          </div>
          {isLast ? (
            <button
              type="button"
              onClick={() => close({ completed: true })}
              className="rounded-lg bg-primary-container px-md py-sm font-label text-sm font-bold tracking-widest text-on-primary hover:opacity-90"
            >
              DONE
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                const next = step + 1
                setStep(next)
                writeStored({
                  dismissed: false,
                  completed: false,
                  stepIndex: next,
                })
              }}
              className="rounded-lg bg-primary-container px-md py-sm font-label text-sm font-bold tracking-widest text-on-primary hover:opacity-90"
            >
              NEXT
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

/** Header control to reopen the roadmap. */
export function OnboardingRoadmapTrigger({
  onOpen,
}: {
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Product roadmap — how to use Que"
      aria-label="Open Que product roadmap"
      className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant/40 bg-surface-container-low font-label text-sm font-bold text-primary transition-colors hover:border-primary hover:bg-[#ffdbd2]/50"
    >
      ?
    </button>
  )
}
