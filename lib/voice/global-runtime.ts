import { parseParticipationSummary, type ParticipationSummary } from '../participation/summary'
import type { AdviceRole, AdviceTopic, VoiceRoom, VoiceSession, VoiceTopic } from './contracts'

export type VoiceRuntimeStatus = 'idle' | 'waiting' | 'offered' | 'connected' | 'cleanup_required'

export type VoiceRuntimeQueue = {
  kind: 'advice' | 'random'
  role: AdviceRole | null
  adviceTopic: AdviceTopic | null
  topic: VoiceTopic
  waitUntil: string
  waiting: ParticipationSummary & { talkers?: number; listeners?: number }
}

export type VoiceGlobalRuntime = {
  status: VoiceRuntimeStatus
  revision: number
  queue: VoiceRuntimeQueue | null
  session: VoiceSession | null
  room: VoiceRoom | null
  sessionConnected: boolean
  cleanup?: { sessionId: string; revision: number } | null
}

export type VoiceDockPoint = { x: number; y: number }
export type VoiceViewport = { width: number; height: number }
export type VoiceRuntimeCommand = {
  action: 'cancel_waiting'
  expectedRevision: number
  idempotencyKey: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const VOICE_TOPICS = ['worries', 'social', 'baseball', 'department'] as const
const ADVICE_TOPICS = ['general', 'romance', 'career'] as const

function object(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message)
  return value as Record<string, unknown>
}

function nonNegativeInteger(value: unknown, message: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(message)
  return Number(value)
}

function nullableString(value: unknown, message: string) {
  if (value !== null && typeof value !== 'string') throw new Error(message)
  return value as string | null
}

function isoDate(value: unknown, message: string) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(message)
  return value
}

function parseSession(value: unknown): VoiceSession | null {
  if (value === null) return null
  const raw = object(value, '통화 상태를 확인하지 못했어요.')
  if (
    typeof raw.id !== 'string' || !UUID.test(raw.id) ||
    typeof raw.roomId !== 'string' || !UUID.test(raw.roomId) ||
    !['group', 'random', 'friend'].includes(String(raw.kind)) ||
    !['proposed', 'active', 'ended'].includes(String(raw.state)) ||
    !['listen', 'speak'].includes(String(raw.mode)) ||
    typeof raw.accepted !== 'boolean' || typeof raw.peerAccepted !== 'boolean' ||
    !Array.isArray(raw.participants)
  ) throw new Error('통화 상태를 확인하지 못했어요.')
  nonNegativeInteger(raw.revision, '통화 상태를 확인하지 못했어요.')
  nonNegativeInteger(raw.generation, '통화 상태를 확인하지 못했어요.')
  if (raw.adviceRole !== null && raw.adviceRole !== 'talker' && raw.adviceRole !== 'listener')
    throw new Error('통화 상태를 확인하지 못했어요.')
  if (raw.adviceTopic !== null && !ADVICE_TOPICS.includes(raw.adviceTopic as AdviceTopic))
    throw new Error('통화 상태를 확인하지 못했어요.')
  for (const participant of raw.participants) {
    const person = object(participant, '통화 상태를 확인하지 못했어요.')
    if (
      typeof person.identity !== 'string' || !UUID.test(person.identity) ||
      typeof person.displayName !== 'string' || !['listen', 'speak'].includes(String(person.mode)) ||
      typeof person.isModerator !== 'boolean'
    ) throw new Error('통화 상태를 확인하지 못했어요.')
  }
  return raw as unknown as VoiceSession
}

function parseRoom(value: unknown): VoiceRoom | null {
  if (value === null) return null
  const raw = object(value, '통화 상태를 확인하지 못했어요.')
  if (
    typeof raw.id !== 'string' || !UUID.test(raw.id) ||
    typeof raw.title !== 'string' || typeof raw.description !== 'string' ||
    !VOICE_TOPICS.includes(raw.topic as VoiceTopic) ||
    !['school', 'department'].includes(String(raw.scope)) ||
    !['scheduled', 'open', 'ended', 'cancelled', 'delayed'].includes(String(raw.status)) ||
    !Number.isSafeInteger(raw.capacity) || Number(raw.capacity) < 1
  ) throw new Error('통화 상태를 확인하지 못했어요.')
  nonNegativeInteger(raw.revision, '통화 상태를 확인하지 못했어요.')
  isoDate(raw.startsAt, '통화 상태를 확인하지 못했어요.')
  isoDate(raw.endsAt, '통화 상태를 확인하지 못했어요.')
  nullableString(raw.departmentKey, '통화 상태를 확인하지 못했어요.')
  nullableString(raw.sourceUrl, '통화 상태를 확인하지 못했어요.')
  nullableString(raw.sourceRevision, '통화 상태를 확인하지 못했어요.')
  nullableString(raw.sourceEventKey, '통화 상태를 확인하지 못했어요.')
  parseParticipationSummary(raw.connected)
  parseParticipationSummary(raw.waiting)
  return raw as unknown as VoiceRoom
}

function parseQueue(value: unknown): VoiceRuntimeQueue | null {
  if (value === null) return null
  const raw = object(value, '대기 상태를 확인하지 못했어요.')
  if (raw.kind !== 'advice' && raw.kind !== 'random') throw new Error('대기 상태를 확인하지 못했어요.')
  const waitUntil = isoDate(raw.waitUntil, '대기 상태를 확인하지 못했어요.')
  const waiting = parseParticipationSummary(raw.waiting)
  if (waiting.basis !== 'waiting_for_voice') throw new Error('대기 상태를 확인하지 못했어요.')
  let role: AdviceRole | null = null
  let adviceTopic: AdviceTopic | null = null
  let topic: VoiceTopic = 'social'
  if (raw.kind === 'advice') {
    if ((raw.role !== 'talker' && raw.role !== 'listener') || !ADVICE_TOPICS.includes(raw.adviceTopic as AdviceTopic))
      throw new Error('대기 상태를 확인하지 못했어요.')
    const talkers = nonNegativeInteger(raw.talkers ?? (raw.waiting as Record<string, unknown>)?.talkers, '대기 상태를 확인하지 못했어요.')
    const listeners = nonNegativeInteger(raw.listeners ?? (raw.waiting as Record<string, unknown>)?.listeners, '대기 상태를 확인하지 못했어요.')
    if (talkers + listeners !== waiting.totalPeople) throw new Error('대기 상태를 확인하지 못했어요.')
    role = raw.role
    adviceTopic = raw.adviceTopic as AdviceTopic
    topic = 'worries'
    return { kind: raw.kind, role, adviceTopic, topic, waitUntil, waiting: { ...waiting, talkers, listeners } }
  }
  if (!VOICE_TOPICS.includes(raw.topic as VoiceTopic) || raw.topic === 'worries')
    throw new Error('대기 상태를 확인하지 못했어요.')
  topic = raw.topic as VoiceTopic
  return { kind: raw.kind, role, adviceTopic, topic, waitUntil, waiting }
}

export function parseVoiceGlobalRuntime(value: unknown): VoiceGlobalRuntime {
  const raw = object(value, '보이스 상태를 확인하지 못했어요.')
  if (!['idle', 'waiting', 'offered', 'connected', 'cleanup_required'].includes(String(raw.status)) || typeof raw.sessionConnected !== 'boolean')
    throw new Error('보이스 상태를 확인하지 못했어요.')
  const revision = nonNegativeInteger(raw.revision, '보이스 상태를 확인하지 못했어요.')
  const queue = parseQueue(raw.queue)
  const session = parseSession(raw.session)
  const room = parseRoom(raw.room)
  const status = raw.status as VoiceRuntimeStatus
  let cleanup: VoiceGlobalRuntime['cleanup'] = null
  if (raw.cleanup !== undefined && raw.cleanup !== null) {
    const handle = object(raw.cleanup, '보이스 정리 상태를 확인하지 못했어요.')
    if (typeof handle.sessionId !== 'string' || !UUID.test(handle.sessionId))
      throw new Error('보이스 정리 상태를 확인하지 못했어요.')
    cleanup = { sessionId: handle.sessionId, revision: nonNegativeInteger(handle.revision, '보이스 정리 상태를 확인하지 못했어요.') }
  }
  if (
    (status === 'idle' && (queue || session || room || raw.sessionConnected)) ||
    (status === 'waiting' && (!queue || session || room || raw.sessionConnected)) ||
    ((status === 'offered' || status === 'connected') && (queue || !session || !room)) ||
    ((status === 'offered' || status === 'connected') && session?.state === 'ended') ||
    (status === 'cleanup_required' && (!cleanup || cleanup.revision !== revision || queue || session || room)) ||
    (status !== 'cleanup_required' && cleanup) ||
    (status === 'connected' && (!raw.sessionConnected || session?.state !== 'active')) ||
    ((status === 'offered' || status === 'cleanup_required') && raw.sessionConnected)
  ) throw new Error('보이스 연결 상태를 확인하지 못했어요.')
  return { status, revision, queue, session, room, sessionConnected: raw.sessionConnected, ...(cleanup ? { cleanup } : {}) }
}

export function parseVoiceRuntimeCommand(value: unknown): VoiceRuntimeCommand {
  const raw = object(value, 'invalid_input')
  if (
    Object.keys(raw).length !== 3 ||
    !['action', 'expectedRevision', 'idempotencyKey'].every((key) => Object.hasOwn(raw, key)) ||
    raw.action !== 'cancel_waiting' ||
    !Number.isSafeInteger(raw.expectedRevision) || Number(raw.expectedRevision) < 0 ||
    typeof raw.idempotencyKey !== 'string' || !UUID.test(raw.idempotencyKey)
  ) throw new Error('invalid_input')
  return {
    action: raw.action,
    expectedRevision: Number(raw.expectedRevision),
    idempotencyKey: raw.idempotencyKey,
  }
}

export function constrainVoiceDockPosition(
  point: VoiceDockPoint,
  viewport: VoiceViewport,
  dockSize = 64,
  bottomInset = 88,
): VoiceDockPoint {
  const margin = 12
  const maximumX = Math.max(margin, viewport.width - dockSize - margin)
  const maximumY = Math.max(margin, viewport.height - dockSize - bottomInset - margin)
  return {
    x: Math.min(maximumX, Math.max(margin, Math.round(point.x))),
    y: Math.min(maximumY, Math.max(margin, Math.round(point.y))),
  }
}

export function moveVoiceDockByKeyboard(
  point: VoiceDockPoint,
  key: string,
  viewport: VoiceViewport,
  dockSize = 64,
  bottomInset = 88,
) {
  const step = 16
  const maximum = constrainVoiceDockPosition({ x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY }, viewport, dockSize, bottomInset)
  const target = key === 'Home' ? { x: 12, y: 12 }
    : key === 'End' ? maximum
      : { x: point.x + (key === 'ArrowRight' ? step : key === 'ArrowLeft' ? -step : 0), y: point.y + (key === 'ArrowDown' ? step : key === 'ArrowUp' ? -step : 0) }
  return constrainVoiceDockPosition(target, viewport, dockSize, bottomInset)
}
