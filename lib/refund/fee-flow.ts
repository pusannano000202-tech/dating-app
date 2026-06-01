export const MIN_PRIVATE_APP_FEE = 3000

export type AppFeeFlowDecision =
  | {
      kind: 'submit'
      normalizedAppFee: number
      requiresPartnerZeroNotification: false
    }
  | {
      kind: 'beg_for_3000'
      normalizedAppFee: number
      requiresPartnerZeroNotification: boolean
    }

export function normalizeAppFeeAmount(appFee: number, depositAmount = 20000): number {
  if (!Number.isFinite(appFee)) return 0
  return Math.min(depositAmount, Math.max(0, Math.floor(appFee)))
}

export function appFeeToRefundAmount(appFee: number, depositAmount = 20000): number {
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
    kind: 'beg_for_3000',
    normalizedAppFee,
    requiresPartnerZeroNotification: normalizedAppFee === 0,
  }
}
