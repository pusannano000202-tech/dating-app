import test from 'node:test'
import assert from 'node:assert/strict'
import {parseApplicationStatusView, parseApplicationManagementView,latestApplicationNotices,canRestartApplication} from '../../lib/meetups/application-view.ts'
const room = '96000000-0000-4000-8000-000000000001'
const owner = '96000000-0000-4000-8000-000000000002'
const id = '96000000-0000-4000-8000-000000000003'
const pending = {id, admission:'pending', payment:'held', amountKrw:17000, revision:1, chatHref:null}
const context = {accountKey:owner, room:{id:room,title:'함께 공부',memberCount:3,capacity:5},isHost:true,pendingCount:1,applications:[{...pending,alias:'오늘의 별칭',intro:'같이 할게요',strength:'설명을 도울게요',createdAt:'2026-09-12T01:00:00Z'}],notices:[],hasMore:false,nextCursor:null}
test('applicant state is account-bound, and pending never opens chat',()=>{
 assert.equal(parseApplicationStatusView({accountKey:owner,application:pending},owner,room)?.application.admission,'pending')
 assert.equal(parseApplicationStatusView({accountKey:id,application:pending},owner,room),null)
 assert.equal(parseApplicationStatusView({accountKey:owner,application:{...pending,chatHref:`/chat/rooms/meetup/${room}`}},owner,room),null)
})
test('only accepted current membership opens the exact room, not an arbitrary link',()=>{
 const accepted={...pending,admission:'accepted',chatHref:`/chat/rooms/meetup/${room}`}
 assert.equal(parseApplicationStatusView({accountKey:owner,application:accepted},owner,room)?.application.chatHref,accepted.chatHref)
 for(const chatHref of [`/chat/rooms/meetup/${id}`,'https://evil.test','//evil.test','/chat/rooms/meetup/../admin']) assert.equal(parseApplicationStatusView({accountKey:owner,application:{...accepted,chatHref}},owner,room),null)
 assert.equal(parseApplicationStatusView({accountKey:owner,application:{...accepted,chatHref:null}},owner,room)?.application.chatHref,null)
})
test('financial status is independent and never inferred as refunded',()=>{
 assert.equal(parseApplicationStatusView({accountKey:owner,application:{...pending,admission:'declined',payment:'refund_due'}},owner,room)?.application.payment,'refund_due')
 for(const amountKrw of [0,-1,NaN,1.1]) assert.equal(parseApplicationStatusView({accountKey:owner,application:{...pending,amountKrw}},owner,room),null)
 for(const revision of [-1,1.5,'1']) assert.equal(parseApplicationStatusView({accountKey:owner,application:{...pending,revision}},owner,room),null)
})
test('management data never shows applications to ordinary room members',()=>{
 assert.equal(parseApplicationManagementView(context,owner,room)?.pendingCount,1)
 assert.equal(parseApplicationManagementView({...context,isHost:false},owner,room),null)
 assert.equal(parseApplicationManagementView({...context,isHost:false,applications:[]},owner,room)?.applications.length,0)
 assert.equal(parseApplicationManagementView({...context,accountKey:id},owner,room),null)
 assert.equal(parseApplicationManagementView({...context,room:{...context.room,id}},owner,room),null)
})
test('invalid pagination, notice types and impossible capacity fail closed',()=>{
 for(const invalid of [{hasMore:true,nextCursor:null},{pendingCount:-1},{notices:[{id,kind:'private_intro',text:'secret',createdAt:'2026-09-12T01:00:00Z'}]},{room:{...context.room,memberCount:7}}]) assert.equal(parseApplicationManagementView({...context,...invalid},owner,room),null)
})
test('the latest three room notices remain visible after a fourth application, in chronological order',()=>{
 const rows=[1,2,3,4,5].map(n=>({id:String(n),createdAt:`2026-09-12T01:00:0${n}Z`,kind:'application_received',text:'notice'+n}))
 assert.deepEqual(latestApplicationNotices(rows).map(n=>n.id),['3','4','5'])
 assert.deepEqual(latestApplicationNotices([...rows].reverse()).map(n=>n.id),['3','4','5'])
})
test('only an explicit same-account choice can reopen a terminal application, preserving prior refund status',()=>{
 for(const admission of ['declined','cancelled'])assert.equal(canRestartApplication({...pending,admission,payment:'refund_due'}, {owner,applicationId:id},owner),true)
 assert.equal(canRestartApplication(pending,{owner,applicationId:id},owner),false)
 assert.equal(canRestartApplication({...pending,admission:'accepted'},{owner,applicationId:id},owner),false)
 assert.equal(canRestartApplication({...pending,admission:'cancelled'},null,owner),false)
 assert.equal(canRestartApplication({...pending,admission:'cancelled'},{owner:id,applicationId:id},owner),false)
})
