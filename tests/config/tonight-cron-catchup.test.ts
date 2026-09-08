import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  TONIGHT_DUE_ROUND_BATCH_SIZE,
  getTonightDueRoundPolicy,
  parseDueTonightRounds,
} from '../../lib/server/tonight/due-rounds'

test('Tonight lifecycle workers select bounded due rounds instead of only the current KST date', () => {
  const now = new Date('2026-09-04T00:30:00.000Z')

  assert.deepEqual(getTonightDueRoundPolicy('allocation', now), {
    deadlineColumn: 'allocation_publish_at',
    eligibleStatuses: ['open'],
    mustFinishBeforeColumn: 'deposit_due_at',
    nowIso: now.toISOString(),
    limit: TONIGHT_DUE_ROUND_BATCH_SIZE,
  })
  assert.deepEqual(getTonightDueRoundPolicy('deposit', now), {
    deadlineColumn: 'deposit_due_at',
    eligibleStatuses: ['open', 'allocation_locked', 'awaiting_deposits'],
    mustFinishBeforeColumn: null,
    nowIso: now.toISOString(),
    limit: TONIGHT_DUE_ROUND_BATCH_SIZE,
  })
  assert.deepEqual(getTonightDueRoundPolicy('partner_acceptance', now), {
    deadlineColumn: 'partner_acceptance_due_at',
    eligibleStatuses: ['awaiting_deposits', 'partner_confirmation'],
    mustFinishBeforeColumn: null,
    nowIso: now.toISOString(),
    limit: TONIGHT_DUE_ROUND_BATCH_SIZE,
  })
})

test('Tonight due-round parsing fails closed on malformed service rows', () => {
  assert.deepEqual(parseDueTonightRounds([
    {
      id: '11111111-1111-4111-8111-111111111111',
      service_date: '2026-09-03',
    },
  ]), [{
    id: '11111111-1111-4111-8111-111111111111',
    serviceDate: '2026-09-03',
  }])
  assert.throws(() => parseDueTonightRounds(null), /invalid_due_round_rows/)
  assert.throws(() => parseDueTonightRounds([{ id: 'not-a-uuid', service_date: '2026-09-03' }]), /invalid_due_round_row/)
  assert.throws(() => parseDueTonightRounds([{ id: '11111111-1111-4111-8111-111111111111', service_date: '03-09-2026' }]), /invalid_due_round_row/)
})

test('Tonight lifecycle route and cron contracts keep retrying bounded due work', () => {
  const contracts: Array<[string, string, string[]]> = [
    ['app/api/internal/tonight/allocate/route.ts', 'allocation_publish_at', ['deposit_due_at']],
    ['app/api/internal/tonight/deposit-gate/route.ts', 'deposit_due_at', []],
    ['app/api/internal/tonight/partner-acceptance-gate/route.ts', 'partner_acceptance_due_at', []],
  ]

  for (const [relativePath, deadlineColumn, extraPatterns] of contracts) {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
    assert.match(source, /getTonightDueRoundPolicy/)
    assert.match(source, /parseDueTonightRounds/)
    assert.match(source, new RegExp(`\\.lte\\(policy\\.deadlineColumn, policy\\.nowIso\\)`))
    assert.match(source, /\.order\(policy\.deadlineColumn, \{ ascending: true \}\)/)
    assert.match(source, /\.limit\(policy\.limit\)/)
    assert.doesNotMatch(source, /getKstServiceDate/)
    for (const pattern of extraPatterns) assert.match(source, new RegExp(pattern))
  }

  const vercel = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')) as {
    crons: Array<{ path: string; schedule: string }>
  }
  assert.ok(vercel.crons.some((cron) =>
    cron.path === '/api/internal/tonight/prepare' && cron.schedule === '*/15 * * * *'))
  for (const routePath of [
    '/api/internal/tonight/allocate',
    '/api/internal/tonight/deposit-gate',
    '/api/internal/tonight/partner-acceptance-gate',
  ]) {
    assert.ok(vercel.crons.some((cron) => cron.path === routePath && cron.schedule === '* * * * *'))
  }
})

test('10K allocation gets a long worker budget and PII-free stage telemetry', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'app/api/internal/tonight/allocate/route.ts'),
    'utf8',
  )

  assert.match(source, /export const maxDuration = 300/)
  assert.match(source, /allocation_metric/)
  assert.match(source, /duration_ms/)
  assert.match(source, /applicant_count/)
  assert.match(source, /evaluation_count/)
  assert.match(source, /team_count/)
  assert.doesNotMatch(source, /console\.(?:info|error)\([^\n]*(?:application_id|phone|name|photo)/i)
})
