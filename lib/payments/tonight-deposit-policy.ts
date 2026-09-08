export const TONIGHT_DEPOSIT_POLICY_VERSION = '2026-09-03' as const

export const TONIGHT_DEPOSIT_POLICY_ITEMS = [
  '보증금 10,000원이 결제됩니다.',
  '18:45 전 사용자 취소 또는 운영상 취소는 전액 환불 절차가 시작됩니다.',
  '정상 도착이 확인되면 전액 환불 절차가 시작됩니다.',
  '미도착은 자동 몰수되지 않고 운영자 수동 검토 대상이며, 사전 승인된 정책이 적용되면 환불되지 않을 수 있습니다.',
  '결제·환불 이의는 앱의 신고 및 도움 요청으로 접수할 수 있습니다.',
] as const

export const TONIGHT_DEPOSIT_POLICY_CANONICAL_TEXT = TONIGHT_DEPOSIT_POLICY_ITEMS.join('|')

// SHA-256 of the canonical Korean policy text above. The server and database
// both require this exact digest so a stale browser cannot accept other copy.
export const TONIGHT_DEPOSIT_POLICY_HASH = '8ba5296074f9f759980ddeec1f42b9be1b1aba8723a6430839ad4829a23919cc' as const
