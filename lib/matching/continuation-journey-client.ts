export type ContinuationSource =
  | { kind: 'tonight'; teamId: string }
  | { kind: 'scheduled'; occurrenceId: string }

export type ContinuationAttempt = {
  sourceIdentity: string
  sourceKey: string
  seriesKey: string
}

export type MutationAttempt = {
  identity: string
  key: string
}

type JourneyResponse = {
  ok: boolean
  json: () => Promise<unknown>
}

type JourneyRequestInit = {
  method: 'POST'
  headers: { 'Content-Type': 'application/json' }
  body: string
}

export type JourneyRequest = (url: string, init: JourneyRequestInit) => Promise<JourneyResponse>

export class ContinuationJourneyError extends Error {
  constructor(
    readonly stage: 'source' | 'series' | 'network',
    readonly code: string,
  ) {
    super(`${stage}:${code}`)
    this.name = 'ContinuationJourneyError'
  }
}

export function resolveContinuationAttempt(
  current: ContinuationAttempt | null,
  sourceIdentity: string,
  createKey: () => string = () => crypto.randomUUID(),
): ContinuationAttempt {
  if (current?.sourceIdentity === sourceIdentity) return current
  return {
    sourceIdentity,
    sourceKey: createKey(),
    seriesKey: createKey(),
  }
}

export function resolveMutationAttempt(
  current: MutationAttempt | null,
  identity: string,
  createKey: () => string = () => crypto.randomUUID(),
): MutationAttempt {
  if (current?.identity === identity) return current
  return { identity, key: createKey() }
}

export async function openContinuationSeries({
  source,
  attempt,
  request = browserRequest,
  canContinue,
}: {
  source: ContinuationSource
  attempt: ContinuationAttempt
  request?: JourneyRequest
  canContinue?: () => boolean
}): Promise<{ sourceId: string; seriesId: string }> {
  try {
    const sourceResponse = await request(
      source.kind === 'tonight'
        ? '/api/match/series/source-from-tonight'
        : '/api/match/series/source-from-scheduled',
      postBody(source.kind === 'tonight'
        ? { team_id: source.teamId, idempotency_key: attempt.sourceKey }
        : { occurrence_id: source.occurrenceId, idempotency_key: attempt.sourceKey }),
    )
    const sourcePayload = await readPayload(sourceResponse)
    if (!sourceResponse.ok || !isRecord(sourcePayload) || typeof sourcePayload.source_id !== 'string') {
      throw new ContinuationJourneyError('source', publicCode(sourcePayload))
    }
    if (canContinue?.() === false) throw new ContinuationJourneyError('source', 'stale_owner')

    const seriesResponse = await request('/api/match/series', postBody({
      source_id: sourcePayload.source_id,
      idempotency_key: attempt.seriesKey,
    }))
    const seriesPayload = await readPayload(seriesResponse)
    if (!seriesResponse.ok || !isRecord(seriesPayload) || typeof seriesPayload.series_id !== 'string') {
      throw new ContinuationJourneyError('series', publicCode(seriesPayload))
    }

    return { sourceId: sourcePayload.source_id, seriesId: seriesPayload.series_id }
  } catch (error) {
    if (error instanceof ContinuationJourneyError) throw error
    throw new ContinuationJourneyError('network', 'service_unavailable')
  }
}

function postBody(body: Record<string, string>): JourneyRequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

async function readPayload(response: JourneyResponse): Promise<unknown> {
  return response.json().catch(() => null)
}

function publicCode(payload: unknown) {
  return isRecord(payload) && typeof payload.error === 'string'
    ? payload.error
    : 'service_unavailable'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function browserRequest(url: string, init: JourneyRequestInit): Promise<JourneyResponse> {
  return fetch(url, init)
}
