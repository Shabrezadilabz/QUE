import { Outlet } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'

/**
 * Jobs shell — chrome + nested list/detail routes.
 */
export function JobsLayout() {
  return (
    <QueAppChrome eyebrow="JOBS · STITCH → SHIP">
      <div className="flex min-h-0 flex-1 overflow-hidden bg-[var(--pdf-bg-canvas)]">
        <Outlet />
      </div>
    </QueAppChrome>
  )
}
