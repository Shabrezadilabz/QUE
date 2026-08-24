import { ThemeToggle } from '@/components/ThemeToggle'
import { AuthSessionControls } from '@/components/AuthSessionControls'
import { ManagedPlaneLaunch } from '@/components/plane/ManagedPlaneLaunch'

/** Shared header actions — managed plane + theme toggle + signed-in identity. */
export function AppTopBarActions({ className = '' }: { className?: string }) {
  return (
    <div className={['flex shrink-0 items-center gap-[10px]', className].join(' ')}>
      <ManagedPlaneLaunch compact />
      <ThemeToggle compact />
      <AuthSessionControls />
    </div>
  )
}
