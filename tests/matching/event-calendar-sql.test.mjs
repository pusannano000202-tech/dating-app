import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {calendarFixture} from './event-calendar-fixture.mjs'
import {installActualSoloWeeklyApplication} from './calendar-payment-fixture.mjs'
import {source} from './event-calendar-fixture.mjs'

test('dated couple needs the invited partner explicit acceptance; no free finalization',async()=>{
 const f=await calendarFixture();try{
  const p=await f.prepare();assert.equal(p.status,'pending_partner');assert.equal(p.applicationFinalized,false)
  await assert.rejects(f.rpc(f.ids.outsider,'accept_calendar_couple_party',{p_party_id:p.entryId,p_partner_consent:true}),/calendar_party_not_found/)
  await assert.rejects(f.rpc(f.ids.partner,'accept_calendar_couple_party',{p_party_id:p.entryId,p_partner_consent:false}),/partner_consent_required/)
  const accepted=await f.rpc(f.ids.partner,'accept_calendar_couple_party',{p_party_id:p.entryId,p_partner_consent:true})
  assert.equal(accepted.status,'payment_pending');assert.equal(accepted.partnerAccepted,true);assert.equal(accepted.myConsent,true);assert.equal(accepted.checkoutEnabled,false)
  for(const status of ['ready','matched','completed'])await assert.rejects(f.db.query('update public.quantum_couple_parties set status=$1 where id=$2',[status,p.entryId]),/calendar_payment_unavailable/)
  assert.equal((await f.rpc(f.ids.outsider,'get_my_calendar_couple_party',{p_event_id:f.ids.event})),null)
 }finally{await f.db.close()}
})
test('idempotent retry, conflicting keys and simultaneous duplicate invitations',async()=>{
 const f=await calendarFixture();try{
  const key=randomUUID(),first=await f.prepare(f.ids.leader,f.ids.partner,key)
  assert.equal((await f.prepare(f.ids.leader,f.ids.partner,key)).entryId,first.entryId)
  await assert.rejects(f.prepare(f.ids.leader,f.ids.outsider,key),/calendar_idempotency_conflict/)
  const requests=await Promise.allSettled([f.prepare(),f.prepare()])
  assert.equal(requests.filter(r=>r.status==='rejected').length,2)
  assert.equal((await f.db.query('select count(*)::integer as n from public.quantum_couple_parties')).rows[0].n,1)
 }finally{await f.db.close()}
})
test('closed, cross-school, missing friend, single and anonymous requests are rejected',async()=>{
 const f=await calendarFixture();try{
  await assert.rejects(f.prepare(null),/not_authenticated/)
  await assert.rejects(f.prepare(f.ids.single),/calendar_audience_unavailable/)
  await assert.rejects(f.prepare(f.ids.leader,f.ids.otherSchool),/calendar_partner_unavailable/)
  await assert.rejects(f.prepare(f.ids.leader,f.ids.partner,randomUUID(),f.ids.otherEvent),/calendar_event_not_found/)
  await f.db.exec("update public.friendships set status='blocked'")
  await assert.rejects(f.prepare(),/calendar_partner_unavailable/)
  await f.db.exec("update quantum_private.couple_calendar_events set status='closed'")
  await assert.rejects(f.prepare(),/calendar_event_closed/)
 }finally{await f.db.close()}
})
test('cancellation remains available after closing, only to a member; no payment claimed',async()=>{
 const f=await calendarFixture();try{
  const p=await f.prepare()
  await f.db.exec("update quantum_private.couple_calendar_events set status='closed'")
  await assert.rejects(f.rpc(f.ids.partner,'accept_calendar_couple_party',{p_party_id:p.entryId,p_partner_consent:true}),/calendar_event_closed/)
  await assert.rejects(f.rpc(f.ids.outsider,'cancel_calendar_couple_party',{p_party_id:p.entryId}),/calendar_party_not_found/)
  assert.deepEqual(await f.rpc(f.ids.partner,'cancel_calendar_couple_party',{p_party_id:p.entryId}),{cancelled:true,applicationFinalized:false,providerPaymentChanged:false})
 }finally{await f.db.close()}
})
test('single date preparation preserves existing weekly application and audience boundary',async()=>{
 const f=await calendarFixture();try{
  const input={p_event_id:f.ids.window,p_idempotency_key:randomUUID(),p_participation_consent:true}
  await assert.rejects(f.rpc(f.ids.leader,'prepare_calendar_single_application',input),/calendar_audience_unavailable/)
  const a=await f.rpc(f.ids.single,'prepare_calendar_single_application',input)
  assert.equal(a.status,'payment_pending');assert.equal(a.checkoutEnabled,false)
  assert.equal((await f.rpc(f.ids.single,'prepare_calendar_single_application',input)).entryId,a.entryId)
  assert.equal((await f.db.query('select count(*)::integer as n from public.quantum_weekly_applications')).rows[0].n,0)
  await f.rpc(f.ids.single,'cancel_calendar_single_application',{p_entry_id:a.entryId})
  const oldId=randomUUID()
  await f.db.query("insert into public.quantum_weekly_applications(id,user_id,week_key,status,party_size)select $1,$2,week_key,'active',1 from public.quantum_weekly_activity_windows where id=$3",[oldId,f.ids.single,f.ids.window])
  await f.db.query("insert into public.quantum_weekly_application_members values($1,$2,'pnu_self_selected','synthetic','accepted','active')",[oldId,f.ids.single])
  await assert.rejects(f.rpc(f.ids.single,'prepare_calendar_single_application',{...input,p_idempotency_key:randomUUID()}),/calendar_existing_weekly_application/)
 }finally{await f.db.close()}
})
test('calendar exposes only own application and real aggregate counts, not unpaid invitations',async()=>{
 const f=await calendarFixture();try{
  const p=await f.prepare()
  const list=await f.rpc(f.ids.leader,'get_my_event_calendar',{p_month:f.month,p_audience:'couple'})
  assert.equal(list.events.length,1);assert.equal(list.events[0].applicantCount,0);assert.equal(list.events[0].myApplication.id,p.entryId)
  assert.equal(list.events[0].depositPolicyStatus,'not_connected')
  const outsider=await f.rpc(f.ids.outsider,'get_my_event_calendar',{p_month:f.month,p_audience:'couple'})
  assert.equal(outsider.events[0].myApplication,null)
  assert.ok(!JSON.stringify(outsider).includes(f.ids.leader));assert.ok(!JSON.stringify(outsider).includes(f.ids.partner))
  await f.as(f.ids.leader);await f.db.exec('set role authenticated')
  await assert.rejects(f.db.query('select public.create_quantum_couple_party($1)',[f.ids.partner]),/permission denied/)
  await assert.rejects(f.db.query('select * from public.quantum_couple_parties'),/permission denied/)
 }finally{await f.db.close()}
})
test('round team count is scoped, excludes cancelled/drafted, and denies other round',async()=>{
 const f=await calendarFixture();try{
  await f.db.query("insert into public.tonight_teams(round_id,status)values($1,'drafted'),($1,'deposit_pending'),($1,'accepted'),($1,'cancelled'),($2,'accepted')",[f.ids.round,randomUUID()])
  assert.deepEqual(await f.rpc(f.ids.leader,'get_my_current_tonight_team_count',{p_round_id:f.ids.round}),{roundId:f.ids.round,teamCount:2})
  await assert.rejects(f.rpc(f.ids.leader,'get_my_current_tonight_team_count',{p_round_id:randomUUID()}),/tonight_round_not_found/)
 }finally{await f.db.close()}
})
test('a historical preparation key never returns a newer replacement application',async()=>{
 const f=await calendarFixture();try{
  const key=randomUUID(),first=await f.prepare(f.ids.leader,f.ids.partner,key)
  await f.rpc(f.ids.leader,'cancel_calendar_couple_party',{p_party_id:first.entryId})
  await f.prepare()
  await assert.rejects(f.prepare(f.ids.leader,f.ids.partner,key),/calendar_idempotency_conflict/)
  const input={p_event_id:f.ids.window,p_idempotency_key:randomUUID(),p_participation_consent:true}
  const a=await f.rpc(f.ids.single,'prepare_calendar_single_application',input)
  await f.rpc(f.ids.single,'cancel_calendar_single_application',{p_entry_id:a.entryId})
  await f.rpc(f.ids.single,'prepare_calendar_single_application',{...input,p_idempotency_key:randomUUID()})
  await assert.rejects(f.rpc(f.ids.single,'prepare_calendar_single_application',input),/calendar_idempotency_conflict/)
 }finally{await f.db.close()}
})
test('calendar cancellation delegates linked active weekly cancellation and preserves assigned lock',async()=>{
 const f=await calendarFixture();try{
  await installActualSoloWeeklyApplication(f)
  await f.db.exec(`alter table public.quantum_weekly_applications add cancellation_kind text;
   alter table public.quantum_weekly_application_members add revision integer default 0,add updated_at timestamptz;
   alter table public.quantum_weekly_party_commands add id uuid default gen_random_uuid();`)
  const original=await source('supabase/migrations/20260906114007_weekly_accepted_friend_party.sql')
  await f.db.exec(original.match(/create or replace function public\.cancel_my_weekly_activity_application_v2\([\s\S]*?\n\$\$;/)[0])
  const input={p_event_id:f.ids.window,p_idempotency_key:randomUUID(),p_participation_consent:true}
  const a=await f.rpc(f.ids.single,'prepare_calendar_single_application',input),weekly=randomUUID()
  await f.db.query("insert into public.quantum_weekly_applications(id,user_id,week_key,status,party_size)select $1,$2,week_key,'active',1 from public.quantum_weekly_activity_windows where id=$3",[weekly,f.ids.single,f.ids.window])
  await f.db.query("update quantum_private.calendar_single_applications set linked_weekly_application_id=$1,status='active' where id=$2",[weekly,a.entryId])
  await f.rpc(f.ids.single,'cancel_calendar_single_application',{p_entry_id:a.entryId})
  assert.equal((await f.db.query('select status from public.quantum_weekly_applications where id=$1',[weekly])).rows[0].status,'cancelled')
  assert.equal((await f.rpc(f.ids.single,'cancel_calendar_single_application',{p_entry_id:a.entryId})).cancelled,true)
  await f.db.query("update quantum_private.calendar_single_applications set status='active' where id=$1",[a.entryId])
  await f.db.query("update public.quantum_weekly_applications set status='assigned' where id=$1",[weekly])
  await assert.rejects(f.rpc(f.ids.single,'cancel_calendar_single_application',{p_entry_id:a.entryId}),/assigned_application_cannot_cancel/)
 }finally{await f.db.close()}
})
