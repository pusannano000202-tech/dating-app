import { DEPOSIT_AMOUNT } from '../constants'

export const APP_FEE_BEG_STEPS = [3000, 2000, 1000] as const

export type AppFeeFlowDecision =
  | {
      kind: 'submit'
      normalizedAppFee: number
      requiresPartnerZeroNotification: false
    }
  | {
      kind: 'ask_for_support'
      normalizedAppFee: 0
      suggestedAppFees: readonly number[]
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
  if (normalizedAppFee > 0) {
    return {
      kind: 'submit',
      normalizedAppFee,
      requiresPartnerZeroNotification: false,
    }
  }

  return {
    kind: 'ask_for_support',
    normalizedAppFee: 0,
    suggestedAppFees: APP_FEE_BEG_STEPS,
    requiresPartnerZeroNotification: true,
  }
}
