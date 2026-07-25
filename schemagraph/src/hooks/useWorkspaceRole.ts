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
    return {
      role,
      workspaceId,
      canWrite: rank >= ROLE_RANK.member,
      canAdmin: rank >= ROLE_RANK.admin,
    }
  }, [workspaces, workspaceId])
}
