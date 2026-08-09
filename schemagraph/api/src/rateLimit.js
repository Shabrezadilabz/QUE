/**
 * Simple in-memory rate limiter for production hygiene (per IP + path prefix).
 */
const buckets = new Map()

/**
 * @param {{ windowMs?: number, max?: number, keyFn?: (req) => string }} opts
 */
export function rateLimitMiddleware(opts = {}) {
  const windowMs = opts.windowMs ?? 60_000
  const max = opts.max ?? 120
  const keyFn =
    opts.keyFn ||
    ((req) => `${req.ip || req.socket?.remoteAddress || 'unknown'}:${req.path}`)

  return function rateLimit(req, res, next) {
    const key = keyFn(req)
    const now = Date.now()
    let bucket = buckets.get(key)
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 }
      buckets.set(key, bucket)
    }
    bucket.count += 1
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)))
      return res.status(429).json({ error: 'Rate limit exceeded' })
    }
    next()
  }
}

/** Periodic cleanup */
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of buckets) {
    if (now - v.start > 5 * 60_000) buckets.delete(k)
  }
}, 60_000).unref?.()
