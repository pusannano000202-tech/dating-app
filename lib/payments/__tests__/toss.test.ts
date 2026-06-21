import { describe, it, expect, vi } from 'vitest'
import { confirmPayment, cancelPayment, TossError } from '../toss'

const secret = 'test_sk_xxx'

// 응답 목: postToss는 res.text()를 사용한다(비JSON 안전 파싱).
function mockRes(ok: boolean, obj: unknown) {
  return { ok, text: async () => JSON.stringify(obj) }
}

describe('confirmPayment', () => {
  it('calls toss confirm with Basic auth and returns payment', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockRes(true, { status: 'DONE', method: '카카오페이', paymentKey: 'pk_1' }),
    )
    const res = await confirmPayment(
      { paymentKey: 'pk_1', orderId: 'deposit_1', amount: 10000 },
      { secretKey: secret, fetchFn: fetchMock as unknown as typeof fetch },
    )
    expect(res.status).toBe('DONE')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.tosspayments.com/v1/payments/confirm')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Basic ' + Buffer.from(secret + ':').toString('base64'),
    )
    expect(JSON.parse(init.body as string)).toEqual({
      paymentKey: 'pk_1', orderId: 'deposit_1', amount: 10000,
    })
  })

  it('throws TossError with message and code on non-ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockRes(false, { code: 'ALREADY_PROCESSED', message: '이미 처리됨' }),
    )
    await expect(
      confirmPayment(
        { paymentKey: 'pk_1', orderId: 'o', amount: 1 },
        { secretKey: secret, fetchFn: fetchMock as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({ message: '이미 처리됨', code: 'ALREADY_PROCESSED' })
  })

  it('throws (not a JSON parse crash) on a non-JSON error body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => '<html>502 Bad Gateway</html>',
    })
    const err = await confirmPayment(
      { paymentKey: 'pk_1', orderId: 'o', amount: 1 },
      { secretKey: secret, fetchFn: fetchMock as unknown as typeof fetch },
    ).catch((e) => e)
    expect(err).toBeInstanceOf(TossError)
    expect(err.message).not.toMatch(/JSON/i) // 파싱 예외가 아니라 본문/상태가 전달돼야 함
  })
})

describe('cancelPayment', () => {
  it('posts to cancel endpoint with cancelReason', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockRes(true, { status: 'CANCELED' }))
    const res = await cancelPayment(
      { paymentKey: 'pk_1', cancelReason: '과팅 성사 환불' },
      { secretKey: secret, fetchFn: fetchMock as unknown as typeof fetch },
    )
    expect(res.status).toBe('CANCELED')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.tosspayments.com/v1/payments/pk_1/cancel')
    expect(JSON.parse(init.body as string)).toEqual({ cancelReason: '과팅 성사 환불' })
  })

  it('surfaces ALREADY_CANCELED code for idempotent handling', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockRes(false, { code: 'ALREADY_CANCELED_PAYMENT', message: '이미 취소된 결제' }),
    )
    await expect(
      cancelPayment(
        { paymentKey: 'pk_1', cancelReason: 'x' },
        { secretKey: secret, fetchFn: fetchMock as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({ code: 'ALREADY_CANCELED_PAYMENT' })
  })
})
