import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {lifecycleFixture} from './admission-lifecycle-fixture.mjs'
test('confirmed receipt creates one pending application, room notice and separate host notification',async()=>{
 const f=await lifecycleFixture();try{const p=await f.prepare();await f.as(f.users.mechanicalCaptain);assert.equal((await f.list()).pendingCount,0)
 const receipt=randomUUID(),a=await f.confirm(p.intentId,receipt),again=await f.confirm(p.intentId,receipt)
 assert.equal(a.admission,'pending');assert.equal(a.payment,'held');assert.equal(a.id,again.id)
 await f.as(f.users.mechanicalCaptain);const list=await f.list();assert.equal(list.pendingCount,1);assert.equal(list.applications[0].intro,'함께할래요');assert.equal(list.notices.length,1)
 assert.equal((await f.db.query('select * from public.notifications where user_id=$1',[f.users.mechanicalCaptain])).rows.length,1)
 assert.equal((await f.db.query("select * from public.activity_meetup_members where meetup_id=$1 and user_id=$2 and status='joined'",[f.roomId,f.users.mechanicalMember])).rows.length,0)
 }finally{await f.db.close()}
})
test('only service caller confirms, no unpaid approval, duplicate receipt cannot fund another intent',async()=>{
 const f=await lifecycleFixture();try{const p=await f.prepare();await f.db.exec('set role authenticated');await assert.rejects(f.value('select public.confirm_activity_meetup_admission_payment_for_service($1,$2,$3,$4)as value',[p.intentId,'fixture-provider','fake',17000]),/permission denied/);await f.db.exec('reset role')
 await f.as(f.users.mechanicalCaptain);await assert.rejects(f.decide(p.intentId),/admission_not_found/)
 await assert.rejects(f.confirm(p.intentId,randomUUID(),1),/deposit_receipt_mismatch/)
 const receipt=randomUUID();await f.confirm(p.intentId,receipt);const other=await f.prepare(f.users.mechanicalReserve);await assert.rejects(f.confirm(other.intentId,receipt),/deposit_receipt_reused/)
 }finally{await f.db.close()}
})
test('host approval grants membership and applicant notification, exact replay is harmless',async()=>{
 const f=await lifecycleFixture();try{const a=await f.confirm((await f.prepare()).intentId);await f.as(f.users.mechanicalReserve);await assert.rejects(f.decide(a.id),/admission_host_required/)
 await f.as(f.users.mechanicalCaptain);const result=await f.decide(a.id);assert.equal(result.admission,'accepted');assert.equal(result.chatHref,`/chat/rooms/meetup/${f.roomId}`);assert.deepEqual(await f.decide(a.id),result)
 await f.as(f.users.mechanicalMember);assert.equal((await f.status()).application.chatHref,result.chatHref);await assert.rejects(f.cancel(a.id,1),/admission_already_accepted/)
 const member=(await f.list());assert.equal(member.isHost,false);assert.deepEqual(member.applications,[]);assert.equal(member.notices.length,2)
 assert.equal((await f.db.query("select count(*)::int count from public.notifications where user_id=$1 and payload->>'event'='application_accepted'",[f.users.mechanicalMember])).rows[0].count,1)
 }finally{await f.db.close()}
})
test('decline and applicant cancellation retain refund_due and never claim refunded',async()=>{
 const f=await lifecycleFixture();try{const a=await f.confirm((await f.prepare()).intentId);await f.as(f.users.mechanicalReserve);await assert.rejects(f.cancel(a.id),/admission_not_found/)
 await f.as(f.users.mechanicalCaptain);assert.equal((await f.decide(a.id,'decline')).payment,'refund_due')
 const b=await f.confirm((await f.prepare(f.users.mechanicalReserve)).intentId);await f.as(f.users.mechanicalReserve);const result=await f.cancel(b.id);assert.equal(result.admission,'cancelled');assert.equal(result.payment,'refund_due');assert.deepEqual(await f.cancel(b.id),result)
 assert.equal((await f.db.query('select * from quantum_private.activity_meetup_admission_refund_outbox')).rows.length,2)
 }finally{await f.db.close()}
})
test('changed scope, block, full room and expired intent cannot admit a paid applicant',async()=>{
 const f=await lifecycleFixture();try{const a=await f.confirm((await f.prepare()).intentId);await f.as(f.users.mechanicalCaptain)
 await f.db.query("insert into public.friendships values($1,$2,'blocked')",[f.users.mechanicalCaptain,f.users.mechanicalMember]);await assert.rejects(f.decide(a.id),/admission_pair_blocked/)
 await f.db.query('delete from public.friendships');await f.db.query("update quantum_private.community_member_profiles set department='다른학과'where user_id=$1",[f.users.mechanicalMember]);await assert.rejects(f.decide(a.id),/meetup_not_found/)
 await f.db.query("update quantum_private.community_member_profiles set department='기계공학과'where user_id=$1",[f.users.mechanicalMember]);await f.db.query("update public.activity_meetups set capacity=2 where id=$1",[f.roomId]);await f.db.query("insert into public.activity_meetup_members(meetup_id,user_id,role)values($1,$2,'member')",[f.roomId,f.users.mechanicalReserve]);await assert.rejects(f.decide(a.id),/meetup_full/)
 await f.db.query("update public.activity_meetups set capacity=3 where id=$1",[f.roomId]);await f.db.query("delete from public.activity_meetup_members where user_id=$1",[f.users.mechanicalReserve]);const p=await f.prepare(f.users.mechanicalReserve);await f.db.query("update quantum_private.activity_meetup_admission_intents set expires_at=now()-interval '1 second'where id=$1",[p.intentId]);const expired=await f.confirm(p.intentId);assert.equal(expired.admission,'cancelled');assert.equal(expired.payment,'refund_due')
 }finally{await f.db.close()}
})
test('one last seat cannot approve two applications; stale decline cannot undo accepted',async()=>{
 const f=await lifecycleFixture();try{await f.db.query('update public.activity_meetups set capacity=2 where id=$1',[f.roomId]);const a=await f.confirm((await f.prepare()).intentId),b=await f.confirm((await f.prepare(f.users.mechanicalReserve)).intentId);await f.as(f.users.mechanicalCaptain)
 await f.decide(a.id);await assert.rejects(f.decide(b.id),/meetup_full/);await assert.rejects(f.decide(a.id,'decline'),/admission_state_conflict/)
 assert.equal((await f.db.query("select count(*)::int count from public.activity_meetup_members where meetup_id=$1 and status='joined'",[f.roomId])).rows[0].count,2)
 }finally{await f.db.close()}
})
test('private lifecycle tables and wrappers deny anonymous reads and writes',async()=>{
 const f=await lifecycleFixture();try{await f.db.exec('set role authenticated');for(const table of ['activity_meetup_admissions','activity_meetup_admission_deposits','activity_meetup_admission_notices','activity_meetup_admission_refund_outbox'])await assert.rejects(f.db.query(`select * from quantum_private.${table}`),/permission denied/)
 await f.db.exec('reset role;set role anon');await assert.rejects(f.list(),/permission denied/);await f.db.exec('reset role');await f.as('');await assert.rejects(f.status(),/not_authenticated/)
 }finally{await f.db.close()}
})
test('notification resolver validates recipient/current cycle and routes to management or joined chat',async()=>{
 const f=await lifecycleFixture();try{const a=await f.confirm((await f.prepare()).intentId),notice=(await f.db.query('select id from public.notifications where user_id=$1',[f.users.mechanicalCaptain])).rows[0].id
 const resolve=id=>f.value('select public.get_activity_meetup_admission_notification($1)as value',[id]);await f.as(f.users.mechanicalReserve);await assert.rejects(resolve(notice),/notification_not_found/)
 await f.as(f.users.mechanicalCaptain);assert.deepEqual(await resolve(notice),{status:'current',href:`/meetups/${f.roomId}/applications`});await f.decide(a.id);assert.deepEqual(await resolve(notice),{status:'ended',href:null})
 const accepted=(await f.db.query("select id from public.notifications where user_id=$1 and payload->>'event'='application_accepted'",[f.users.mechanicalMember])).rows[0].id
 await f.as(f.users.mechanicalMember);assert.equal((await resolve(accepted)).href,`/chat/rooms/meetup/${f.roomId}`)
 await f.db.query("update public.activity_meetup_members set status='left'where meetup_id=$1 and user_id=$2",[f.roomId,f.users.mechanicalMember]);assert.equal((await resolve(accepted)).status,'ended')
 const legacy=randomUUID();await f.db.query("insert into public.notifications values($1,$2,'legacy','{}',now())",[legacy,f.users.mechanicalMember]);assert.deepEqual(await resolve(legacy),{status:'ended',href:null})
 }finally{await f.db.close()}
})
test('applicant cannot read chat before approval; after approval existing history is readable',async()=>{
 const f=await lifecycleFixture();try{await f.db.query("insert into public.activity_meetup_messages(meetup_id,sender_user_id,sender_alias_snapshot,message,idempotency_key)values($1,$2,'기존 참가자','학생회관에서 만나요',gen_random_uuid())",[f.roomId,f.users.mechanicalCaptain]);const a=await f.confirm((await f.prepare()).intentId)
 await f.as(f.users.mechanicalMember);await assert.rejects(f.value('select public.get_my_activity_meetup_chat($1)as value',[f.roomId]),/meetup_not_found/)
 await f.as(f.users.mechanicalCaptain);await f.decide(a.id);await f.as(f.users.mechanicalMember);const chat=await f.value('select public.get_my_activity_meetup_chat($1)as value',[f.roomId]);assert.equal(chat.phase,'send');assert.equal(chat.messages[0].message,'학생회관에서 만나요')
 }finally{await f.db.close()}
})
test('account deletion erases private application but retains an unclaimed refund liability',async()=>{
 const f=await lifecycleFixture();try{const a=await f.confirm((await f.prepare()).intentId);await f.db.exec(`alter table public.users drop constraint users_id_fkey,add constraint users_id_fkey foreign key(id)references auth.users(id)on delete cascade;
 alter table quantum_private.community_member_profiles drop constraint community_member_profiles_user_id_fkey,add constraint community_member_profiles_user_id_fkey foreign key(user_id)references public.users(id)on delete cascade;`)
 await f.db.query('delete from auth.users where id=$1',[f.users.mechanicalMember]);assert.equal((await f.db.query('select * from quantum_private.activity_meetup_admissions where id=$1',[a.id])).rows.length,0)
 const d=(await f.db.query('select * from quantum_private.activity_meetup_admission_deposits')).rows[0];assert.equal(d.user_id,null);assert.equal(d.state,'refund_due');assert.equal(d.amount_krw,17000);assert.equal((await f.db.query('select * from quantum_private.activity_meetup_admission_refund_outbox')).rows.length,1)
 }finally{await f.db.close()}
})
test('closing a room cancels pending admissions and creates refund_due once',async()=>{
 const f=await lifecycleFixture();try{const a=await f.confirm((await f.prepare()).intentId);await f.db.query("update public.activity_meetups set status='cancelled'where id=$1",[f.roomId]);await f.as(f.users.mechanicalMember);const status=(await f.status()).application;assert.equal(status.admission,'cancelled');assert.equal(status.payment,'refund_due');assert.equal(status.chatHref,null)
 await f.db.query("update public.activity_meetups set status='completed'where id=$1",[f.roomId]);assert.equal((await f.db.query('select * from quantum_private.activity_meetup_admission_refund_outbox')).rows.length,1)
 }finally{await f.db.close()}
})
test('existing members get a generic separate notice, no applicant identity or introduction',async()=>{
 const f=await lifecycleFixture();try{await f.db.query("insert into public.activity_meetup_members(meetup_id,user_id,role)values($1,$2,'member')",[f.roomId,f.users.mechanicalReserve]);const intent=await f.prepare(),receipt=randomUUID();const a=await f.confirm(intent.intentId,receipt);await f.confirm(intent.intentId,receipt)
 const notices=(await f.db.query("select * from public.notifications where user_id=$1 and payload->>'event'='application_notice'",[f.users.mechanicalReserve])).rows;assert.equal(notices.length,1)
 assert.equal(JSON.stringify(notices[0].payload).includes(f.users.mechanicalMember),false);assert.equal(JSON.stringify(notices[0].payload).includes('함께할래요'),false)
 await f.as(f.users.mechanicalReserve);assert.deepEqual(await f.value('select public.get_activity_meetup_admission_notification($1)as value',[notices[0].id]),{status:'current',href:`/chat/rooms/meetup/${f.roomId}`})
 await f.as(f.users.mechanicalCaptain);await f.decide(a.id);await f.as(f.users.mechanicalReserve);assert.equal((await f.value('select public.get_activity_meetup_admission_notification($1)as value',[notices[0].id])).status,'ended')
 }finally{await f.db.close()}
})
test('member leave closes the accepted application and keeps money under refund review',async()=>{
 const f=await lifecycleFixture();try{const a=await f.confirm((await f.prepare()).intentId);await f.as(f.users.mechanicalCaptain);await f.decide(a.id);await f.as(f.users.mechanicalMember)
 await f.value('select public.leave_activity_meetup($1)as value',[f.roomId]);const state=(await f.status()).application;assert.equal(state.admission,'cancelled');assert.equal(state.payment,'refund_due');assert.equal(state.chatHref,null)
 const next=await f.confirm((await f.prepare()).intentId);assert.equal(next.admission,'pending');assert.notEqual(next.id,a.id)
 }finally{await f.db.close()}
})
test('current PostgREST JSON claims service role is supported, not just legacy GUC',async()=>{
 const f=await lifecycleFixture();try{const intent=await f.prepare();await f.db.exec("set role service_role;select set_config('request.jwt.claim.role','',false),set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)")
 const result=await f.value('select public.confirm_activity_meetup_admission_payment_for_service($1,$2,$3,$4)as value',[intent.intentId,'fixture-provider',randomUUID(),17000]);assert.equal(result.payment,'held');await f.db.exec('reset role')
 }finally{await f.db.close()}
})
test('blocked or no-longer-scoped applicant details are hidden but a host can decline safely',async()=>{
 const f=await lifecycleFixture();try{const a=await f.confirm((await f.prepare()).intentId);await f.db.query("insert into public.friendships values($1,$2,'blocked')",[f.users.mechanicalCaptain,f.users.mechanicalMember]);await f.as(f.users.mechanicalCaptain)
 const row=(await f.list()).applications[0];assert.equal(row.intro,'');assert.equal(row.strength,'');assert.equal(row.amountKrw,undefined)
 assert.equal((await f.decide(a.id,'decline')).payment,'refund_due')
 }finally{await f.db.close()}
})
test('host history cursor pages by stable timestamp/id without silently dropping older applications',async()=>{
 const f=await lifecycleFixture();try{await f.db.query(`with deposits as(insert into quantum_private.activity_meetup_admission_deposits(intent_id,meetup_id,user_id,amount_krw,provider,receipt_ref,policy_version,policy_summary,policy_conditions,state)
 select gen_random_uuid(),$1,$2,17000,'fixture-provider',gen_random_uuid()::text,'fixture-only','테스트',array['실제 돈 없음'],'refund_due'from generate_series(1,51)returning id)
 insert into quantum_private.activity_meetup_admissions(meetup_id,user_id,deposit_id,intro,state)select $1,$2,id,'테스트 종료 신청','cancelled'from deposits`,[f.roomId,f.users.mechanicalMember]);await f.as(f.users.mechanicalCaptain)
 const first=await f.list();assert.equal(first.applications.length,50);assert.equal(first.hasMore,true);assert.ok(first.nextCursor)
 const second=await f.list(first.nextCursor);assert.equal(second.applications.length,1);assert.equal(second.hasMore,false);assert.equal(second.nextCursor,null)
 assert.equal(new Set([...first.applications,...second.applications].map(x=>x.id)).size,51);await assert.rejects(f.list(randomUUID()),/invalid_admission_cursor/)
 }finally{await f.db.close()}
})
test('management count and approval capacity both exclude a joined member whose department changed',async()=>{
 const f=await lifecycleFixture();try{
  await f.db.query('update public.activity_meetups set capacity=2 where id=$1',[f.roomId])
  await f.db.query("insert into public.activity_meetup_members(meetup_id,user_id,role)values($1,$2,'member')",[f.roomId,f.users.mechanicalReserve])
  await f.db.query("update quantum_private.community_member_profiles set department='컴퓨터공학과'where user_id=$1",[f.users.mechanicalReserve])
  await f.as(f.users.mechanicalCaptain)
  const before=await f.list();assert.equal(before.room.memberCount,1);assert.equal(before.room.capacity,2)
  const application=await f.confirm((await f.prepare()).intentId)
  await f.as(f.users.mechanicalCaptain);assert.equal((await f.decide(application.id)).admission,'accepted')
  const after=await f.list();assert.equal(after.room.memberCount,2);assert.equal(after.room.capacity,2)
  assert.equal((await f.db.query("select count(*)::int count from public.activity_meetup_members where meetup_id=$1 and status='joined'",[f.roomId])).rows[0].count,3)
  assert.equal((await f.db.query('select status from public.activity_meetups where id=$1',[f.roomId])).rows[0].status,'full')
 }finally{await f.db.close()}
})
