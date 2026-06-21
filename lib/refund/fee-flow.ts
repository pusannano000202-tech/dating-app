import { DEPOSIT_AMOUNT } from '../constants'

export const MIN_PRIVATE_APP_FEE = DEPOSIT_AMOUNT

export type AppFeeFlowDecision =
  | {
      kind: 'submit'
      normalizedAppFee: number
      requiresPartnerZeroNotification: false
    }
  | {
      kind: 'ask_for_min_fee'
      normalizedAppFee: number
      requiresPartnerZeroNotification: boolean
    }

export function normalizeAppFeeAmount(appFee: number, depositAmount = DEPOSIT_AMOUNT): number {
  if (!Number.isFinite(appFee)) return 0
  return Math.min(depositAmount, Math.max(0, Math.floor(appFee)))
}

export function appFeeToRefundAmount(appFee: number, depositAmount = DEPOSIT_AMOUNT): number {
  return depositAmount - normalizeAppFeeAmount(appFee, depositAmount)
}

export function getAppFeeFlowDecision(appFee: number): AppFeeFlowDecision {
  const normalizedAppFee = normalizeAppFeeAmount(appFee)
  if (normalizedAppFee >= MIN_PRIVATE_APP_FEE) {
    return {
      kind: 'submit',
      normalizedAppFee,
      requiresPartnerZeroNotification: false,
    }
  }

  return {
    kind: 'ask_for_min_fee',
    normalizedAppFee,
    requiresPartnerZeroNotification: normalizedAppFee === 0,
  }
}
