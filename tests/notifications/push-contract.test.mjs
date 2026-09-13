import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedCommonPushEndpoint, parseCommonPushSubscription, commonPushConfig, commonPushReadiness, commonPushPayload, classifyCommonPushFailure, COMMON_PUSH_CONSENT_VERSION } from '../../lib/notifications/web-push-contract.ts'

const valid = { endpoint:'https://fcm.googleapis.com/fcm/send/test-token', keys:{p256dh:'B'+'a'.repeat(86),auth:'b'.repeat(22)},consentVersion:COMMON_PUSH_CONSENT_VERSION }
test('subscriptions require explicit versioned consent and bounded strict keys',()=>{
 assert.deepEqual(parseCommonPushSubscription(valid),valid)
 for(const body of [null,[],{...valid,userId:'other'},{...valid,consentVersion:'old'},{...valid,keys:{...valid.keys,secret:'x'}},{...valid,keys:{...valid.keys,auth:'a'.repeat(21)}}])assert.equal(parseCommonPushSubscription(body),null)
})
test('only HTTPS official provider endpoints on default ports are allowed, never user arbitrary URLs',()=>{
 for(const endpoint of ['https://fcm.googleapis.com/fcm/send/token','https://updates.push.services.mozilla.com/wpush/v2/token','https://web.push.apple.com/Qtoken','https://abc.notify.windows.com/?token=abc'])assert.equal(allowedCommonPushEndpoint(endpoint),true,endpoint)
 for(const endpoint of ['http://fcm.googleapis.com/token','https://127.0.0.1/token','https://[::1]/token','https://fcm.googleapis.com.evil.example/token','https://evil.example/token','https://fcm.googleapis.com:8443/token','https://user:pass@fcm.googleapis.com/token','https://fcm.googleapis.com/token#secret','https://fcm.googleapis.com/','https://fcm.googleapis.com\\@evil.test/token'])assert.equal(allowedCommonPushEndpoint(endpoint),false,endpoint)
})
test('missing/disabled provider settings never advertise a working notification service',()=>{
 assert.equal(commonPushConfig({}).ready,false)
 const env={QUANTUM_WEB_PUSH_ENABLED:'true',QUANTUM_WEB_PUSH_PUBLIC_KEY:valid.keys.p256dh,QUANTUM_WEB_PUSH_PRIVATE_KEY:'x'.repeat(43),QUANTUM_WEB_PUSH_SUBJECT:'mailto:operator@example.com'}
 assert.equal(commonPushConfig(env).ready,true)
 assert.equal(commonPushConfig({...env,QUANTUM_WEB_PUSH_ENABLED:'false'}).ready,false)
 assert.equal(commonPushConfig({...env,QUANTUM_WEB_PUSH_SUBJECT:'javascript:alert(1)'}).ready,false)
})
test('lockscreen payload is generic and never includes user content or unsafe deep links',()=>{
 const id='10000000-0000-4000-8000-000000000001'
 assert.deepEqual(commonPushPayload(id),{title:'Quantum',body:'새 알림이 도착했어요. 앱에서 확인해 주세요.',url:'/notifications',notificationId:id})
 assert.equal(JSON.stringify(commonPushPayload('https://evil.test/전화번호')).includes('evil'),false)
})
test('provider keys alone do not advertise dispatcher readiness or device delivery',()=>{
 const env={QUANTUM_WEB_PUSH_ENABLED:'true',QUANTUM_WEB_PUSH_PUBLIC_KEY:valid.keys.p256dh,QUANTUM_WEB_PUSH_PRIVATE_KEY:'x'.repeat(43),QUANTUM_WEB_PUSH_SUBJECT:'mailto:operator@example.com'}
 assert.equal(commonPushReadiness(env).available,false)
 const ready=commonPushReadiness({...env,CRON_SECRET:'x'.repeat(32),SUPABASE_SERVICE_ROLE_KEY:'fixture-only'})
 assert.equal(ready.available,true);assert.equal(ready.schedulerVerified,false);assert.equal(ready.phoneDeliveryVerified,false)
 assert.ok(!JSON.stringify(ready).includes('fixture-only'))
})
test('expired endpoints are revoked and transport acceptance is distinct from phone delivery',()=>{
 assert.deepEqual(classifyCommonPushFailure({statusCode:410}),{code:'endpoint_expired',revoke:true,retry:false})
 assert.equal(classifyCommonPushFailure({statusCode:429}).retry,true)
 assert.equal(classifyCommonPushFailure({statusCode:503}).retry,true)
 assert.equal(classifyCommonPushFailure({statusCode:403}).revoke,false)
 assert.equal(classifyCommonPushFailure({statusCode:400}).retry,false)
 assert.equal(classifyCommonPushFailure(new Error('endpoint secrets must not appear')).code,'transport_failed')
})
