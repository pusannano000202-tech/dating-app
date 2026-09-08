const TONIGHT_URL = '/tonight'
const TONIGHT_ALLOWED_URLS = new Set(['/tonight', '/partner/tonight'])
const TONIGHT_BODY = '오늘밤 만나기 새 안내가 도착했어요. 앱에서 확인해 주세요.'

function safeTonightUrl(value) {
  return typeof value === 'string' && TONIGHT_ALLOWED_URLS.has(value)
    ? value
    : TONIGHT_URL
}

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }
  event.waitUntil(self.registration.showNotification('Quantum', {
    body: typeof payload.body === 'string' ? payload.body : TONIGHT_BODY,
    tag: typeof payload.notificationId === 'string' ? payload.notificationId : 'tonight-journey',
    renotify: true,
    data: { url: safeTonightUrl(payload.url) },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const targetUrl = safeTonightUrl(event.notification?.data?.url)
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) await client.navigate(targetUrl)
        return
      }
    }
    await self.clients.openWindow(targetUrl)
  })())
})
