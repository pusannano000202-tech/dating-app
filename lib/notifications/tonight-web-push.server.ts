import 'server-only'

import webPush from 'web-push'

import {
  buildTonightPushPayload,
  type TonightPushDelivery,
  type TonightWebPushConfig,
} from './tonight-contract'

export async function sendTonightPush(
  delivery: TonightPushDelivery,
  config: TonightWebPushConfig,
): Promise<void> {
  webPush.setVapidDetails(config.subject, config.publicKey, config.privateKey)
  await webPush.sendNotification({
    endpoint: delivery.endpoint,
    keys: {
      p256dh: delivery.p256dh,
      auth: delivery.auth_secret,
    },
  }, JSON.stringify(buildTonightPushPayload(delivery)), {
    TTL: 600,
    urgency: 'high',
    topic: delivery.notification_id.replace(/-/g, '').slice(0, 32),
    timeout: 10_000,
  })
}
