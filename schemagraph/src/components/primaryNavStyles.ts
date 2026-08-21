/** Shared primary header nav — Figma teal active indicator. */

export const primaryNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'relative inline-flex h-full items-center whitespace-nowrap px-2 font-label text-[11px] font-bold leading-none tracking-[0.05em] uppercase transition-colors lg:px-3',
    isActive
      ? 'border-b-2 border-secondary text-secondary'
      : 'border-b-2 border-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
  ].join(' ')

export const workspaceNavTriggerClass = ({
  emphasized,
}: {
  emphasized: boolean
}) =>
  [
    'inline-flex max-w-[11rem] items-center gap-1 truncate font-label text-[11px] font-bold tracking-[0.05em] uppercase transition-colors sm:max-w-[14rem]',
    emphasized
      ? 'border-b-2 border-secondary pb-[5px] text-secondary'
      : 'pb-[7px] text-on-surface-variant hover:text-on-surface',
  ].join(' ')

/** Left sidebar secondary nav item */
export const sideNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'mx-2 flex items-center gap-3 rounded-lg px-3 py-2 font-body text-[13px] transition-colors',
    isActive
      ? 'bg-secondary-container font-medium text-secondary'
      : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface',
  ].join(' ')
