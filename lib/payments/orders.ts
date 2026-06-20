import { randomUUID } from 'crypto'

/** 토스 orderId 규칙(6~64자, 영숫자/-_=)에 맞는 고유 주문번호 생성 */
export function generateOrderId(prefix: 'deposit' | 'tip'): string {
  return `${prefix}_${randomUUID()}`
}

/**
 * 서버가 저장한 금액과 클라이언트가 보낸 금액을 대조한다.
 * 불일치 시 위변조로 간주하고 throw.
 */
export function assertAmountMatches(expected: number, actual: number): void {
  if (expected !== actual) {
    throw new Error(`amount mismatch: expected ${expected}, got ${actual}`)
  }
}
