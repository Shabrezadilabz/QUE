import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ExportAttestationsPanel } from '@/components/settings/ExportAttestationsPanel'
import { SignedArtifactsPanel } from '@/components/settings/SignedArtifactsPanel'
import { ScheduledSyncPanel } from '@/components/settings/ScheduledSyncPanel'
import { ScheduledJobsPanel } from '@/components/settings/ScheduledJobsPanel'
import { OrchestratorPanel } from '@/components/settings/OrchestratorPanel'
import { PrivateRunnerPanel } from '@/components/settings/PrivateRunnerPanel'
import { BillingPanel } from '@/components/settings/BillingPanel'
import {
  SETTINGS_PANEL,
  SettingsKebabButton,
  SettingsMetric,
  SettingsPanelHeader,
  SettingsProgressRow,
  SettingsRoleBadge,
  SettingsSearchInput,
  SettingsSectionHeader,
  SettingsSelect,
  SettingsUsageBadge,
  relativeActiveLabel,
} from '@/components/settings/SettingsPdfUi'
import {
  PdfGhostButton,
  PdfPrimaryButton,
} from '@/components/pdf/PdfUi'
import {
  PDF_TABLE_CELL,
  PDF_TABLE_HEAD,
  PDF_TABLE_ROW,
  PdfTableFooter,
  PdfTableShell,
} from '@/components/pdf/PdfTable'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import { useAuth } from '@/context/AuthContext'
import { getApiBase } from '@/services/stitchApi'
import {
  SETTINGS_SECTION_META,
  type SettingsSection,
} from '@/pages/settings/settingsSections'
import {
  createWorkspaceInvite,
  fetchWorkspaceAuditEvents,
  fetchWorkspaceInvites,
  fetchWorkspaceMembers,
  fetchWorkspaceSettings,
  fetchWorkspaceUsage,
  fetchDrift,
  acknowledgeDriftEvent,
  notifyDriftEvent,
  sendDriftTestAlert,
  reindexAi,
  removeWorkspaceMember,
  revokeWorkspaceInvite,
  runJoinInference,
  exportAuditCsv,
  fetchAuthSessions,
  revokeAuthSession,
  revokeOtherAuthSessions,
  sendDriftDigestApi,
  sendJoinReviewTestNotify,
  updateWorkspaceLlmSecrets,
  updateWorkspaceMemberRole,
  updateWorkspaceSettings,
  type WorkspaceAuditEvent,
  type WorkspaceInvite,
  type WorkspaceMember,
  type WorkspaceMemberRole,
  type WorkspaceSecretSlot,
  type WorkspaceSettingsFlags,
  type WorkspaceSettingsPayload,
  type WorkspaceUsage,
  type DriftEvent,
} from '@/services/stitchApi'

type MemberRow = {
  id: string
  name: string
  email: string
  role: WorkspaceMemberRole
  joinedLabel: string
  you?: boolean
  isLastOwner?: boolean
}

/**
 * Settings section body — rendered inside SettingsLayout nested routes.
 */
export function SettingsPage({ section = 'members' }: { section?: SettingsSection }) {
  const { canAdmin, canWrite, role } = useWorkspaceRole()
  const { workspaceId, user } = useAuth()
  const navigate = useNavigate()
  const sectionMeta = SETTINGS_SECTION_META[section]
  const isDev = import.meta.env.DEV
  const [data, setData] = useState<WorkspaceSettingsPayload | null>(null)
  const [draft, setDraft] = useState<WorkspaceSettingsFlags | null>(null)
  const [busy, setBusy] = useState(false)
  const [secretsBusy, setSecretsBusy] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [inferring, setInferring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [openaiKeyDraft, setOpenaiKeyDraft] = useState('')
  const [anthropicKeyDraft, setAnthropicKeyDraft] = useState('')
  const [memberQuery, setMemberQuery] = useState('')
  const [memberRoleFilter, setMemberRoleFilter] = useState<'all' | WorkspaceMemberRole>('all')
  const [memberPage, setMemberPage] = useState(0)
  const MEMBERS_PAGE_SIZE = 10
  const showAdvanced = section === 'ai-policy'
  const [membersApi, setMembersApi] = useState<WorkspaceMember[]>([])
  const [memberSummary, setMemberSummary] = useState<{
    ownerCount: number
    hasSingleOwner: boolean
  } | null>(null)
  const [invites, setInvites] = useState<WorkspaceInvite[]>([])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<WorkspaceMemberRole>('member')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [usage, setUsage] = useState<WorkspaceUsage | null>(null)

  useEffect(() => {
    setData(null)
    setDraft(null)
    fetchWorkspaceSettings()
      .then((payload) => {
        setData(payload)
        setDraft({
          includeSamplesDefault: payload.settings.includeSamplesDefault,
          scrubSamples: payload.settings.scrubSamples !== false,
          aiMayUsePinnedSamples:
            payload.settings.aiMayUsePinnedSamples !== false,
          pinnedSampleRows: payload.settings.pinnedSampleRows ?? 10,
          enableManagedDataPlane:
            payload.settings.enableManagedDataPlane === true,
          defaultExecutionPlane:
            payload.settings.defaultExecutionPlane ?? 'customer',
          managedMaxDatasets: payload.settings.managedMaxDatasets ?? 25,
          managedMaxRowsPerDataset:
            payload.settings.managedMaxRowsPerDataset ?? 50000,
          managedRetentionDays: payload.settings.managedRetentionDays ?? 90,
          inferJoinsOnSync: payload.settings.inferJoinsOnSync,
          preferLlmChat: payload.settings.preferLlmChat,
          aiModelId: payload.settings.aiModelId ?? 'gpt-4o-mini',
          ragTopK: payload.settings.ragTopK ?? 8,
          ragIncludeDocs: payload.settings.ragIncludeDocs !== false,
          blockExportOnDrift: payload.settings.blockExportOnDrift !== false,
          blockPrOnColumnDrift:
            payload.settings.blockPrOnColumnDrift !== false,
          blockExportOnUnreviewedJoins:
            payload.settings.blockExportOnUnreviewedJoins === true,
          databricksQueryJoinAssist:
            payload.settings.databricksQueryJoinAssist !== false,
          snowflakeQueryJoinAssist:
            payload.settings.snowflakeQueryJoinAssist !== false,
          enableStitchAgent: payload.settings.enableStitchAgent === true,
          enableLiveValidate: payload.settings.enableLiveValidate !== false,
          enableMaterialize: payload.settings.enableMaterialize !== false,
          enableAutoPromoteLowRisk:
            payload.settings.enableAutoPromoteLowRisk === true,
          autoPromoteMinRecall: payload.settings.autoPromoteMinRecall ?? 0.9,
          yellowPromoteMinRole:
            payload.settings.yellowPromoteMinRole ?? 'member',
          redPromoteMinRole: payload.settings.redPromoteMinRole ?? 'admin',
          enableCatalogGovernance:
            payload.settings.enableCatalogGovernance === true,
          stewardUxMode: payload.settings.stewardUxMode === true,
          ticketProvider: payload.settings.ticketProvider ?? 'webhook',
          ticketWebhookUrl: payload.settings.ticketWebhookUrl ?? '',
          jiraWebhookUrl: payload.settings.jiraWebhookUrl ?? '',
          serviceNowWebhookUrl: payload.settings.serviceNowWebhookUrl ?? '',
          emitContractEvents: payload.settings.emitContractEvents !== false,
          contractWebhookUrl: payload.settings.contractWebhookUrl ?? '',
          driftAlertsEnabled: payload.settings.driftAlertsEnabled !== false,
          driftAlertOnHigh: payload.settings.driftAlertOnHigh !== false,
          driftAlertWebhookUrl: payload.settings.driftAlertWebhookUrl ?? '',
          driftAlertEmails: payload.settings.driftAlertEmails ?? '',
          githubOwner: payload.settings.githubOwner ?? '',
          githubRepo: payload.settings.githubRepo ?? '',
          githubBaseBranch: payload.settings.githubBaseBranch ?? 'main',
          githubAllowedBranches:
            payload.settings.githubAllowedBranches ?? 'main',
          githubPrMinRole: payload.settings.githubPrMinRole ?? 'member',
          joinProposeMinRole: payload.settings.joinProposeMinRole ?? 'member',
          joinPromoteMinRole: payload.settings.joinPromoteMinRole ?? 'member',
          joinReviewNotifyEnabled:
            payload.settings.joinReviewNotifyEnabled !== false,
                      joinReviewWebhookUrl: payload.settings.joinReviewWebhookUrl ?? '',
                      slackNotifyChannel: payload.settings.slackNotifyChannel ?? '',
                      joinPromoteNotify: payload.settings.joinPromoteNotify === true,
          driftDigestEnabled: payload.settings.driftDigestEnabled !== false,
          driftDigestWebhookUrl: payload.settings.driftDigestWebhookUrl ?? '',
          dbtModelsPath: payload.settings.dbtModelsPath ?? 'models/que',
        })
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      )
  }, [workspaceId])

  async function reloadMembers() {
    try {
      const { members: rows, summary } = await fetchWorkspaceMembers()
      setMembersApi(rows)
      setMemberSummary(
        summary
          ? {
              ownerCount: summary.ownerCount,
              hasSingleOwner: summary.hasSingleOwner,
            }
          : null,
      )
      if (canAdmin) {
        const inv = await fetchWorkspaceInvites()
        setInvites(inv.filter((i) => !i.acceptedAt))
      } else {
        setInvites([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void reloadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, canAdmin])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const u = await fetchWorkspaceUsage()
        if (!cancelled) setUsage(u)
      } catch {
        if (!cancelled) setUsage(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const members = useMemo((): MemberRow[] => {
    return membersApi.map((m) => ({
      id: m.id,
      name: m.displayName || m.email.split('@')[0] || m.email,
      email: m.email,
      role: m.role,
      joinedLabel: m.joinedAt
        ? new Date(m.joinedAt).toLocaleDateString()
        : '—',
      you: user?.id === m.id,
      isLastOwner: Boolean(m.isLastOwner),
    }))
  }, [membersApi, user?.id])

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase()
    return members.filter((m) => {
      if (memberRoleFilter !== 'all' && m.role !== memberRoleFilter) return false
      if (!q) return true
      return (
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.role.includes(q)
      )
    })
  }, [members, memberQuery, memberRoleFilter])

  const memberPageCount = Math.max(
    1,
    Math.ceil(filteredMembers.length / MEMBERS_PAGE_SIZE),
  )
  const pagedMembers = useMemo(() => {
    const start = memberPage * MEMBERS_PAGE_SIZE
    return filteredMembers.slice(start, start + MEMBERS_PAGE_SIZE)
  }, [filteredMembers, memberPage])

  useEffect(() => {
    setMemberPage(0)
  }, [memberQuery, memberRoleFilter, workspaceId])

  const dirty =
    draft &&
    data &&
    (draft.includeSamplesDefault !== data.settings.includeSamplesDefault ||
      draft.scrubSamples !== (data.settings.scrubSamples !== false) ||
      draft.aiMayUsePinnedSamples !==
        (data.settings.aiMayUsePinnedSamples !== false) ||
      draft.pinnedSampleRows !== (data.settings.pinnedSampleRows ?? 10) ||
      draft.enableManagedDataPlane !==
        (data.settings.enableManagedDataPlane === true) ||
      draft.defaultExecutionPlane !==
        (data.settings.defaultExecutionPlane ?? 'customer') ||
      draft.managedMaxDatasets !== (data.settings.managedMaxDatasets ?? 25) ||
      draft.managedMaxRowsPerDataset !==
        (data.settings.managedMaxRowsPerDataset ?? 50000) ||
      draft.managedRetentionDays !==
        (data.settings.managedRetentionDays ?? 90) ||
      draft.inferJoinsOnSync !== data.settings.inferJoinsOnSync ||
      draft.preferLlmChat !== data.settings.preferLlmChat ||
      draft.aiModelId !== (data.settings.aiModelId ?? 'gpt-4o-mini') ||
      draft.ragTopK !== (data.settings.ragTopK ?? 8) ||
      draft.ragIncludeDocs !== (data.settings.ragIncludeDocs !== false) ||
      draft.blockExportOnDrift !== (data.settings.blockExportOnDrift !== false) ||
      draft.blockPrOnColumnDrift !==
        (data.settings.blockPrOnColumnDrift !== false) ||
      draft.blockExportOnUnreviewedJoins !==
        (data.settings.blockExportOnUnreviewedJoins === true) ||
      draft.databricksQueryJoinAssist !==
        (data.settings.databricksQueryJoinAssist !== false) ||
      draft.emitContractEvents !== (data.settings.emitContractEvents !== false) ||
      draft.contractWebhookUrl !== (data.settings.contractWebhookUrl ?? '') ||
      draft.driftAlertsEnabled !== (data.settings.driftAlertsEnabled !== false) ||
      draft.driftAlertOnHigh !== (data.settings.driftAlertOnHigh !== false) ||
      draft.driftAlertWebhookUrl !==
        (data.settings.driftAlertWebhookUrl ?? '') ||
      draft.driftAlertEmails !== (data.settings.driftAlertEmails ?? '') ||
      draft.githubOwner !== data.settings.githubOwner ||
      draft.githubRepo !== data.settings.githubRepo ||
      draft.githubBaseBranch !== data.settings.githubBaseBranch ||
      draft.githubAllowedBranches !==
        (data.settings.githubAllowedBranches ?? 'main') ||
      draft.joinProposeMinRole !==
        (data.settings.joinProposeMinRole ?? 'member') ||
      draft.joinPromoteMinRole !==
        (data.settings.joinPromoteMinRole ?? 'member') ||
      draft.joinReviewNotifyEnabled !==
        (data.settings.joinReviewNotifyEnabled !== false) ||
      draft.joinPromoteNotify !==
        (data.settings.joinPromoteNotify === true) ||
      draft.joinReviewWebhookUrl !==
        (data.settings.joinReviewWebhookUrl ?? '') ||
      draft.slackNotifyChannel !==
        (data.settings.slackNotifyChannel ?? '') ||
      draft.driftDigestEnabled !==
        (data.settings.driftDigestEnabled !== false) ||
      draft.driftDigestWebhookUrl !==
        (data.settings.driftDigestWebhookUrl ?? '') ||
      draft.enableStitchAgent !==
        (data.settings.enableStitchAgent === true) ||
      draft.enableAutoPromoteLowRisk !==
        (data.settings.enableAutoPromoteLowRisk === true) ||
      draft.autoPromoteMinRecall !==
        (data.settings.autoPromoteMinRecall ?? 0.9) ||
      draft.yellowPromoteMinRole !==
        (data.settings.yellowPromoteMinRole ?? 'member') ||
      draft.redPromoteMinRole !==
        (data.settings.redPromoteMinRole ?? 'admin') ||
      draft.enableCatalogGovernance !==
        (data.settings.enableCatalogGovernance === true) ||
      draft.stewardUxMode !== (data.settings.stewardUxMode === true) ||
      draft.ticketWebhookUrl !== (data.settings.ticketWebhookUrl ?? '') ||
      draft.dbtModelsPath !== data.settings.dbtModelsPath)

  async function save() {
    if (!draft || !canAdmin) return
    setBusy(true)
    setError(null)
    try {
      const next = await updateWorkspaceSettings(draft)
      setData(next)
      setDraft(next.settings)
      setToast('Settings saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveLlmSecrets(patch: {
    openaiApiKey?: string | null
    anthropicApiKey?: string | null
    githubToken?: string | null
  }) {
    if (!canAdmin) return
    setSecretsBusy(true)
    setError(null)
    try {
      const secrets = await updateWorkspaceLlmSecrets(patch)
      const next = await fetchWorkspaceSettings()
      setData({
        ...next,
        capabilities: { ...next.capabilities, secrets },
      })
      if ('openaiApiKey' in patch) setOpenaiKeyDraft('')
      if ('anthropicApiKey' in patch) setAnthropicKeyDraft('')
      setToast('API keys updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSecretsBusy(false)
    }
  }

  const usagePct = usage
    ? Math.min(100, usage.usagePct)
    : data
      ? Math.min(
          100,
          Math.round(
            ((data.stats.tables + data.stats.connections * 10) /
              Math.max(data.stats.tables + 40, 80)) *
              100,
          ),
        )
      : 0

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="min-h-0 flex-1 overflow-y-auto pb-[24px]">
            <SettingsSectionHeader
              title={sectionMeta.title}
              subtitle={sectionMeta.subtitle}
              actions={
                section === 'members' ? (
                  <PdfPrimaryButton
                    type="button"
                    disabled={!canAdmin}
                    onClick={() => {
                      if (!canAdmin) {
                        setToast('Admin required to invite members')
                        return
                      }
                      setInviteOpen(true)
                    }}
                  >
                    + Invite Member
                  </PdfPrimaryButton>
                ) : undefined
              }
            />

            {error ? (
              <p className="mb-[16px] rounded-[8px] border border-solid border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.08)] px-[16px] py-[10px] text-[13px] text-[#ff6b6b]">
                {error}
              </p>
            ) : null}
            {toast ? (
              <p className="mb-[16px] rounded-[8px] border border-solid border-[rgba(122,236,208,0.35)] bg-[rgba(122,236,208,0.08)] px-[16px] py-[10px] text-[12px] text-[#7aecd0]">
                {toast}
                <button
                  type="button"
                  className="ml-[12px] underline"
                  onClick={() => setToast(null)}
                >
                  dismiss
                </button>
              </p>
            ) : null}

            {!data || !draft ? (
              <p className="text-[12px] text-[#a3afbe]">Loading…</p>
            ) : (
              <>
                {section === 'members' ? (
                <div className="flex flex-col gap-[20px]">
                  <div className="flex flex-col gap-[12px] sm:flex-row sm:items-center">
                    <SettingsSearchInput
                      value={memberQuery}
                      onChange={setMemberQuery}
                      placeholder="Filter members by name or email..."
                      className="min-w-0 flex-1"
                    />
                    <SettingsSelect
                      value={memberRoleFilter}
                      onChange={(v) =>
                        setMemberRoleFilter(v as 'all' | WorkspaceMemberRole)
                      }
                      aria-label="Filter by role"
                      className="w-full sm:w-[140px]"
                    >
                      <option value="all">All Roles</option>
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="member">Editor</option>
                      <option value="viewer">Viewer</option>
                    </SettingsSelect>
                  </div>

                  <PdfTableShell
                    footer={
                      <PdfTableFooter
                        left={
                          filteredMembers.length === 0
                            ? 'No members match this filter'
                            : `Showing ${memberPage * MEMBERS_PAGE_SIZE + 1} to ${Math.min(
                                (memberPage + 1) * MEMBERS_PAGE_SIZE,
                                filteredMembers.length,
                              )} of ${filteredMembers.length} members`
                        }
                        right={
                          filteredMembers.length > MEMBERS_PAGE_SIZE ? (
                            <>
                              <button
                                type="button"
                                disabled={memberPage === 0}
                                onClick={() =>
                                  setMemberPage((p) => Math.max(0, p - 1))
                                }
                                className="inline-flex size-[28px] items-center justify-center rounded-[4px] border border-solid border-[#424850] text-[#c8cdd3] disabled:opacity-40"
                                aria-label="Previous page"
                              >
                                ‹
                              </button>
                              <button
                                type="button"
                                disabled={memberPage >= memberPageCount - 1}
                                onClick={() =>
                                  setMemberPage((p) =>
                                    Math.min(memberPageCount - 1, p + 1),
                                  )
                                }
                                className="inline-flex size-[28px] items-center justify-center rounded-[4px] border border-solid border-[#424850] text-[#c8cdd3] disabled:opacity-40"
                                aria-label="Next page"
                              >
                                ›
                              </button>
                            </>
                          ) : undefined
                        }
                      />
                    }
                  >
                    <table className="w-full min-w-[640px] text-left">
                      <thead className="bg-[#15191e]">
                        <tr>
                          <th className={PDF_TABLE_HEAD}>User</th>
                          <th className={PDF_TABLE_HEAD}>Role</th>
                          <th className={PDF_TABLE_HEAD}>Last active</th>
                          <th className={`${PDF_TABLE_HEAD} text-right`}>
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedMembers.map((m, i) => {
                          const lockLastOwner = Boolean(m.isLastOwner)
                          const canEditRow = canAdmin && !m.you && !lockLastOwner
                          const joinedAt = membersApi.find((x) => x.id === m.id)?.joinedAt
                          return (
                            <tr key={m.id} className={PDF_TABLE_ROW}>
                              <td className={PDF_TABLE_CELL}>
                                <div className="flex items-center gap-[12px]">
                                  <div
                                    className={[
                                      'flex size-[32px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                                      i % 3 === 0
                                        ? 'bg-[rgba(122,236,208,0.15)] text-[#7aecd0]'
                                        : i % 3 === 1
                                          ? 'bg-[#252a30] text-[#c8cdd3]'
                                          : 'bg-[#2e343b] text-[#a3afbe]',
                                    ].join(' ')}
                                  >
                                    {initials(m.name)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-[13px] font-medium text-[#d4dbe3]">
                                      {m.name}
                                      {m.you ? (
                                        <span className="ml-[6px] text-[11px] text-[#7aecd0]">
                                          (you)
                                        </span>
                                      ) : null}
                                    </p>
                                    <p className="truncate text-[12px] text-[#8a9099]">
                                      {m.email}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className={PDF_TABLE_CELL}>
                                {canEditRow ? (
                                  <select
                                    value={m.role}
                                    aria-label={`Role for ${m.email}`}
                                    onChange={(e) => {
                                      const next = e.target
                                        .value as WorkspaceMemberRole
                                      if (
                                        m.role === 'owner' &&
                                        next !== 'owner' &&
                                        !window.confirm(
                                          `Demote ${m.email} from owner? Workspace must keep at least one owner.`,
                                        )
                                      ) {
                                        e.target.value = m.role
                                        return
                                      }
                                      void (async () => {
                                        try {
                                          await updateWorkspaceMemberRole(
                                            m.id,
                                            next,
                                          )
                                          await reloadMembers()
                                          setToast(`Updated ${m.email} → ${next}`)
                                        } catch (err) {
                                          setError(
                                            err instanceof Error
                                              ? err.message
                                              : String(err),
                                          )
                                          await reloadMembers()
                                        }
                                      })()
                                    }}
                                    className="rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] px-[8px] py-[4px] text-[11px] text-[#d4dbe3] uppercase"
                                  >
                                    <option value="viewer">viewer</option>
                                    <option value="member">member</option>
                                    <option value="admin">admin</option>
                                    {role === 'owner' ? (
                                      <option value="owner">owner</option>
                                    ) : null}
                                  </select>
                                ) : (
                                  <SettingsRoleBadge role={m.role} />
                                )}
                              </td>
                              <td className={`${PDF_TABLE_CELL} text-[12px] text-[#a3afbe]`}>
                                {relativeActiveLabel(Boolean(m.you), joinedAt)}
                              </td>
                              <td className={`${PDF_TABLE_CELL} text-right`}>
                                {canAdmin && !m.you && !lockLastOwner ? (
                                  <SettingsKebabButton
                                    label={`Actions for ${m.email}`}
                                    onClick={() => {
                                      if (
                                        !window.confirm(
                                          `Remove ${m.email} from this workspace?`,
                                        )
                                      ) {
                                        return
                                      }
                                      void (async () => {
                                        try {
                                          await removeWorkspaceMember(m.id)
                                          await reloadMembers()
                                          setToast(`Removed ${m.email}`)
                                        } catch (err) {
                                          setError(
                                            err instanceof Error
                                              ? err.message
                                              : String(err),
                                          )
                                        }
                                      })()
                                    }}
                                  />
                                ) : lockLastOwner ? (
                                  <span
                                    className="text-[11px] text-[#8a9099]"
                                    title="Promote another owner first"
                                  >
                                    Protected
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-[#8a9099]">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </PdfTableShell>

                  {memberSummary?.hasSingleOwner ? (
                    <p className="text-[12px] text-[#a3afbe]">
                      This workspace has a single owner — they cannot be removed or
                      demoted until another owner is promoted.
                    </p>
                  ) : null}

                  {canAdmin ? (
                    <div className={`${SETTINGS_PANEL} mt-[4px]`}>
                      <SettingsPanelHeader
                        title="Pending invites"
                        subtitle={`${invites.length} outstanding invite${invites.length === 1 ? '' : 's'}`}
                      />
                      {invites.length === 0 ? (
                        <p className="text-[12px] text-[#a3afbe]">
                          No pending invites. Use Invite Member to add someone who is
                          not in this workspace yet.
                        </p>
                      ) : (
                        <ul className="space-y-[8px]">
                          {invites.map((inv) => (
                            <li
                              key={inv.id}
                              className="flex items-center justify-between gap-[12px] text-[12px]"
                            >
                              <span className="text-[#d4dbe3]">
                                {inv.email}{' '}
                                <span className="text-[#8a9099]">· {inv.role}</span>
                              </span>
                              <button
                                type="button"
                                className="text-[11px] text-[#ff6b6b] hover:underline"
                                onClick={() => {
                                  void (async () => {
                                    try {
                                      await revokeWorkspaceInvite(inv.id)
                                      await reloadMembers()
                                      setToast('Invite revoked')
                                    } catch (err) {
                                      setError(
                                        err instanceof Error
                                          ? err.message
                                          : String(err),
                                      )
                                    }
                                  })()
                                }}
                              >
                                Revoke
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
                ) : null}

                {section === 'security' ? (
                <div className="grid grid-cols-12 gap-[20px]">
                  <div className="col-span-12">
                    <SessionsSecurityPanel />
                  </div>
                  <div className="col-span-12 flex flex-col gap-[20px] lg:col-span-6">
                    <section className={SETTINGS_PANEL}>
                      <SettingsPanelHeader
                        title="API Keys"
                        actions={
                          <button
                            type="button"
                            className="text-[12px] text-[#7aecd0] hover:underline"
                            onClick={() => navigate('/settings/ai-policy')}
                          >
                            Manage in AI Policy
                          </button>
                        }
                      />
                      <div className="space-y-sm">
                        <KeyRow
                          name="OpenAI"
                          hint={
                            data.capabilities.secrets?.openai?.hint ||
                            (data.capabilities.secrets?.openai?.configured
                              ? 'sk_••••••••'
                              : 'Not configured')
                          }
                        />
                        <KeyRow
                          name="Anthropic"
                          hint={
                            data.capabilities.secrets?.anthropic?.hint ||
                            (data.capabilities.secrets?.anthropic?.configured
                              ? 'sk_••••••••'
                              : 'Not configured')
                          }
                        />
                        <button
                          type="button"
                          disabled={!canAdmin}
                          onClick={() => navigate('/settings/ai-policy')}
                          className="pdf-btn-ghost mt-[12px] w-full rounded-[4px] px-[13px] py-[8px] text-[12px] disabled:opacity-40"
                        >
                          Configure BYOK keys
                        </button>
                      </div>
                    </section>
                  </div>
                  <div className="col-span-12 flex flex-col gap-[20px] lg:col-span-6">
                    <section className={SETTINGS_PANEL}>
                      <SettingsPanelHeader
                        title="Environment Variables"
                        actions={
                          <button
                            type="button"
                            className="text-[12px] text-[#a3afbe] hover:text-[#d0d8e0]"
                            onClick={() => navigate('/settings/ai-policy')}
                            aria-label="Edit environment"
                          >
                            Edit
                          </button>
                        }
                      />
                      <div className="space-y-xs">
                        <EnvRow
                          keyName="API_BASE"
                          value={maskMiddle(getApiBase())}
                        />
                        <EnvRow
                          keyName="GITHUB_REPO"
                          value={
                            draft.githubOwner && draft.githubRepo
                              ? `${draft.githubOwner}/${draft.githubRepo}`
                              : '••••••••••••'
                          }
                        />
                        <EnvRow
                          keyName="DBT_PATH"
                          value={draft.dbtModelsPath || 'models/que'}
                        />
                        <EnvRow
                          keyName="AI_MODEL"
                          value={draft.aiModelId || 'gpt-4o-mini'}
                        />
                      </div>
                    </section>
                  </div>
                  <div className="col-span-12 mt-lg">
                    <SsoStatusPanel />
                  </div>
                </div>
                ) : null}

                {section === 'automation' ? (
                <div className="space-y-[20px]">
                <UsageCountersPanel usage={usage} />
                <ScheduledSyncPanel
                  workspaceId={workspaceId}
                  canAdmin={canAdmin}
                />
                <ScheduledJobsPanel
                  workspaceId={workspaceId}
                  canAdmin={canAdmin}
                />
                <OrchestratorPanel
                  workspaceId={workspaceId}
                  canAdmin={canAdmin}
                />
                <PrivateRunnerPanel
                  workspaceId={workspaceId}
                  canAdmin={canAdmin}
                />
                </div>
                ) : null}

                {section === 'governance' ? (
                <div className="space-y-[20px]">
                <DriftAlertsPanel canAdmin={canAdmin} />
                <ExportAttestationsPanel workspaceId={workspaceId} />
                <SignedArtifactsPanel
                  workspaceId={workspaceId}
                  canAdmin={canAdmin}
                />
                <AuditLogPanel workspaceId={workspaceId} />
                </div>
                ) : null}

                {section === 'billing' ? (
                <div className="space-y-[20px]">
                <BillingPanel workspaceId={workspaceId} canAdmin={canAdmin} />
                <UsageCountersPanel usage={usage} />
                </div>
                ) : null}

                {section === 'team' ? (
                <div className="space-y-[20px]">
                  <Section title="PROPOSE_VS_PROMOTE" meta="TEAM OS ACL">
                    <p className="mb-md font-body text-[12px] text-on-surface-variant">
                      Analysts can stay at member for propose/infer; raise Promote
                      to admin if only seniors may accept joins into contracts.
                    </p>
                    <label className="mb-md block max-w-sm">
                      <span className="mb-xs block font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                        Min role to propose / infer joins
                      </span>
                      <select
                        disabled={!canAdmin}
                        value={draft.joinProposeMinRole ?? 'member'}
                        onChange={(e) =>
                          setDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  joinProposeMinRole: e.target
                                    .value as WorkspaceSettingsFlags['joinProposeMinRole'],
                                }
                              : d,
                          )
                        }
                        className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-sm py-2 font-body text-[13px]"
                      >
                        <option value="member">member+</option>
                        <option value="admin">admin+</option>
                        <option value="owner">owner only</option>
                      </select>
                    </label>
                    <label className="mb-md block max-w-sm">
                      <span className="mb-xs block font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
                        Min role to Promote joins
                      </span>
                      <select
                        disabled={!canAdmin}
                        value={draft.joinPromoteMinRole ?? 'member'}
                        onChange={(e) =>
                          setDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  joinPromoteMinRole: e.target
                                    .value as WorkspaceSettingsFlags['joinPromoteMinRole'],
                                }
                              : d,
                          )
                        }
                        className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-sm py-2 font-body text-[13px]"
                      >
                        <option value="member">member+</option>
                        <option value="admin">admin+</option>
                        <option value="owner">owner only</option>
                      </select>
                    </label>
                    {canAdmin ? (
                      <button
                        type="button"
                        disabled={!dirty || busy}
                        onClick={() => void save()}
                        className="rounded bg-secondary px-md py-2 font-label text-[12px] text-on-secondary disabled:opacity-40"
                      >
                        Save role gates
                      </button>
                    ) : null}
                  </Section>

                  <Section title="SLACK_TEAMS_NOTIFY" meta="JOIN REVIEW · DRIFT DIGEST">
                    <Toggle
                      label="Join review notifications"
                      hint="Webhook when inference creates suggestions needing Promote"
                      checked={draft.joinReviewNotifyEnabled !== false}
                      disabled={!canAdmin}
                      onChange={(v) =>
                        setDraft((d) =>
                          d ? { ...d, joinReviewNotifyEnabled: v } : d,
                        )
                      }
                    />
                    <Toggle
                      label="Notify on Promote"
                      hint="Optional ping when a join is accepted"
                      checked={draft.joinPromoteNotify === true}
                      disabled={!canAdmin}
                      onChange={(v) =>
                        setDraft((d) =>
                          d ? { ...d, joinPromoteNotify: v } : d,
                        )
                      }
                    />
                    <Field
                      label="Join review webhook URL (Slack / Teams / generic)"
                      value={draft.joinReviewWebhookUrl ?? ''}
                      disabled={!canAdmin}
                      onChange={(v) =>
                        setDraft((d) =>
                          d ? { ...d, joinReviewWebhookUrl: v } : d,
                        )
                      }
                      placeholder="https://hooks.slack.com/services/… or Teams webhook"
                    />
                    <Field
                      label="Slack channel (interactive buttons)"
                      value={draft.slackNotifyChannel ?? ''}
                      disabled={!canAdmin}
                      onChange={(v) =>
                        setDraft((d) =>
                          d ? { ...d, slackNotifyChannel: v } : d,
                        )
                      }
                      placeholder="#data-ops or C0123ABCD (needs SLACK_BOT_TOKEN)"
                    />
                    <p className="text-[11px] text-on-surface-variant">
                      With <code className="font-mono">SLACK_BOT_TOKEN</code> +
                      channel, Que posts interactive Approve/Reject (value
                      tokens →{' '}
                      <code className="font-mono">
                        /webhooks/slack/interactions
                      </code>
                      ). Webhook-only mode uses signed URL buttons. Set{' '}
                      <code className="font-mono">QUE_APP_URL</code>,{' '}
                      <code className="font-mono">QUE_PUBLIC_API_URL</code>,{' '}
                      <code className="font-mono">SLACK_SIGNING_SECRET</code>.
                    </p>
                    <Toggle
                      label="Drift digest enabled"
                      hint="Summarize open high/warn drift to a webhook"
                      checked={draft.driftDigestEnabled !== false}
                      disabled={!canAdmin}
                      onChange={(v) =>
                        setDraft((d) =>
                          d ? { ...d, driftDigestEnabled: v } : d,
                        )
                      }
                    />
                    <Field
                      label="Drift digest webhook URL"
                      value={draft.driftDigestWebhookUrl ?? ''}
                      disabled={!canAdmin}
                      onChange={(v) =>
                        setDraft((d) =>
                          d ? { ...d, driftDigestWebhookUrl: v } : d,
                        )
                      }
                      placeholder="Falls back to join/drift alert URL if empty"
                    />
                    {canAdmin ? (
                      <div className="flex flex-wrap gap-sm pt-md">
                        <button
                          type="button"
                          disabled={!dirty || busy}
                          onClick={() => void save()}
                          className="rounded bg-secondary px-md py-2 font-label text-[12px] text-on-secondary disabled:opacity-40"
                        >
                          Save notify settings
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void sendJoinReviewTestNotify()
                              .then(() => setToast('Join review test notify sent'))
                              .catch((err) =>
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : String(err),
                                ),
                              )
                          }}
                          className="rounded-lg border border-outline-variant/40 px-md py-2 font-label text-[12px]"
                        >
                          Test join webhook
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void sendDriftDigestApi()
                              .then((r) =>
                                setToast(
                                  `Drift digest · open=${String(r.openCount ?? '—')}`,
                                ),
                              )
                              .catch((err) =>
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : String(err),
                                ),
                              )
                          }}
                          className="rounded-lg border border-outline-variant/40 px-md py-2 font-label text-[12px]"
                        >
                          Send drift digest now
                        </button>
                      </div>
                    ) : null}
                  </Section>
                  <p className="font-body text-[12px] text-on-surface-variant">
                    Domains live under{' '}
                    <Link
                      to="/settings/domains"
                      className="text-secondary hover:underline"
                    >
                      Settings → Domains
                    </Link>
                    . Job templates are on the Jobs page.
                  </p>
                </div>
                ) : null}

                {section === 'ai-policy' && showAdvanced ? (
                    <div className="space-y-[20px] pb-[24px]">
                      <Section
                        title="Workspace"
                        meta={`${data.workspace.name} · ${data.workspace.slug}`}
                      >
                        <div className="grid gap-md md:grid-cols-2">
                          <Info label="Name" value={data.workspace.name} />
                          <Info label="Slug" value={data.workspace.slug} />
                          <Info
                            label="Created"
                            value={new Date(
                              data.workspace.createdAt,
                            ).toLocaleString()}
                          />
                          <Info label="API base" value={getApiBase()} />
                        </div>
                      </Section>

                      <PolicyAndAiBlocks
                        data={data}
                        draft={draft}
                        setDraft={setDraft}
                        canAdmin={canAdmin}
                        canWrite={canWrite}
                        dirty={Boolean(dirty)}
                        busy={busy}
                        secretsBusy={secretsBusy}
                        inferring={inferring}
                        setInferring={setInferring}
                        setError={setError}
                        setToast={setToast}
                        openaiKeyDraft={openaiKeyDraft}
                        setOpenaiKeyDraft={setOpenaiKeyDraft}
                        anthropicKeyDraft={anthropicKeyDraft}
                        setAnthropicKeyDraft={setAnthropicKeyDraft}
                        save={save}
                        saveLlmSecrets={saveLlmSecrets}
                        reindexing={reindexing}
                        setReindexing={setReindexing}
                        setData={setData}
                      />
                    </div>
                ) : null}
              </>
            )}
          </main>

          {(section === 'billing' || section === 'members') && isDev ? (
          <div className="absolute right-0 bottom-0 left-0 z-40 border-t border-outline-variant/20 bg-background/95 p-lg md:px-lg lg:px-margin-desktop">
            <div className="flex flex-col justify-between gap-lg md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <div className="mb-xs flex items-center justify-between gap-sm">
                  <div className="flex items-center gap-sm">
                    <span className="font-label text-[12px] font-semibold text-on-surface">
                      Workspace Usage
                    </span>
                    <span className="rounded bg-secondary-container px-xs font-label text-[9px] text-on-secondary-container">
                      DEV
                    </span>
                  </div>
                  <span className="font-label text-[12px] text-on-surface-variant">
                    {usage
                      ? `${usage.inventory.connections}/${usage.againstLimits.connections.max} sources · ${usage.period.syncs} syncs · ${usage.period.exports} exports (${usage.period.days}d) · plan ${usage.plan.name}`
                      : data
                        ? `${data.stats.tables} tables · ${data.stats.connections} sources`
                        : '—'}
                  </span>
                </div>
                <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary-container">
                  <div
                    className="h-full rounded-full bg-secondary transition-all duration-1000 ease-out"
                    style={{ width: `${usagePct}%` }}
                  />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-md">
                <button
                  type="button"
                  className="px-md py-2 font-label text-[12px] text-on-surface-variant hover:text-on-surface"
                  onClick={() => navigate('/settings/billing')}
                >
                  Manage Billing
                </button>
              </div>
            </div>
          </div>
          ) : null}

      {inviteOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-[16px]">
          <div
            role="dialog"
            aria-label="Invite member"
            className="w-full max-w-[28rem] rounded-[8px] border border-solid border-[#424850] bg-[#0f1215] p-[24px] shadow-[0_16px_48px_rgba(0,0,0,0.45)]"
          >
            <h2 className="text-[16px] font-semibold text-[#d4dbe3]">
              Invite member
            </h2>
            <p className="mt-[6px] text-[13px] text-[#a3afbe]">
              They join this workspace on next login or SSO with that email.
            </p>
            <label className="mt-[16px] block">
              <span className="mb-[6px] block text-[11px] tracking-[0.3px] text-[#8a9099] uppercase">
                Email
              </span>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full rounded-[4px] border border-solid border-[#424850] bg-[#15191e] px-[12px] py-[10px] text-[13px] text-[#d4dbe3] outline-none focus:border-[#6b7380]"
                required
              />
            </label>
            <label className="mt-[16px] block">
              <span className="mb-[6px] block text-[11px] tracking-[0.3px] text-[#8a9099] uppercase">
                Role
              </span>
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as WorkspaceMemberRole)
                }
                className="w-full border border-outline-variant px-md py-sm font-body text-[13px]"
              >
                <option value="viewer">viewer — read only</option>
                <option value="member">member — sync, joins, jobs</option>
                <option value="admin">admin — connectors + invites</option>
                {role === 'owner' ? (
                  <option value="owner">owner — full control</option>
                ) : null}
              </select>
            </label>
            <div className="mt-lg flex justify-end gap-sm">
              <button
                type="button"
                className="px-md py-sm font-label text-[12px] text-on-surface-variant"
                onClick={() => setInviteOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={inviteBusy || !inviteEmail.trim()}
                className="rounded bg-secondary px-md py-sm font-label text-[12px] text-on-secondary disabled:opacity-40"
                onClick={() => {
                  void (async () => {
                    setInviteBusy(true)
                    try {
                      await createWorkspaceInvite(
                        inviteEmail.trim(),
                        inviteRole,
                      )
                      setInviteEmail('')
                      setInviteRole('member')
                      setInviteOpen(false)
                      await reloadMembers()
                      setToast('Invite sent — they join on next login')
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : String(err),
                      )
                    } finally {
                      setInviteBusy(false)
                    }
                  })()
                }}
              >
                {inviteBusy ? 'Sending…' : 'Send invite'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function SessionsSecurityPanel() {
  const [sessions, setSessions] = useState<
    { id: string; createdAt: string; expiresAt: string; current: boolean }[]
  >([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    try {
      setSessions(await fetchAuthSessions())
      setErr(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <section className={SETTINGS_PANEL}>
      <SettingsPanelHeader
        title="Active sessions"
        subtitle="Revoke stolen sessions. Current browser session is marked."
        actions={
          <PdfGhostButton
            type="button"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true)
                try {
                  await revokeOtherAuthSessions()
                  await load()
                } catch (e) {
                  setErr(e instanceof Error ? e.message : String(e))
                } finally {
                  setBusy(false)
                }
              })()
            }}
          >
            Revoke other sessions
          </PdfGhostButton>
        }
      />
      {err ? (
        <p className="mb-[12px] text-[12px] text-[#ff6b6b]">{err}</p>
      ) : null}
      <ul className="space-y-[8px]">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-[12px] rounded-[4px] bg-[#15191e] px-[14px] py-[10px] text-[12px]"
          >
            <span className="text-[#d4dbe3]">
              {new Date(s.createdAt).toLocaleString()}
              {s.current ? (
                <span className="ml-[8px] text-[10px] font-semibold tracking-[0.5px] text-[#7aecd0] uppercase">
                  current
                </span>
              ) : null}
            </span>
            {!s.current ? (
              <button
                type="button"
                className="text-[11px] text-[#ff6b6b] hover:underline"
                onClick={() => {
                  void (async () => {
                    try {
                      await revokeAuthSession(s.id)
                      await load()
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : String(e))
                    }
                  })()
                }}
              >
                Revoke
              </button>
            ) : (
              <span className="text-[#8a9099]">—</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

type SsoPublicConfig = {
  configured?: boolean
  status?: string
  issuer?: string | null
  requireInvite?: boolean
  allowedDomains?: string[]
  note?: string
  authorizePath?: string
}

function SsoStatusPanel() {
  const [sso, setSso] = useState<SsoPublicConfig | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${getApiBase()}/auth/sso`)
        const body = (await res.json()) as { sso?: SsoPublicConfig }
        if (!cancelled) setSso(body.sso || null)
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className={SETTINGS_PANEL}>
      <SettingsPanelHeader
        title="SSO"
        subtitle="Wave 1.2 — OIDC + PKCE. Production defaults to invite-required."
      />
      {err ? (
        <p className="font-body text-[12px] text-error">{err}</p>
      ) : !sso ? (
        <p className="font-body text-[13px] text-on-surface-variant">
          Loading SSO status…
        </p>
      ) : (
        <div className="grid gap-sm sm:grid-cols-2">
          <Info
            label="Status"
            value={sso.configured ? sso.status || 'ready' : 'not_configured'}
          />
          <Info
            label="Invite required"
            value={sso.requireInvite ? 'Yes' : 'No'}
          />
          <Info label="Issuer" value={sso.issuer || '—'} />
          <Info
            label="Allowed domains"
            value={
              sso.allowedDomains?.length
                ? sso.allowedDomains.join(', ')
                : 'Any (no allowlist)'
            }
          />
          {sso.note ? (
            <p className="sm:col-span-2 font-body text-[12px] text-on-surface-variant">
              {sso.note}
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}

function UsageCountersPanel({ usage }: { usage: WorkspaceUsage | null }) {
  if (!usage) {
    return (
      <section className={SETTINGS_PANEL}>
        <SettingsPanelHeader title="Usage" subtitle="Loading usage counters…" />
      </section>
    )
  }

  const rows: { key: string; label: string; used: number; max: number; pct: number; hint: string }[] =
    [
      {
        key: 'connections',
        label: 'Connectors',
        used: usage.againstLimits.connections.used,
        max: usage.againstLimits.connections.max,
        pct: usage.againstLimits.connections.pct,
        hint: 'Active data sources in this workspace',
      },
      {
        key: 'members',
        label: 'Members',
        used: usage.againstLimits.members.used,
        max: usage.againstLimits.members.max,
        pct: usage.againstLimits.members.pct,
        hint: 'Seats including owners',
      },
      {
        key: 'syncs',
        label: `Syncs (${usage.period.days}d)`,
        used: usage.againstLimits.syncs.used,
        max: usage.againstLimits.syncs.max,
        pct: usage.againstLimits.syncs.pct,
        hint: `${usage.period.syncFailures} failed in period`,
      },
      {
        key: 'exports',
        label: `Exports (${usage.period.days}d)`,
        used: usage.againstLimits.exports.used,
        max: usage.againstLimits.exports.max,
        pct: usage.againstLimits.exports.pct,
        hint: 'Attested job exports',
      },
    ]

  return (
    <section className={SETTINGS_PANEL}>
      <SettingsPanelHeader
        title="Usage"
        subtitle={`Wave 1.5 — billing precursor. Plan ${usage.plan.name} uses soft limits (not enforced yet).`}
        actions={<SettingsUsageBadge pct={usage.usagePct} />}
      />
      <div className="mb-[20px] grid gap-[16px] sm:grid-cols-2 lg:grid-cols-4">
        <SettingsMetric label="Tables" value={usage.inventory.tables} />
        <SettingsMetric label="Relations" value={usage.inventory.relationships} />
        <SettingsMetric label="Jobs" value={usage.inventory.jobs} />
        <SettingsMetric label="Promotes" value={usage.period.joinPromotes} />
      </div>
      <ul className="space-y-[16px]">
        {rows.map(({ key, ...row }) => (
          <SettingsProgressRow key={key} {...row} />
        ))}
      </ul>
      {usage.nearLimit.length ? (
        <p className="mt-[16px] rounded-[4px] border border-solid border-[rgba(122,236,208,0.25)] bg-[rgba(122,236,208,0.06)] px-[14px] py-[10px] text-[12px] text-[#d4dbe3]">
          Near soft limit: {usage.nearLimit.join(', ')}. Contact Que before
          enforcing hard caps in production billing.
        </p>
      ) : null}
    </section>
  )
}

function DriftAlertsPanel({ canAdmin }: { canAdmin: boolean }) {
  const [events, setEvents] = useState<DriftEvent[]>([])
  const [openHigh, setOpenHigh] = useState<DriftEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const data = await fetchDrift()
      setEvents(data.events || [])
      setOpenHigh(data.openHigh || [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <section className={SETTINGS_PANEL}>
      <SettingsPanelHeader
        title="Drift alerts"
        subtitle="Wave 2.3 — high drift blocks export until acknowledged; Slack/webhook notify on sync."
        actions={
          <div className="flex flex-wrap gap-[8px]">
            <PdfGhostButton
              type="button"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </PdfGhostButton>
            {canAdmin ? (
              <PdfGhostButton
                type="button"
                disabled={busyId === 'test'}
                onClick={() => {
                  void (async () => {
                    setBusyId('test')
                    setErr(null)
                    try {
                      const result = await sendDriftTestAlert()
                      setToast(
                        `Test alert ${result.notify.delivered ? 'delivered' : 'queued'} · ${result.notify.status || 'ok'}`,
                      )
                      await load()
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : String(e))
                    } finally {
                      setBusyId(null)
                    }
                  })()
                }}
              >
                Send test alert
              </PdfGhostButton>
            ) : null}
          </div>
        }
      />
      {err ? (
        <p className="mb-sm font-body text-[12px] text-error">{err}</p>
      ) : null}
      {toast ? (
        <p className="mb-sm font-body text-[12px] text-secondary">
          {toast}{' '}
          <button type="button" className="underline" onClick={() => setToast(null)}>
            dismiss
          </button>
        </p>
      ) : null}
      {openHigh.length > 0 ? (
        <p className="mb-md rounded-lg border border-error/30 bg-error/5 px-md py-sm font-body text-[12px] text-error">
          {openHigh.length} open high-severity event(s) — exports blocked until
          acknowledged.
        </p>
      ) : (
        <p className="mb-md font-body text-[12px] text-on-surface-variant">
          No open high-severity drift.
        </p>
      )}
      {events.length === 0 && !loading ? (
        <p className="font-body text-[13px] text-on-surface-variant">
          No drift events yet. Sync a source after schema change to populate.
        </p>
      ) : (
        <ul className="max-h-72 space-y-sm overflow-y-auto">
          {events.slice(0, 12).map((e) => (
            <li
              key={e.id}
              className="rounded-lg border border-outline-variant/20 bg-surface-container px-md py-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-sm">
                <div className="min-w-0">
                  <p className="font-label text-[11px] tracking-wider uppercase">
                    <span
                      className={
                        e.severity === 'high'
                          ? 'text-error'
                          : e.severity === 'warn'
                            ? 'text-[#8a5a00]'
                            : 'text-on-surface-variant'
                      }
                    >
                      {e.severity}
                    </span>
                    <span className="text-on-surface-variant"> · {e.code}</span>
                    {e.acknowledged ? (
                      <span className="text-tertiary"> · acked</span>
                    ) : null}
                  </p>
                  <p className="mt-1 font-body text-[12px] text-on-surface">
                    {e.summary}
                  </p>
                  <p className="mt-1 font-body text-[11px] text-on-surface-variant">
                    {new Date(e.createdAt).toLocaleString()}
                    {e.notifyStatus ? ` · notify ${e.notifyStatus}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-xs">
                  {!e.acknowledged && e.severity === 'high' ? (
                    <button
                      type="button"
                      disabled={busyId === e.id}
                      className="rounded-md border border-outline-variant/40 px-sm py-1 font-label text-[11px]"
                      onClick={() => {
                        void (async () => {
                          setBusyId(e.id)
                          try {
                            await acknowledgeDriftEvent(e.id)
                            await load()
                          } catch (err) {
                            setErr(
                              err instanceof Error ? err.message : String(err),
                            )
                          } finally {
                            setBusyId(null)
                          }
                        })()
                      }}
                    >
                      Ack
                    </button>
                  ) : null}
                  {canAdmin ? (
                    <button
                      type="button"
                      disabled={busyId === `n-${e.id}`}
                      className="rounded-md border border-secondary/40 px-sm py-1 font-label text-[11px] text-secondary"
                      onClick={() => {
                        void (async () => {
                          setBusyId(`n-${e.id}`)
                          try {
                            const r = await notifyDriftEvent(e.id)
                            setToast(
                              r.notify.delivered
                                ? `Alert delivered (${(r.notify.channels || []).join('+') || 'ok'})`
                                : `Alert ${r.notify.status || 'skipped'}`,
                            )
                            await load()
                          } catch (err) {
                            setErr(
                              err instanceof Error ? err.message : String(err),
                            )
                          } finally {
                            setBusyId(null)
                          }
                        })()
                      }}
                    >
                      Re-notify
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AuditLogPanel({ workspaceId }: { workspaceId: string | null }) {
  const [events, setEvents] = useState<WorkspaceAuditEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    if (!workspaceId) return
    setLoading(true)
    setErr(null)
    try {
      const list = await fetchWorkspaceAuditEvents({ limit: 40 }, workspaceId)
      setEvents(list)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  return (
    <section className={SETTINGS_PANEL}>
      <SettingsPanelHeader
        title="Audit log"
        subtitle="Wave 1.1 — sync, join promote/reject, exports, invites, roles, secrets."
        actions={
          <div className="flex gap-[8px]">
            <PdfGhostButton
              type="button"
              onClick={() => {
                void (async () => {
                  try {
                    const blob = await exportAuditCsv(workspaceId || undefined)
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'que-audit.csv'
                    a.click()
                    URL.revokeObjectURL(url)
                  } catch (e) {
                    setErr(e instanceof Error ? e.message : String(e))
                  }
                })()
              }}
            >
              Export CSV
            </PdfGhostButton>
            <PdfGhostButton
              type="button"
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </PdfGhostButton>
          </div>
        }
      />
      {err ? (
        <p className="mb-sm font-body text-[12px] text-error">{err}</p>
      ) : null}
      {events.length === 0 && !loading ? (
        <p className="font-body text-[13px] text-on-surface-variant">
          No audit events yet. Sync a source, promote a join, or invite a member
          to populate this log.
        </p>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-outline-variant/15">
                <th className="px-sm py-sm font-label text-[11px] tracking-wider text-on-surface-variant/60 uppercase">
                  When
                </th>
                <th className="px-sm py-sm font-label text-[11px] tracking-wider text-on-surface-variant/60 uppercase">
                  Action
                </th>
                <th className="px-sm py-sm font-label text-[11px] tracking-wider text-on-surface-variant/60 uppercase">
                  Actor
                </th>
                <th className="px-sm py-sm font-label text-[11px] tracking-wider text-on-surface-variant/60 uppercase">
                  Summary
                </th>
              </tr>
            </thead>
            <tbody className="font-body text-[12px] text-on-surface">
              {events.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-outline-variant/5 hover:bg-surface-container-low"
                >
                  <td className="whitespace-nowrap px-sm py-sm text-on-surface-variant">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-sm py-sm font-label text-[11px] text-secondary">
                    {e.action}
                  </td>
                  <td className="px-sm py-sm text-on-surface-variant">
                    {e.actor?.displayName || e.actor?.email || '—'}
                  </td>
                  <td className="px-sm py-sm">{e.summary || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function KeyRow({ name, hint }: { name: string; hint: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-outline-variant/10 bg-canvas p-sm">
      <div>
        <p className="font-label text-[12px]">{name}</p>
        <p className="font-label text-[11px] text-on-surface-variant/60">{hint}</p>
      </div>
      <button
        type="button"
        className="font-label text-[11px] text-on-surface-variant hover:text-secondary"
        onClick={() => void navigator.clipboard.writeText(hint)}
        title="Copy hint"
      >
        Copy
      </button>
    </div>
  )
}

function EnvRow({ keyName, value }: { keyName: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-outline-variant/5 py-xs last:border-0">
      <span className="rounded bg-secondary/10 px-xs font-label text-[12px] text-secondary">
        {keyName}
      </span>
      <span className="max-w-[55%] truncate text-xs text-on-surface-variant">
        {value}
      </span>
    </div>
  )
}

function maskMiddle(s: string) {
  if (s.length <= 12) return '••••••••••••'
  return `${s.slice(0, 8)}••••${s.slice(-4)}`
}


function PolicyAndAiBlocks({
  data,
  draft,
  setDraft,
  canAdmin,
  canWrite,
  dirty,
  busy,
  secretsBusy,
  inferring,
  setInferring,
  setError,
  setToast,
  openaiKeyDraft,
  setOpenaiKeyDraft,
  anthropicKeyDraft,
  setAnthropicKeyDraft,
  save,
  saveLlmSecrets,
  reindexing,
  setReindexing,
  setData,
}: {
  data: WorkspaceSettingsPayload
  draft: WorkspaceSettingsFlags
  setDraft: Dispatch<SetStateAction<WorkspaceSettingsFlags | null>>
  canAdmin: boolean
  canWrite: boolean
  dirty: boolean
  busy: boolean
  secretsBusy: boolean
  inferring: boolean
  setInferring: (v: boolean) => void
  setError: (v: string | null) => void
  setToast: (v: string | null) => void
  openaiKeyDraft: string
  setOpenaiKeyDraft: (v: string) => void
  anthropicKeyDraft: string
  setAnthropicKeyDraft: (v: string) => void
  save: () => Promise<void>
  saveLlmSecrets: (patch: {
    openaiApiKey?: string | null
    anthropicApiKey?: string | null
    githubToken?: string | null
  }) => Promise<void>
  reindexing: boolean
  setReindexing: (v: boolean) => void
  setData: (v: WorkspaceSettingsPayload) => void
}) {
  return (
    <>
<Section title="POLICY_FLAGS" meta="APPLIED ON SYNC / CHAT">
  {!canAdmin ? (
    <p className="mb-md font-label text-[11px] tracking-widest text-on-surface-variant">
      READ-ONLY · REQUIRES ADMIN+
    </p>
  ) : null}
  <Toggle
    label="Include column samples on sync"
    hint="Off by default for schema-only. If on, samples are tokenized before storage."
    checked={draft.includeSamplesDefault}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) =>
        d ? { ...d, includeSamplesDefault: v } : d,
      )
    }
  />
  <Toggle
    label="Scrub / tokenize samples"
    hint="Hash emails, UUIDs, and free-text samples before metadata DB"
    checked={draft.scrubSamples !== false}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, scrubSamples: v } : d))
    }
  />
  <Toggle
    label="AI may use pinned scrubbed samples"
    hint="Default ON — chat/agent sees frozen 5–10 row grids only (never the lake)"
    checked={draft.aiMayUsePinnedSamples !== false}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, aiMayUsePinnedSamples: v } : d))
    }
  />
  <label className="mb-md block font-label text-[12px] text-on-surface-variant">
    Pinned sample rows (5–10)
    <input
      type="number"
      min={5}
      max={10}
      value={draft.pinnedSampleRows ?? 10}
      disabled={!canAdmin}
      onChange={(e) =>
        setDraft((d) =>
          d
            ? {
                ...d,
                pinnedSampleRows: Math.min(
                  10,
                  Math.max(5, Number(e.target.value) || 10),
                ),
              }
            : d,
        )
      }
      className="mt-1 w-24 rounded-lg border border-outline-variant/40 px-md py-1.5 font-body text-[13px] text-on-surface"
    />
  </label>
  <Toggle
    label="Enable Que Managed Data Plane (Offer B)"
    hint="Host job outputs for Excel/SQL customers — AI never reads row payloads"
    checked={draft.enableManagedDataPlane === true}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, enableManagedDataPlane: v } : d))
    }
  />
  <label className="mb-md block font-label text-[12px] text-on-surface-variant">
    Default execution plane
    <select
      value={draft.defaultExecutionPlane ?? 'customer'}
      disabled={!canAdmin}
      onChange={(e) => {
        const plane = e.target.value as 'customer' | 'managed' | 'que'
        setDraft((d) => (d ? { ...d, defaultExecutionPlane: plane } : d))
      }}
      className="mt-1 block w-full max-w-xs rounded-lg border border-outline-variant/40 px-md py-2 font-body text-[13px] text-on-surface"
    >
      <option value="customer">Customer warehouse (Offer A)</option>
      <option value="managed">Que managed plane (Offer B)</option>
      <option value="que">Que runner only</option>
    </select>
  </label>
  <div className="mb-md grid max-w-xl gap-sm sm:grid-cols-3">
    <label className="block font-label text-[12px] text-on-surface-variant">
      Max datasets
      <input
        type="number"
        min={1}
        max={200}
        value={draft.managedMaxDatasets ?? 25}
        disabled={!canAdmin}
        onChange={(e) =>
          setDraft((d) =>
            d
              ? {
                  ...d,
                  managedMaxDatasets: Math.min(
                    200,
                    Math.max(1, Number(e.target.value) || 25),
                  ),
                }
              : d,
          )
        }
        className="mt-1 w-full rounded-lg border border-outline-variant/40 px-md py-1.5 font-body text-[13px] text-on-surface"
      />
    </label>
    <label className="block font-label text-[12px] text-on-surface-variant">
      Max rows / dataset
      <input
        type="number"
        min={100}
        max={100000}
        value={draft.managedMaxRowsPerDataset ?? 50000}
        disabled={!canAdmin}
        onChange={(e) =>
          setDraft((d) =>
            d
              ? {
                  ...d,
                  managedMaxRowsPerDataset: Math.min(
                    100000,
                    Math.max(100, Number(e.target.value) || 50000),
                  ),
                }
              : d,
          )
        }
        className="mt-1 w-full rounded-lg border border-outline-variant/40 px-md py-1.5 font-body text-[13px] text-on-surface"
      />
    </label>
    <label className="block font-label text-[12px] text-on-surface-variant">
      Retention days
      <input
        type="number"
        min={1}
        max={365}
        value={draft.managedRetentionDays ?? 90}
        disabled={!canAdmin}
        onChange={(e) =>
          setDraft((d) =>
            d
              ? {
                  ...d,
                  managedRetentionDays: Math.min(
                    365,
                    Math.max(1, Number(e.target.value) || 90),
                  ),
                }
              : d,
          )
        }
        className="mt-1 w-full rounded-lg border border-outline-variant/40 px-md py-1.5 font-body text-[13px] text-on-surface"
      />
    </label>
  </div>
  <Toggle
    label="Infer cross-source joins on sync"
    hint="Creates suggested edges for review (Promote / Reject)"
    checked={draft.inferJoinsOnSync}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, inferJoinsOnSync: v } : d))
    }
  />
  <Toggle
    label="Databricks query-history join assist"
    hint="On live DBX sync, parse recent SQL JOINs into suggested edges"
    checked={draft.databricksQueryJoinAssist !== false}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, databricksQueryJoinAssist: v } : d))
    }
  />
  <Toggle
    label="Snowflake query-history join assist"
    hint="On live Snowflake sync, mine ACCOUNT_USAGE QUERY_HISTORY for JOINs"
    checked={draft.snowflakeQueryJoinAssist !== false}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, snowflakeQueryJoinAssist: v } : d))
    }
  />
  <Toggle
    label="Enable Stitch Agent"
    hint="Activates /agent in Assistant — NL plan → tools → checkpoint → Promote → draft job"
    checked={draft.enableStitchAgent === true}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, enableStitchAgent: v } : d))
    }
  />
  <Toggle
    label="Auto-promote low-risk joins"
    hint="CEO P0 — Green tier only, after golden-set recall ≥ gate. Default off (HITL)."
    checked={draft.enableAutoPromoteLowRisk === true}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, enableAutoPromoteLowRisk: v } : d))
    }
  />
  <label className="block text-[12px] text-on-surface-variant">
    Auto-Promote min golden recall (0–1)
    <input
      type="number"
      min={0}
      max={1}
      step={0.01}
      className="mt-xs w-full rounded-lg border border-outline-variant/40 bg-surface px-sm py-sm text-[13px]"
      disabled={!canAdmin}
      value={draft.autoPromoteMinRecall ?? 0.9}
      onChange={(e) =>
        setDraft((d) =>
          d
            ? {
                ...d,
                autoPromoteMinRecall: Number(e.target.value),
              }
            : d,
        )
      }
    />
  </label>
  <label className="block text-[12px] text-on-surface-variant">
    Yellow Promote min role
    <select
      className="mt-xs w-full rounded-lg border border-outline-variant/40 bg-surface px-sm py-sm text-[13px]"
      disabled={!canAdmin}
      value={draft.yellowPromoteMinRole ?? 'member'}
      onChange={(e) =>
        setDraft((d) =>
          d
            ? {
                ...d,
                yellowPromoteMinRole: e.target
                  .value as WorkspaceSettingsFlags['yellowPromoteMinRole'],
              }
            : d,
        )
      }
    >
      <option value="member">member</option>
      <option value="admin">admin</option>
      <option value="owner">owner</option>
    </select>
  </label>
  <label className="block text-[12px] text-on-surface-variant">
    Red Promote min role
    <select
      className="mt-xs w-full rounded-lg border border-outline-variant/40 bg-surface px-sm py-sm text-[13px]"
      disabled={!canAdmin}
      value={draft.redPromoteMinRole ?? 'admin'}
      onChange={(e) =>
        setDraft((d) =>
          d
            ? {
                ...d,
                redPromoteMinRole: e.target
                  .value as WorkspaceSettingsFlags['redPromoteMinRole'],
              }
            : d,
        )
      }
    >
      <option value="member">member</option>
      <option value="admin">admin</option>
      <option value="owner">owner</option>
    </select>
  </label>
  <Toggle
    label="Enable catalog governance"
    hint="Phase 4 — Catalog, Glossary, Steward pages (optional Atlan-style expansion)"
    checked={draft.enableCatalogGovernance === true}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, enableCatalogGovernance: v } : d))
    }
  />
  <Toggle
    label="Steward UX mode"
    hint="Prefer steward-oriented defaults (certify queues, glossary) without removing DE tools"
    checked={draft.stewardUxMode === true}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, stewardUxMode: v } : d))
    }
  />
  <label className="mt-md block max-w-xl">
    <span className="mb-xs block font-label text-[11px] uppercase tracking-widest text-on-surface-variant">
      Governance ticket webhook (Jira / ServiceNow / generic)
    </span>
    <input
      value={draft.ticketWebhookUrl ?? ''}
      disabled={!canAdmin}
      onChange={(e) =>
        setDraft((d) =>
          d ? { ...d, ticketWebhookUrl: e.target.value } : d,
        )
      }
      placeholder="https://hooks.example/que-tickets"
      className="w-full rounded-lg border border-outline-variant/40 px-md py-sm font-body text-[13px]"
    />
  </label>
  <Toggle
    label="Enable live validate"
    hint="Allow Jobs → Validate (read-only ~20 rows from sources)"
    checked={draft.enableLiveValidate !== false}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, enableLiveValidate: v } : d))
    }
  />
  <Toggle
    label="Enable materialize"
    hint="Allow Jobs → Deploy → create VIEW/table in customer warehouse"
    checked={draft.enableMaterialize !== false}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, enableMaterialize: v } : d))
    }
  />
  <Toggle
    label="Prefer LLM for AI chat"
    hint={
      data.capabilities.llm.openaiConfigured ||
      data.capabilities.llm.anthropicConfigured
        ? `Uses RAG + key from ${
            data.capabilities.secrets?.openai?.source ===
              'workspace' ||
            data.capabilities.secrets?.anthropic?.source ===
              'workspace'
              ? 'workspace BYOK'
              : 'server env'
          }`
        : 'No LLM key — add BYOK below or set OPENAI_API_KEY / ANTHROPIC_API_KEY on the API'
    }
    checked={draft.preferLlmChat}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, preferLlmChat: v } : d))
    }
  />
  <Toggle
    label="Include Que product docs in RAG"
    hint="Strategic + technical HTML docs indexed as global vector chunks"
    checked={draft.ragIncludeDocs}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, ragIncludeDocs: v } : d))
    }
  />
  <Toggle
    label="Block export on high drift / broken contract"
    hint="Export returns 409 until drift is acknowledged or contract is re-frozen"
    checked={draft.blockExportOnDrift}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, blockExportOnDrift: v } : d))
    }
  />
  <Toggle
    label="Block dbt PR on column-level drift"
    hint="Stops Open dbt PR when column/type drift touches job tables"
    checked={draft.blockPrOnColumnDrift !== false}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, blockPrOnColumnDrift: v } : d))
    }
  />
  <Toggle
    label="Block export on unreviewed suggested joins"
    hint="Promote or reject suggested joins that touch job tables before export"
    checked={draft.blockExportOnUnreviewedJoins}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) =>
        d ? { ...d, blockExportOnUnreviewedJoins: v } : d,
      )
    }
  />
  <Toggle
    label="Emit contract events (outbox + webhook)"
    hint="Streaming-later adapter: freeze/export/drift → outbox for Kafka/Flink consumers"
    checked={draft.emitContractEvents}
    disabled={!canAdmin}
    onChange={(v) =>
      setDraft((d) => (d ? { ...d, emitContractEvents: v } : d))
    }
  />
  <div className="flex flex-wrap items-center justify-between gap-sm border border-outline-variant bg-surface-container-low px-md py-sm mt-md">
    <div>
      <p className="font-label text-[11px] tracking-widest text-on-surface">
        JOIN INFERENCE
      </p>
      <p className="mt-xs font-body text-[12px] text-on-surface-variant">
        Re-score cross-source joins from metadata (no full sync). Uses
        promote/reject memory.
      </p>
    </div>
    <button
      type="button"
      disabled={!canWrite || inferring}
      onClick={() => {
        setInferring(true)
        setError(null)
        void runJoinInference()
          .then((r) => {
            setToast(
              `Join inference: ${r.created} new suggestion(s) · scanned ${r.scanned} · ${r.durationMs}ms`,
            )
          })
          .catch((err) =>
            setError(
              err instanceof Error ? err.message : String(err),
            ),
          )
          .finally(() => setInferring(false))
      }}
      className="border border-outline-variant bg-surface-container px-md py-sm font-label text-[11px] font-bold tracking-[0.14em] text-secondary uppercase transition-colors hover:border-secondary-fixed disabled:opacity-40"
    >
      {inferring ? 'RUNNING…' : 'RE-RUN JOIN INFERENCE'}
    </button>
  </div>
  <div className="pt-md">
    <Field
      label="Contract webhook URL"
      value={draft.contractWebhookUrl ?? ''}
      disabled={!canAdmin}
      onChange={(v) =>
        setDraft((d) =>
          d ? { ...d, contractWebhookUrl: v } : d,
        )
      }
      placeholder="https://hooks.example.com/que-contracts"
    />
  </div>
  <div className="space-y-md border-t border-outline-variant/20 pt-md">
    <p className="font-label text-[11px] tracking-widest text-on-surface-variant">
      DRIFT ALERTS (WAVE 2.3)
    </p>
    <Toggle
      label="Enable drift alerts"
      hint="Slack/webhook + email list when sync detects risk"
      checked={draft.driftAlertsEnabled !== false}
      disabled={!canAdmin}
      onChange={(v) =>
        setDraft((d) => (d ? { ...d, driftAlertsEnabled: v } : d))
      }
    />
    <Toggle
      label="High severity only"
      hint="Skip info/warn — alert on broken joins / removed tables"
      checked={draft.driftAlertOnHigh !== false}
      disabled={!canAdmin}
      onChange={(v) =>
        setDraft((d) => (d ? { ...d, driftAlertOnHigh: v } : d))
      }
    />
    <Field
      label="Drift alert webhook (Slack or generic)"
      value={draft.driftAlertWebhookUrl ?? ''}
      disabled={!canAdmin}
      onChange={(v) =>
        setDraft((d) => (d ? { ...d, driftAlertWebhookUrl: v } : d))
      }
      placeholder="https://hooks.slack.com/services/…"
    />
    <Field
      label="Alert emails (comma-separated)"
      value={draft.driftAlertEmails ?? ''}
      disabled={!canAdmin}
      onChange={(v) =>
        setDraft((d) => (d ? { ...d, driftAlertEmails: v } : d))
      }
      placeholder="ops@acme.com, data@acme.com"
    />
    <p className="font-body text-[11px] text-on-surface-variant">
      Emails need <code className="font-label">QUE_DRIFT_EMAIL_WEBHOOK</code>{' '}
      (Zapier/Make/SMTP bridge). Without it, addresses are logged + included on
      webhook payloads.
    </p>
  </div>
  <div className="grid gap-md pt-md md:grid-cols-2">
    <label className="block">
      <span className="font-label text-[11px] tracking-widest text-on-surface-variant">
        DEFAULT MODEL
      </span>
      <select
        value={draft.aiModelId}
        disabled={!canAdmin}
        onChange={(e) =>
          setDraft((d) =>
            d ? { ...d, aiModelId: e.target.value } : d,
          )
        }
        className="mt-xs w-full border border-outline-variant bg-surface-container px-sm py-sm font-body text-[13px] text-on-surface outline-none focus:border-secondary disabled:opacity-40"
      >
        {(data.capabilities.ai?.models?.length
          ? data.capabilities.ai.models
          : [
              {
                id: 'gpt-4o-mini',
                label: 'GPT-4o mini (needs key)',
              },
            ]
        ).map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
    <label className="block">
      <span className="font-label text-[11px] tracking-widest text-on-surface-variant">
        RAG TOP-K
      </span>
      <input
        type="number"
        min={1}
        max={32}
        value={draft.ragTopK}
        disabled={!canAdmin}
        onChange={(e) =>
          setDraft((d) =>
            d
              ? {
                  ...d,
                  ragTopK: Number(e.target.value) || 8,
                }
              : d,
          )
        }
        className="mt-xs w-full border border-outline-variant bg-surface-container px-sm py-sm font-body text-[13px] text-on-surface outline-none focus:border-secondary disabled:opacity-40"
      />
    </label>
  </div>
  {canAdmin ? (
    <div className="flex justify-end gap-sm pt-md">
      <button
        type="button"
        disabled={!dirty || busy}
        onClick={() =>
          setDraft({
            includeSamplesDefault:
              data.settings.includeSamplesDefault,
            scrubSamples: data.settings.scrubSamples !== false,
            inferJoinsOnSync: data.settings.inferJoinsOnSync,
            preferLlmChat: data.settings.preferLlmChat,
            aiModelId: data.settings.aiModelId ?? 'gpt-4o-mini',
            ragTopK: data.settings.ragTopK ?? 8,
            ragIncludeDocs:
              data.settings.ragIncludeDocs !== false,
            blockExportOnDrift:
              data.settings.blockExportOnDrift !== false,
            blockPrOnColumnDrift:
              data.settings.blockPrOnColumnDrift !== false,
            blockExportOnUnreviewedJoins:
              data.settings.blockExportOnUnreviewedJoins === true,
            databricksQueryJoinAssist:
              data.settings.databricksQueryJoinAssist !== false,
            emitContractEvents:
              data.settings.emitContractEvents !== false,
            contractWebhookUrl:
              data.settings.contractWebhookUrl ?? '',
            driftAlertsEnabled:
              data.settings.driftAlertsEnabled !== false,
            driftAlertOnHigh: data.settings.driftAlertOnHigh !== false,
            driftAlertWebhookUrl:
              data.settings.driftAlertWebhookUrl ?? '',
            driftAlertEmails: data.settings.driftAlertEmails ?? '',
            githubOwner: data.settings.githubOwner ?? '',
            githubRepo: data.settings.githubRepo ?? '',
            githubBaseBranch:
              data.settings.githubBaseBranch ?? 'main',
            dbtModelsPath:
              data.settings.dbtModelsPath ?? 'models/que',
          })
        }
        className="border border-outline-variant px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-surface-variant disabled:opacity-40"
      >
        RESET
      </button>
      <button
        type="button"
        disabled={!dirty || busy}
        onClick={() => void save()}
        className="bg-secondary px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-secondary-fixed disabled:opacity-40"
      >
        SAVE
      </button>
    </div>
  ) : null}
</Section>

<Section
  title="BYOK_LLM_KEYS"
  meta="YOUR KEY · YOUR BILL · ENCRYPTED AT REST"
>
  <p className="mb-md font-body text-[12px] text-on-surface-variant">
    Bring your own OpenAI / Anthropic key for this workspace.
    Que still proxies calls server-side with schema-only prompts —
    plaintext is never returned to the browser. Env keys remain a
    demo/ops fallback when no workspace key is set.
  </p>
  {!canAdmin ? (
    <p className="mb-md font-label text-[11px] tracking-widest text-on-surface-variant">
      READ-ONLY · REQUIRES ADMIN+
    </p>
  ) : null}
  <div className="grid gap-md md:grid-cols-2">
    <SecretKeyField
      label="OpenAI API key"
      status={data.capabilities.secrets?.openai}
      value={openaiKeyDraft}
      disabled={!canAdmin || secretsBusy}
      onChange={setOpenaiKeyDraft}
      onSave={() =>
        void saveLlmSecrets({ openaiApiKey: openaiKeyDraft })
      }
      onClear={() =>
        void saveLlmSecrets({ openaiApiKey: null })
      }
    />
    <SecretKeyField
      label="Anthropic API key"
      status={data.capabilities.secrets?.anthropic}
      value={anthropicKeyDraft}
      disabled={!canAdmin || secretsBusy}
      onChange={setAnthropicKeyDraft}
      onSave={() =>
        void saveLlmSecrets({
          anthropicApiKey: anthropicKeyDraft,
        })
      }
      onClear={() =>
        void saveLlmSecrets({ anthropicApiKey: null })
      }
    />
  </div>
  {data.capabilities.secrets?.note ? (
    <p className="mt-md font-body text-[11px] text-on-surface-variant">
      {data.capabilities.secrets.note}
    </p>
  ) : null}
</Section>

<Section title="AI_STACK" meta="RAG · VECTORS · FEEDBACK · PILLARS">
  <div className="grid gap-sm md:grid-cols-2">
    <Info
      label="Vector DB"
      value={
        data.capabilities.ai?.vectorReady
          ? 'pgvector ready'
          : 'not ready — apply 007 + pgvector image'
      }
    />
    <Info
      label="Embeddings"
      value={data.capabilities.ai?.embeddingMode || '—'}
    />
    <Info
      label="Workspace chunks"
      value={String(
        data.capabilities.ai?.chunkStats?.workspaceChunks ?? 0,
      )}
    />
    <Info
      label="Doc chunks"
      value={String(
        data.capabilities.ai?.chunkStats?.docChunks ?? 0,
      )}
    />
    <Info
      label="Feedback"
      value={`+${data.capabilities.ai?.feedback?.up ?? 0} / -${data.capabilities.ai?.feedback?.down ?? 0}`}
    />
    <Info
      label="OpenAI / Anthropic"
      value={`${
        data.capabilities.llm.openaiConfigured
          ? `OpenAI (${data.capabilities.llm.openaiSource || data.capabilities.secrets?.openai?.source || '?'})`
          : '—'
      } · ${
        data.capabilities.llm.anthropicConfigured
          ? `Anthropic (${data.capabilities.llm.anthropicSource || data.capabilities.secrets?.anthropic?.source || '?'})`
          : '—'
      }`}
    />
  </div>
  <p className="mt-md font-body text-[12px] text-on-surface-variant">
    Que implements NLP chat, RAG retrieval, generative inference
    via cloud APIs, agentic slash skills, join recommendations,
    limited memory, and a feedback loop. Computer vision and
    custom foundation-model training are out of product scope.
  </p>
  <div className="mt-md flex flex-wrap gap-xs">
    {Object.entries(data.capabilities.ai?.pillars || {}).map(
      ([k, v]) => (
        <span
          key={k}
          className={`border px-sm py-xs font-label text-[9px] tracking-wider ${
            v
              ? 'border-secondary/40 text-secondary'
              : 'border-outline-variant text-on-surface-variant/50'
          }`}
        >
          {k} · {v ? 'ON' : 'N/A'}
        </span>
      ),
    )}
  </div>
  <div className="mt-md flex justify-end">
      <button
        type="button"
        disabled={reindexing}
        onClick={() => {
          setReindexing(true)
          void reindexAi({ docs: true })
            .then(async () => {
              setToast('AI index rebuilt (schema + docs)')
              const payload = await fetchWorkspaceSettings()
              setData(payload)
            })
            .catch((err) =>
              setError(
                err instanceof Error ? err.message : String(err),
              ),
            )
            .finally(() => setReindexing(false))
        }}
        className="bg-secondary px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-secondary-fixed disabled:opacity-40"
      >
        {reindexing ? 'REINDEXING…' : 'REINDEX SCHEMA + DOCS'}
      </button>
    </div>
</Section>

<Section
  title="DBT_GITHUB_EXPORT"
  meta="ADDITIVE LAYER · NO SECRETS HERE"
>
  <p className="mb-md font-body text-[12px] text-on-surface-variant">
    Optional defaults for Jobs → dbt / GitHub PR export. Prefer a{' '}
    <strong>workspace GitHub token</strong> (below); falls back to API env{' '}
    <code className="text-secondary">GITHUB_TOKEN</code>. JSON/SQL
    exports are unchanged.
  </p>
  {!canAdmin ? (
    <p className="mb-md font-label text-[11px] tracking-widest text-on-surface-variant">
      READ-ONLY · REQUIRES ADMIN+
    </p>
  ) : null}
  <div className="grid gap-md md:grid-cols-2">
    <Field
      label="GitHub owner"
      value={draft.githubOwner ?? ''}
      disabled={!canAdmin}
      onChange={(v) =>
        setDraft((d) => (d ? { ...d, githubOwner: v } : d))
      }
      placeholder="acme-corp"
    />
    <Field
      label="GitHub repo"
      value={draft.githubRepo ?? ''}
      disabled={!canAdmin}
      onChange={(v) =>
        setDraft((d) => (d ? { ...d, githubRepo: v } : d))
      }
      placeholder="analytics-dbt"
    />
    <Field
      label="Base branch"
      value={draft.githubBaseBranch ?? 'main'}
      disabled={!canAdmin}
      onChange={(v) =>
        setDraft((d) => (d ? { ...d, githubBaseBranch: v } : d))
      }
      placeholder="main"
    />
    <Field
      label="Allowed deploy branches"
      value={draft.githubAllowedBranches ?? 'main'}
      disabled={!canAdmin}
      onChange={(v) =>
        setDraft((d) => (d ? { ...d, githubAllowedBranches: v } : d))
      }
      placeholder="main, develop"
    />
    <Field
      label="dbt models path"
      value={draft.dbtModelsPath ?? 'models/que'}
      disabled={!canAdmin}
      onChange={(v) =>
        setDraft((d) => (d ? { ...d, dbtModelsPath: v } : d))
      }
      placeholder="models/que"
    />
  </div>
  <label className="mt-md block max-w-sm">
    <span className="mb-xs block font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
      Min role to open PR to base branch
    </span>
    <select
      disabled={!canAdmin}
      value={draft.githubPrMinRole ?? 'member'}
      onChange={(e) =>
        setDraft((d) =>
          d
            ? {
                ...d,
                githubPrMinRole: e.target.value as
                  | 'member'
                  | 'admin'
                  | 'owner',
              }
            : d,
        )
      }
      className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-sm py-2 font-body text-[13px]"
    >
      <option value="member">member+</option>
      <option value="admin">admin+</option>
      <option value="owner">owner only</option>
    </select>
  </label>
  <p className="mt-md font-body text-[12px] text-on-surface-variant">
    GitHub token:{' '}
    <Flag on={Boolean(data.capabilities.github?.tokenConfigured)} />
    {data.capabilities.github?.tokenSource
      ? ` (${data.capabilities.github.tokenSource})`
      : ''}
    {' · '}
    dbt export layer:{' '}
    <Flag on={Boolean(data.capabilities.github?.dbtExport)} />
  </p>
  {canAdmin ? (
    <div className="mt-md space-y-sm">
      <label className="block font-label text-[11px] tracking-widest text-on-surface-variant uppercase">
        Workspace GitHub token (preferred over env)
        <input
          type="password"
          className="mt-1 w-full rounded-lg border border-outline-variant/30 bg-surface-container-low px-sm py-2 font-body text-[13px]"
          placeholder="ghp_… leave blank to keep"
          id="que-github-token"
        />
      </label>
      <button
        type="button"
        disabled={secretsBusy}
        onClick={() => {
          const el = document.getElementById(
            'que-github-token',
          ) as HTMLInputElement | null
          const v = el?.value?.trim()
          if (v) void saveLlmSecrets({ githubToken: v })
        }}
        className="rounded-lg border border-outline-variant px-md py-sm font-label text-[11px] disabled:opacity-40"
      >
        Save GitHub token
      </button>
    </div>
  ) : null}
  {canAdmin ? (
    <div className="flex justify-end gap-sm pt-md">
      <button
        type="button"
        disabled={!dirty || busy}
        onClick={() => void save()}
        className="bg-secondary px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-secondary-fixed disabled:opacity-40"
      >
        SAVE
      </button>
    </div>
  ) : null}
</Section>

<Section title="CAPABILITIES" meta="READ-ONLY">
  <div className="space-y-sm">
    <p className="font-body text-[12px] text-on-surface-variant">
      Connectors:{' '}
      <span className="text-on-surface">
        {data.capabilities.connectors.join(' · ')}
      </span>
    </p>
    <p className="font-body text-[12px] text-on-surface-variant">
      OpenAI:{' '}
      <Flag on={data.capabilities.llm.openaiConfigured} />
      {' · '}
      Anthropic:{' '}
      <Flag on={data.capabilities.llm.anthropicConfigured} />
    </p>
    {data.latestSnapshot ? (
      <p className="font-body text-[12px] text-on-surface-variant">
        Latest snapshot:{' '}
        <span className="text-secondary">
          {data.latestSnapshot.label}
        </span>{' '}
        (
        {new Date(
          data.latestSnapshot.createdAt,
        ).toLocaleString()}
        )
      </p>
    ) : (
      <p className="font-body text-[12px] text-on-surface-variant">
        No schema snapshots yet — sync a source to create one.
      </p>
    )}
  </div>
</Section>

<Section title="ABOUT_QUE" meta={data.capabilities.brand}>
  <p className="font-body text-[13px] text-on-surface">
    {data.capabilities.wedge}
  </p>
  <p className="mt-sm font-body text-[12px] text-on-surface-variant">
    AI and sync paths use schema metadata only. Raw warehouse
    rows are never centralized into Que.
  </p>
  <div className="mt-md flex flex-wrap gap-sm">
    <Link
      to="/workspace"
      className="border border-secondary px-md py-sm font-label text-[11px] font-bold tracking-widest text-secondary"
    >
      WORKSPACE
    </Link>
    <Link
      to="/sources"
      className="border border-outline-variant px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-surface-variant hover:border-secondary-fixed"
    >
      SOURCES
    </Link>
    <Link
      to="/chat"
      className="border border-outline-variant px-md py-sm font-label text-[11px] font-bold tracking-widest text-on-surface-variant hover:border-secondary-fixed"
    >
      AI CHAT
    </Link>
  </div>
</Section>
    </>
  )
}

function Section({
  title,
  meta,
  children,
}: {
  title: string
  meta?: string
  children: ReactNode
}) {
  return (
    <section className={SETTINGS_PANEL}>
      <div className="mb-[16px] flex items-center justify-between gap-[12px] border-b border-solid border-[#424850] pb-[12px]">
        <span className="text-[11px] font-bold tracking-[0.5px] text-[#7aecd0] uppercase">
          {title}
        </span>
        {meta ? (
          <span className="text-[11px] tracking-[0.3px] text-[#8a9099]">
            {meta}
          </span>
        ) : null}
      </div>
      <div>{children}</div>
    </section>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.3px] text-[#8a9099] uppercase">
        {label}
      </p>
      <p className="mt-[4px] break-all text-[12px] text-[#d4dbe3]">{value}</p>
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={[
        'mb-[16px] flex items-start justify-between gap-[16px] border-b border-solid border-[#424850] pb-[16px] last:mb-0 last:border-0 last:pb-0',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
      ].join(' ')}
    >
      <span>
        <span className="block text-[13px] text-[#d4dbe3]">{label}</span>
        <span className="mt-[4px] block text-[12px] text-[#a3afbe]">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'mt-[2px] h-[22px] w-[40px] shrink-0 rounded-full border border-solid transition-colors disabled:opacity-50',
          checked
            ? 'border-[#7aecd0] bg-[#7aecd0]'
            : 'border-[#424850] bg-[#252a30]',
        ].join(' ')}
      >
        <span
          className={[
            'mt-[2px] block size-[16px] rounded-full transition-transform',
            checked
              ? 'translate-x-[20px] bg-[#0f1215]'
              : 'translate-x-[2px] bg-[#8a9099]',
          ].join(' ')}
        />
      </button>
    </label>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <label className="block">
      <span className="text-[11px] tracking-[0.3px] text-[#8a9099] uppercase">
        {label}
      </span>
      <input
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-[6px] w-full rounded-[4px] border border-solid border-[#424850] bg-[#0f1215] px-[12px] py-[8px] text-[12px] text-[#d4dbe3] outline-none focus:border-[#6b7380] disabled:opacity-50"
      />
    </label>
  )
}

function SecretKeyField({
  label,
  status,
  value,
  onChange,
  onSave,
  onClear,
  disabled = false,
}: {
  label: string
  status?: WorkspaceSecretSlot
  value: string
  onChange: (v: string) => void
  onSave: () => void
  onClear: () => void
  disabled?: boolean
}) {
  const source = status?.source ?? 'none'
  const hint = status?.hint
  return (
    <div className="rounded-xl border border-outline-variant/30 bg-canvas p-sm">
      <div className="flex items-center justify-between gap-sm">
        <span className="font-label text-[11px] tracking-widest text-on-surface-variant">
          {label}
        </span>
        <span className="font-label text-[9px] tracking-wider text-secondary">
          {source === 'workspace'
            ? 'WORKSPACE'
            : source === 'env'
              ? 'ENV FALLBACK'
              : 'NONE'}
        </span>
      </div>
      {hint ? (
        <p className="mt-xs font-body text-[11px] text-on-surface-variant">
          Stored hint: {hint}
        </p>
      ) : (
        <p className="mt-xs font-body text-[11px] text-on-surface-variant">
          Not configured
        </p>
      )}
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        disabled={disabled}
        placeholder="Paste key to replace…"
        onChange={(e) => onChange(e.target.value)}
        className="mt-sm w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-sm py-xs font-body text-[12px] text-on-surface outline-none focus:border-secondary disabled:opacity-50"
      />
      <div className="mt-sm flex flex-wrap gap-sm">
        <button
          type="button"
          disabled={disabled || !value.trim()}
          onClick={onSave}
          className="rounded-lg bg-secondary px-sm py-xs font-label text-[11px] font-bold tracking-widest text-on-secondary disabled:opacity-40"
        >
          SAVE KEY
        </button>
        <button
          type="button"
          disabled={disabled || source !== 'workspace'}
          onClick={onClear}
          className="rounded-lg border border-outline-variant px-sm py-xs font-label text-[11px] font-bold tracking-widest text-on-surface-variant disabled:opacity-40"
        >
          CLEAR
        </button>
      </div>
    </div>
  )
}

function Flag({ on }: { on: boolean }) {
  return (
    <span className={on ? 'text-secondary' : 'text-on-surface-variant'}>
      {on ? 'configured' : 'not set'}
    </span>
  )
}

export default SettingsPage
