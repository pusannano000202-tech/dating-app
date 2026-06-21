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

/** 토스 API 에러. `code`로 ALREADY_CANCELED 등 분기 가능. */
export class TossError extends Error {
  code?: string
  status: number
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'TossError'
    this.status = status
    this.code = code
  }
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
  // 비JSON 응답(502/504 HTML, 빈 본문 등)에서 파싱 예외로 실제 상태가 가려지지 않도록 안전 파싱.
  const text = await res.text()
  let data: Record<string, unknown> = {}
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { message: text.slice(0, 200) }
    }
  }
  if (!res.ok) {
    const message = (data.message as string) ?? `Toss API error ${res.status}`
    throw new TossError(message, res.status, data.code as string | undefined)
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
