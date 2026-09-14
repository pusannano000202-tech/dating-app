import assert from 'node:assert/strict'
import test from 'node:test'

import {
  parseRetentionWorkItem,
  processRetentionWork,
  retentionRetryDelaySeconds,
  scheduledRetentionInput,
  type RetentionWorkerDependencies,
} from '../../lib/account/retention-worker'

const JOB = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const REQUEST = '33333333-3333-4333-8333-333333333333'
const TOKEN = '44444444-4444-4444-8444-444444444444'

test('retention jobs accept only owned buckets, paths, ids, and kinds', () => {
  const storage = parseRetentionWorkItem({
    kind: 'storage_object', job_id: JOB, user_id: USER, request_id: REQUEST,
    bucket: 'photos', storage_path: `${USER}/photo_0.jpg`, claim_token: TOKEN,
  })
  assert.ok(storage && storage.kind === 'storage_object')
  assert.equal(parseRetentionWorkItem({
    kind: 'storage_object', job_id: JOB, user_id: USER, request_id: REQUEST,
    bucket: 'photos', storage_path: 'someone-else/photo_0.jpg', claim_token: TOKEN,
  }), null)
  assert.equal(parseRetentionWorkItem({
    kind: 'storage_object', job_id: JOB, user_id: USER, request_id: null,
    bucket: 'meeting-evidence', storage_path: '../unsafe', claim_token: TOKEN,
  }), null)
  assert.ok(parseRetentionWorkItem({
    kind: 'auth_user', job_id: JOB, user_id: USER, request_id: REQUEST,
    bucket: null, storage_path: null, claim_token: TOKEN,
  }))
})

test('auth deletion runs only after the database readiness gate and retries provider failures', async () => {
  const calls: string[] = []
  const deps: RetentionWorkerDependencies = {
    removeStorageObject: async () => { calls.push('storage') },
    confirmAuthDeletionReady: async () => { calls.push('ready'); return true },
    deleteAuthUser: async () => { calls.push('delete'); throw new Error('provider_failed') },
    completeJob: async () => { calls.push('complete') },
    retryJob: async (_job, code) => { calls.push(`retry:${code}`) },
  }
  const item = parseRetentionWorkItem({
    kind: 'auth_user', job_id: JOB, user_id: USER, request_id: REQUEST,
    bucket: null, storage_path: null, claim_token: TOKEN,
  })!
  const result = await processRetentionWork([item], deps)
  assert.deepEqual(calls, ['ready', 'delete', 'retry:provider_failed'])
  assert.deepEqual(result, { processed: 1, completed: 0, retryScheduled: 1 })
})

test('a failed closed readiness gate never invokes the auth provider', async () => {
  let deleted = false
  const deps: RetentionWorkerDependencies = {
    removeStorageObject: async () => {},
    confirmAuthDeletionReady: async () => false,
    deleteAuthUser: async () => { deleted = true },
    completeJob: async () => {},
    retryJob: async () => {},
  }
  const item = parseRetentionWorkItem({
    kind: 'auth_user', job_id: JOB, user_id: USER, request_id: REQUEST,
    bucket: null, storage_path: null, claim_token: TOKEN,
  })!
  await processRetentionWork([item], deps)
  assert.equal(deleted, false)
})

test('finance appearing after readiness is retried and readiness runs again before a later deletion', async () => {
  const calls: string[] = []
  let financePending = true
  const deps: RetentionWorkerDependencies = {
    removeStorageObject: async () => {},
    confirmAuthDeletionReady: async () => { calls.push('ready'); return true },
    deleteAuthUser: async () => {
      calls.push('delete')
      if (financePending) throw new Error('account_financial_retention_pending')
    },
    completeJob: async () => { calls.push('complete') },
    retryJob: async (_job, code) => { calls.push(`retry:${code}`) },
  }
  const item = parseRetentionWorkItem({
    kind: 'auth_user', job_id: JOB, user_id: USER, request_id: REQUEST,
    bucket: null, storage_path: null, claim_token: TOKEN,
  })!
  assert.deepEqual(await processRetentionWork([item], deps), { processed: 1, completed: 0, retryScheduled: 1 })
  assert.deepEqual(calls, ['ready', 'delete', 'retry:account_not_ready'])
  financePending = false
  assert.deepEqual(await processRetentionWork([item], deps), { processed: 1, completed: 1, retryScheduled: 0 })
  assert.deepEqual(calls, ['ready', 'delete', 'retry:account_not_ready', 'ready', 'delete', 'complete'])
})

test('retry backoff is bounded', () => {
  assert.equal(retentionRetryDelaySeconds(1), 60)
  assert.equal(retentionRetryDelaySeconds(2), 120)
  assert.equal(retentionRetryDelaySeconds(99), 21_600)
})

test('scheduled retention is preview-only until the destructive worker is explicitly enabled', () => {
  assert.deepEqual(scheduledRetentionInput(undefined), { dryRun: true, limit: 25 })
  assert.deepEqual(scheduledRetentionInput('false'), { dryRun: true, limit: 25 })
  assert.deepEqual(scheduledRetentionInput('true'), { dryRun: false, limit: 25 })
  assert.deepEqual(scheduledRetentionInput('TRUE'), { dryRun: true, limit: 25 })
})
