import { useCallback, useEffect, useRef, useState } from 'react'

function formatDisplay(value: unknown) {
  if (value == null) return '—'
  if (typeof value === 'number') {
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`
    if (Number.isInteger(value)) return value.toLocaleString()
    return value.toFixed(2)
  }
  return String(value)
}

function parseNumeric(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Phase 4.2 — metric KPI with hover/click live warehouse fetch + count-up animation.
 */
export function MetricLiveValue({
  label,
  initialValue,
  fetchLive,
  compact = false,
  className = '',
}: {
  label?: string
  initialValue?: unknown
  fetchLive: () => Promise<{ value: unknown; source?: string; cached?: boolean }>
  compact?: boolean
  className?: string
}) {
  const [display, setDisplay] = useState(() => formatDisplay(initialValue))
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState<string | null>(null)
  const [cached, setCached] = useState(false)
  const animRef = useRef<number | null>(null)

  const animateTo = useCallback((target: unknown) => {
    const num = parseNumeric(target)
    if (num == null) {
      setDisplay(formatDisplay(target))
      return
    }
    const start = parseNumeric(display.replace(/[^0-9.-]/g, '')) ?? 0
    const duration = 480
    const t0 = performance.now()
    if (animRef.current) cancelAnimationFrame(animRef.current)
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - (1 - p) ** 3
      const cur = start + (num - start) * eased
      setDisplay(formatDisplay(Math.round(cur * 100) / 100))
      if (p < 1) animRef.current = requestAnimationFrame(tick)
      else setDisplay(formatDisplay(num))
    }
    animRef.current = requestAnimationFrame(tick)
  }, [display])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const out = await fetchLive()
      setSource(out.source || null)
      setCached(Boolean(out.cached))
      animateTo(out.value)
    } catch {
      setDisplay('—')
    } finally {
      setLoading(false)
    }
  }, [animateTo, fetchLive])

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  useEffect(() => {
    setDisplay(formatDisplay(initialValue))
  }, [initialValue])

  return (
    <div
      className={[
        'group cursor-default select-none',
        compact ? 'text-center' : '',
        className,
      ].join(' ')}
      onMouseEnter={() => void refresh()}
      onFocus={() => void refresh()}
      onClick={() => void refresh()}
      role="button"
      tabIndex={0}
      title="Hover for live warehouse value"
    >
      {label ? (
        <p className="font-label text-[10px] tracking-widest text-on-surface-variant uppercase">
          {label}
        </p>
      ) : null}
      <p
        className={[
          'font-headline font-semibold text-on-surface transition-transform duration-300 group-hover:scale-[1.03]',
          compact ? 'text-2xl mt-sm' : 'text-4xl mt-sm',
          loading ? 'opacity-60' : '',
        ].join(' ')}
      >
        {loading ? '…' : display}
      </p>
      <p className="mt-1 font-label text-[10px] text-on-surface-variant">
        {source === 'que_warehouse'
          ? `Live · Que Warehouse${cached ? ' · cached' : ''}`
          : 'Hover for live value'}
      </p>
    </div>
  )
}
