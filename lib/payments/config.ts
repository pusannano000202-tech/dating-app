// 결제 전용 상수. lib/constants.ts(공용)는 건드리지 않는다.

/** 팀장 1인이 내는 보증금 (원). 추후 정책에 맞게 조정. */
export const DEPOSIT_AMOUNT_KRW = 10000

/** 결제 통화 */
export const CURRENCY = 'KRW' as const

/** 토스페이먼츠 REST API base URL */
export const TOSS_API_BASE = 'https://api.tosspayments.com'

/** 뽀찌 최소/최대 금액 (원) */
export const TIP_MIN_KRW = 1000
export const TIP_MAX_KRW = 100000
