/* Dedicated scope /notifications/; never replaces Tonight or Campus Seven SW. */
const QUANTUM_ALERT_BODY = '새 알림이 도착했어요. 앱에서 확인해 주세요.'
const QUANTUM_ALERT_TARGET = '/notifications'
const quantumNotificationId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : 'quantum-alert'
self.addEventListener('push', event => {
 let payload = {}
 try { payload = event.data?.json() ?? {} } catch { /* Generic payload only. */ }
 event.waitUntil(self.registration.showNotification('Quantum', {
  body: QUANTUM_ALERT_BODY,
  tag: 'quantum-' + quantumNotificationId(payload.notificationId),
  renotify: false,
  data: { url: QUANTUM_ALERT_TARGET },
 }))
})
self.addEventListener('notificationclick', event => {
 event.notification.close()
 event.waitUntil((async () => {
  // Notification content cannot supply a URL, room, account or external link.
  const target = new URL(QUANTUM_ALERT_TARGET, self.location.origin).href
  const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true})
  for(const client of windows) {
   if(new URL(client.url).origin !== self.location.origin)continue
   if('navigate' in client && 'focus' in client){
    try{const navigated=await client.navigate(target);if(navigated){await navigated.focus();return}}catch{/* Try another window or open the safe target. */}
   }
  }
  await self.clients.openWindow(target)
 })())
})
