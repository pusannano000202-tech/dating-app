import { canBeginTonightDeposit, tonightFinancialNextAction } from './user-action-policy'
import { canShowTonightMeetingCoaching } from './tonight-journey-state'
import type { UserTonightData } from './types'

type PrimaryAction = Readonly<{
  panel: 'next' | 'place' | 'guide' | 'help'
  title: string
  description: string
  label: string
  refresh?: boolean
}>

function time(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(date)
    : '안내된 시각'
}

/** Presentation only: existing server state and payment policy remain authoritative. */
export function tonightPrimaryAction(data: UserTonightData, now: number, fresh: boolean): PrimaryAction {
  const state = {
    applicationStatus: data.application?.status ?? null,
    roundStatus: data.round.status,
    teamStatus: data.journey?.teamStatus ?? null,
    depositStatus: data.application?.deposit?.status ?? null,
    refundStatus: data.application?.deposit?.refundStatus ?? null,
  }
  if (!fresh) return { panel: 'next', refresh: true, title: '현재 참가 상태를 다시 확인해 주세요', description: '마지막으로 확인한 신청 내역은 아래에 남아 있어요.', label: '상태 다시 확인' }
  if (state.refundStatus || ['refund_requested', 'refunded', 'forfeited', 'reconciliation_required', 'cancelled'].includes(state.depositStatus ?? '')) {
    return { panel: 'help', title: tonightFinancialNextAction(state), description: '실제 보증금 처리 내역을 확인해 주세요.', label: '보증금 상태 보기' }
  }
  if (state.roundStatus === 'cancelled' || state.teamStatus === 'cancelled' || ['cancelled', 'withdrawn'].includes(state.applicationStatus ?? '')) {
    return { panel: 'help', title: '이번 참가가 종료됐어요', description: '납부한 보증금이 있다면 처리 상태를 확인해 주세요.', label: '참가·보증금 확인' }
  }
  if (state.roundStatus === 'completed' && data.journey?.teamId) {
    return { panel: 'next', title: '오늘 만남을 마쳤어요', description: '출석·업장 확인이 끝나면 기존 계속 만나기 흐름에서 각자 선택할 수 있어요.', label: '만남 이후 선택 보기' }
  }
  if (state.roundStatus === 'completed' || state.teamStatus === 'completed') {
    return { panel: 'next', title: '만남 마무리를 확인하고 있어요', description: '이번 회차 종료와 팀 참가 내역이 확인되면 다음 선택을 안내해요.', label: '내 참가 내역 보기' }
  }
  if (data.journey?.teamId && canBeginTonightDeposit(state)) {
    return { panel: 'next', title: `${time(data.round.depositDueAt)}까지 보증금을 확인해 주세요`, description: '기존 보증금 정책을 확인한 뒤 각자 결제해요.', label: '보증금 확인' }
  }
  if (canShowTonightMeetingCoaching(data, now)) {
    return { panel: 'guide', title: '도착 확인을 마쳤어요', description: '배정된 활동을 함께 확인해요. 안내를 넘겨도 출석·종료 상태는 바뀌지 않아요.', label: '만남 안내 보기' }
  }
  if (data.journey?.canRevealExactVenue) {
    return { panel: 'place', title: data.journey.canMarkArrival ? '현장에 도착했다면 알려 주세요' : '팀 번호와 만날 장소를 확인해요', description: '공개된 장소와 길찾기, 도착 확인을 기존 참가 내역에서 이어가요.', label: '장소·도착 확인' }
  }
  if (state.depositStatus === 'paid') {
    return { panel: 'next', title: '내 보증금 납부 완료 · 팀 확정 대기', description: '팀과 업장 확인 뒤 장소가 공개돼요. 다시 결제하지 않아도 돼요.', label: '내 참가 내역 보기' }
  }
  if (state.depositStatus === 'held') {
    return { panel: 'help', title: tonightFinancialNextAction(state), description: '보증금 확인 결과를 기다려 주세요.', label: '보증금 상태 보기' }
  }
  if (state.applicationStatus === 'waitlisted') {
    return { panel: 'next', title: '신청 접수 · 배정 대기 중이에요', description: '아직 팀이나 장소가 확정된 상태는 아니에요.', label: '내 신청 내역 보기' }
  }
  if (data.journey?.teamId) {
    return { panel: 'next', title: '팀 배정 후 확인 중이에요', description: '참가·업장 확인 상태에 맞춰 다음 절차를 안내해요.', label: '내 참가 내역 보기' }
  }
  return { panel: 'next', title: '신청 완료 · 팀 편성을 기다려요', description: `${time(data.round.allocationPublishAt)} 팀 편성 안내 예정이에요. 아직 결제 단계는 아니에요.`, label: '내 신청 내역 보기' }
}
