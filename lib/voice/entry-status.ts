import { parseParticipationSummary, type ParticipationSummary } from '../participation/summary'
import type { AdviceRole, AdviceTopic } from './contracts'

export type VoiceEntryStatus = {
  queued: boolean
  sessionId: string | null
  role: AdviceRole | null
  adviceTopic: AdviceTopic | null
  waiting: ParticipationSummary
  talkers: number | null
  listeners: number | null
}

export type VoiceEntryLoadState = {
  phase: 'loading' | 'ready' | 'error'
  refreshing: boolean
  data: VoiceEntryStatus | null
  error: string
}

export const INITIAL_VOICE_ENTRY_STATE: VoiceEntryLoadState = {
  phase: 'loading', refreshing: false, data: null, error: '',
}

/** Mutation acknowledgement is authoritative even if a later count refresh fails. */
export function parseVoiceQueueIdentity(value: unknown, allowCompletedLeave = false): { queued: boolean; sessionId: string | null } {
  if (!value || typeof value !== 'object') throw new Error('연결 상태를 확인하지 못했어요.')
  const { queued, sessionId } = value as Record<string, unknown>
  // Eligibility-revoked cleanup returns only { queued: false }; never allow this for join/resume.
  if (allowCompletedLeave && queued === false && sessionId === undefined) return { queued: false, sessionId: null }
  if (typeof queued !== 'boolean' || (sessionId !== null && (typeof sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId))))
    throw new Error('연결 상태를 확인하지 못했어요.')
  return { queued, sessionId: sessionId as string | null }
}

/** A status response is a waiting queue, never a count of connected callers. */
export function parseVoiceEntryStatus(value: unknown, advice: boolean, expectedTopic?: AdviceTopic | 'social'): VoiceEntryStatus {
  if (!value || typeof value !== 'object') throw new Error('현황 응답을 확인하지 못했어요.')
  const raw = value as Record<string, unknown>
  const waiting = parseParticipationSummary(raw.waiting)
  if (waiting.basis !== 'waiting_for_voice' || typeof raw.queued !== 'boolean')
    throw new Error('현황 응답을 확인하지 못했어요.')
  if (expectedTopic && (advice
    ? expectedTopic === 'social' || !waiting.scopeId.startsWith('advice:') || !waiting.scopeId.endsWith(':' + expectedTopic)
    : expectedTopic !== 'social' || !waiting.scopeId.startsWith('random:')))
    throw new Error('선택한 주제의 현황인지 확인하지 못했어요.')
  const { sessionId } = parseVoiceQueueIdentity(raw)
  let role: AdviceRole | null = null
  let adviceTopic: AdviceTopic | null = null
  let talkers: number | null = null
  let listeners: number | null = null
  if (advice) {
    role = raw.role === 'talker' || raw.role === 'listener' ? raw.role : null
    adviceTopic = raw.adviceTopic === 'general' || raw.adviceTopic === 'romance' || raw.adviceTopic === 'career' ? raw.adviceTopic : null
    const roles = raw.waiting as Record<string, unknown>
    if (![roles.talkers, roles.listeners].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0))
      throw new Error('현황 응답을 확인하지 못했어요.')
    talkers = roles.talkers as number
    listeners = roles.listeners as number
    if (talkers + listeners !== waiting.totalPeople || (raw.queued && (!role || !adviceTopic)))
      throw new Error('현황 응답을 확인하지 못했어요.')
  }
  return { queued: raw.queued, sessionId: sessionId as string | null, role, adviceTopic, waiting, talkers, listeners }
}

/** Scope this loader to one topic. Disposing also protects against fetchers ignoring abort. */
export function createVoiceEntryLoader(
  fetchStatus: (signal: AbortSignal) => Promise<unknown>,
  advice: boolean,
  publish: (state: VoiceEntryLoadState) => void,
  expectedTopic?: AdviceTopic | 'social',
) {
  let disposed = false
  let revision = 0
  let controller: AbortController | null = null
  let state = INITIAL_VOICE_ENTRY_STATE
  function emit(next: VoiceEntryLoadState) { state = next; publish(next) }
  return {
    async refresh() {
      if (disposed) return
      controller?.abort()
      controller = new AbortController()
      const signal = controller.signal
      const request = ++revision
      emit({ ...state, refreshing: true })
      try {
        const raw = await fetchStatus(signal)
        if (disposed || signal.aborted || request !== revision) return
        const data = parseVoiceEntryStatus(raw, advice, expectedTopic)
        emit({ phase: 'ready', refreshing: false, data, error: '' })
      } catch (caught) {
        if (disposed || signal.aborted || request !== revision) return
        emit({ phase: 'error', refreshing: false, data: null,
          error: caught instanceof Error && !caught.message.startsWith('invalid_')
            ? caught.message : '현황 응답을 확인하지 못했어요.' })
      }
    },
    dispose() { disposed = true; revision++; controller?.abort() },
  }
}
