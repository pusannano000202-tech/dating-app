const TOSS_API_BASE_URL = 'https://api.tosspayments.com/v1'

export interface TossPaymentObject {
  paymentKey: string
  orderId: string
  status: string
  totalAmount: number
  method?: string
  approvedAt?: string
  cancels?: Array<{
    cancelAmount?: number
    cancelReason?: string
    canceledAt?: string
  }>
}

export interface TossPaymentErrorBody {
  code?: string
  message?: string
}

export class TossPaymentError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status: number, code = 'toss_payment_error') {
    super(message)
    this.name = 'TossPaymentError'
    this.status = status
    this.code = code
  }
}

export async function confirmTossPayment(params: {
  paymentKey: string
  orderId: string
  amount: number
  idempotencyKey?: string
}): Promise<TossPaymentObject> {
  return requestTossPayment('/payments/confirm', {
    method: 'POST',
    idempotencyKey: params.idempotencyKey ?? `confirm_${params.orderId}`,
    body: {
      paymentKey: params.paymentKey,
      orderId: params.orderId,
      amount: params.amount,
    },
  })
}

export async function cancelTossPayment(params: {
  paymentKey: string
  cancelReason: string
  cancelAmount?: number
  idempotencyKey?: string
}): Promise<TossPaymentObject> {
  return requestTossPayment(`/payments/${encodeURIComponent(params.paymentKey)}/cancel`, {
    method: 'POST',
    idempotencyKey: params.idempotencyKey ?? `cancel_${params.paymentKey}_${params.cancelAmount ?? 'all'}`,
    body: {
      cancelReason: params.cancelReason,
      ...(typeof params.cancelAmount === 'number' ? { cancelAmount: params.cancelAmount } : {}),
    },
  })
}

export async function getTossPayment(paymentKey: string): Promise<TossPaymentObject> {
  return requestTossPayment(`/payments/${encodeURIComponent(paymentKey)}`, {
    method: 'GET',
  })
}

export async function getTossPaymentByOrderId(orderId: string): Promise<TossPaymentObject> {
  return requestTossPayment(`/payments/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
  })
}

type TossPaymentRequestOptions =
  | {
      method: 'POST'
      body: Record<string, unknown>
      idempotencyKey: string
    }
  | {
      method: 'GET'
    }

async function requestTossPayment(path: string, options: TossPaymentRequestOptions): Promise<TossPaymentObject> {
  const secretKey = process.env.TOSS_SECRET_KEY
  if (!secretKey) {
    throw new TossPaymentError('Toss secret key is not configured.', 503, 'payment_provider_not_configured')
  }

  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
  }

  const init: RequestInit = {
    method: options.method,
    headers,
  }

  if (options.method === 'POST') {
    headers['Content-Type'] = 'application/json'
    headers['Idempotency-Key'] = options.idempotencyKey.slice(0, 300)
    init.body = JSON.stringify(options.body)
  }

  const res = await fetch(`${TOSS_API_BASE_URL}${path}`, {
    ...init,
  })

  const json = await readJson(res)
  if (!res.ok) {
    const body = json as TossPaymentErrorBody
    throw new TossPaymentError(
      body.message || 'Toss payment request failed.',
      res.status,
      body.code || 'toss_payment_error',
    )
  }

  return json as TossPaymentObject
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return {}
  }
}
