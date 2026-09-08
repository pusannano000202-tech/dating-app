import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const STATE_VERSION = 'v1'
const STATE_TTL_SECONDS = 60 * 60
const STATE_PATTERN = /^v1\.([0-9]{10})\.([A-Za-z0-9_-]{20,32})\.([A-Za-z0-9_-]{40,64})$/

type TonightPaymentReturnContext = Readonly<{
  applicationId: string
  userId: string
  orderId: string
}>

function assertSecret(secret: string): void {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new TypeError('invalid_payment_state_secret')
  }
}

function message(
  context: TonightPaymentReturnContext,
  expiresAt: number,
  nonce: string,
): string {
  return [
    STATE_VERSION,
    context.applicationId,
    context.userId,
    context.orderId,
    String(expiresAt),
    nonce,
  ].join('\n')
}

function signature(
  context: TonightPaymentReturnContext,
  expiresAt: number,
  nonce: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(message(context, expiresAt, nonce))
    .digest('base64url')
}

export function signTonightPaymentReturnState(
  context: TonightPaymentReturnContext,
  secret: string,
  now: Date = new Date(),
): string {
  assertSecret(secret)
  const expiresAt = Math.floor(now.getTime() / 1000) + STATE_TTL_SECONDS
  const nonce = randomBytes(16).toString('base64url')
  return `${STATE_VERSION}.${expiresAt}.${nonce}.${signature(context, expiresAt, nonce, secret)}`
}

export function verifyTonightPaymentReturnState(
  state: string,
  context: TonightPaymentReturnContext,
  secret: string,
  now: Date = new Date(),
): boolean {
  try {
    assertSecret(secret)
    const match = STATE_PATTERN.exec(state)
    if (!match) return false
    const expiresAt = Number(match[1])
    const nonce = match[2]
    const actual = match[3]
    const nowSeconds = Math.floor(now.getTime() / 1000)
    if (!Number.isSafeInteger(expiresAt) || expiresAt < nowSeconds) return false

    const expected = signature(context, expiresAt, nonce, secret)
    const actualBuffer = Buffer.from(actual)
    const expectedBuffer = Buffer.from(expected)
    return actualBuffer.length === expectedBuffer.length
      && timingSafeEqual(actualBuffer, expectedBuffer)
  } catch {
    return false
  }
}
