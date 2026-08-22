import { ThemeToggle } from '@/components/ThemeToggle'
import { AuthSessionControls } from '@/components/AuthSessionControls'

/** Shared header actions — theme toggle + signed-in identity (PDF top bar). */
export function AppTopBarActions({ className = '' }: { className?: string }) {
  return (
    <div className={['flex shrink-0 items-center gap-[10px]', className].join(' ')}>
      <ThemeToggle compact />
      <AuthSessionControls />
    </div>
  )
}
