import { TOSS_API_BASE } from './config'

export interface TossPayment {
  status: string
  method?: string
  paymentKey?: string
  totalAmount?: number
  [key: string]: unknown
}

interface TossOptions {
  secretKey: string
  /** 테스트용 주입. 미지정 시 전역 fetch 사용 */
  fetchFn?: typeof fetch
}

function authHeader(secretKey: string): string {
  return 'Basic ' + Buffer.from(secretKey + ':').toString('base64')
}

async function postToss(
  url: string,
  body: Record<string, unknown>,
  { secretKey, fetchFn = fetch }: TossOptions,
): Promise<TossPayment> {
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(secretKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.message ?? 'Toss API error')
  }
  return data as TossPayment
}

export function confirmPayment(
  params: { paymentKey: string; orderId: string; amount: number },
  opts: TossOptions,
): Promise<TossPayment> {
  return postToss(`${TOSS_API_BASE}/v1/payments/confirm`, params, opts)
}

export function cancelPayment(
  params: { paymentKey: string; cancelReason: string },
  opts: TossOptions,
): Promise<TossPayment> {
  return postToss(
    `${TOSS_API_BASE}/v1/payments/${params.paymentKey}/cancel`,
    { cancelReason: params.cancelReason },
    opts,
  )
}
