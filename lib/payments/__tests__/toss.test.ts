import { describe, it, expect, vi } from 'vitest'
import { confirmPayment, cancelPayment } from '../toss'

const secret = 'test_sk_xxx'

describe('confirmPayment', () => {
  it('calls toss confirm with Basic auth and returns payment', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'DONE', method: '카카오페이', paymentKey: 'pk_1' }),
    })
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

  it('throws with toss error message on non-ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ code: 'ALREADY_PROCESSED', message: '이미 처리됨' }),
    })
    await expect(
      confirmPayment(
        { paymentKey: 'pk_1', orderId: 'o', amount: 1 },
        { secretKey: secret, fetchFn: fetchMock as unknown as typeof fetch },
      ),
    ).rejects.toThrow(/이미 처리됨/)
  })
})

describe('cancelPayment', () => {
  it('posts to cancel endpoint with cancelReason', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'CANCELED' }),
    })
    const res = await cancelPayment(
      { paymentKey: 'pk_1', cancelReason: '과팅 성사 환불' },
      { secretKey: secret, fetchFn: fetchMock as unknown as typeof fetch },
    )
    expect(res.status).toBe('CANCELED')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.tosspayments.com/v1/payments/pk_1/cancel')
    expect(JSON.parse(init.body as string)).toEqual({ cancelReason: '과팅 성사 환불' })
  })
})
