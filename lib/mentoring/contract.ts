export const MENTORING_TOPICS = ['courses', 'career', 'campus'] as const
export type MentoringTopic = typeof MENTORING_TOPICS[number]
export type MentoringRole = 'mentor' | 'mentee'
export type MentoringPhase = 'idle' | 'waiting' | 'offered' | 'active' | 'ended' | 'expired'
export type MentoringMessage = { id: string; mine: boolean; text: string; created_at: string }
export type MentoringSnapshot = {
  phase: MentoringPhase; role: MentoringRole | null; topic: MentoringTopic | null;
  session_id: string | null; expires_at: string | null; server_now: string;
  my_accepted: boolean; alias: string | null; peer_alias: string | null;
  messages: MentoringMessage[]; mentor_waiting: number; mentee_waiting: number;
}
export type MentoringCommand = { action: 'join' | 'cancel' | 'accept' | 'decline' | 'message' | 'end' | 'report'; args: Record<string, unknown> }
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const bounded = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max

export function parseMentoringCommand(value: unknown): MentoringCommand | null {
  if (!record(value) || Object.keys(value).some(key => !['action', 'args'].includes(key)) || !record(value.args)) return null
  const { action, args } = value
  const keys: Record<string, string[]> = { join: ['role', 'topic'], cancel: [], accept: ['session_id'], decline: ['session_id'], message: ['session_id', 'text', 'client_id'], end: ['session_id'], report: ['session_id', 'reason'] }
  if (typeof action !== 'string' || !Object.hasOwn(keys, action) || Object.keys(args).some(key => !keys[action].includes(key))) return null
  if (action === 'join' && (!['mentor', 'mentee'].includes(String(args.role)) || !MENTORING_TOPICS.includes(args.topic as MentoringTopic))) return null
  if (!['join', 'cancel'].includes(action) && !uuid(args.session_id)) return null
  if (action === 'message' && (!bounded(args.text, 1000) || !uuid(args.client_id))) return null
  if (action === 'report' && !bounded(args.reason, 2000)) return null
  return { action: action as MentoringCommand['action'], args }
}

export function parseMentoringSnapshot(value: unknown): MentoringSnapshot | null {
  if (!record(value) || !['idle', 'waiting', 'offered', 'active', 'ended', 'expired'].includes(String(value.phase))) return null
  if (value.role !== null && !['mentor', 'mentee'].includes(String(value.role))) return null
  if (value.topic !== null && !MENTORING_TOPICS.includes(value.topic as MentoringTopic)) return null
  if (value.session_id !== null && !uuid(value.session_id)) return null
  if (value.expires_at !== null && !timestamp(value.expires_at)) return null
  if (!timestamp(value.server_now) || typeof value.my_accepted !== 'boolean') return null
  if (!Number.isSafeInteger(value.mentor_waiting) || Number(value.mentor_waiting) < 0 || !Number.isSafeInteger(value.mentee_waiting) || Number(value.mentee_waiting) < 0) return null
  if (!Array.isArray(value.messages) || value.messages.length > 100 || value.messages.some(message => !record(message) || !uuid(message.id) || typeof message.mine !== 'boolean' || !bounded(message.text, 1000) || !timestamp(message.created_at))) return null
  if (['waiting', 'offered', 'active'].includes(String(value.phase)) && (!value.role || !value.topic || !value.expires_at)) return null
  if (['offered', 'active'].includes(String(value.phase)) && !value.session_id) return null
  if (value.phase === 'active') {
    if (!bounded(value.alias, 160) || !bounded(value.peer_alias, 160)) return null
  } else if (value.alias !== null || value.peer_alias !== null || value.messages.length !== 0) return null
  return value as MentoringSnapshot
}

export function classifyMentoringError(error: { message?: string; code?: string }): { error: string; status: number } {
  const message = (error.message ?? '').toLowerCase()
  if (/not_authenticated|unauthorized/.test(message)) return { error: 'auth_required', status: 401 }
  if (/profile_required|department_identity_required/.test(message)) return { error: 'profile_required', status: 409 }
  if (/forbidden|account_deletion_pending/.test(message) || error.code === '42501') return { error: 'forbidden', status: 403 }
  if (/mentoring_rate_limited/.test(message)) return { error: 'rate_limited', status: 429 }
  if (/mentoring_already_waiting/.test(message)) return { error: 'already_waiting', status: 409 }
  if (/mentoring_not_active/.test(message)) return { error: 'not_active', status: 409 }
  if (/mentoring_invalid/.test(message) || ['22P02', '22023'].includes(error.code ?? '')) return { error: 'invalid', status: 400 }
  return { error: 'unavailable', status: 503 }
}
