import type { CSSProperties } from 'react'

type QueLogoProps = {
  /** Pixel size of the mark (square). */
  size?: number
  /** Show “Que” wordmark beside the mark. */
  withWordmark?: boolean
  className?: string
  /** Wordmark class override */
  wordmarkClassName?: string
  title?: string
}

/**
 * Que brand mark — hub + three dual arms (app logo).
 * Uses the raster asset for fidelity; falls back to SVG mark.
 */
export function QueLogo({
  size = 28,
  withWordmark = false,
  className = '',
  wordmarkClassName = 'font-headline text-[1.1rem] font-bold tracking-tight text-on-surface',
  title = 'Que',
}: QueLogoProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
  }

  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`.trim()}
      title={title}
    >
      <img
        src={size <= 36 ? '/que-logo-64.png' : '/que-logo.png'}
        alt=""
        width={size}
        height={size}
        style={style}
        className="shrink-0 rounded-[4px] object-cover"
        decoding="async"
      />
      {withWordmark ? (
        <span className={wordmarkClassName}>Que</span>
      ) : (
        <span className="sr-only">Que</span>
      )}
    </span>
  )
}
