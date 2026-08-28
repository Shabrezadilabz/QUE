/**
 * SSE stream for Monk Mode run events (replaces UI polling).
 */
import { listMonkEvents, getMonkRun } from './monkMode.js'
import { getMonkRunControl } from './monkRunControl.js'

export function attachMonkEventsStream(app) {
  app.get(
    '/workspaces/:workspaceId/monk/runs/:runId/events/stream',
    async (req, res) => {
      const { workspaceId, runId } = req.params
      let since = req.query.since ? String(req.query.since) : null

      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders?.()

      let closed = false
      req.on('close', () => {
        closed = true
      })

      const ping = () => {
        if (!closed) res.write(': ping\n\n')
      }

      const tick = async () => {
        if (closed) return
        try {
          const run = await getMonkRun(workspaceId, runId)
          if (!run) {
            res.write(`event: error\ndata: ${JSON.stringify({ error: 'run not found' })}\n\n`)
            closed = true
            res.end()
            return
          }

          const events = await listMonkEvents(runId, { since })
          for (const ev of events) {
            res.write(`event: monk\ndata: ${JSON.stringify(ev)}\n\n`)
            since = ev.createdAt
          }

          const control = getMonkRunControl(runId)
          res.write(
            `event: control\ndata: ${JSON.stringify({ run, control })}\n\n`,
          )

          if (run.status === 'completed' || run.status === 'failed') {
            res.write(
              `event: done\ndata: ${JSON.stringify({ run, control })}\n\n`,
            )
            closed = true
            res.end()
          }
        } catch (err) {
          if (!closed) {
            res.write(
              `event: error\ndata: ${JSON.stringify({ error: String(err.message || err) })}\n\n`,
            )
          }
        }
      }

      await tick()
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval)
          return
        }
        ping()
        await tick()
      }, 900)

      req.on('close', () => clearInterval(interval))
    },
  )
}
