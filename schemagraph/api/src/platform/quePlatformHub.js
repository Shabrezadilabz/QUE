/**
 * Que Platform Hub — six-module launcher with live readiness (shell capstone).
 */
import { computeLoadSlaStatus } from '../duplicateProfile.js'
import { summarizeLoadOps } from '../load/queLoadHub.js'
import { getPageAutofill } from '../pageAutofill.js'
import {
  fetchPlatformModuleSignals,
  buildPlatformModulePages,
} from './platformModuleSignals.js'

export const QUE_PLATFORM_MODULES = [
  {
    id: 'load',
    label: 'Load',
    tagline: 'Pipelines · sync · warehouse replicate',
    route: '/load',
    icon: '⇅',
  },
  {
    id: 'model',
    label: 'Model',
    tagline: 'SQL IDE · lineage · dbt export',
    route: '/model',
    icon: '◫',
  },
  {
    id: 'studio',
    label: 'Studio',
    tagline: 'BI boards · grid explore · metrics',
    route: '/studio/grid',
    icon: '▥',
  },
  {
    id: 'catalog',
    label: 'Catalog',
    tagline: 'Tables · metrics · jobs · glossary',
    route: '/catalog',
    icon: '◎',
  },
  {
    id: 'pipes',
    label: 'Pipes',
    tagline: 'NL → ELT · HITL approve · jobs',
    route: '/pipes',
    icon: '⎇',
  },
  {
    id: 'observe',
    label: 'Observe',
    tagline: 'Drift · golden eval · incidents',
    route: '/observe',
    icon: '◈',
  },
]

/**
 * Map module defs + page readiness into hub cards.
 * @param {object} pages
 */
export function mapPlatformModuleCards(pages) {
  return QUE_PLATFORM_MODULES.map((def) => ({
    ...def,
    ...(pages[def.id] || {
      status: 'empty',
      headline: 'Not configured',
      hints: [],
      href: def.route,
      cta: 'Open',
    }),
  }))
}

/**
 * Full platform hub payload for `/hub`.
 * @param {string} workspaceId
 */
export async function buildPlatformHub(workspaceId) {
  const [autofill, signals] = await Promise.all([
    getPageAutofill(workspaceId, null),
    fetchPlatformModuleSignals(workspaceId),
  ])

  const pipelines = (signals.syncSched?.connections || []).map((c) => ({
    ...c,
    sla: computeLoadSlaStatus(c),
  }))
  const loadOps = summarizeLoadOps({
    pipelines,
    workerFailed7d: signals.worker?.failed7d ?? 0,
  })

  const platformPages = buildPlatformModulePages(signals, autofill.health || {}, loadOps)
  const modules = mapPlatformModuleCards(platformPages)

  const reviewCount = modules.filter((m) => m.status === 'review').length
  const readyCount = modules.filter((m) => m.status === 'ready').length

  const warehouse = signals.warehouse
    ? {
        provisioned: signals.warehouse.provisioned,
        tableCount: signals.warehouse.tableCount,
        totalRows: signals.warehouse.totalRows,
        replicateDefaultOn: signals.warehouse.replicateDefaultOn,
        schemaName: signals.warehouse.registry?.schemaName ?? null,
        readiness: signals.warehouse.readiness,
      }
    : null

  return {
    workspaceId,
    generatedAt: new Date().toISOString(),
    health: autofill.health,
    global: autofill.global,
    modules,
    phase1: warehouse,
    phase5: {
      readiness: {
        status: loadOps.status,
        label: loadOps.label,
      },
      pipelineCount: loadOps.pipelineCount,
      slaCounts: loadOps.slaCounts,
      workerFailed7d: loadOps.workerFailed7d,
      workerQueued: signals.worker?.queued ?? 0,
      scheduledSyncEnabled: signals.syncSched?.enabled ?? false,
    },
    core: {
      label: 'Workspace graph',
      route: '/workspace',
      page: autofill.pages?.workspace ?? null,
    },
    summary: {
      moduleCount: modules.length,
      readyCount,
      reviewCount,
      healthScore: autofill.health?.score ?? null,
      healthGrade: autofill.health?.grade ?? null,
    },
  }
}
