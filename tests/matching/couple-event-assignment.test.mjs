import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {calendarFixture,source} from './event-calendar-fixture.mjs'
import {installCalendarErasurePolicy} from './calendar-erasure-fixture.mjs'
const paymentMigration='supabase/migrations/20260914192111_calendar_event_deposit_payments.sql'
const assignmentMigration='supabase/migrations/20260914193252_calendar_dated_couple_assignment.sql'
async function fixture(){
 const f=await calendarFixture()
 await installCalendarErasurePolicy(f)
 await f.db.exec(`alter table auth.users add deleted_at timestamptz,add banned_until timestamptz;`)
 const social=await source('supabase/migrations/20260906181225_community_social_integrated.sql')
 const rooms=await source('supabase/migrations/20260907113358_automatic_activity_rooms.sql')
 const deletion=social.match(/create or replace function quantum_private\.account_deletion_blocks_access\([\s\S]*?\n\$\$;/i)?.[0]
 const access=rooms.match(/create function quantum_private\.assert_activity_room_access\([\s\S]*?\n\$\$;/i)?.[0]
 if(!deletion||!access)throw Error('authoritative account access functions missing')
 await f.db.exec(deletion+'\n'+access)
 await f.db.exec(await source(paymentMigration))
 if(process.env.CALENDAR_ASSIGNMENT_BASELINE!=='true')await f.db.exec(await source(assignmentMigration))
 const fourth=f.ids.single
 await f.db.query("insert into quantum_private.relationship_states values($1,'in_relationship')",[fourth])
 await f.db.query("insert into public.friendships values($1,$2,'active')",[f.ids.outsider,fourth])
 const first=await f.prepare(),second=await f.prepare(f.ids.outsider,fourth)
 await f.rpc(f.ids.partner,'accept_calendar_couple_party',{p_party_id:first.entryId,p_partner_consent:true})
 await f.rpc(fourth,'accept_calendar_couple_party',{p_party_id:second.entryId,p_partner_consent:true})
 const receipt=async(party,owner,event=f.ids.event)=>{
  const intent=randomUUID(),orderId='calendar_'+intent.replaceAll('-','')
  await f.db.query(`insert into quantum_private.calendar_payment_orders(order_id,intent_id,audience,event_id,application_id,user_id,provider_mode,state,payment_key,deposit_state,expires_at,paid_at)
    values($1,$2,'couple',$3,$4,$5,'test','confirmed',$6,'held',now()+interval '1 day',now())`,[orderId,intent,event,party,owner,'synthetic_'+intent])
  return orderId
 }
 const finalize=(actor,party)=>f.rpc(actor,'finalize_calendar_payment_application',{p_audience:'couple',p_event_id:f.ids.event,p_application_id:party})
 return {...f,fourth,first,second,receipt,finalize}
}
test('four exact event receipts produce one dated assignment, with no legacy Saturday match',async()=>{
 const f=await fixture();try{
  for(const [entry,owner]of [[f.first.entryId,f.ids.leader],[f.first.entryId,f.ids.partner],[f.second.entryId,f.ids.outsider],[f.second.entryId,f.fourth]])await f.receipt(entry,owner)
  await f.finalize(f.ids.leader,f.first.entryId)
  await f.finalize(f.ids.outsider,f.second.entryId)
  const states=(await f.db.query('select status from public.quantum_couple_parties order by id')).rows.map(row=>row.status)
  assert.deepEqual(states,['calendar_matched','calendar_matched'])
  const result=(await f.db.query(`select a.starts_at=e.starts_at and a.ends_at=e.ends_at and a.location_name=e.location_name as exact,
    (select count(*)::integer from quantum_private.calendar_couple_assignment_parties p where p.assignment_id=a.id) as pairs
    from quantum_private.calendar_couple_assignments a join quantum_private.couple_calendar_events e on e.id=a.event_id`)).rows
  assert.deepEqual(result,[{exact:true,pairs:2}])
  const own=await f.rpc(f.ids.leader,'get_my_calendar_couple_party',{p_event_id:f.ids.event})
  assert.equal(own.status,'matched');assert.equal(own.applicationFinalized,true);assert.equal(own.checkoutEnabled,false)
  const replay=await f.finalize(f.ids.leader,f.first.entryId)
  assert.equal(replay.applicationFinalized,true)
  const calendar=await f.rpc(f.ids.leader,'get_my_event_calendar',{p_month:f.month,p_audience:'couple'})
  assert.equal(calendar.events[0].applicantCount,4);assert.equal(calendar.events[0].myApplication.status,'matched')
  await f.db.query('select quantum_private.try_assign_calendar_couple($1)',[f.second.entryId])
  assert.equal((await f.db.query('select count(*)::integer as n from quantum_private.calendar_couple_assignments')).rows[0].n,1)
  assert.equal((await f.db.query("select count(*)::integer as n from public.quantum_couple_parties where status in ('ready','matched','completed')")).rows[0].n,0)
 }finally{await f.db.close()}
})
test('one missing/foreign-event receipt cannot finalize or mix into a four-person event',async()=>{
 const f=await fixture();try{
  await f.receipt(f.first.entryId,f.ids.leader);await f.receipt(f.first.entryId,f.ids.partner)
  await f.receipt(f.second.entryId,f.ids.outsider);await f.receipt(f.second.entryId,f.fourth,f.ids.otherEvent)
  await f.finalize(f.ids.leader,f.first.entryId)
  const second=await f.finalize(f.ids.outsider,f.second.entryId)
  assert.equal(second.applicationFinalized,false)
  assert.equal((await f.db.query('select count(*)::integer as n from quantum_private.calendar_couple_assignments')).rows[0].n,0)
 }finally{await f.db.close()}
})
test('blocked cross-couple pair stays unassigned; private helper is not a user RPC',async()=>{
 const f=await fixture();try{
  for(const [entry,owner]of [[f.first.entryId,f.ids.leader],[f.first.entryId,f.ids.partner],[f.second.entryId,f.ids.outsider],[f.second.entryId,f.fourth]])await f.receipt(entry,owner)
  await f.db.query("insert into public.friendships values($1,$2,'blocked')",[f.ids.partner,f.ids.outsider])
  await f.finalize(f.ids.leader,f.first.entryId);await f.finalize(f.ids.outsider,f.second.entryId)
  assert.equal((await f.db.query('select count(*)::integer as n from quantum_private.calendar_couple_assignments')).rows[0].n,0)
  await f.as(f.ids.leader);await f.db.exec('set role authenticated')
  await assert.rejects(f.db.query('select quantum_private.try_assign_calendar_couple($1)',[f.first.entryId]),/permission denied/)
 }finally{await f.db.close()}
})

const accountChanges = {
 banned: async(f,user)=>f.db.query("update auth.users set banned_until=now()+interval '7 days' where id=$1",[user]),
 deleted: async(f,user)=>f.db.query('update auth.users set deleted_at=now() where id=$1',[user]),
 deletion_pending: async(f,user)=>f.db.query("insert into quantum_private.account_deletion_requests(user_id,idempotency_key,status) values($1,$2,'requested')",[user,randomUUID()]),
 incomplete_signup: async(f,user)=>f.db.query('update auth.users set phone_confirmed_at=null where id=$1',[user]),
}
for(const role of ['leader','partner'])for(const [change,invalidate]of Object.entries(accountChanges)){
 test(`waiting ${role} with ${change} cannot be assigned when the next paid couple arrives`,async()=>{
  const f=await fixture();try{
   for(const [entry,owner]of [[f.first.entryId,f.ids.leader],[f.first.entryId,f.ids.partner],[f.second.entryId,f.ids.outsider],[f.second.entryId,f.fourth]])await f.receipt(entry,owner)
   await f.finalize(f.ids.leader,f.first.entryId)
   await invalidate(f,f.ids[role])
   await f.finalize(f.ids.outsider,f.second.entryId)
   assert.equal(await f.value('select count(*)::integer as value from quantum_private.calendar_couple_assignments'),0)
   assert.equal(await f.value('select status as value from public.quantum_couple_parties where id=$1',[f.second.entryId]),'calendar_ready')
   assert.equal(await f.value("select count(*)::integer as value from quantum_private.calendar_payment_orders where state='confirmed' and deposit_state='held'"),4)
  }finally{await f.db.close()}
 })
}

test('unexpected account eligibility errors abort instead of treating the account as ready or silently skipping it',async()=>{
 const f=await fixture();try{
  await f.db.exec(`create or replace function quantum_private.account_deletion_blocks_access(p_user_id uuid)returns boolean
    language plpgsql stable as $$begin raise exception 'unexpected_access_failure';end$$;`)
  await assert.rejects(f.db.query('select quantum_private.calendar_pair_ready(p) from public.quantum_couple_parties p where p.id=$1',[f.first.entryId]),/unexpected_access_failure/)
 }finally{await f.db.close()}
})
