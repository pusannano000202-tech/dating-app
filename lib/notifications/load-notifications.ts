export type NotificationFetchResponse = {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export type NotificationFetcher = (
  input: string,
  init?: { method?: string },
) => Promise<NotificationFetchResponse>

export async function syncDailyCardsThenLoadNotifications(fetcher: NotificationFetcher) {
  try {
    await fetcher('/api/notifications/sync-daily-cards', { method: 'POST' })
  } catch {
    // A sync outage must not block existing notifications from being read.
  }

  return fetcher('/api/notifications?limit=100')
}
