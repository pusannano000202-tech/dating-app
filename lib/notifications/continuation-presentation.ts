const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const seriesPath = new RegExp(`^/match/series/${UUID}$`, 'i')
const occurrencePath = new RegExp(`^/match/occurrences/${UUID}$`, 'i')

export function continuationNotificationPresentation(kind: string, payload: Record<string, unknown>): { href: string; title: string; summary: string } | null {
  if (kind !== 'meeting_reminder' || typeof payload.deep_link !== 'string') return null
  const event = payload.continuation_kind
  const href = payload.deep_link
  if (event === 'join_consent_request' && href === '/match/series/join') {
    return {href,title:'새로운 합류 동의를 확인해 주세요',summary:'본인의 참여 의사를 직접 선택해 주세요. 다른 사람의 선택이나 이전 비공개 기록은 공개하지 않아요.'}
  }
  if (event === 'schedule_changed' && occurrencePath.test(href)) {
    return {href,title:'다음 만남 일정이 정해졌어요',summary:'확정된 회차 화면에서 시간과 장소를 확인해 주세요.'}
  }
  if (!seriesPath.test(href)) return null
  if (event === 'series_closed') return {href,title:'이번 이어가기 신청이 마감됐어요',summary:'진행 상태와 내 결제 처리 상태를 확인해 주세요.'}
  if (event === 'transition_ready') return {href,title:'다음 만남 준비가 진행 중이에요',summary:'이어가기 화면에서 현재 단계와 다음 안내를 확인해 주세요.'}
  if (event === 'payment_verified') return {href,title:'내 참가비 확인이 반영됐어요',summary:'내 결제와 다음 진행 단계만 확인할 수 있어요.'}
  return null
}
