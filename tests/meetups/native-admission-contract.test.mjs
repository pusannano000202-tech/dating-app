import test from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
registerHooks({resolve(s,c,next){return next(s.startsWith('./')&&c.parentURL?.includes('/lib/meetups/')&&!s.endsWith('.ts')?s+'.ts':s,c)}})
const api=await import('../../lib/meetups/native-admission-contract.ts')
const room={kind:'study',id:'11111111-1111-4111-8111-111111111111'},id='22222222-2222-4222-8222-222222222222'
test('native metadata cannot inject paid status or unrelated roles',()=>{
 assert.deepEqual(api.parseNativeAdmissionMetadata('study',{}),{})
 assert.equal(api.parseNativeAdmissionMetadata('study',{role:'mentor'}),null)
 assert.equal(api.parseNativeAdmissionMetadata('mentoring',{role:'mentor',paid:true}),null)
 assert.deepEqual(api.parseNativeAdmissionMetadata('mentoring',{role:'mentee'}),{role:'mentee'})
 const input={intro:'함께해요',paymentMethod:'new',consent:true,policyVersion:'v1',quoteId:id,idempotencyKey:id,metadata:{}}
 assert.equal(api.parseNativeAdmissionInput('study',input).ok,true)
 for(const patch of [{paid:true},{amountKrw:1},{metadata:{paid:true}},{userId:id}])assert.equal(api.parseNativeAdmissionInput('study',{...input,...patch}).ok,false)
})
test('native admission never resolves to a custom room or wrong domain',()=>{
 const value={id,admission:'accepted',payment:'held',amountKrw:17000,revision:1,chatHref:`/chat/rooms/study_room/${room.id}`}
 assert.ok(api.parseNativeAdmissionStatus(value,room))
 for(const href of [`/chat/rooms/meetup/${room.id}`,`/chat/rooms/mentoring/${room.id}`,'https://example.com'])assert.equal(api.parseNativeAdmissionStatus({...value,chatHref:href},room),null)
 assert.equal(api.parseNativeAdmissionStatus({...value,admission:'pending'},room),null)
})
