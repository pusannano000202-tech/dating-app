import { timingSafeEqual } from 'node:crypto'
import webPush from 'web-push'

export const CAMPUS_SEVEN_PUSH_TITLE = 'Quantum'
export const CAMPUS_SEVEN_PUSH_BODY = '새 안내가 도착했어요. 앱에서 확인해 주세요.'
export const CAMPUS_SEVEN_PUSH_URL = '/match/campus-seven'

export type CampusSevenWebPushConfig = {
  enabled: boolean
  publicKey: string
  privateKey: string
  subject: string
  cronSecret: string
}

export type CampusSevenPushDelivery = {
  delivery_id: string
  subscription_id: string
  endpoint: string
  p256dh: string
  auth_secret: string
  notification_id: string
}

export function getCampusSevenWebPushConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): CampusSevenWebPushConfig {
  return {
    enabled: env.CAMPUS_SEVEN_NOTIFICATIONS_ENABLED === 'true',
    publicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() ?? '',
    privateKey: env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() ?? '',
    subject: env.WEB_PUSH_VAPID_SUBJECT?.trim() ?? '',
    cronSecret: env.CAMPUS_SEVEN_PUSH_CRON_SECRET?.trim() ?? '',
  }
}

export function isCampusSevenWebPushReady(config: CampusSevenWebPushConfig): boolean {
  return config.enabled
    && config.publicKey.length >= 32
    && config.privateKey.length >= 32
    && /^(mailto:|https:\/\/)/.test(config.subject)
    && config.cronSecret.length >= 32
}

export function isAuthorizedCampusSevenPushCron(
  authorizationHeader: string | null,
  expectedSecret: string,
): boolean {
  if (!authorizationHeader?.startsWith('Bearer ') || expectedSecret.length < 32) return false
  const provided = authorizationHeader.slice('Bearer '.length)
  const actualBytes = Buffer.from(provided)
  const expectedBytes = Buffer.from(expectedSecret)
  return actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes)
}

export async function sendCampusSevenGuidePush(
  delivery: CampusSevenPushDelivery,
  config: CampusSevenWebPushConfig,
): Promise<void> {
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey)
  await webPush.sendNotification({
    endpoint: delivery.endpoint,
    keys: {
      p256dh: delivery.p256dh,
      auth: delivery.auth_secret,
    },
  }, JSON.stringify({
    title: CAMPUS_SEVEN_PUSH_TITLE,
    body: CAMPUS_SEVEN_PUSH_BODY,
    url: CAMPUS_SEVEN_PUSH_URL,
    notificationId: delivery.notification_id,
  }), {
    TTL: 600,
    urgency: 'high',
    topic: delivery.notification_id.replace(/-/g, '').slice(0, 32),
    timeout: 10_000,
  })
}

export function classifyCampusSevenPushError(error: unknown): {
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
