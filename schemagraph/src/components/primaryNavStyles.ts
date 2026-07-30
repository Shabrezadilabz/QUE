/** Shared primary header nav — dense, Databricks-like. */

export const primaryNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'relative inline-flex items-center whitespace-nowrap font-body text-[13px] leading-none tracking-[-0.01em] transition-colors',
    isActive
      ? 'border-b-2 border-primary pb-[6px] font-medium text-primary'
      : 'pb-[8px] font-normal text-[#3d3a45]/75 hover:text-primary',
  ].join(' ')

export const workspaceNavTriggerClass = ({
  emphasized,
}: {
  emphasized: boolean
}) =>
  [
    'inline-flex max-w-[11rem] items-center gap-1 truncate font-label text-[11px] font-semibold tracking-[0.12em] uppercase transition-colors sm:max-w-[14rem]',
    emphasized
      ? 'border-b-2 border-primary-container pb-[5px] text-primary-container'
      : 'pb-[7px] text-primary-container/85 hover:text-primary',
  ].join(' ')
