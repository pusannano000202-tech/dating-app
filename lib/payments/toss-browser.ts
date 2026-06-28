export type TossBrowserPaymentRequest = {
  provider: 'toss'
  clientKey: string
  method: 'CARD'
  amount: number
  orderId: string
  orderName: string
  successUrl: string
  failUrl: string
  customerKey: string
}

type TossPaymentsFactory = (clientKey: string) => {
  payment?: (params: { customerKey: string }) => {
    requestPayment: (params: {
      method: 'CARD'
      amount: { currency: 'KRW'; value: number }
      orderId: string
      orderName: string
      successUrl: string
      failUrl: string
    }) => Promise<void>
  }
  requestPayment?: (
    method: '카드',
    params: {
      amount: number
      orderId: string
      orderName: string
      successUrl: string
      failUrl: string
      customerKey?: string
    }
  ) => Promise<void>
}

type BrowserScriptElement = {
  src: string
  async: boolean
  onload: (() => void) | null
  onerror: (() => void) | null
  addEventListener?: (type: 'load' | 'error', listener: () => void, options?: { once?: boolean }) => void
}

type BrowserDocument = {
  querySelector: (selector: string) => BrowserScriptElement | null
  createElement: (tagName: 'script') => BrowserScriptElement
  head: {
    appendChild: (element: BrowserScriptElement) => void
  }
}

type BrowserGlobal = {
  TossPayments?: TossPaymentsFactory
  document?: BrowserDocument
}

let tossSdkPromise: Promise<void> | null = null

export async function requestTossPaymentWindow(request: TossBrowserPaymentRequest): Promise<void> {
  const browser = getBrowserGlobal()
  if (!browser.document) {
    throw new Error('Toss payment window can only be opened in the browser.')
  }

  if (!request.clientKey) {
    throw new Error('Toss client key is not configured.')
  }

  await loadTossPaymentsSdk()

  const tossPayments = getBrowserGlobal().TossPayments?.(request.clientKey)
  if (!tossPayments) {
    throw new Error('Toss Payments SDK is not available.')
  }

  if (typeof tossPayments.payment === 'function') {
    const payment = tossPayments.payment({ customerKey: request.customerKey })
    await payment.requestPayment({
      method: request.method,
      amount: { currency: 'KRW', value: request.amount },
      orderId: request.orderId,
      orderName: request.orderName,
      successUrl: request.successUrl,
      failUrl: request.failUrl,
    })
    return
  }

  if (typeof tossPayments.requestPayment === 'function') {
    await tossPayments.requestPayment('카드', {
      amount: request.amount,
      orderId: request.orderId,
      orderName: request.orderName,
      successUrl: request.successUrl,
      failUrl: request.failUrl,
      customerKey: request.customerKey,
    })
    return
  }

  throw new Error('Toss payment request API is not available.')
}

function loadTossPaymentsSdk(): Promise<void> {
  const browser = getBrowserGlobal()
  const document = browser.document

  if (browser.TossPayments) {
    return Promise.resolve()
  }

  if (!document) {
    return Promise.reject(new Error('Toss payment window can only be opened in the browser.'))
  }

  if (tossSdkPromise) {
    return tossSdkPromise
  }

  tossSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://js.tosspayments.com/v2/standard"]')

    if (existing?.addEventListener) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load Toss Payments SDK.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://js.tosspayments.com/v2/standard'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Toss Payments SDK.'))
    document.head.appendChild(script)
  })

  return tossSdkPromise
}

function getBrowserGlobal(): BrowserGlobal {
  return globalThis as unknown as BrowserGlobal
}
