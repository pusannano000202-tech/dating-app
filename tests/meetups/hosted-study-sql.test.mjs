import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {hostedStudyFixture} from './hosted-study-fixture.mjs'
import {nativeFixture} from './native-admission-fixture.mjs'

test('explicit study creation preserves ten sessions and cannot silently join another host',async()=>{
 const f=await hostedStudyFixture();try{
  const key=randomUUID(),a=await f.createStudy(undefined,{client_id:key}),replay=await f.createStudy(undefined,{client_id:key})
  assert.equal(a.admission_mode,'hosted');assert.equal(a.title,'함께 푸는 미적분');assert.equal(a.is_host,true);assert.equal(a.member_count,1);assert.equal(a.sessions.length,10);assert.equal(replay.id,a.id)
  const b=await f.createStudy(f.users.mechanicalMember);assert.notEqual(a.id,b.id);assert.equal(b.member_count,1)
  assert.equal((await f.study('list',{course_id:'pnu:AN1600527',level:'beginner'})).rooms.length,2)
  await assert.rejects(f.study('join',{room_id:a.id}),/admission_required/)
  await assert.rejects(f.study('create',{course_id:'pnu:AN1600527',level:'beginner'}),/hosted_creation_required/)
  await f.db.exec('set role authenticated');await assert.rejects(f.value("select quantum_private.study_room_legacy_action('join',$1::jsonb)as value",[JSON.stringify({room_id:a.id})]),/permission denied/);await f.db.exec('reset role')
 }finally{await f.db.close()}
})

test('host departure hides closed recruitment from outsiders while keeping joined study history and refund_due',async()=>{
 const f=await nativeFixture();try{
  await f.enableNativePolicy()
  const application=await f.nativeConfirm((await f.nativePrepare()).intentId)
  await f.as(f.users.mechanicalCaptain);await f.nativeDecide(application.id)
  await f.study('message',{room_id:f.nativeRoom,message:'다음 회차도 이 기록에서 이어가요',idempotency_key:randomUUID()})
  await f.study('leave',{room_id:f.nativeRoom})
  await f.as(f.users.mechanicalReserve)
  const outsiders=await f.study('list',{course_id:'pnu:AN1600527',level:'beginner'})
  assert.equal(outsiders.rooms.some(room=>room.id===f.nativeRoom),false,'closed hosted room must not advertise an application that cannot proceed')
  await assert.rejects(f.nativeContext(),/meetup_closed/)
  await f.as(f.users.mechanicalMember)
  const ownList=await f.study('list',{course_id:'pnu:AN1600527',level:'beginner'})
  const ownRoom=ownList.rooms.find(room=>room.id===f.nativeRoom)
  assert.equal(ownRoom?.joined,true);assert.equal(ownRoom.recruitment_closed,true)
  const detail=await f.study('detail',{room_id:f.nativeRoom})
  assert.equal(detail.recruitment_closed,true);assert.equal(detail.member_count,1);assert.equal(detail.sessions.length,10)
  assert.equal(detail.messages[0].message,'다음 회차도 이 기록에서 이어가요')
  const status=await f.value('select public.get_my_native_meetup_admission($1,$2)as value',['study',f.nativeRoom])
  assert.equal(status.application.payment,'refund_due')
  await f.study('message',{room_id:f.nativeRoom,message:'모집은 닫혀도 기존 대화는 이어가요',idempotency_key:randomUUID()})
 }finally{await f.db.close()}
})

test('host scope loss closes the listing with the same eligibility predicate as admission',async()=>{
 const f=await nativeFixture();try{
  await f.enableNativePolicy()
  const application=await f.nativeConfirm((await f.nativePrepare()).intentId)
  await f.as(f.users.mechanicalCaptain);await f.nativeDecide(application.id)
  await f.db.query("update quantum_private.community_member_profiles set department='다른과'where user_id=$1",[f.users.mechanicalCaptain])
  assert.equal((await f.db.query('select recruitment_closed from quantum_private.study_rooms where id=$1',[f.nativeRoom])).rows[0].recruitment_closed,false)
  await f.as(f.users.mechanicalReserve)
  assert.equal((await f.study('list',{course_id:'pnu:AN1600527',level:'beginner'})).rooms.some(room=>room.id===f.nativeRoom),false)
  await assert.rejects(f.nativeContext(),/meetup_closed/)
  await f.as(f.users.mechanicalMember)
  const detail=await f.study('detail',{room_id:f.nativeRoom})
  assert.equal(detail.recruitment_closed,true);assert.equal(detail.joined,true);assert.equal(detail.sessions.length,10)
 }finally{await f.db.close()}
})
