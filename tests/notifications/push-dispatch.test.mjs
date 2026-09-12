import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createContext,runInContext} from 'node:vm'
import {dispatchCommonPush} from '../../lib/notifications/web-push-dispatch.ts'
import {classifyCommonPushFailure} from '../../lib/notifications/web-push-contract.ts'
const claim={delivery_id:'10000000-0000-4000-8000-000000000001',revision:1,notification_id:'10000000-0000-4000-8000-000000000002',subscription_id:'10000000-0000-4000-8000-000000000003',endpoint:'https://fcm.googleapis.com/test',p256dh:'private-endpoint-key',auth_secret:'private-auth-secret'}
test('dispatcher rechecks current authorization immediately before sending and reports accepted not delivered',async()=>{
 const events=[]
 const result=await dispatchCommonPush({claim:async()=>[claim],current:async c=>{events.push('current');return c},send:async()=>{events.push('send')},failure:classifyCommonPushFailure,complete:async(c,o,e)=>{events.push(o);assert.equal(e,null);return true}})
 assert.deepEqual(events,['current','send','provider_accepted']);assert.equal(result.providerAccepted,1);assert.equal('delivered'in result,false)
})
test('revoked recipient never sends; provider failure retries, expiration disables and stale completions remain unknown',async()=>{
 let sends=0
 const base={claim:async()=>[claim],current:async c=>c,send:async()=>{sends++},failure:classifyCommonPushFailure,complete:async()=>true}
 assert.equal((await dispatchCommonPush({...base,current:async()=>null})).cancelled,1);assert.equal(sends,0)
 const outcomes=[]
 assert.equal((await dispatchCommonPush({...base,send:async()=>{throw {statusCode:410}},complete:async(c,o)=>{outcomes.push(o);return true}})).expired,1)
 assert.deepEqual(outcomes,['expired'])
 assert.equal((await dispatchCommonPush({...base,send:async()=>{throw {statusCode:503}}})).retryScheduled,1)
 const unknown=await dispatchCommonPush({...base,complete:async()=>false});assert.equal(unknown.completionFailed,1);assert.equal(unknown.providerAccepted,0)
})
test('a failed database recheck cannot accidentally send a previously leased payload',async()=>{
 let sends=0
 const result=await dispatchCommonPush({claim:async()=>[claim],current:async()=>{throw Error('db unavailable')},send:async()=>{sends++},failure:classifyCommonPushFailure,complete:async(c,o,code)=>{assert.equal(o,'retry');assert.equal(code,'transport_failed');return true}})
 assert.equal(sends,0);assert.equal(result.retryScheduled,1)
})
test('service worker ignores private message text and attacker links; retries reuse a quiet tag',async()=>{
 const handlers={},shown=[],opened=[],focused=[],id=claim.notification_id
 const self={location:{origin:'https://quantum.example'},addEventListener:(name,fn)=>{handlers[name]=fn},registration:{showNotification:async(...args)=>shown.push(args)},clients:{matchAll:async()=>[{url:'https://foreign.example/',focus:async()=>focused.push('foreign')},{url:'https://quantum.example/meetups',focus:async()=>focused.push('own'),navigate:async url=>{opened.push(url);return {focus:async()=>focused.push('own')}}}],openWindow:async url=>opened.push(url)}}
 runInContext(await readFile(new URL('../../public/quantum-notifications-sw.js',import.meta.url),'utf8'),createContext({self,URL}))
 let pending
 handlers.push({data:{json:()=>({notificationId:id,title:'PRIVATE NAME',body:'PRIVATE MESSAGE',url:'https://evil.test'})},waitUntil:p=>{pending=p}});await pending
 assert.equal(shown[0][0],'Quantum');assert.equal(shown[0][1].body.includes('PRIVATE'),false);assert.equal(shown[0][1].renotify,false)
 handlers.push({data:{json:()=>({notificationId:id})},waitUntil:p=>{pending=p}});await pending;assert.equal(shown[0][1].tag,shown[1][1].tag)
 handlers.notificationclick({notification:{close(){},data:{url:'javascript:evil()'}},waitUntil:p=>{pending=p}});await pending
 assert.deepEqual(opened,['https://quantum.example/notifications']);assert.deepEqual(focused,['own'])
})
