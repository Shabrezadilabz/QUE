/**
 * Que Agent runtime hub — unified SSM pack status for Chat, Genie, Pipes.
 */
import { getWorkspaceSettings } from '../workspaceSettings.js'
import { buildUnifiedContextPack } from '../ssm/schemaContextService.js'
import { detectQueAgentIntent } from '../queAgentRuntime.js'

export const SSM_CONSUMERS = [
  { id: 'chat', label: 'Chat', wired: true },
  { id: 'genie', label: 'Genie', wired: true },
  { id: 'pipes', label: 'Que Pipes', wired: true },
  { id: 'liveQuery', label: 'Live SQL', wired: true },
  { id: 'monk', label: 'Monk Mode', wired: false, note: 'tool loop — pack via match' },
]

/**
 * Summarize agent + SSM readiness (pure).
 * @param {object} input
 */
export function summarizeAgentRuntime(input = {}) {
  const enabled = Boolean(input.enabled)
  const validation = input.validation || {}
  const tableCount = input.tableCount ?? 0
  const sampleWarnings = input.sampleWarnings || []
  const sampleGate = input.sampleGate || {}

  let status = 'empty'
  if (!enabled) {
    status = 'unavailable'
  } else if (tableCount === 0) {
    status = 'empty'
  } else if (sampleGate.blocked) {
    status = 'blocked'
  } else if (validation.ok && sampleWarnings.length === 0) {
    status = 'ready'
  } else {
    status = 'review'
  }

  return {
    status,
    enabled,
    tableCount,
    validationOk: Boolean(validation.ok),
    sampleWarningCount: sampleWarnings.length,
    sampleGateBlocked: Boolean(sampleGate.blocked),
    intent: input.intent ?? null,
    label:
      !enabled
        ? 'Agent disabled'
        : tableCount === 0
          ? 'Sync sources first'
          : sampleGate.blocked
            ? 'Sample gate — sync & pin 5–10 rows'
            : validation.ok
              ? 'Unified SSM pack ready'
              : 'Pack needs samples',
  }
}

/**
 * @param {string} workspaceId
 * @param {{ message?: string, pageContext?: object }} [opts]
 */
export async function getAgentRuntimeStatus(workspaceId, opts = {}) {
  const ws = await getWorkspaceSettings(workspaceId)
  const settings = ws?.settings || {}
  const enabled =
    settings.enableQueAgent !== false || settings.enableStitchAgent === true

  const probeMessage =
    opts.message || 'Create a job joining orders and customers for revenue mart'
  const pageContext = opts.pageContext || { pageId: 'chat' }

  const unified = await buildUnifiedContextPack(workspaceId, {
    message: probeMessage,
    pageContext,
    settings,
  })

  const agentProbe = detectQueAgentIntent(probeMessage, pageContext)

  const summary = summarizeAgentRuntime({
    enabled,
    validation: unified.validation,
    tableCount: unified.stats?.tableCount ?? unified.pack?.tables?.length ?? 0,
    sampleWarnings: unified.sampleWarnings,
    sampleGate: unified.sampleGate,
    intent: unified.intent,
  })

  return {
    workspaceId,
    generatedAt: new Date().toISOString(),
    enabled,
    consumers: SSM_CONSUMERS,
    summary,
    unifiedPack: {
      intent: unified.intent,
      ssmRoute: {
        intent: unified.ssmRoute?.intent,
        routingSource: unified.ssmRoute?.routingSource || 'heuristic',
        confidence: unified.ssmRoute?.confidence ?? null,
        mlModel: unified.ssmRoute?.mlModel ?? null,
        abWinner: unified.ssmRoute?.abWinner ?? null,
        focusTableNames: unified.ssmRoute?.focusTableNames || [],
        workspaceStateSummary: unified.ssmRoute?.workspaceStateSummary || null,
      },
      stats: unified.stats,
      validation: unified.validation,
      sampleWarnings: unified.sampleWarnings || [],
      sampleGate: unified.sampleGate || null,
      joinPathCount: unified.joinPaths?.length ?? 0,
      warehouseTableCount: unified.warehouseMap?.length ?? 0,
      allowedTables: (unified.focusedPack?.tables || unified.pack?.tables || [])
        .slice(0, 24)
        .map((t) => t.name),
    },
    agentProbe: agentProbe
      ? { kind: agentProbe.kind, autoExecute: agentProbe.autoExecute }
      : null,
    systemPromptAnchor: unified.systemPromptAnchor,
  }
}
