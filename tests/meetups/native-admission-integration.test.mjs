import test from 'node:test'
import assert from 'node:assert/strict'
import {nativeFullFixture,ids} from './native-admission-full-fixture.mjs'
test('real hosted mentoring role is frozen in deposit, host approval opens native chat and current push',async()=>{
 const f=await nativeFullFixture();try{
  const created=await f.create(),room=created.room.id;await f.enable('mentoring',room)
  await f.act(ids[0],'message',{session_id:room,text:'다음 주 도서관에서 만나요',client_id:crypto.randomUUID()})
  const q=(await f.context(ids[1],'mentoring',room,{role:'mentee'})).quote
  await assert.rejects(f.rpc(ids[1],'prepare_native_meetup_admission',['mentoring',room,JSON.stringify({intro:'배워요',paymentMethod:'new',consent:true,quoteId:q.id,policyVersion:q.policyVersion,idempotencyKey:crypto.randomUUID(),metadata:{role:'mentor'}})]),/deposit_quote_mismatch/)
  const a=await f.confirm((await f.prepare(ids[1],'mentoring',room,{role:'mentee'})).intentId)
  assert.equal(a.admission,'pending');const n=(await f.db.query("select id from public.notifications where payload->>'event'='application_received'and payload->>'entity_type'='admission'and user_id=$1",[ids[0]])).rows[0].id
  assert.equal(await f.value('select quantum_private.common_web_push_notification_current($1)as value',[n]),true)
  const result=await f.decide(ids[0],'mentoring',room,a.id);assert.equal(result.chatHref,`/chat/rooms/mentoring/${room}`)
  assert.equal(await f.value('select quantum_private.common_web_push_notification_current($1)as value',[n]),false)
  const members=(await f.db.query('select role from quantum_private.group_mentoring_members where session_id=$1 and user_id=$2',[room,ids[1]])).rows
  assert.deepEqual(members,[{role:'mentee'}])
  const actual=await f.act(ids[1],'status',{session_id:room});assert.equal(actual.room.messages[0].text,'다음 주 도서관에서 만나요')
  assert.equal((await f.rooms(ids[1],{kind:'mentoring',id:room,cursor:null})).rooms[0].id,room)
  const acceptedNotice=(await f.db.query("select id from public.notifications where payload->>'entity_type'='admission'and payload->>'event'='application_accepted'and user_id=$1",[ids[1]])).rows[0].id
  assert.equal(await f.value('select quantum_private.common_web_push_notification_current($1)as value',[acceptedNotice]),true)
  await f.act(ids[1],'leave',{session_id:room});assert.equal(await f.value('select quantum_private.common_web_push_notification_current($1)as value',[acceptedNotice]),false)
  assert.equal((await f.rpc(ids[1],'get_my_native_meetup_admission',['mentoring',room])).application.payment,'refund_due')
 }finally{await f.db.close()}
})

test('native paid mentoring role quota does not admit the second paid applicant into an occupied mentor slot',async()=>{
 const f=await nativeFullFixture();try{
  const room=(await f.create()).room.id;await f.enable('mentoring',room)
  const a=await f.confirm((await f.prepare(ids[1],'mentoring',room,{role:'mentor'})).intentId),b=await f.confirm((await f.prepare(ids[2],'mentoring',room,{role:'mentor'})).intentId)
  await f.decide(ids[0],'mentoring',room,a.id);await assert.rejects(f.decide(ids[0],'mentoring',room,b.id),/mentoring_role_full/)
  const c=await f.confirm((await f.prepare(ids[3],'mentoring',room,{role:'mentee'})).intentId)
  const notice=(await f.db.query("select id,payload from public.notifications where user_id=$1 and payload->>'event'='application_notice'",[ids[1]])).rows.at(-1)
  assert.ok(notice);assert.equal(JSON.stringify(notice.payload).includes('경험을 정리했어요'),false);assert.equal(JSON.stringify(notice.payload).includes('우리 과 이야기'),false)
  assert.equal(await f.value('select quantum_private.common_web_push_notification_current($1)as value',[notice.id]),true)
  await f.decide(ids[0],'mentoring',room,c.id);assert.equal(await f.value('select quantum_private.common_web_push_notification_current($1)as value',[notice.id]),false)
  assert.equal((await f.decide(ids[0],'mentoring',room,b.id,'decline')).payment,'refund_due')
 }finally{await f.db.close()}
})

test('real mentoring scope changes and host deletion do not permit paid approval or lose refund liability',async()=>{
 const f=await nativeFullFixture();try{
  const room=(await f.create()).room.id;await f.enable('mentoring',room)
  const a=await f.confirm((await f.prepare(ids[1],'mentoring',room,{role:'mentee'})).intentId)
  await f.db.query("update quantum_private.community_member_profiles set department='전자공학과'where user_id=$1",[ids[1]])
  await assert.rejects(f.decide(ids[0],'mentoring',room,a.id),/mentoring_not_found/)
  const cancelled=await f.rpc(ids[1],'cancel_my_native_meetup_admission',['mentoring',room,a.id,0]);assert.equal(cancelled.payment,'refund_due')
  const b=await f.confirm((await f.prepare(ids[2],'mentoring',room,{role:'mentee'})).intentId)
  await f.db.query('delete from public.users where id=$1',[ids[0]])
  const after=(await f.rpc(ids[2],'get_my_native_meetup_admission',['mentoring',room])).application;assert.equal(after.id,b.id);assert.equal(after.admission,'cancelled');assert.equal(after.payment,'refund_due')
 }finally{await f.db.close()}
})
