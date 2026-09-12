import test from 'node:test'
import assert from 'node:assert/strict'
import {nativeFixture} from './native-admission-fixture.mjs'

test('native study requires configured policy and confirmed deposit before approval and historical chat',async()=>{
 const f=await nativeFixture();try{
  await f.as(f.users.mechanicalMember);const blocked=await f.nativeContext();assert.equal(blocked.quote,null);assert.equal(blocked.checkoutEnabled,false)
  await f.enableNativePolicy();const p=await f.nativePrepare();await assert.rejects(f.study('detail',{room_id:f.nativeRoom}),/membership_required/)
  await f.as(f.users.mechanicalCaptain);await assert.rejects(f.nativeDecide(p.intentId),/admission_not_found/)
  await f.study('message',{room_id:f.nativeRoom,message:'다음 약속은 도서관에서 같이 정해요',idempotency_key:crypto.randomUUID()})
  const a=await f.nativeConfirm(p.intentId);assert.equal(a.admission,'pending');assert.equal(a.chatHref,null)
  await f.as(f.users.mechanicalCaptain);const list=await f.nativeList();assert.equal(list.pendingCount,1);assert.equal(list.applications[0].intro,'미분 같이 풀어요');assert.deepEqual(list.applications[0].metadata,{})
  const accepted=await f.nativeDecide(a.id);assert.equal(accepted.chatHref,`/chat/rooms/study_room/${f.nativeRoom}`)
  await f.as(f.users.mechanicalMember);const detail=await f.study('detail',{room_id:f.nativeRoom});assert.equal(detail.messages[0].message,'다음 약속은 도서관에서 같이 정해요');assert.equal(detail.sessions.length,10)
 }finally{await f.db.close()}
})

test('shared receipt cannot fund custom and native admissions, old custom approval still works',async()=>{
 const f=await nativeFixture();try{
  await f.enableNativePolicy();const custom=await f.prepare(),native=await f.nativePrepare(),receipt=crypto.randomUUID(),a=await f.confirm(custom.intentId,receipt)
  await assert.rejects(f.nativeConfirm(native.intentId,receipt),/deposit_receipt_reused/)
  await assert.rejects(f.confirm(native.intentId),/admission_intent_not_found/)
  await f.as(f.users.mechanicalCaptain);assert.equal((await f.decide(a.id)).admission,'accepted')
  const b=await f.nativeConfirm(native.intentId);assert.equal(b.admission,'pending');await f.as(f.users.mechanicalCaptain);assert.equal((await f.nativeDecide(b.id)).admission,'accepted')
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.activity_meetup_admission_deposits')).rows[0].n,2)
 }finally{await f.db.close()}
})

test('native host review denies wrong host, changed scope and blocks; owner can cancel for refund_due',async()=>{
 const f=await nativeFixture();try{
  await f.enableNativePolicy();const a=await f.nativeConfirm((await f.nativePrepare()).intentId)
  await f.as(f.users.mechanicalReserve);await assert.rejects(f.nativeDecide(a.id),/admission_host_required/)
  await f.db.query("insert into public.friendships values($1,$2,'blocked')",[f.users.mechanicalCaptain,f.users.mechanicalMember]);await f.as(f.users.mechanicalCaptain)
  await assert.rejects(f.nativeDecide(a.id),/admission_pair_blocked/);assert.equal((await f.nativeList()).applications[0].intro,'')
  await f.db.query('delete from public.friendships');await f.db.query("update quantum_private.community_member_profiles set department='다른과'where user_id=$1",[f.users.mechanicalMember]);await assert.rejects(f.nativeDecide(a.id),/study_room_not_found/)
  await f.as(f.users.mechanicalMember);const cancelled=await f.nativeCancel(a.id);assert.equal(cancelled.payment,'refund_due');assert.equal(cancelled.admission,'cancelled');assert.deepEqual(await f.nativeCancel(a.id),cancelled)
 }finally{await f.db.close()}
})

test('last seat is not reserved by payment and only four applicants can join a five-person hosted study',async()=>{
 const f=await nativeFixture();try{
  await f.enableNativePolicy();const applications=[]
  for(let i=0;i<5;i++){const u=await f.addNativeUser();applications.push(await f.nativeConfirm((await f.nativePrepare(u)).intentId))}
  await f.as(f.users.mechanicalCaptain)
  for(const a of applications.slice(0,4))await f.nativeDecide(a.id)
  await assert.rejects(f.nativeDecide(applications[4].id),/meetup_full/)
  const list=await f.nativeList();assert.equal(list.room.memberCount,5);assert.equal(list.pendingCount,1)
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.study_rooms')).rows[0].n,1)
  assert.equal((await f.nativeDecide(applications[4].id,'decline')).payment,'refund_due')
 }finally{await f.db.close()}
})

test('scope-ineligible old seat uses same count in management/detail/approval and keeps history',async()=>{
 const f=await nativeFixture();try{
  await f.enableNativePolicy();const a=await f.nativeConfirm((await f.nativePrepare()).intentId);await f.as(f.users.mechanicalCaptain);await f.nativeDecide(a.id)
  await f.as(f.users.mechanicalMember);await f.study('message',{room_id:f.nativeRoom,message:'지난 공부 기록을 남겨요',idempotency_key:crypto.randomUUID()})
  await f.db.query("update quantum_private.community_member_profiles set department='다른과'where user_id=$1",[f.users.mechanicalMember]);await f.as(f.users.mechanicalCaptain)
  assert.equal((await f.nativeList()).room.memberCount,1);const before=await f.study('detail',{room_id:f.nativeRoom});assert.equal(before.member_count,1);assert.equal(before.members.length,1)
  const b=await f.nativeConfirm((await f.nativePrepare(f.users.mechanicalReserve)).intentId);await f.as(f.users.mechanicalCaptain);await f.nativeDecide(b.id)
  const after=await f.study('detail',{room_id:f.nativeRoom});assert.equal(after.member_count,2);assert.equal(after.messages.length,1)
  assert.equal((await f.db.query('select d.state from quantum_private.activity_meetup_admission_deposits d join quantum_private.activity_meetup_admissions a on a.deposit_id=d.id where a.id=$1',[a.id])).rows[0].state,'refund_due')
 }finally{await f.db.close()}
})

test('approval joins at current session without rewriting ten-session schedule and prior recaps',async()=>{
 const f=await nativeFixture();try{
  await f.enableNativePolicy();await f.db.query('update quantum_private.study_rooms set current_session=3 where id=$1',[f.nativeRoom])
  const a=await f.nativeConfirm((await f.nativePrepare()).intentId);await f.as(f.users.mechanicalCaptain);await f.nativeDecide(a.id);await f.as(f.users.mechanicalMember)
  const detail=await f.study('detail',{room_id:f.nativeRoom});assert.equal(detail.sessions.length,10);assert.equal(detail.sessions[0].my_attendance,'not_member');assert.equal(detail.sessions[1].my_attendance,'not_member');assert.equal(detail.sessions[2].my_attendance,'undecided')
  await f.study('leave',{room_id:f.nativeRoom,report_reason:'대화가 불편하여 신고하고 나갑니다'});const status=await f.value('select public.get_my_native_meetup_admission($1,$2)as value',['study',f.nativeRoom]);assert.equal(status.application.payment,'refund_due');assert.equal((await f.db.query('select count(*)::int n from quantum_private.study_room_reports')).rows[0].n,1)
 }finally{await f.db.close()}
})

test('room closure/account deletion retain financial receipt but erase private application introduction',async()=>{
 const f=await nativeFixture();try{
  await f.enableNativePolicy();const a=await f.nativeConfirm((await f.nativePrepare()).intentId)
  await f.db.query('delete from quantum_private.community_member_profiles where user_id=$1',[f.users.mechanicalMember]);await f.db.query('delete from public.users where id=$1',[f.users.mechanicalMember])
  assert.equal((await f.db.query('select *from quantum_private.activity_meetup_admissions where id=$1',[a.id])).rows.length,0)
  const paid=(await f.db.query('select *from quantum_private.activity_meetup_admission_deposits')).rows[0];assert.equal(paid.user_id,null);assert.equal(paid.state,'refund_due');assert.equal('intro'in paid,false)
  assert.equal(paid.source_kind,'study');assert.equal(paid.source_room_id,f.nativeRoom)
  await assert.rejects(f.db.query("update quantum_private.activity_meetup_admission_deposits set source_kind='custom_meetup'where id=$1",[paid.id]),/deposit_origin_immutable/)
  const b=await f.nativeConfirm((await f.nativePrepare(f.users.mechanicalReserve)).intentId);await f.as(f.users.mechanicalCaptain);await f.study('leave',{room_id:f.nativeRoom})
  await f.as(f.users.mechanicalReserve);const status=await f.value('select public.get_my_native_meetup_admission($1,$2)as value',['study',f.nativeRoom]);assert.equal(status.application.id,b.id);assert.equal(status.application.payment,'refund_due')
 }finally{await f.db.close()}
})

test('native target XOR, private ACL and service-only payment prevent bypasses',async()=>{
 const f=await nativeFixture();try{
  await f.enableNativePolicy();const p=await f.nativePrepare();await f.db.exec('set role authenticated')
  await assert.rejects(f.value('select public.confirm_native_meetup_admission_payment_for_service($1,$2,$3,$4)as value',[p.intentId,'fixture-provider','pretend',17000]),/permission denied/)
  await assert.rejects(f.value('select quantum_private.hosted_study_admit($1,$2,$3)as value',[f.nativeRoom,f.users.mechanicalMember,'{}']),/permission denied/)
  await assert.rejects(f.db.query('select *from quantum_private.activity_meetup_admission_intents'),/permission denied/)
  await f.db.exec('reset role');await assert.rejects(f.db.query('update quantum_private.activity_meetup_admission_intents set meetup_id=$1 where id=$2',[f.roomId,p.intentId]),/target_check/)
  await f.db.exec('set role anon');await assert.rejects(f.nativeContext(),/permission denied/);await f.db.exec('reset role')
 }finally{await f.db.close()}
})
