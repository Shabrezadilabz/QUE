/**
 * Structured JSON logs for Que API (MVP ops).
 */
export function log(level, msg, fields = {}) {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    service: 'que-api',
    ...fields,
  }
  const text = JSON.stringify(line)
  if (level === 'error') console.error(text)
  else if (level === 'warn') console.warn(text)
  else console.log(text)
}

export const logger = {
  info: (msg, fields) => log('info', msg, fields),
  warn: (msg, fields) => log('warn', msg, fields),
  error: (msg, fields) => log('error', msg, fields),
}

/** Express middleware — request id + duration. */
export function requestLogMiddleware(req, res, next) {
  const start = Date.now()
  const requestId =
    req.headers['x-request-id'] ||
    `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  req.requestId = requestId
  res.setHeader('x-request-id', requestId)
  res.on('finish', () => {
    logger.info('http_request', {
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      status: res.statusCode,
      durationMs: Date.now() - start,
      workspaceId: req.params?.workspaceId || undefined,
    })
  })
  next()
}
