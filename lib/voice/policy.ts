import {
  VOICE_TOPICS,
  type VoiceCommand,
  type VoiceRoomInput,
} from './contracts'

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function requireUuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value))
    throw new Error('invalid_input')
  return value
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Error('invalid_input')
  return v as Record<string, unknown>
}
function text(v: unknown, min: number, max: number): string {
  if (
    typeof v !== 'string' ||
    v.trim().length < min ||
    v.trim().length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
  )
    throw new Error('invalid_input')
  return v.trim()
}
export function parseRoomInput(input: unknown): VoiceRoomInput {
  const v = record(input)
  const title = text(v.title, 3, 80),
    description = text(v.description, 0, 600)
  if (
    !VOICE_TOPICS.some((t) => t.id === v.topic) ||
    !Number.isInteger(v.capacity) ||
    (v.capacity as number) < 2 ||
    (v.capacity as number) > 24
  )
    throw new Error('invalid_input')
  const startsAt = text(v.startsAt, 10, 40),
    endsAt = text(v.endsAt, 10, 40)
  const start = Date.parse(startsAt),
    end = Date.parse(endsAt)
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 8 * 3600000
  )
    throw new Error('invalid_input')
  if (v.scope !== 'school' && v.scope !== 'department')
    throw new Error('invalid_input')
  const departmentKey =
    v.scope === 'department' ? text(v.departmentKey, 1, 120) : null
  let sourceUrl: string | null = null,
    sourceRevision: string | null = null,
    sourceEventKey: string | null = null
  if (v.topic === 'baseball') {
    let url: URL
    try {
      url = new URL(text(v.sourceUrl, 10, 500))
    } catch {
      throw new Error('invalid_input')
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !['www.koreabaseball.com', 'koreabaseball.com'].includes(url.hostname)
    )
      throw new Error('invalid_input')
    sourceUrl = url.href
    sourceRevision = text(v.sourceRevision, 3, 120)
    sourceEventKey = text(v.sourceEventKey, 3, 120).toLowerCase()
    if (!/^[a-z0-9][a-z0-9:_-]{2,119}$/.test(sourceEventKey))
      throw new Error('invalid_input')
  }
  return {
    title,
    topic: v.topic as VoiceRoomInput['topic'],
    description,
    capacity: v.capacity as number,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    scope: v.scope,
    departmentKey,
    sourceUrl,
    sourceRevision,
    sourceEventKey,
  }
}
export function parseVoiceCommand(input: unknown): VoiceCommand {
  const v = record(input)
  if (
    Object.keys(v).some(
      (k) =>
        ![
          'action',
          'expectedRevision',
          'idempotencyKey',
          'mode',
          'targetIdentity',
          'startsAt',
          'endsAt',
          'scheduleNotice',
          'sourceRevision',
        ].includes(k),
    )
  )
    throw new Error('invalid_input')
  if (
    ![
      'join',
      'leave',
      'accept',
      'next',
      'mode',
      'kick',
      'close',
      'cancel',
      'delay',
      'open',
      'reschedule',
    ].includes(String(v.action)) ||
    !Number.isSafeInteger(v.expectedRevision) ||
    (v.expectedRevision as number) < 0
  )
    throw new Error('invalid_input')
  if (v.mode !== undefined && v.mode !== 'listen' && v.mode !== 'speak')
    throw new Error('invalid_input')
  if (v.targetIdentity !== undefined) requireUuid(v.targetIdentity)
  if (v.action === 'delay' || v.action === 'reschedule')
    text(v.scheduleNotice, 3, 300)
  if (v.action === 'reschedule') {
    const start = Date.parse(text(v.startsAt, 10, 40)),
      end = Date.parse(text(v.endsAt, 10, 40))
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      end - start > 8 * 3600000
    )
      throw new Error('invalid_input')
    if (v.sourceRevision !== undefined) text(v.sourceRevision, 3, 120)
  }
  return { ...v, idempotencyKey: requireUuid(v.idempotencyKey) } as VoiceCommand
}
export function voiceProviderConfig(env: Record<string, string | undefined>) {
  const url = env.LIVEKIT_URL,
    key = env.LIVEKIT_API_KEY,
    secret = env.LIVEKIT_API_SECRET
  if (!url || !key || !secret) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('invalid_voice_provider')
  }
  if (
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== '' && parsed.pathname !== '/') ||
    parsed.search ||
    parsed.hash ||
    /[\s;*]/.test(url) ||
    !(
      parsed.protocol === 'wss:' ||
      (parsed.protocol === 'ws:' &&
        env.NODE_ENV !== 'production' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname))
    )
  )
    throw new Error('invalid_voice_provider')
  return { url, key, secret }
}
type QueueCandidate = {
  userId: string
  school: string
  topic: string
  eligible: boolean
  department?: string
}
export function mayPair(
  a: QueueCandidate,
  b: QueueCandidate,
  blocked: readonly (readonly string[])[],
  skipped: readonly (readonly string[])[],
): boolean {
  return (
    a.userId !== b.userId &&
    a.eligible &&
    b.eligible &&
    a.school === b.school &&
    a.topic === b.topic &&
    ![...blocked, ...skipped].some(
      (p) => p.includes(a.userId) && p.includes(b.userId),
    )
  )
}
