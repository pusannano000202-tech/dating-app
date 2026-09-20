import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {calendarFixture,source} from './event-calendar-fixture.mjs'
import {installCalendarErasurePolicy} from './calendar-erasure-fixture.mjs'

async function fixture(){
  const f=await calendarFixture()
  await installCalendarErasurePolicy(f)
  await f.db.exec(await source('supabase/migrations/20260914192111_calendar_event_deposit_payments.sql'))
  return f
}

test('unpaid cancelled single preparation does not prevent Auth erasure',async()=>{
  const f=await fixture();try{
    const s=await f.rpc(f.ids.single,'prepare_calendar_single_application',{p_event_id:f.ids.window,p_idempotency_key:randomUUID(),p_participation_consent:true})
    await f.rpc(f.ids.single,'cancel_calendar_single_application',{p_entry_id:s.entryId})
    await f.db.query('delete from auth.users where id=$1',[f.ids.single])
    const row=(await f.db.query('select user_id,status from quantum_private.calendar_single_applications where id=$1',[s.entryId])).rows[0]
    assert.deepEqual(row,{user_id:null,status:'cancelled'})
  }finally{await f.db.close()}
})

test('terminal calendar receipt requires existing hash-reviewed retention approval and survives anonymized',async()=>{
  const f=await fixture();try{
    const user=f.ids.single,intent=randomUUID(),request=randomUUID(),order='calendar_'+intent.replaceAll('-','')
    await f.db.query(`insert into quantum_private.calendar_payment_orders(order_id,intent_id,audience,event_id,application_id,user_id,provider_mode,state,deposit_state,expires_at)
      values($1,$2,'single',$3,$4,$5,'test','aborted','unpaid',now())`,[order,intent,f.ids.window,randomUUID(),user])
    await f.db.query(`insert into quantum_private.account_deletion_requests(id,user_id,idempotency_key,legal_retention_ready)
      values($1,$2,$3,true)`,[request,user,randomUUID()])
    assert.equal(await f.value('select quantum_private.account_has_legal_retention_candidates($1) as value',[user]),true)
    await assert.rejects(f.db.query('delete from auth.users where id=$1',[user]),/account_financial_retention_pending/)
    await f.db.exec("select set_config('request.jwt.claim.role','service_role',false)")
    await f.db.query('select public.approve_account_legal_retention_for_service($1,$2,$3,$4)',[request,f.ids.leader,'retention_preserved', 'a'.repeat(64)])
    await f.db.query('delete from auth.users where id=$1',[user])
    assert.equal(await f.value('select user_id as value from quantum_private.calendar_payment_orders where order_id=$1',[order]),null)
    assert.equal(await f.value('select count(*)::integer as value from quantum_private.calendar_payment_orders where order_id=$1',[order]),1)
  }finally{await f.db.close()}
})

for(const state of ['prepared','held','refund_due'])test(`even an explicit retention review cannot erase ${state} calendar money`,async()=>{
  const f=await fixture();try{
    const user=f.ids.single,intent=randomUUID(),request=randomUUID(),order='calendar_'+intent.replaceAll('-','')
    await f.db.query(`insert into quantum_private.calendar_payment_orders(order_id,intent_id,audience,event_id,application_id,user_id,provider_mode,state,payment_key,deposit_state,expires_at,paid_at)
      values($1,$2,'single',$3,$4,$5,'test',$6,$7,$8,now()-interval '1 day',now())`,
      [order,intent,f.ids.window,randomUUID(),user,state==='prepared'?'prepared':'confirmed',state==='prepared'?null:'synthetic-'+intent,state==='prepared'?'unpaid':state])
    await f.db.query('insert into quantum_private.account_deletion_requests(id,user_id,idempotency_key) values($1,$2,$3)',[request,user,randomUUID()])
    await f.db.exec("select set_config('request.jwt.claim.role','service_role',false)")
    await f.db.query('select public.approve_account_legal_retention_for_service($1,$2,$3,$4)',[request,f.ids.leader,'retention_preserved','b'.repeat(64)])
    assert.equal(await f.value('select quantum_private.account_has_unresolved_meetup_payments($1) as value',[user]),true)
    await assert.rejects(f.db.query('delete from auth.users where id=$1',[user]),/account_financial_retention_pending/)
    assert.equal(await f.value('select user_id as value from quantum_private.calendar_payment_orders where order_id=$1',[order]),user)
  }finally{await f.db.close()}
})

test('settled single receipts, completed refunds, and linked preparation survive erasure without blocking the legacy weekly cascade',async()=>{
  const f=await fixture();try{
    const user=f.ids.single,entry=await f.rpc(user,'prepare_calendar_single_application',{p_event_id:f.ids.window,p_idempotency_key:randomUUID(),p_participation_consent:true})
    const weekly=randomUUID(),intent=randomUUID(),request=randomUUID(),order='calendar_'+intent.replaceAll('-','')
    // Install the production weekly owner CASCADE absent from the small fixture.
    await f.db.exec('alter table public.quantum_weekly_applications add foreign key(user_id) references public.users(id) on delete cascade;')
    await f.db.query("insert into public.quantum_weekly_applications(id,user_id,status) values($1,$2,'cancelled')",[weekly,user])
    await f.db.query('update quantum_private.calendar_single_applications set linked_weekly_application_id=$1 where id=$2',[weekly,entry.entryId])
    await f.db.query(`insert into quantum_private.calendar_payment_orders(order_id,intent_id,audience,event_id,application_id,user_id,provider_mode,state,payment_key,deposit_state,expires_at,paid_at)
      values($1,$2,'single',$3,$4,$5,'test','confirmed',$6,'refunded',now(),now())`,[order,intent,f.ids.window,entry.entryId,user,'synthetic-'+intent])
    await f.db.query(`insert into quantum_private.calendar_refund_outbox(order_id,state,transaction_key,completed_at) values($1,'completed',$2,now())`,[order,'refund-'+intent])
    await f.db.query('insert into quantum_private.account_deletion_requests(id,user_id,idempotency_key) values($1,$2,$3)',[request,user,randomUUID()])
    await f.db.exec("select set_config('request.jwt.claim.role','service_role',false)")
    await f.db.query('select public.approve_account_legal_retention_for_service($1,$2,$3,$4)',[request,f.ids.leader,'retention_preserved','c'.repeat(64)])
    await f.db.query('delete from auth.users where id=$1',[user])
    assert.deepEqual((await f.db.query('select user_id,linked_weekly_application_id from quantum_private.calendar_single_applications where id=$1',[entry.entryId])).rows,[{user_id:null,linked_weekly_application_id:null}])
    assert.equal(await f.value('select count(*)::integer as value from quantum_private.calendar_refund_outbox where order_id=$1',[order]),1)
    assert.equal(await f.value('select user_id as value from quantum_private.calendar_payment_orders where order_id=$1',[order]),null)
  }finally{await f.db.close()}
})

test('historical dated assignments and operator events retain metadata after account erasure',async()=>{
  const f=await fixture();try{
    await f.db.exec(await source('supabase/migrations/20260914193252_calendar_dated_couple_assignment.sql'))
    await f.db.exec(await source('supabase/migrations/20260914194527_calendar_operator_publication.sql'))
    const entry=await f.prepare(),assignment=randomUUID()
    await f.rpc(f.ids.leader,'cancel_calendar_couple_party',{p_party_id:entry.entryId})
    await f.db.query(`insert into quantum_private.calendar_couple_assignments(id,event_id,school_scope_key,starts_at,ends_at,location_name,status)
      select $1,id,school_scope_key,starts_at,ends_at,location_name,'completed' from quantum_private.couple_calendar_events where id=$2`,[assignment,f.ids.event])
    await f.db.query('insert into quantum_private.calendar_couple_assignment_parties(party_id,assignment_id,pair_number) values($1,$2,1)',[entry.entryId,assignment])
    await assert.rejects(f.db.query('update quantum_private.couple_calendar_events set created_by=null where id=$1',[f.ids.event]),/calendar_event_metadata_locked/)
    await assert.rejects(f.db.query("update quantum_private.couple_calendar_events set created_by=null,title='changed' where id=$1",[f.ids.event]),/calendar_event_metadata_locked/)
    await f.db.query('delete from auth.users where id=$1',[f.ids.leader])
    assert.equal(await f.value('select party_id as value from quantum_private.calendar_couple_assignment_parties where assignment_id=$1',[assignment]),null)
    assert.equal(await f.value('select status as value from quantum_private.calendar_couple_assignments where id=$1',[assignment]),'completed')
    assert.equal(await f.value('select created_by as value from quantum_private.couple_calendar_events where id=$1',[f.ids.event]),null)
    await assert.rejects(f.db.query("update quantum_private.couple_calendar_events set title='changed' where id=$1",[f.ids.event]),/calendar_event_metadata_locked/)
  }finally{await f.db.close()}
})
