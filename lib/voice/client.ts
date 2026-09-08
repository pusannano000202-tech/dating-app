import type { VoiceCommand } from './contracts'
export const VOICE_ERROR_COPY: Record<string, string> = {
  unauthenticated: '로그인하면 같은 학교의 모집방을 볼 수 있어요.',
  not_authenticated: '로그인하면 같은 학교의 모집방을 볼 수 있어요.',
  minimum_signup_required: '전화번호와 기본 가입 정보를 먼저 확인해 주세요.',
  voice_restricted: '현재 보이스 참여가 제한되어 있어요. 운영자에게 문의해 주세요.',
  sports_event_not_found: '경기 검수 기록을 먼저 등록하고 선택해 주세요.',
  sports_event_mismatch: '검수한 경기와 모집 정보가 달라요. 최신 경기 기록을 다시 선택해 주세요.',
  sports_event_not_ready: '취소·지연·종료된 경기로는 모집방을 열 수 없어요.',
  sports_event_stale_review: '공식 경기 일정을 다시 확인하고 검수 기록을 갱신해 주세요.',
  provider_unavailable:
    '통화 서버를 준비 중이에요. 아직 마이크는 연결되지 않았어요.',
  voice_scene_unavailable:
    '새 보이스 방을 준비 중이에요. 준비가 끝난 뒤 다시 시도해 주세요.',
  service_unavailable:
    '모집 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
  voice_rules_required: '참여 전에 대화 약속을 확인해 주세요.',
  room_full: '방금 정원이 찼어요. 다른 방을 둘러보세요.',
  room_closed: '이 대화는 끝났거나 아직 시작 전이에요.',
  stale_revision:
    '참여 상태가 바뀌었어요. 새 상태를 확인한 뒤 다시 눌러 주세요.',
  already_in_voice:
    '이미 참여 중인 대화가 있어요. 먼저 현재 대화를 마쳐 주세요.',
  blocked_pair: '함께 참여할 수 없는 사용자가 있어 이 방에 들어갈 수 없어요.',
  media_cleanup_pending:
    '이전 통화 연결을 정리 중이에요. 잠시 후 다시 시도해 주세요.',
  rate_limited: '잠시 쉬었다 다시 시도해 주세요.',
  acceptance_required: '서로 수락한 뒤 통화를 연결할 수 있어요.',
}
export async function voiceFetch<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers:
      body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal,
  })
  const data = await response
    .json()
    .catch(() => ({ error: 'service_unavailable' }))
  if (!response.ok)
    throw new Error(
      VOICE_ERROR_COPY[data.error] ??
        '요청을 완료하지 못했어요. 상태를 확인하고 다시 시도해 주세요.',
    )
  return data as T
}
export function voiceCommand(
  action: VoiceCommand['action'],
  expectedRevision: number,
  extra: Partial<VoiceCommand> = {},
): VoiceCommand {
  return {
    action,
    expectedRevision,
    idempotencyKey: crypto.randomUUID(),
    ...extra,
  }
}
