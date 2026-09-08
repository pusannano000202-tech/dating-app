export type TonightUserActionState = Readonly<{
  applicationStatus: string | null
  roundStatus: string | null
  teamStatus: string | null
  depositStatus: string | null
  refundStatus?: string | null
}>

const CHECKOUT_DEPOSIT_STATUSES = new Set<string>(['initiated', 'pending'])
const REFUNDABLE_DEPOSIT_STATUSES = new Set<string>(['paid', 'held'])

export function canBeginTonightDeposit(state: TonightUserActionState): boolean {
  return state.applicationStatus === 'allocated'
    && state.roundStatus === 'awaiting_deposits'
    && state.teamStatus === 'deposit_pending'
    && (state.depositStatus === null || CHECKOUT_DEPOSIT_STATUSES.has(state.depositStatus))
}

export function canRequestTonightRefund(state: TonightUserActionState): boolean {
  return state.applicationStatus === 'allocated'
    && state.roundStatus === 'awaiting_deposits'
    && state.teamStatus === 'deposit_pending'
    && state.refundStatus == null
    && state.depositStatus !== null
    && REFUNDABLE_DEPOSIT_STATUSES.has(state.depositStatus)
}

export function tonightFinancialNextAction(state: TonightUserActionState): string {
  if (state.depositStatus === 'refunded' || state.refundStatus === 'completed') {
    return '보증금 환불이 완료됐어요'
  }
  if (state.refundStatus === 'failed') {
    return '환불 처리 상태를 운영자가 확인하고 있어요'
  }
  if (
    state.depositStatus === 'refund_requested'
    || state.refundStatus === 'requested'
    || state.refundStatus === 'approved'
    || state.refundStatus === 'processing'
  ) {
    return '보증금 환불을 처리하고 있어요'
  }
  if (state.depositStatus === 'reconciliation_required') {
    return '결제 상태를 운영자가 확인하고 있어요'
  }
  if (state.depositStatus === 'held') {
    return '보증금 상태를 운영자가 확인하고 있어요'
  }
  if (state.depositStatus === 'cancelled') return '이번 결제는 취소됐어요'
  if (state.depositStatus === 'forfeited') return '보증금이 몰수되어 환불되지 않았어요'
  if (state.roundStatus === 'completed' || state.teamStatus === 'completed') return '오늘 모임이 종료됐어요'
  if (state.roundStatus === 'cancelled' || state.teamStatus === 'cancelled') return '이번 회차가 종료됐어요'
  if (canBeginTonightDeposit(state)) return '18:45까지 보증금을 결제해 주세요'
  return '팀 조합을 확인하고 잠시 기다려 주세요'
}
