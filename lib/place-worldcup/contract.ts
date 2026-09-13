export const PLACE_CATEGORIES = Object.freeze([
  { id: 'pc', label: 'PC방' },
  { id: 'gym', label: '헬스장' },
  { id: 'boardgame', label: '보드게임방' },
] as const)

export type PlaceCategory = typeof PLACE_CATEGORIES[number]['id']
export type PlaceCatalogState = 'ready' | 'under_review' | 'stale' | 'insufficient'

export type PlaceCandidate = Readonly<{
  id: string
  name: string
  address: string
  mapQuery: string
  verifiedAt?: string
  reviewDueAt?: string
}>

export type PlaceCatalog = Readonly<{
  category: PlaceCategory
  state: PlaceCatalogState
  requiredMinimum: 2
  /** Number of candidates included in this response, not the total approved row count. */
  candidateCount: number
  catalogRevision: string
  candidates: readonly PlaceCandidate[]
}>

export type PlaceSuggestion = Readonly<{
  kind: 'new' | 'correction'
  category: PlaceCategory
  targetCandidateId: string | null
  placeName: string
  address: string
  sourceUrl: string
  note: string
  idempotencyKey: string
}>

export type PlaceQueueItem = Readonly<{
  entityKind: 'candidate' | 'suggestion'
  id: string
  kind: 'new' | 'correction'
  category: PlaceCategory
  targetCandidateId: string | null
  targetCandidateRevision: number | null
  name: string
  address: string
  sourceUrl: string
  note: string
  revision: number
  createdAt: string
}>

export type PlaceOperatorReview = Readonly<{
  entity_kind: 'candidate' | 'suggestion'
  entity_id: string
  decision: 'approve' | 'reject'
  expected_revision: number
  idempotency_key: string
}>

export class PlaceInputError extends Error {
  constructor() { super('장소 정보를 확인해 주세요.') }
}

export function parsePlaceCatalog(value: unknown): PlaceCatalog {
  const row = strictObject(value, ['category', 'state', 'required_minimum', 'candidate_count', 'catalog_revision', 'candidates'])
  const category = categoryValue(row.category)
  const state = catalogState(row.state)
  if (row.required_minimum !== 2 || !Number.isSafeInteger(row.candidate_count) || (row.candidate_count as number) < 0) fail()
  const catalogRevision = shortKey(row.catalog_revision, 80)
  if (!Array.isArray(row.candidates) || row.candidates.length > 64) fail()
  const candidates = row.candidates.map(value => {
    const candidate = strictObject(value, ['id', 'name', 'address', 'map_query', 'verified_at', 'review_due_at'])
    return Object.freeze({
      id: uuid(candidate.id),
      name: safeText(candidate.name, 100),
      address: safeText(candidate.address, 200),
      mapQuery: safeText(candidate.map_query, 180),
      verifiedAt: isoTime(candidate.verified_at),
      reviewDueAt: isoTime(candidate.review_due_at),
    })
  })
  if (candidates.length !== row.candidate_count) fail()
  if (state === 'ready') {
    if (candidates.length < 2) fail()
  } else if (candidates.length !== 0) fail()
  return Object.freeze({
    category, state, requiredMinimum: 2, candidateCount: row.candidate_count as number,
    catalogRevision, candidates: Object.freeze(candidates),
  })
}

export function parsePlaceSuggestion(value: unknown): PlaceSuggestion {
  const row = strictObject(value, [
    'kind', 'category', 'targetCandidateId', 'placeName', 'address', 'sourceUrl', 'note', 'idempotencyKey',
  ])
  if (row.kind !== 'new' && row.kind !== 'correction') fail()
  const targetCandidateId = row.targetCandidateId === null ? null : uuid(row.targetCandidateId)
  if ((row.kind === 'correction') !== Boolean(targetCandidateId)) fail()
  const sourceUrl = safeHttpsUrl(row.sourceUrl)
  return Object.freeze({
    kind: row.kind,
    category: categoryValue(row.category),
    targetCandidateId,
    placeName: safeText(row.placeName, 100),
    address: safeText(row.address, 200),
    sourceUrl,
    note: optionalText(row.note, 500),
    idempotencyKey: uuid(row.idempotencyKey),
  })
}

export function suggestionRpcPayload(value: PlaceSuggestion): Record<string, unknown> {
  return {
    kind: value.kind,
    category: value.category,
    target_candidate_id: value.targetCandidateId,
    place_name: value.placeName,
    address: value.address,
    source_url: value.sourceUrl,
    note: value.note,
    idempotency_key: value.idempotencyKey,
  }
}

export function parsePlaceQueue(value: unknown): readonly PlaceQueueItem[] {
  const root = strictObject(value, ['items'])
  if (!Array.isArray(root.items) || root.items.length > 500) fail()
  return Object.freeze(root.items.map(value => {
    const item = strictObject(value, [
      'entity_kind', 'id', 'kind', 'category', 'target_candidate_id', 'name', 'address',
      'target_candidate_revision', 'source_url', 'note', 'revision', 'created_at',
    ])
    if ((item.entity_kind !== 'candidate' && item.entity_kind !== 'suggestion')
      || (item.kind !== 'new' && item.kind !== 'correction')
      || !Number.isSafeInteger(item.revision) || (item.revision as number) < 1) fail()
    const targetCandidateId = item.target_candidate_id === null ? null : uuid(item.target_candidate_id)
    const targetCandidateRevision = item.target_candidate_revision === null ? null : item.target_candidate_revision
    if (targetCandidateRevision !== null && (!Number.isSafeInteger(targetCandidateRevision) || (targetCandidateRevision as number) < 1)) fail()
    if (item.entity_kind === 'candidate' && (item.kind !== 'new' || targetCandidateId !== null || targetCandidateRevision !== null)) fail()
    if (item.entity_kind === 'suggestion' && (
      (item.kind === 'new' && (targetCandidateId !== null || targetCandidateRevision !== null))
      || (item.kind === 'correction' && (targetCandidateId === null || targetCandidateRevision === null))
    )) fail()
    return Object.freeze({
      entityKind: item.entity_kind,
      id: uuid(item.id),
      kind: item.kind,
      category: categoryValue(item.category),
      targetCandidateId,
      targetCandidateRevision: targetCandidateRevision as number | null,
      name: safeText(item.name, 100),
      address: safeText(item.address, 200),
      sourceUrl: safeHttpsUrl(item.source_url),
      note: optionalText(item.note, 500),
      revision: item.revision as number,
      createdAt: isoTime(item.created_at),
    })
  }))
}

export function parsePlaceOperatorReview(value: unknown): PlaceOperatorReview {
  const row = strictObject(value, [
    'entity_kind', 'entity_id', 'decision', 'expected_revision', 'idempotency_key',
  ])
  if ((row.entity_kind !== 'candidate' && row.entity_kind !== 'suggestion')
    || (row.decision !== 'approve' && row.decision !== 'reject')
    || !Number.isSafeInteger(row.expected_revision) || (row.expected_revision as number) < 1) fail()
  return Object.freeze({
    entity_kind: row.entity_kind,
    entity_id: uuid(row.entity_id),
    decision: row.decision,
    expected_revision: row.expected_revision as number,
    idempotency_key: uuid(row.idempotency_key),
  })
}

export function placeCategory(value: unknown): PlaceCategory {
  return categoryValue(value)
}

export function expectedPlaceAccountMatches(expectedAccount: string | null, authenticatedAccount: string): boolean {
  return typeof expectedAccount === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expectedAccount)
    && expectedAccount.toLowerCase() === authenticatedAccount.toLowerCase()
}

function strictObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  const row = value as Record<string, unknown>
  if (Object.keys(row).some(key => !keys.includes(key))) return fail()
  return row
}

function categoryValue(value: unknown): PlaceCategory {
  if (value === 'pc' || value === 'gym' || value === 'boardgame') return value
  return fail()
}

function catalogState(value: unknown): PlaceCatalogState {
  if (value === 'ready' || value === 'under_review' || value === 'stale' || value === 'insufficient') return value
  return fail()
}

function safeText(value: unknown, max: number): string {
  if (typeof value !== 'string') return fail()
  const text = value.trim()
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/u.test(text)) return fail()
  return text
}

function optionalText(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) return fail()
  return value.trim()
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return fail()
  return value.toLowerCase()
}

function shortKey(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max || !/^[a-z0-9][a-z0-9-]*$/i.test(value)) return fail()
  return value
}

function isoTime(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) return fail()
  return value
}

function safeHttpsUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) return fail()
  let url: URL
  try { url = new URL(value) } catch { return fail() }
  const host = url.hostname.toLowerCase()
  if (url.protocol !== 'https:' || url.username || url.password || !host || host === 'localhost' || host.endsWith('.local')) return fail()
  if (host.includes(':') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return fail()
  return url.toString()
}

function fail(): never { throw new PlaceInputError() }
