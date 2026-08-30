import { useEffect, useMemo, useState } from 'react'
import type { PocPackDefinition } from '@/connectors/connectorCatalog'
import { formatConnectorKeyLabel } from '@/sources/sourceSetup'
import { PdfGhostButton, PdfPrimaryButton } from '@/components/pdf/PdfUi'

export type PackInstallDataMode = 'pending' | 'demo'

export type PackInstallSelection = {
  selectedKeys: string[]
  dataMode: PackInstallDataMode
}

type Props = {
  pack: PocPackDefinition
  busy?: boolean
  onCancel: () => void
  onConfirm: (selection: PackInstallSelection) => void
}

/**
 * Pack install: pick connectors (skip unchecked) + demo vs add credentials later.
 */
export function PocPackInstallDialog({
  pack,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const allKeys = useMemo(
    () => pack.connectors.map((c) => c.key),
    [pack.connectors],
  )
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(allKeys.map((k) => [k, true])),
  )
  const [dataMode, setDataMode] = useState<PackInstallDataMode>('pending')

  useEffect(() => {
    setSelected(
      Object.fromEntries(pack.connectors.map((c) => [c.key, true])),
    )
    setDataMode('pending')
  }, [pack.id, pack.connectors])

  const selectedKeys = allKeys.filter((k) => selected[k])

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-[16px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poc-pack-install-title"
      aria-busy={busy ? 'true' : undefined}
      onClick={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        className="relative w-full max-w-[520px] overflow-hidden rounded-[10px] border border-solid border-[#424850] bg-[#1a1e24] p-[20px] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {busy ? (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-[14px] bg-[#1a1e24]/95 backdrop-blur-[2px]"
            role="status"
            aria-live="polite"
          >
            <span
              className="size-[36px] animate-spin rounded-full border-[3px] border-[#424850] border-t-[#d0d8e0]"
              aria-hidden
            />
            <p className="text-[14px] font-semibold text-[#d4dbe3]">
              Installing pack…
            </p>
            <p className="max-w-[280px] text-center text-[12px] leading-relaxed text-[#a3afbe]">
              Creating connectors
              {dataMode === 'demo' ? ' and syncing demo data' : ''}. Please wait.
            </p>
          </div>
        ) : null}

        <h2
          id="poc-pack-install-title"
          className="text-[15px] font-semibold text-[#d4dbe3]"
        >
          Install · {pack.title}
        </h2>
        <p className="mt-[8px] text-[12px] leading-relaxed text-[#a3afbe]">
          Choose which connectors to add. Uncheck any you want to skip. You can
          attach real credentials later, or start with Que demo data.
        </p>

        <div className="mt-[16px]">
          <p className="mb-[8px] text-[10px] font-semibold tracking-[0.12em] text-[#8a9099] uppercase">
            Connectors
          </p>
          <ul className="flex flex-col gap-[8px]">
            {pack.connectors.map((c) => (
              <li key={c.key}>
                <label className="flex cursor-pointer items-start gap-[10px] rounded-[6px] border border-solid border-[#424850] bg-[#252a30] px-[12px] py-[10px]">
                  <input
                    type="checkbox"
                    className="mt-[2px]"
                    checked={Boolean(selected[c.key])}
                    disabled={busy}
                    onChange={(e) =>
                      setSelected((prev) => ({
                        ...prev,
                        [c.key]: e.target.checked,
                      }))
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-[#d4dbe3]">
                      {formatConnectorKeyLabel(c.key)}
                    </span>
                    <span className="mt-[2px] block text-[11px] text-[#8a9099]">
                      {c.spec.description}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-[16px]">
          <p className="mb-[8px] text-[10px] font-semibold tracking-[0.12em] text-[#8a9099] uppercase">
            Data for selected
          </p>
          <div className="flex flex-col gap-[8px]">
            <label className="flex cursor-pointer items-start gap-[10px] rounded-[6px] border border-solid border-[#424850] px-[12px] py-[10px]">
              <input
                type="radio"
                name="pack-data-mode"
                className="mt-[2px]"
                checked={dataMode === 'pending'}
                disabled={busy}
                onChange={() => setDataMode('pending')}
              />
              <span>
                <span className="block text-[13px] font-medium text-[#d4dbe3]">
                  I&apos;ll add my connections
                </span>
                <span className="mt-[2px] block text-[11px] text-[#8a9099]">
                  Creates empty slots — Workspace stays empty until you Connect
                  or Use demo on each row.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-[10px] rounded-[6px] border border-solid border-[#424850] px-[12px] py-[10px]">
              <input
                type="radio"
                name="pack-data-mode"
                className="mt-[2px]"
                checked={dataMode === 'demo'}
                disabled={busy}
                onChange={() => setDataMode('demo')}
              />
              <span>
                <span className="block text-[13px] font-medium text-[#d4dbe3]">
                  Start with demo data
                </span>
                <span className="mt-[2px] block text-[11px] text-[#8a9099]">
                  Uses Que fixture JSON and syncs now (QA / sales demo only —
                  not customer production data).
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="mt-[20px] flex flex-wrap justify-end gap-[8px]">
          <PdfGhostButton type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </PdfGhostButton>
          <PdfPrimaryButton
            type="button"
            disabled={busy || selectedKeys.length === 0}
            onClick={() =>
              onConfirm({
                selectedKeys,
                dataMode,
              })
            }
          >
            {busy
              ? 'Installing…'
              : `Install ${selectedKeys.length} connector${selectedKeys.length === 1 ? '' : 's'}`}
          </PdfPrimaryButton>
        </div>
      </div>
    </div>
  )
}
