import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {calendarFixture} from './event-calendar-fixture.mjs'
import {paymentFixture} from './calendar-payment-fixture.mjs'

const applicationInput=f=>({p_event_id:f.ids.window,p_idempotency_key:randomUUID(),p_participation_consent:true})
const prepareOrder=(f,entry,intent=randomUUID())=>f.service.rpc('prepare_calendar_payment_for_service',{
  p_actor:f.ids.single,p_audience:'single',p_event_id:f.ids.window,p_application_id:entry.entryId,p_intent_id:intent,p_provider_mode:'test',
})

for(const state of ['missing','stale','failed','pending'])test(`single ${state} analysis cannot prepare an application`,async()=>{
  const f=await calendarFixture();try{
    if(state==='missing')await f.db.query('delete from public.private_appearance_scores where user_id=$1',[f.ids.single])
    else await f.db.query('update public.private_appearance_scores set status=$1 where user_id=$2',[state,f.ids.single])
    assert.equal(await f.value('select matching_ready as value from quantum_private.resolve_profile_readiness($1)',[f.ids.single]),false)
    await assert.rejects(f.rpc(f.ids.single,'prepare_calendar_single_application',applicationInput(f)),/matching_features_not_ready/)
    assert.equal(await f.value('select count(*)::integer as value from quantum_private.calendar_single_applications'),0)
  }finally{await f.db.close()}
})

test('a missing profile photo blocks preparation even if a legacy score remains ready',async()=>{
  const f=await calendarFixture();try{
    await f.db.query('delete from public.photos where user_id=$1',[f.ids.single])
    await assert.rejects(f.rpc(f.ids.single,'prepare_calendar_single_application',applicationInput(f)),/matching_features_not_ready/)
  }finally{await f.db.close()}
})

test('single readiness is checked again before creating or reusing an unpaid checkout order',async()=>{
  const f=await paymentFixture();try{
    const entry=await f.rpc(f.ids.single,'prepare_calendar_single_application',applicationInput(f))
    await f.db.query("update public.private_appearance_scores set status='stale' where user_id=$1",[f.ids.single])
    assert.match((await prepareOrder(f,entry)).error?.message??'',/matching_features_not_ready/)
    assert.equal(await f.value("select count(*)::integer as value from quantum_private.calendar_payment_orders where audience='single'"),0)
    await f.db.query("update public.private_appearance_scores set status='ready' where user_id=$1",[f.ids.single])
    const intent=randomUUID(),order=await prepareOrder(f,entry,intent)
    assert.equal(order.error,null)
    await f.db.query("update public.private_appearance_scores set status='pending' where user_id=$1",[f.ids.single])
    assert.match((await prepareOrder(f,entry,intent)).error?.message??'',/matching_features_not_ready/)
    await f.db.query("update public.private_appearance_scores set status='ready' where user_id=$1",[f.ids.single])
    assert.equal((await prepareOrder(f,entry,intent)).data.orderId,order.data.orderId)
  }finally{await f.db.close()}
})

test('couple social invitations and checkout do not acquire single appearance requirements',async()=>{
  const f=await paymentFixture();try{
    await f.db.exec('delete from public.private_appearance_scores;delete from public.photos')
    const order=await f.prepareOrder()
    assert.equal(order.audience,'couple')
    assert.equal(order.state,'prepared')
  }finally{await f.db.close()}
})

test('readiness lost after checkout blocks new confirmation but preserves late payment as refund due',async()=>{
  const f=await paymentFixture();try{
    const entry=await f.rpc(f.ids.single,'prepare_calendar_single_application',applicationInput(f))
    const order=(await prepareOrder(f,entry)).data
    await f.db.query("update public.private_appearance_scores set status='stale' where user_id=$1",[f.ids.single])
    const evidence={p_actor:f.ids.single,p_audience:'single',p_event_id:f.ids.window,p_order_id:order.orderId,p_payment_key:'synthetic-confirmation',p_amount_krw:10000}
    const confirming=await f.service.rpc('record_calendar_payment_for_service',{...evidence,p_state:'confirming'})
    assert.match(confirming.error?.message??'',/calendar_event_closed/)
    const late=await f.service.rpc('record_calendar_payment_for_service',{...evidence,p_state:'confirmed'})
    assert.equal(late.error,null)
    assert.equal(late.data.depositState,'refund_due')
    assert.equal((await prepareOrder(f,entry)).data.orderId,order.orderId)
  }finally{await f.db.close()}
})
