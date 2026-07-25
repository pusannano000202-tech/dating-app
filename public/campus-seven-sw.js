const CAMPUS_SEVEN_URL = '/match/campus-seven'
const CAMPUS_SEVEN_BODY = '새 안내가 도착했어요. 앱에서 확인해 주세요.'

self.addEventListener('push', (event) => {
  event.waitUntil(self.registration.showNotification('Quantum', {
    body: CAMPUS_SEVEN_BODY,
    tag: 'campus-seven-guide',
    renotify: true,
    data: { url: CAMPUS_SEVEN_URL },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if ('focus' in client) {
        await client.focus()
        if ('navigate' in client) await client.navigate(CAMPUS_SEVEN_URL)
        return
      }
    }
    await self.clients.openWindow(CAMPUS_SEVEN_URL)
  })())
})
