import { useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'

export type WorkspaceRole = 'viewer' | 'member' | 'admin' | 'owner'

const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
}

/** Current user's role on the active workspace. */
export function useWorkspaceRole() {
  const { workspaces, workspaceId } = useAuth()

  return useMemo(() => {
    const match = workspaces.find((w) => w.id === workspaceId)
    const role = (match?.role ?? null) as WorkspaceRole | null
    const rank = role ? (ROLE_RANK[role] ?? 0) : 0
    /** Builder = member+ (connectors, jobs, Genie, Engineer chat). */
    const isBuilder = rank >= ROLE_RANK.member
    /** KPI consumer = viewer (Ask + certified BI only; no Genie). */
    const isKpiConsumer = Boolean(role) && !isBuilder
    return {
      role,
      workspaceId,
      canWrite: isBuilder,
      canAdmin: rank >= ROLE_RANK.admin,
      canOwner: rank >= ROLE_RANK.owner,
      isBuilder,
      isKpiConsumer,
      /** Chat audience is role-locked — no CEO/Engineer dropdown. */
      chatAudience: (isBuilder ? 'engineer' : 'ceo') as 'engineer' | 'ceo',
      homePath: isBuilder ? '/hub' : '/chat',
    }
  }, [workspaces, workspaceId])
}
