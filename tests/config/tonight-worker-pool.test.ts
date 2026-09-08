import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  readTonightDatabaseWorkerConfig,
  readTonightReconciliationWorkerConfig,
  readTonightRefundWorkerConfig,
  runBoundedBatchDrain,
  runBoundedWorkerPool,
} from '../../lib/server/tonight/worker-pool'

test('Tonight refund worker configuration is bounded for a 60 second invocation', () => {
  assert.deepEqual(readTonightRefundWorkerConfig({}), {
    batchSize: 15,
    concurrency: 3,
    budgetMs: 40_000,
    maxBatches: 50,
    backlogSlo: 500,
  })
  assert.deepEqual(readTonightRefundWorkerConfig({
    TONIGHT_REFUND_BATCH_SIZE: '20',
    TONIGHT_REFUND_CONCURRENCY: '5',
    TONIGHT_REFUND_BUDGET_MS: '45000',
    TONIGHT_REFUND_MAX_BATCHES: '20',
    TONIGHT_REFUND_BACKLOG_SLO: '1000',
  }), {
    batchSize: 20,
    concurrency: 5,
    budgetMs: 45_000,
    maxBatches: 20,
    backlogSlo: 1000,
  })
  assert.equal(readTonightRefundWorkerConfig({ TONIGHT_REFUND_BATCH_SIZE: '21' }), null)
  assert.equal(readTonightRefundWorkerConfig({ TONIGHT_REFUND_CONCURRENCY: '0' }), null)
  assert.equal(readTonightRefundWorkerConfig({ TONIGHT_REFUND_BUDGET_MS: '50000' }), null)
  assert.equal(readTonightRefundWorkerConfig({ TONIGHT_REFUND_MAX_BATCHES: '0' }), null)
  assert.equal(readTonightRefundWorkerConfig({ TONIGHT_REFUND_BACKLOG_SLO: '0' }), null)
})

test('Tonight provider and database workers use separate bounded fail-closed settings', () => {
  assert.deepEqual(readTonightReconciliationWorkerConfig({}), {
    batchSize: 20,
    concurrency: 3,
    budgetMs: 40_000,
    maxBatches: 50,
    backlogSlo: 500,
  })
  assert.deepEqual(readTonightDatabaseWorkerConfig('deposit_finalize', {}), {
    batchSize: 100,
    concurrency: 10,
    budgetMs: 45_000,
    maxBatches: 100,
    backlogSlo: 2_000,
  })
  assert.deepEqual(readTonightDatabaseWorkerConfig('settlement', {}), {
    batchSize: 100,
    concurrency: 20,
    budgetMs: 45_000,
    maxBatches: 100,
    backlogSlo: 2_000,
  })
  assert.equal(readTonightReconciliationWorkerConfig({
    TONIGHT_RECONCILIATION_CONCURRENCY: '6',
  }), null)
  assert.equal(readTonightDatabaseWorkerConfig('settlement', {
    TONIGHT_SETTLEMENT_MAX_BATCHES: '101',
  }), null)
})

test('bounded worker pool processes concurrently without exceeding its limit', async () => {
  let active = 0
  let maxActive = 0
  const result = await runBoundedWorkerPool({
    items: [1, 2, 3, 4, 5, 6],
    concurrency: 2,
    deadlineAt: Date.now() + 5_000,
    async task(item) {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return item * 2
    },
  })

  assert.equal(maxActive, 2)
  assert.deepEqual(result.completed.map((entry) => entry.value), [2, 4, 6, 8, 10, 12])
  assert.deepEqual(result.deferred, [])
})

test('bounded worker pool does not start new provider work after its deadline', async () => {
  let clock = 0
  const started: number[] = []
  const result = await runBoundedWorkerPool({
    items: [1, 2, 3, 4],
    concurrency: 1,
    deadlineAt: 2,
    now: () => clock,
    async task(item) {
      started.push(item)
      clock += 1
      return item
    },
  })

  assert.deepEqual(started, [1, 2])
  assert.deepEqual(result.deferred, [3, 4])
})

test('bounded batch drain claims full batches until the queue is empty', async () => {
  const batches = [[1, 2], [3, 4], []]
  const result = await runBoundedBatchDrain({
    batchSize: 2,
    maxBatches: 10,
    concurrency: 2,
    deadlineAt: Date.now() + 5_000,
    claim: async () => batches.shift() ?? [],
    key: (item) => String(item),
    task: async (item) => item * 10,
  })

  assert.equal(result.batchCount, 3)
  assert.equal(result.claimed, 4)
  assert.equal(result.repeated, 0)
  assert.equal(result.stopReason, 'queue_exhausted')
  assert.deepEqual(result.completed.map((entry) => entry.value), [10, 20, 30, 40])
})

test('bounded batch drain stops when a failed database item is claimed again', async () => {
  let claimCount = 0
  const result = await runBoundedBatchDrain({
    batchSize: 2,
    maxBatches: 10,
    concurrency: 1,
    deadlineAt: Date.now() + 5_000,
    claim: async () => {
      claimCount += 1
      return claimCount === 1 ? [1, 2] : [1, 2]
    },
    key: (item) => String(item),
    task: async (item) => item === 1 ? 'failed' : 'processed',
  })

  assert.equal(result.batchCount, 2)
  assert.equal(result.claimed, 4)
  assert.equal(result.repeated, 2)
  assert.equal(result.stopReason, 'repeated_claim')
  assert.deepEqual(result.completed.map((entry) => entry.value), ['failed', 'processed'])
})

test('bounded batch drain returns unstarted claims when the deadline is reached', async () => {
  let clock = 0
  const result = await runBoundedBatchDrain({
    batchSize: 3,
    maxBatches: 10,
    concurrency: 1,
    deadlineAt: 2,
    now: () => clock,
    claim: async () => [1, 2, 3],
    key: (item) => String(item),
    task: async (item) => {
      clock += 1
      return item
    },
  })

  assert.equal(result.batchCount, 1)
  assert.equal(result.stopReason, 'deadline')
  assert.deepEqual(result.completed.map((entry) => entry.value), [1, 2])
  assert.deepEqual(result.deferred, [3])
})

test('bounded batch drain stops at max batches even when every batch is new', async () => {
  let next = 0
  const result = await runBoundedBatchDrain({
    batchSize: 1,
    maxBatches: 2,
    concurrency: 1,
    deadlineAt: Date.now() + 5_000,
    claim: async () => [++next],
    key: (item) => String(item),
    task: async (item) => item,
  })

  assert.equal(result.batchCount, 2)
  assert.equal(result.stopReason, 'max_batches')
  assert.deepEqual(result.completed.map((entry) => entry.value), [1, 2])
})

test('financial worker tuning and SLO controls are documented without raising provider concurrency', () => {
  for (const envFile of ['.env.example', '.env.local.example']) {
    const envExample = fs.readFileSync(path.join(process.cwd(), envFile), 'utf8')
    for (const name of [
      'TONIGHT_REFUND_MAX_BATCHES',
      'TONIGHT_REFUND_BACKLOG_SLO',
      'TONIGHT_RECONCILIATION_MAX_BATCHES',
      'TONIGHT_RECONCILIATION_BACKLOG_SLO',
      'TONIGHT_DEPOSIT_FINALIZE_MAX_BATCHES',
      'TONIGHT_DEPOSIT_FINALIZE_BACKLOG_SLO',
      'TONIGHT_SETTLEMENT_MAX_BATCHES',
      'TONIGHT_SETTLEMENT_BACKLOG_SLO',
    ]) {
      assert.match(envExample, new RegExp(`^${name}=`, 'm'), `${envFile}: ${name}`)
    }
    assert.match(envExample, /공급자 동시성/)
    assert.match(envExample, /실제 Toss/)
  }
})
