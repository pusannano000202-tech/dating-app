import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {paymentFixture,installActualSoloWeeklyApplication} from './calendar-payment-fixture.mjs'
import {calendarFixture,source} from './event-calendar-fixture.mjs'
import {installCalendarErasurePolicy} from './calendar-erasure-fixture.mjs'

async function fixture(){
  const f=await paymentFixture()
  await installActualSoloWeeklyApplication(f)
  f.prepareSingle=()=>f.rpc(f.ids.single,'prepare_calendar_single_application',{p_event_id:f.ids.window,p_idempotency_key:randomUUID(),p_participation_consent:true})
  f.apply=async(key=randomUUID(),windows=[f.ids.window])=>f.rpc(f.ids.single,'apply_to_my_weekly_activity_v2',{
    p_activity_id:'board-game',p_week_key:await f.value('select week_key::text as value from public.quantum_weekly_activity_windows where id=$1',[f.ids.window]),
    p_candidate_window_ids:windows,p_party_group_id:null,p_idempotency_key:key})
  f.pay=async(entry)=>{
    const intent=randomUUID()
    await f.db.query(`insert into quantum_private.calendar_payment_orders(order_id,intent_id,audience,event_id,application_id,user_id,provider_mode,state,payment_key,deposit_state,expires_at,paid_at)
      values($1,$2,'single',$3,$4,$5,'test','confirmed',$6,'held',now()+interval '1 hour',now())`,['calendar_'+intent.replaceAll('-',''),intent,f.ids.window,entry.entryId,f.ids.single,'fixture-'+intent])
  }
  f.finalize=entry=>f.rpc(f.ids.single,'finalize_calendar_payment_application',{p_audience:'single',p_event_id:f.ids.window,p_application_id:entry.entryId})
  return f
}

for(const prepared of [false,true])test(`legacy weekly RPC cannot admit a free single (${prepared?'unpaid preparation':'no preparation'})`,async()=>{
  const f=await fixture();try{
    const entry=prepared?await f.prepareSingle():null
    await assert.rejects(f.apply(entry?.entryId),/calendar_payment_not_ready/)
    assert.equal(await f.value('select count(*)::integer as value from public.quantum_weekly_applications'),0)
    assert.equal(await f.value('select count(*)::integer as value from quantum_private.calendar_payment_orders'),0)
  }finally{await f.db.close()}
})

test('paid legacy direct RPC must also bind the calendar entry; authorized finalize does so atomically',async()=>{
  const f=await fixture();try{
    const entry=await f.prepareSingle();await f.pay(entry)
    await assert.rejects(f.apply(entry.entryId),/calendar_payment_conflict/)
    assert.equal(await f.value('select count(*)::integer as value from public.quantum_weekly_applications'),0)
    assert.equal((await f.finalize(entry)).applicationFinalized,true)
    assert.equal((await f.finalize(entry)).applicationFinalized,true)
    const linked=await f.value('select linked_weekly_application_id as value from quantum_private.calendar_single_applications where id=$1',[entry.entryId])
    assert.ok(linked)
    await assert.rejects(f.db.query('update public.quantum_weekly_applications set party_size=2 where id=$1',[linked]),/calendar_payment_not_ready/)
    await assert.rejects(f.db.query('update public.quantum_weekly_applications set user_id=$1 where id=$2',[f.ids.outsider,linked]),/calendar_payment_not_ready/)
    await assert.rejects(f.db.query("update public.quantum_weekly_applications set activity_id='another-activity' where id=$1",[linked]),/calendar_payment_not_ready/)
    await f.db.query("update public.quantum_weekly_applications set status='cancelled' where id=$1",[linked])
    await assert.rejects(f.db.query("update public.quantum_weekly_applications set status='active' where id=$1",[linked]),/calendar_payment_not_ready/)
  }finally{await f.db.close()}
})

test('pre-migration legacy admissions keep their existing consent/assignment lifecycle without a retroactive charge',async()=>{
  const f=await calendarFixture();try{
    await installActualSoloWeeklyApplication(f)
    const key=randomUUID(),week=await f.value('select week_key::text as value from public.quantum_weekly_activity_windows where id=$1',[f.ids.window])
    await f.rpc(f.ids.single,'apply_to_my_weekly_activity_v2',{p_activity_id:'board-game',p_week_key:week,p_candidate_window_ids:[f.ids.window],p_party_group_id:null,p_idempotency_key:key})
    const id=await f.value('select id as value from public.quantum_weekly_applications where idempotency_key=$1',[key])
    await installCalendarErasurePolicy(f)
    await f.db.exec(await source('supabase/migrations/20260914192111_calendar_event_deposit_payments.sql'))
    assert.equal(await f.value('select status as value from public.quantum_weekly_applications where id=$1',[id]),'active')
    await f.db.query("update public.quantum_weekly_applications set status='assigned',assigned_window_id=$1 where id=$2",[f.ids.window,id])
    assert.equal(await f.value('select status as value from public.quantum_weekly_applications where id=$1',[id]),'assigned')
    assert.equal(await f.value('select count(*)::integer as value from quantum_private.calendar_payment_orders'),0)
  }finally{await f.db.close()}
})

test('one event receipt cannot admit a second candidate or move a candidate to a different date',async()=>{
  const f=await fixture();try{
    const second=randomUUID(),entry=await f.prepareSingle();await f.pay(entry)
    await f.db.query(`insert into public.quantum_weekly_activity_windows select $1,activity_id,activity_kind,week_key,title,summary,
      starts_at+interval '1 hour',ends_at+interval '1 hour',application_closes_at,location_name,status,school_scope_key
      from public.quantum_weekly_activity_windows where id=$2`,[second,f.ids.window])
    await assert.rejects(f.apply(entry.entryId,[f.ids.window,second]),/calendar_payment_not_ready/)
    await f.finalize(entry)
    await assert.rejects(f.db.query('update public.quantum_weekly_application_candidates set window_id=$1 where window_id=$2',[second,f.ids.window]),/calendar_payment_not_ready/)
  }finally{await f.db.close()}
})
