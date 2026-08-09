import { Outlet } from 'react-router-dom'
import { QueAppChrome } from '@/layouts/QueAppChrome'

/**
 * Sources shell — chrome + nested list/wizard/detail routes.
 */
export function SourcesLayout() {
  return (
    <QueAppChrome eyebrow="SOURCES · SCHEMA SYNC">
      <div className="flex min-h-0 flex-1 overflow-hidden bg-canvas">
        <Outlet />
      </div>
    </QueAppChrome>
  )
}
