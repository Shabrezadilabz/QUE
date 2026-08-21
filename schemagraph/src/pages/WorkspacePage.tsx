import { useCallback, useEffect, useState } from 'react'
import { QueAppChrome } from '@/layouts/QueAppChrome'
import { MainDiagramLayout } from '@/layouts/MainDiagramLayout'
import { DiagramProvider } from '@/context/DiagramContext'
import { useWorkspaceRole } from '@/hooks/useWorkspaceRole'
import { useToast } from '@/context/ToastContext'
import { StitchSessionDialog } from '@/components/StitchSessionDialog'
import { IncorrectJoinConfirmDialog } from '@/components/IncorrectJoinConfirmDialog'
import {
  createStitchJobFromCanvas,
  loadWorkspaceData,
  reviewRelationship,
  createManualRelationshipApi,
  IncorrectJoinError,
  syncConnection,
  type JoinSampleAssessment,
  type WorkspaceLoadError,
} from '@/services/stitchApi'
import { notifySchemaChanged } from '@/utils/schemaChangeBus'
import type { DataSource } from '@/types/dataSource'
import type { SchemaRelationship, SchemaTable } from '@/types/schema'

type PendingIncorrectJoin =
  | {
      mode: 'create'
      fromColumnId: string
      toColumnId: string
      assessment: JoinSampleAssessment
    }
  | {
      mode: 'edit'
      relationshipId: string
      fromColumnId: string
      toColumnId: string
      assessment: JoinSampleAssessment
    }

/**
 * Workspace page — loads schema from stitch-api, falls back to dummy only when offline.
 */
export function WorkspacePage() {
  const { canWrite, workspaceId } = useWorkspaceRole()
  const { pushToast } = useToast()
  const [tables, setTables] = useState<SchemaTable[]>([])
  const [relationships, setRelationships] = useState<SchemaRelationship[]>([])
  const [sources, setSources] = useState<DataSource[]>([])
  const [fromApi, setFromApi] = useState(false)
  const [loadError, setLoadError] = useState<WorkspaceLoadError>(null)
  const [ready, setReady] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [stitchOpen, setStitchOpen] = useState(false)
  const [pendingIncorrect, setPendingIncorrect] =
    useState<PendingIncorrectJoin | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const hydrate = useCallback(async () => {
    const data = await loadWorkspaceData(workspaceId)
    setTables(data.tables)
    setRelationships(data.relationships)
    setSources(data.sources)
    setFromApi(data.fromApi)
    setLoadError(data.loadError)
    if (data.loadError === 'auth') {
      setBanner('Session expired — sign in again.')
    } else if (data.loadError === 'forbidden') {
      setBanner('You do not have access to this workspace.')
    } else if (data.loadError === 'offline') {
      setBanner('API offline — showing demo schema (not live data).')
    } else {
      setBanner(null)
    }
  }, [workspaceId])

  useEffect(() => {
    let cancelled = false
    setReady(false)
    hydrate().then(() => {
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [hydrate])

  const applyLocalReview = useCallback(
    (relationshipId: string, action: 'promote' | 'reject') => {
      setRelationships((prev) => {
        if (action === 'reject') {
          return prev.filter((r) => r.id !== relationshipId)
        }
        return prev.map((r) =>
          r.id === relationshipId
            ? {
                ...r,
                status: 'accepted' as const,
                type: 'explicit' as const,
                kind: 'fk' as const,
                confidence: 1,
              }
            : r,
        )
      })
    },
    [],
  )

  const handlePromote = useCallback(
    async (relationshipId: string) => {
      if (!canWrite) return
      if (fromApi) {
        const updated = await reviewRelationship(relationshipId, 'promote')
        if (!updated) {
          pushToast('Promote failed', 'error')
          return
        }
        setRelationships((prev) =>
          prev.map((r) => (r.id === relationshipId ? { ...r, ...updated } : r)),
        )
        pushToast('Relationship promoted', 'success')
        notifySchemaChanged('promote')
        return
      }
      applyLocalReview(relationshipId, 'promote')
      notifySchemaChanged('promote')
    },
    [fromApi, applyLocalReview, canWrite, pushToast],
  )

  const handleReject = useCallback(
    async (relationshipId: string) => {
      if (!canWrite) return
      if (fromApi) {
        const updated = await reviewRelationship(relationshipId, 'reject')
        if (!updated) {
          pushToast('Reject failed', 'error')
          return
        }
        setRelationships((prev) => prev.filter((r) => r.id !== relationshipId))
        pushToast('Relationship rejected', 'success')
        notifySchemaChanged('reject')
        return
      }
      applyLocalReview(relationshipId, 'reject')
      notifySchemaChanged('reject')
    },
    [fromApi, applyLocalReview, canWrite, pushToast],
  )

  const handleCreateJoin = useCallback(
    async (
      from: { tableId: string; columnId: string },
      to: { tableId: string; columnId: string },
    ) => {
      if (!canWrite) return
      if (!fromApi) {
        pushToast('Create join requires a live API connection', 'error')
        return
      }
      try {
        const created = await createManualRelationshipApi(
          from.columnId,
          to.columnId,
        )
        setRelationships((prev) => [...prev, created])
        pushToast('Join drawn — Promote when ready (HITL)', 'success')
        notifySchemaChanged('promote')
      } catch (err) {
        if (err instanceof IncorrectJoinError) {
          setPendingIncorrect({
            mode: 'create',
            fromColumnId: from.columnId,
            toColumnId: to.columnId,
            assessment: err.assessment,
          })
          pushToast('Stopped — this join looks incorrect', 'error')
          return
        }
        pushToast(
          err instanceof Error ? err.message : 'Create join failed',
          'error',
        )
      }
    },
    [canWrite, fromApi, pushToast],
  )

  const handleEditJoinEndpoints = useCallback(
    async (
      relationshipId: string,
      fromColumnId: string,
      toColumnId: string,
    ) => {
      if (!canWrite) return
      if (!fromApi) {
        pushToast('Edit join requires a live API connection', 'error')
        return
      }
      try {
        const updated = await reviewRelationship(relationshipId, 'edit', {
          fromColumnId,
          toColumnId,
        })
        if (!updated) {
          pushToast('Edit join failed', 'error')
          return
        }
        setRelationships((prev) =>
          prev.map((r) => (r.id === relationshipId ? { ...r, ...updated } : r)),
        )
        pushToast('Join endpoints updated', 'success')
        notifySchemaChanged('promote')
      } catch (err) {
        if (err instanceof IncorrectJoinError) {
          setPendingIncorrect({
            mode: 'edit',
            relationshipId,
            fromColumnId,
            toColumnId,
            assessment: err.assessment,
          })
          pushToast('Stopped — this join looks incorrect', 'error')
          return
        }
        pushToast(
          err instanceof Error ? err.message : 'Edit join failed',
          'error',
        )
      }
    },
    [canWrite, fromApi, pushToast],
  )

  const confirmIncorrectJoin = useCallback(async () => {
    if (!pendingIncorrect || !canWrite) return
    setConfirmBusy(true)
    try {
      if (pendingIncorrect.mode === 'create') {
        const created = await createManualRelationshipApi(
          pendingIncorrect.fromColumnId,
          pendingIncorrect.toColumnId,
          { confirmIncorrect: true },
        )
        setRelationships((prev) => [...prev, created])
        pushToast('Join saved with override — Promote carefully', 'info')
      } else {
        const updated = await reviewRelationship(
          pendingIncorrect.relationshipId,
          'edit',
          {
            fromColumnId: pendingIncorrect.fromColumnId,
            toColumnId: pendingIncorrect.toColumnId,
            confirmIncorrect: true,
          },
        )
        if (updated) {
          setRelationships((prev) =>
            prev.map((r) =>
              r.id === pendingIncorrect.relationshipId
                ? { ...r, ...updated }
                : r,
            ),
          )
        }
        pushToast('Join updated with override — Promote carefully', 'info')
      }
      notifySchemaChanged('promote')
      setPendingIncorrect(null)
    } catch (err) {
      pushToast(
        err instanceof Error ? err.message : 'Could not save join',
        'error',
      )
    } finally {
      setConfirmBusy(false)
    }
  }, [pendingIncorrect, canWrite, pushToast])

  const handleSyncSource = useCallback(
    async (sourceId: string) => {
      if (!canWrite) return
      if (!fromApi) {
        pushToast('Sync requires a live API connection', 'error')
        return
      }
      setSyncing(true)
      try {
        const result = await syncConnection(sourceId)
        const drift = result.drift
        const base = `Synced ${result.tablesSynced} tables · ${result.columnsSynced} columns`
        if (drift?.summary) {
          pushToast(
            `${base} · ${drift.summary}`,
            drift.hasRisk ? 'error' : 'success',
          )
          if (drift.hasRisk || drift.suggestedJoins > 0) {
            setBanner(
              `Sync drift: ${drift.summary}` +
                (drift.joinsBroken?.length
                  ? ` — review broken joins / new suggestions on the canvas.`
                  : ''),
            )
          }
        } else {
          pushToast(base, 'success')
        }
        notifySchemaChanged('sync')
        await hydrate()
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : 'Sync failed',
          'error',
        )
      } finally {
        setSyncing(false)
      }
    },
    [fromApi, hydrate, canWrite, pushToast],
  )

  const handleCreateStitchJob = useCallback(
    async (tableNames: string[]) => {
      if (!canWrite) return
      if (!fromApi) {
        pushToast('Create job requires a live API connection', 'error')
        return
      }
      try {
        const job = await createStitchJobFromCanvas(tableNames)
        const n = job.joinsSnapshot?.length ?? 0
        pushToast(
          `Job “${job.title}” created · ${n} join(s) frozen`,
          'success',
        )
        window.location.assign('/jobs')
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : 'Create job failed',
          'error',
        )
      }
    },
    [canWrite, fromApi, pushToast],
  )

  if (!ready) {
    return (
      <QueAppChrome flush>
        <div className="flex h-full items-center justify-center font-label text-[11px] tracking-widest text-[#8a9099]">
          LOADING WORKSPACE…
        </div>
      </QueAppChrome>
    )
  }

  if (loadError === 'auth' || loadError === 'forbidden') {
    return (
      <QueAppChrome flush>
        <div className="flex h-full flex-col items-center justify-center gap-md px-md text-center">
          <p className="text-xl font-semibold text-[#d4dbe3]">{banner}</p>
          <a
            href="/login"
            className="pdf-btn-primary rounded-[4px] px-md py-sm text-[11px] font-semibold tracking-widest"
          >
            SIGN IN
          </a>
        </div>
      </QueAppChrome>
    )
  }

  return (
    <QueAppChrome flush>
      <div className="relative h-full min-h-0">
      <DiagramProvider initialTables={tables}>
        <StitchSessionDialog
          open={stitchOpen}
          onClose={() => setStitchOpen(false)}
          sources={sources}
          onComplete={async () => {
            notifySchemaChanged('promote')
            await hydrate()
            setStitchOpen(false)
          }}
        />
        <IncorrectJoinConfirmDialog
          pending={pendingIncorrect}
          busy={confirmBusy}
          onCancel={() => setPendingIncorrect(null)}
          onConfirm={confirmIncorrectJoin}
        />
        <MainDiagramLayout
          tables={tables}
          relationships={relationships}
          sources={sources}
          fromApi={fromApi}
          readOnly={!canWrite}
          statusBanner={banner}
          onDismissBanner={() => setBanner(null)}
          onPromoteRelationship={canWrite ? handlePromote : undefined}
          onRejectRelationship={canWrite ? handleReject : undefined}
          onCreateJoin={canWrite ? handleCreateJoin : undefined}
          onEditJoinEndpoints={canWrite ? handleEditJoinEndpoints : undefined}
          onSyncSource={canWrite ? handleSyncSource : undefined}
          onCreateStitchJob={canWrite ? handleCreateStitchJob : undefined}
          onOpenStitchSession={
            canWrite && fromApi && sources.length >= 2
              ? () => setStitchOpen(true)
              : undefined
          }
          stitchSessionLabel={`STITCH SESSION · ${Math.min(sources.length, 2)} SOURCES`}
          syncing={syncing}
        />
      </DiagramProvider>
      </div>
    </QueAppChrome>
  )
}
