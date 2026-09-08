import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ContinuationJourneyError,
  openContinuationSeries,
  resolveContinuationAttempt,
  resolveMutationAttempt,
} from '../../lib/matching/continuation-journey-client'

type RequestCall = {
  url: string
  body: Record<string, unknown>
}

function response(ok: boolean, payload: unknown) {
  return { ok, json: async () => payload }
}

test('Tonight source registration opens and returns the canonical series id', async () => {
  const calls: RequestCall[] = []
  const request = async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> })
    return calls.length === 1
      ? response(true, { source_id: 'source-1', replayed: true })
      : response(true, { series_id: 'series-1', replayed: true })
  }

  const result = await openContinuationSeries({
    source: { kind: 'tonight', teamId: 'team-1' },
    attempt: { sourceIdentity: 'tonight:team-1', sourceKey: 'source-key', seriesKey: 'series-key' },
    request,
  })

  assert.deepEqual(result, { sourceId: 'source-1', seriesId: 'series-1' })
  assert.deepEqual(calls, [
    {
      url: '/api/match/series/source-from-tonight',
      body: { team_id: 'team-1', idempotency_key: 'source-key' },
    },
    {
      url: '/api/match/series',
      body: { source_id: 'source-1', idempotency_key: 'series-key' },
    },
  ])
})

test('scheduled source registration uses the same canonical series opening step', async () => {
  const calls: RequestCall[] = []
  const request = async (url: string, init: { body: string }) => {
    calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> })
    return calls.length === 1
      ? response(true, { source_id: 'source-2' })
      : response(true, { series_id: 'series-2' })
  }

  const result = await openContinuationSeries({
    source: { kind: 'scheduled', occurrenceId: 'occurrence-2' },
    attempt: { sourceIdentity: 'scheduled:occurrence-2', sourceKey: 'source-key-2', seriesKey: 'series-key-2' },
    request,
  })

  assert.equal(result.seriesId, 'series-2')
  assert.equal(calls[0]?.url, '/api/match/series/source-from-scheduled')
  assert.deepEqual(calls[0]?.body, {
    occurrence_id: 'occurrence-2',
    idempotency_key: 'source-key-2',
  })
})

test('a source error stops before series creation and preserves its public error', async () => {
  const calls: string[] = []
  const request = async (url: string) => {
    calls.push(url)
    return response(false, { error: 'source_not_ready' })
  }

  await assert.rejects(
    openContinuationSeries({
      source: { kind: 'tonight', teamId: 'team-1' },
      attempt: { sourceIdentity: 'tonight:team-1', sourceKey: 'source-key', seriesKey: 'series-key' },
      request,
    }),
    (error: unknown) => error instanceof ContinuationJourneyError
      && error.stage === 'source'
      && error.code === 'source_not_ready',
  )
  assert.deepEqual(calls, ['/api/match/series/source-from-tonight'])
})

test('an invalid series response never fabricates a successful destination', async () => {
  let callCount = 0
  const request = async () => {
    callCount += 1
    return callCount === 1
      ? response(true, { source_id: 'source-1' })
      : response(true, { source_id: 'source-1' })
  }

  await assert.rejects(
    openContinuationSeries({
      source: { kind: 'tonight', teamId: 'team-1' },
      attempt: { sourceIdentity: 'tonight:team-1', sourceKey: 'source-key', seriesKey: 'series-key' },
      request,
    }),
    (error: unknown) => error instanceof ContinuationJourneyError && error.stage === 'series',
  )
})

test('uncertain retry keeps both idempotency keys for the same source identity', () => {
  let sequence = 0
  const createKey = () => `key-${++sequence}`
  const first = resolveContinuationAttempt(null, 'tonight:team-1', createKey)
  const retry = resolveContinuationAttempt(first, 'tonight:team-1', createKey)
  const nextTeam = resolveContinuationAttempt(first, 'tonight:team-2', createKey)

  assert.strictEqual(retry, first)
  assert.deepEqual(first, {
    sourceIdentity: 'tonight:team-1',
    sourceKey: 'key-1',
    seriesKey: 'key-2',
  })
  assert.deepEqual(nextTeam, {
    sourceIdentity: 'tonight:team-2',
    sourceKey: 'key-3',
    seriesKey: 'key-4',
  })
})

test('uncertain mutation retry keeps one key until the logical request changes', () => {
  let sequence = 0
  const createKey = () => `mutation-${++sequence}`
  const first = resolveMutationAttempt(null, 'weekly-apply:2026-W36:board:a,b', createKey)
  const retry = resolveMutationAttempt(first, 'weekly-apply:2026-W36:board:a,b', createKey)
  const changed = resolveMutationAttempt(first, 'weekly-apply:2026-W36:board:a,c', createKey)

  assert.strictEqual(retry, first)
  assert.deepEqual(first, {
    identity: 'weekly-apply:2026-W36:board:a,b',
    key: 'mutation-1',
  })
  assert.deepEqual(changed, {
    identity: 'weekly-apply:2026-W36:board:a,c',
    key: 'mutation-2',
  })
})

test('an ownership change after source registration stops before opening a series', async () => {
  const calls: string[] = []
  const request = async (url: string) => {
    calls.push(url)
    return response(true, { source_id: 'source-1' })
  }

  await assert.rejects(
    openContinuationSeries({
      source: { kind: 'tonight', teamId: 'team-1' },
      attempt: { sourceIdentity: 'tonight:team-1', sourceKey: 'source-key', seriesKey: 'series-key' },
      request,
      canContinue: () => false,
    }),
    (error: unknown) => error instanceof ContinuationJourneyError && error.code === 'stale_owner',
  )
  assert.deepEqual(calls, ['/api/match/series/source-from-tonight'])
})
