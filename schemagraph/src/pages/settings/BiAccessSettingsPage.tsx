import { useCallback, useEffect, useState } from 'react'
import {
  PdfGhostButton,
  PdfPrimaryButton,
} from '@/components/pdf/PdfUi'
import {
  SETTINGS_PANEL,
  SettingsPanelHeader,
  SettingsSectionHeader,
} from '@/components/settings/SettingsPdfUi'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import {
  addBiAccessGroupMemberApi,
  createBiAccessGroupApi,
  deleteBiAccessGroupApi,
  fetchBiAccessGroups,
  fetchWorkspaceMembers,
  updateBiAccessGroupApi,
  type BiAccessGroup,
  type WorkspaceMember,
} from '@/services/stitchApi'

/** Admin UI for BI Studio access groups (P3.6). */
export function BiAccessSettingsPage() {
  const { canAdmin } = useWorkspaceRole()
  const [groups, setGroups] = useState<BiAccessGroup[]>([])
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [allowedTables, setAllowedTables] = useState('')
  const [deniedColumns, setDeniedColumns] = useState('')
  const [assignUserId, setAssignUserId] = useState('')

  const selected = groups.find((g) => g.id === selectedId) ?? null

  const reload = useCallback(async () => {
    const [g, m] = await Promise.all([
      fetchBiAccessGroups(),
      fetchWorkspaceMembers(),
    ])
    setGroups(g)
    setMembers(m.members || [])
    setSelectedId((prev) => {
      if (prev && g.some((x) => x.id === prev)) return prev
      return g[0]?.id ?? null
    })
  }, [])

  useEffect(() => {
    void reload().catch((e) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }, [reload])

  useEffect(() => {
    if (!selected) return
    setName(selected.name)
    setDescription(selected.description)
    setAllowedTables((selected.allowedTables || []).join(', '))
    const deniedLines = Object.entries(selected.deniedColumns || {}).map(
      ([table, cols]) => `${table}:${(cols || []).join(',')}`,
    )
    setDeniedColumns(deniedLines.join('\n'))
  }, [selected])

  const parseDenied = (text: string) => {
    const out: Record<string, string[]> = {}
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.includes(':')) continue
      const [table, cols] = trimmed.split(':')
      out[table.trim()] = cols
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
    }
    return out
  }

  const onSave = async () => {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    const payload = {
      name: name.trim(),
      description,
      allowedTables: allowedTables
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      deniedColumns: parseDenied(deniedColumns),
    }
    try {
      if (selectedId) {
        await updateBiAccessGroupApi(selectedId, payload)
        setToast('Access group updated')
      } else {
        const item = await createBiAccessGroupApi(payload)
        setSelectedId(item.id)
        setToast('Access group created')
      }
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onCreate = async () => {
    setSelectedId(null)
    setName('')
    setDescription('')
    setAllowedTables('')
    setDeniedColumns('')
  }

  const onDelete = async () => {
    if (!selectedId || !confirm('Delete this access group?')) return
    setBusy(true)
    try {
      await deleteBiAccessGroupApi(selectedId)
      setToast('Deleted')
      setSelectedId(null)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const onAssign = async () => {
    if (!selectedId || !assignUserId) return
    setBusy(true)
    try {
      await addBiAccessGroupMemberApi(selectedId, assignUserId)
      setToast('Member assigned')
      setAssignUserId('')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!canAdmin) {
    return (
      <div className={SETTINGS_PANEL}>
        <SettingsPanelHeader title="BI Access" subtitle="Admin only" />
        <p className="text-[13px] text-[var(--pdf-text-muted)]">
          Only workspace admins can manage BI access groups.
        </p>
      </div>
    )
  }

  return (
    <div className={SETTINGS_PANEL}>
      <SettingsPanelHeader
        title="BI Access Groups"
        subtitle="Field-level and table-scope policies for Report Studio and Grid Explore."
      />

      {error && (
        <div className="mb-[12px] rounded border border-red-900/50 bg-red-950/30 px-[12px] py-[8px] text-[13px] text-red-300">
          {error}
        </div>
      )}
      {toast && (
        <div className="mb-[12px] text-[12px] text-[#c3f400]">{toast}</div>
      )}

      <div className="flex min-h-0 gap-[16px]">
        <aside className="w-[200px] shrink-0">
          <SettingsSectionHeader title="Groups" />
          <ul className="mt-[8px] flex flex-col gap-[4px]">
            {groups.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  className={`w-full rounded px-[8px] py-[6px] text-left text-[12px] ${
                    selectedId === g.id
                      ? 'bg-[#c3f400]/15 text-[#c3f400]'
                      : 'text-[var(--pdf-text-secondary)] hover:bg-[var(--pdf-bg-elevated)]'
                  }`}
                  onClick={() => setSelectedId(g.id)}
                >
                  {g.name}
                  <span className="block text-[10px] text-[var(--pdf-text-faint)]">
                    {g.memberCount ?? 0} members
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="min-w-0 flex-1 flex flex-col gap-[12px]">
          <label className="flex flex-col gap-[4px] text-[12px]">
            Name
            <input
              className="rounded border border-[var(--pdf-border)] bg-[var(--pdf-bg-shell)] px-[10px] py-[6px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-[4px] text-[12px]">
            Description
            <input
              className="rounded border border-[var(--pdf-border)] bg-[var(--pdf-bg-shell)] px-[10px] py-[6px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-[4px] text-[12px]">
            Allowed tables (comma-separated, empty = all)
            <input
              className="rounded border border-[var(--pdf-border)] bg-[var(--pdf-bg-shell)] px-[10px] py-[6px] font-mono text-[11px]"
              value={allowedTables}
              onChange={(e) => setAllowedTables(e.target.value)}
              placeholder="raw_orders, raw_customers"
            />
          </label>
          <label className="flex flex-col gap-[4px] text-[12px]">
            Denied columns (one per line: table:col1,col2)
            <textarea
              className="h-[72px] rounded border border-[var(--pdf-border)] bg-[var(--pdf-bg-shell)] px-[10px] py-[6px] font-mono text-[11px]"
              value={deniedColumns}
              onChange={(e) => setDeniedColumns(e.target.value)}
              placeholder={'employees:salary,ssn\norders:internal_notes'}
            />
          </label>

          <div className="flex flex-wrap gap-[8px]">
            <PdfPrimaryButton type="button" disabled={busy} onClick={() => void onSave()}>
              {selected ? 'Save group' : 'Create group'}
            </PdfPrimaryButton>
            <PdfGhostButton type="button" disabled={busy} onClick={() => void onCreate()}>
              + New group
            </PdfGhostButton>
            {selected && (
              <PdfGhostButton type="button" disabled={busy} onClick={() => void onDelete()}>
                Delete
              </PdfGhostButton>
            )}
          </div>

          {selected && (
            <div className="mt-[8px] border-t border-[var(--pdf-border)] pt-[12px]">
              <SettingsSectionHeader title="Assign member" />
              <div className="mt-[8px] flex flex-wrap items-end gap-[8px]">
                <select
                  className="rounded border border-[var(--pdf-border)] bg-[var(--pdf-bg-shell)] px-[10px] py-[6px] text-[12px]"
                  value={assignUserId}
                  onChange={(e) => setAssignUserId(e.target.value)}
                >
                  <option value="">Select member…</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.email} ({m.role})
                    </option>
                  ))}
                </select>
                <PdfGhostButton type="button" disabled={busy || !assignUserId} onClick={() => void onAssign()}>
                  Add to group
                </PdfGhostButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
