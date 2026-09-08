const DEFAULT_BATCH_SIZE = 15
const DEFAULT_CONCURRENCY = 3
const DEFAULT_BUDGET_MS = 40_000
const DEFAULT_PROVIDER_MAX_BATCHES = 50
const DEFAULT_PROVIDER_BACKLOG_SLO = 500

type FinancialWorkerKind = 'deposit_finalize' | 'settlement'

export type TonightRefundWorkerConfig = {
  batchSize: number
  concurrency: number
  budgetMs: number
  maxBatches: number
  backlogSlo: number
}

export type TonightDatabaseWorkerConfig = TonightRefundWorkerConfig

export function readTonightRefundWorkerConfig(
  env: Record<string, string | undefined> = process.env,
): TonightRefundWorkerConfig | null {
  const batchSize = readBoundedInteger(
    env.TONIGHT_REFUND_BATCH_SIZE,
    DEFAULT_BATCH_SIZE,
    1,
    20,
  )
  const concurrency = readBoundedInteger(
    env.TONIGHT_REFUND_CONCURRENCY,
    DEFAULT_CONCURRENCY,
    1,
    5,
  )
  // A newly started refund may consume one provider GET and one cancellation,
  // each with an 8s timeout. Keeping 15s outside the scheduling budget lets
  // already-started work finish before maxDuration=60.
  const budgetMs = readBoundedInteger(
    env.TONIGHT_REFUND_BUDGET_MS,
    DEFAULT_BUDGET_MS,
    10_000,
    45_000,
  )
  const maxBatches = readBoundedInteger(
    env.TONIGHT_REFUND_MAX_BATCHES,
    DEFAULT_PROVIDER_MAX_BATCHES,
    1,
    100,
  )
  const backlogSlo = readBoundedInteger(
    env.TONIGHT_REFUND_BACKLOG_SLO,
    DEFAULT_PROVIDER_BACKLOG_SLO,
    1,
    100_000,
  )
  if (
    batchSize === null || concurrency === null || budgetMs === null
    || maxBatches === null || backlogSlo === null
  ) return null
  return { batchSize, concurrency, budgetMs, maxBatches, backlogSlo }
}

export function readTonightReconciliationWorkerConfig(
  env: Record<string, string | undefined> = process.env,
): TonightRefundWorkerConfig | null {
  return readFinancialWorkerConfig(env, {
    prefix: 'TONIGHT_RECONCILIATION',
    defaults: {
      batchSize: 20,
      concurrency: 3,
      budgetMs: 40_000,
      maxBatches: 50,
      backlogSlo: 500,
    },
    limits: { maxBatchSize: 50, maxConcurrency: 5 },
  })
}

export function readTonightDatabaseWorkerConfig(
  kind: FinancialWorkerKind,
  env: Record<string, string | undefined> = process.env,
): TonightDatabaseWorkerConfig | null {
  const settlement = kind === 'settlement'
  return readFinancialWorkerConfig(env, {
    prefix: settlement ? 'TONIGHT_SETTLEMENT' : 'TONIGHT_DEPOSIT_FINALIZE',
    defaults: {
      batchSize: 100,
      concurrency: settlement ? 20 : 10,
      budgetMs: 45_000,
      maxBatches: 100,
      backlogSlo: 2_000,
    },
    limits: { maxBatchSize: 100, maxConcurrency: 20 },
  })
}

export async function runBoundedWorkerPool<T, R>(params: {
  items: readonly T[]
  concurrency: number
  deadlineAt: number
  task: (item: T, index: number) => Promise<R>
  now?: () => number
}): Promise<{
  completed: Array<{ item: T; index: number; value: R }>
  deferred: T[]
}> {
  if (!Number.isInteger(params.concurrency) || params.concurrency < 1) {
    throw new TypeError('invalid_worker_concurrency')
  }
  const now = params.now ?? Date.now
  let cursor = 0
  const results: Array<{ item: T; index: number; value: R } | undefined>
    = new Array(params.items.length)

  async function worker() {
    while (true) {
      if (now() >= params.deadlineAt) return
      const index = cursor
      cursor += 1
      if (index >= params.items.length) return
      const item = params.items[index]
      const value = await params.task(item, index)
      results[index] = { item, index, value }
    }
  }

  const workerCount = Math.min(params.concurrency, params.items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return {
    completed: results.filter(
      (entry): entry is { item: T; index: number; value: R } => entry !== undefined,
    ),
    deferred: params.items.slice(cursor),
  }
}

export type BoundedBatchDrainStopReason =
  | 'queue_exhausted'
  | 'deadline'
  | 'max_batches'
  | 'repeated_claim'

/**
 * Drains claim/list RPCs within one serverless invocation without increasing
 * provider concurrency. Stable keys prevent a failed row returned by a
 * non-claiming list RPC from creating an infinite loop.
 */
export async function runBoundedBatchDrain<T, R>(params: {
  batchSize: number
  maxBatches: number
  concurrency: number
  deadlineAt: number
  claim: (batchIndex: number) => Promise<readonly T[]>
  key: (item: T) => string
  task: (item: T, index: number) => Promise<R>
  now?: () => number
}): Promise<{
  completed: Array<{ item: T; index: number; value: R }>
  deferred: T[]
  batchCount: number
  claimed: number
  repeated: number
  stopReason: BoundedBatchDrainStopReason
}> {
  if (!Number.isInteger(params.batchSize) || params.batchSize < 1) {
    throw new TypeError('invalid_worker_batch_size')
  }
  if (!Number.isInteger(params.maxBatches) || params.maxBatches < 1) {
    throw new TypeError('invalid_worker_max_batches')
  }
  const now = params.now ?? Date.now
  const completed: Array<{ item: T; index: number; value: R }> = []
  const seen = new Set<string>()
  let batchCount = 0
  let claimed = 0
  let repeated = 0
  let globalIndex = 0

  while (batchCount < params.maxBatches) {
    if (now() >= params.deadlineAt) {
      return {
        completed, deferred: [], batchCount, claimed, repeated, stopReason: 'deadline',
      }
    }

    const batch = await params.claim(batchCount)
    batchCount += 1
    if (!Array.isArray(batch) || batch.length > params.batchSize) {
      throw new TypeError('invalid_worker_claim_batch')
    }
    claimed += batch.length
    if (batch.length === 0) {
      return {
        completed, deferred: [], batchCount, claimed, repeated, stopReason: 'queue_exhausted',
      }
    }

    const unique: T[] = []
    for (const item of batch) {
      const key = params.key(item)
      if (!key || seen.has(key)) {
        repeated += 1
        continue
      }
      seen.add(key)
      unique.push(item)
    }
    if (unique.length === 0) {
      return {
        completed, deferred: [], batchCount, claimed, repeated, stopReason: 'repeated_claim',
      }
    }

    const startIndex = globalIndex
    globalIndex += unique.length
    const work = await runBoundedWorkerPool({
      items: unique,
      concurrency: params.concurrency,
      deadlineAt: params.deadlineAt,
      now,
      task: (item, index) => params.task(item, startIndex + index),
    })
    completed.push(...work.completed.map((entry) => ({
      ...entry,
      index: startIndex + entry.index,
    })))
    if (work.deferred.length > 0 || now() >= params.deadlineAt) {
      return {
        completed,
        deferred: work.deferred,
        batchCount,
        claimed,
        repeated,
        stopReason: 'deadline',
      }
    }

    if (batch.length < params.batchSize) {
      return {
        completed, deferred: [], batchCount, claimed, repeated, stopReason: 'queue_exhausted',
      }
    }
  }

  return {
    completed, deferred: [], batchCount, claimed, repeated, stopReason: 'max_batches',
  }
}

function readFinancialWorkerConfig(
  env: Record<string, string | undefined>,
  input: {
    prefix: string
    defaults: TonightRefundWorkerConfig
    limits: { maxBatchSize: number; maxConcurrency: number }
  },
): TonightRefundWorkerConfig | null {
  const read = (suffix: string, fallback: number, min: number, max: number) =>
    readBoundedInteger(env[`${input.prefix}_${suffix}`], fallback, min, max)
  const batchSize = read('BATCH_SIZE', input.defaults.batchSize, 1, input.limits.maxBatchSize)
  const concurrency = read('CONCURRENCY', input.defaults.concurrency, 1, input.limits.maxConcurrency)
  const budgetMs = read('BUDGET_MS', input.defaults.budgetMs, 10_000, 45_000)
  const maxBatches = read('MAX_BATCHES', input.defaults.maxBatches, 1, 100)
  const backlogSlo = read('BACKLOG_SLO', input.defaults.backlogSlo, 1, 100_000)
  if (
    batchSize === null || concurrency === null || budgetMs === null
    || maxBatches === null || backlogSlo === null
  ) return null
  return { batchSize, concurrency, budgetMs, maxBatches, backlogSlo }
}

function readBoundedInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (raw === undefined) return fallback
  if (!/^(?:0|[1-9]\d*)$/.test(raw)) return null
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : null
}
