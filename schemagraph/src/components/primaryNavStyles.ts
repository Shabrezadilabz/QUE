/** Shared primary header nav classes — Sunset Clay. */

export const primaryNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'relative inline-flex items-center whitespace-nowrap font-body text-[15px] leading-none tracking-[-0.01em] transition-colors',
    isActive
      ? 'border-b-2 border-primary pb-[7px] font-semibold text-primary'
      : 'pb-[9px] font-normal text-[#3d3a45]/80 hover:text-primary',
  ].join(' ')

export const workspaceNavTriggerClass = ({
  emphasized,
}: {
  emphasized: boolean
}) =>
  [
    'inline-flex max-w-[11rem] items-center gap-1 truncate font-label text-[11px] font-semibold tracking-[0.14em] uppercase transition-colors sm:max-w-[15rem] sm:text-[12px]',
    emphasized
      ? 'border-b-2 border-primary-container pb-[6px] text-primary-container'
      : 'pb-[8px] text-primary-container/85 hover:text-primary',
  ].join(' ')
