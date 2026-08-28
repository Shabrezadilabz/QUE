/**

 * SSM-B ML export + route A/B + trained model — unit tests (no DB).

 */

import {

  routeSsmMlStub,

  routeSsmMlTrained,

  compareSsmRoutes,

  resolveSsmRouteWithAb,

  trainSsmRoutingModel,

  ensureWorkspaceSsmModelAsync,

} from '../src/ssm/ssmMlExport.js'

import {

  clearSsmModelsForTests,

  evaluateSsmModel,

} from '../src/ssm/ssmTrainedModel.js'

import { generateSyntheticSsmTraces } from '../src/ssm/ssmSyntheticTraces.js'

import { extractSsmFeatures } from '../src/ssm/ssmFeatureExtractor.js'



let failed = 0



function ok(label) {

  console.log(`ok: ${label}`)

}



function assert(cond, label) {

  if (!cond) {

    failed += 1

    console.error(`FAIL: ${label}`)

  } else {

    ok(label)

  }

}



clearSsmModelsForTests()



const events = [

  {

    eventType: 'board_published',

    createdAt: new Date().toISOString(),

    meta: { tableName: 'orders' },

  },

  {

    eventType: 'sync_completed',

    createdAt: new Date().toISOString(),

    meta: { tableName: 'orders' },

  },

]



const stub = routeSsmMlStub('build revenue dashboard for exec board', events)

assert(stub.intent === 'studio_board', 'ML stub picks studio with board events')

assert(stub.model === 'ssm-b-lite-stub-v0', 'stub model id')



const synthetic = generateSyntheticSsmTraces(12)

assert(synthetic.length >= 84, 'synthetic trace count')

assert(synthetic.every((t) => t.label && t.message), 'synthetic traces labeled')



const features = extractSsmFeatures('build dashboard', events)

assert(features.length === 19, 'feature vector length')

assert(features[0] === 1, 'bias feature')



const model = trainSsmRoutingModel('test-ws', { syntheticPerIntent: 16 })

assert(model.modelId === 'ssm-b-trained-v1', 'trained model id')

assert(model.metrics.holdoutAccuracy >= 0.5, 'holdout accuracy reasonable')

assert(model.sampleCount >= 100, 'trained sample count')



const trained = routeSsmMlTrained('build revenue dashboard for exec board', events, {

  workspaceId: 'test-ws',

})

assert(trained?.source === 'trained', 'trained route source')

assert(trained?.model === 'ssm-b-trained-v1', 'trained route model')



const holdoutAcc = evaluateSsmModel(model, synthetic.slice(0, 20))

assert(holdoutAcc >= 0, 'evaluate helper runs')



const ab = compareSsmRoutes('create a job for revenue mart', events, {

  workspaceId: 'test-ws',

})

assert(ab.heuristic.intent === 'create_job', 'heuristic create_job')

assert(typeof ab.winner === 'string', 'A/B winner chosen')

assert(ab.recommendedIntent, 'recommended intent set')

assert(ab.ml?.source === 'trained', 'A/B uses trained ML when available')



const resolved = resolveSsmRouteWithAb('build revenue dashboard for exec board', events, {

  workspaceId: 'test-ws',

})

assert(resolved.ssmRoute.intent === 'studio_board', 'prod routing picks studio_board')

assert(resolved.ssmRoute.routingSource, 'routing source set')

assert(resolved.ssmAb?.winner, 'comparison attached')



const heuristicOnly = resolveSsmRouteWithAb('what tables do we have', events, {

  useAb: false,

  workspaceId: 'test-ws',

})

assert(heuristicOnly.ssmAb === null, 'useAb false skips comparison')

assert(heuristicOnly.ssmRoute.routingSource === 'heuristic', 'heuristic-only mode')



const wsEvents = [

  ...events,

  { eventType: 'job_created', createdAt: new Date().toISOString(), meta: { jobId: 'j1' } },

  { eventType: 'chat_query', createdAt: new Date().toISOString(), meta: {} },

  { eventType: 'board_published', createdAt: new Date().toISOString(), meta: { tableName: 'orders' } },

  { eventType: 'dataset_certified', createdAt: new Date().toISOString(), meta: { tableName: 'orders' } },

  { eventType: 'sync_completed', createdAt: new Date().toISOString(), meta: { tableName: 'orders' } },

]



void ensureWorkspaceSsmModelAsync('ws-prod', wsEvents).then((model) => {

  assert(model?.modelId === 'ssm-b-trained-v1', 'workspace model ensure trains')

  clearSsmModelsForTests()

  if (failed > 0) {

    console.error(`\nPhase SSM ML tests FAILED (${failed})`)

    process.exit(1)

  }

  console.log('\nAll Phase SSM ML tests passed')

})

