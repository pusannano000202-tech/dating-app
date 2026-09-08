export const TONIGHT_PUSH_CONSENT_VERSION = '2026-09-03-tonight-v1'
export const TONIGHT_PUSH_TITLE = 'Quantum'
export const TONIGHT_PUSH_BODY = '오늘밤 만나기 새 안내가 도착했어요. 앱에서 확인해 주세요.'
export const TONIGHT_PUSH_URL = '/tonight'

export type TonightWebPushConfig = {
  enabled: boolean
  publicKey: string
  privateKey: string
  subject: string
}

export type TonightOutboxClaim = {
  outbox_id: string
  outbox_revision: number
  recipient_user_id: string
  event_type: string
  event_key: string
  round_id: string
  team_id: string | null
}

export type TonightPushDelivery = {
  delivery_id: string
  delivery_revision: number
  subscription_id: string
  endpoint: string
  p256dh: string
  auth_secret: string
  notification_id: string
  event_type: string
  audience: 'participant' | 'partner'
}

export function getTonightWebPushConfig(
  env: Readonly<Record<string, string | undefined>>,
): TonightWebPushConfig {
  return {
    enabled: env.TONIGHT_NOTIFICATIONS_ENABLED === 'true',
    publicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? '',
    privateKey: env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? '',
    subject: env.WEB_PUSH_VAPID_SUBJECT?.trim() ?? '',
  }
}

export function isTonightWebPushReady(config: TonightWebPushConfig): boolean {
  return config.enabled
    && config.publicKey.length >= 32
    && config.privateKey.length >= 32
    && /^(mailto:|https:\/\/)/.test(config.subject)
}

export function isAllowedTonightPushEndpoint(value: string): boolean {
  try {
    const endpoint = new URL(value)
    if (
      endpoint.protocol !== 'https:'
      || endpoint.username !== ''
      || endpoint.password !== ''
      || endpoint.pathname === '/'
    ) return false

    const hostname = endpoint.hostname.toLowerCase()
    return hostname === 'fcm.googleapis.com'
      || hostname === 'updates.push.services.mozilla.com'
      || hostname === 'web.push.apple.com'
      || /^[a-z0-9-]+\.notify\.windows\.com$/.test(hostname)
  } catch {
    return false
  }
}

export function buildTonightPushPayload(delivery: Pick<
  TonightPushDelivery,
  'notification_id' | 'event_type' | 'audience'
>) {
  // Deliberately generic. Exact venue and participant data stay behind the
  // authenticated Tonight page and its reveal gate.
  return {
    title: TONIGHT_PUSH_TITLE,
    body: TONIGHT_PUSH_BODY,
    url: delivery.audience === 'partner' ? '/partner/tonight' : TONIGHT_PUSH_URL,
    notificationId: delivery.notification_id,
  }
}

export function classifyTonightPushError(error: unknown): {
  errorCode: string
  revokeSubscription: boolean
} {
  const statusCode = getStatusCode(error)
  return {
    errorCode: statusCode ? `push_http_${statusCode}` : 'push_send_failed',
    revokeSubscription: statusCode === 404 || statusCode === 410,
  }
}

function getStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return null
  const value = (error as { statusCode?: unknown }).statusCode
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}
