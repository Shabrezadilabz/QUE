import { Link } from 'react-router-dom'

type Props = {
  feature: string
  blurb?: string
}

/**
 * Frosted glass cover for surfaces that are scaffolded but not production-ready.
 * Keeps chrome/nav usable; blocks interaction with the incomplete page body.
 */
export function WorkInProgressOverlay({ feature, blurb }: Props) {
  return (
    <div
      className="absolute inset-0 z-40 bg-background/50 backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <div className="absolute top-1/2 left-1/2 w-[min(calc(100%-2rem),26rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/20 bg-surface-container-low/80 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <p className="font-label text-[10px] tracking-[0.18em] text-secondary uppercase">
          Work in progress
        </p>
        <h2 className="mt-3 font-headline text-xl font-semibold tracking-tight text-on-surface">
          {feature} is still being built
        </h2>
        <p className="mt-3 font-body text-[13px] leading-relaxed text-on-surface-variant">
          {blurb ||
            'This screen is a preview scaffold — core stitch workflows are ready elsewhere while we finish governance UX.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            to="/chat"
            className="rounded-lg bg-secondary px-4 py-2 font-label text-[12px] font-semibold text-on-secondary"
          >
            Open Assistant
          </Link>
          <Link
            to="/jobs"
            className="rounded-lg border border-outline-variant/50 px-4 py-2 font-label text-[12px] text-on-surface-variant"
          >
            Jobs
          </Link>
          <Link
            to="/joins"
            className="rounded-lg border border-outline-variant/50 px-4 py-2 font-label text-[12px] text-on-surface-variant"
          >
            Joins
          </Link>
        </div>
      </div>
    </div>
  )
}
