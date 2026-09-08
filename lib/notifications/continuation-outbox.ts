export type ContinuationNotificationKind = 'transition_ready' | 'payment_verified' | 'schedule_changed' | 'series_closed'

export function createContinuationOutboxMessage(input: {
  recipientUserId: string
  transitionId: string
  kind: ContinuationNotificationKind
  revision: number
  deepLink: string
}) {
  if (!input.deepLink.startsWith('/') || input.deepLink.startsWith('//')) throw new Error('invalid_deep_link')
  if (!Number.isInteger(input.revision) || input.revision < 0) throw new Error('invalid_revision')
  return {
    dedupeKey: `${input.kind}:${input.transitionId}:${input.recipientUserId}:${input.revision}`,
    recipientUserId: input.recipientUserId,
    payload: {
      kind: input.kind,
      transitionId: input.transitionId,
      revision: input.revision,
      deepLink: input.deepLink,
    },
  }
}

