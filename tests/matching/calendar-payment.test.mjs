import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {registerHooks} from 'node:module'
import {paymentFixture,installActualSoloWeeklyApplication} from './calendar-payment-fixture.mjs'
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('.')&&!specifier.endsWith('.ts')&&context.parentURL?.includes('/lib/payments/')?specifier+'.ts':specifier,context)}})
const {calendarPaymentConfig,verifiedCalendarPaid,verifiedCalendarRefund}=await import('../../lib/payments/calendar-provider.ts')
const {confirmCalendarPayment,processCalendarRefund}=await import('../../lib/payments/calendar-server.ts')
const {publicCalendarOrder,calendarEventMonth}=await import('../../lib/payments/calendar-contract.ts')
const input=o=>({audience:o.audience,eventId:o.eventId,orderId:o.orderId,paymentKey:null,amount:null})
const done=o=>({orderId:o.orderId,paymentKey:o.paymentKey??'fixture-'+o.intentId,currency:'KRW',totalAmount:10000,balanceAmount:10000,status:'DONE',approvedAt:new Date().toISOString(),cancels:[]})
const cancelled=o=>({...done(o),status:'CANCELED',balanceAmount:0,lastTransactionKey:'fixture-cancel',cancels:[{cancelStatus:'DONE',transactionKey:'fixture-cancel',cancelAmount:10000,canceledAt:new Date().toISOString()}]})
const provider=(lookup,overrides={})=>({mode:'test',lookup,confirm:()=>assert.fail('unexpected provider confirm'),cancel:()=>assert.fail('unexpected provider cancel'),...overrides})

test('dedicated flag, matched provider keys, and production isolation are required',()=>{
  const env={QUANTUM_CALENDAR_PAYMENTS_ENABLED:'true',NEXT_PUBLIC_TOSS_CLIENT_KEY:'test_ck_fixture',TOSS_SECRET_KEY:'test_sk_fixture'}
  assert.equal(calendarPaymentConfig(env).ready,true)
  for(const patch of [{QUANTUM_CALENDAR_PAYMENTS_ENABLED:'false'},{TOSS_SECRET_KEY:'live_sk_fixture'},{NODE_ENV:'production'},{TOSS_SECRET_KEY:''}])assert.equal(calendarPaymentConfig({...env,...patch}).ready,false)
  assert.equal(calendarPaymentConfig({...env,QUANTUM_CALENDAR_PAYMENTS_ENABLED:'false'}).recoveryReady,true)
})

test('owner/event/entry binding and repeated prepare reuse one outstanding order',async()=>{
  const f=await paymentFixture();try{
    const a=await f.prepareOrder(),b=await f.prepareOrder()
    assert.equal(a.orderId,b.orderId)
    const stolen=await f.service.rpc('get_calendar_payment_for_service',{p_actor:f.ids.outsider,p_audience:'couple',p_event_id:f.ids.event,p_order_id:a.orderId})
    assert.match(stolen.error.message,/calendar_order_not_found/)
    const rebound=await f.service.rpc('prepare_calendar_payment_for_service',{p_actor:f.ids.partner,p_audience:'couple',p_event_id:f.ids.event,p_application_id:f.entry,p_intent_id:a.intentId,p_provider_mode:'test'})
    assert.match(rebound.error.message,/calendar_idempotency_conflict/)
    await assert.rejects(f.rpc(f.ids.leader,'record_calendar_payment_for_service',{p_actor:f.ids.leader,p_audience:'couple',p_event_id:f.ids.event,p_order_id:a.orderId,p_state:'confirmed',p_payment_key:'forged',p_amount_krw:10000}),/permission denied/)
    await f.db.exec('set role authenticated')
    await assert.rejects(f.db.query('select * from quantum_private.calendar_payment_orders'),/permission denied/)
    await f.db.exec('reset role')
  }finally{await f.db.close()}
})

test('both accepted partners must pay separately before calendar admission, with no legacy ready state',async()=>{
  const f=await paymentFixture();try{
    const a=await f.record(await f.prepareOrder())
    assert.equal((await f.finalize()).applicationFinalized,false)
    await f.record(await f.prepareOrder(f.ids.partner))
    assert.equal((await f.finalize()).applicationFinalized,true)
    assert.equal((await f.finalize()).applicationFinalized,true)
    assert.equal(await f.value('select status as value from public.quantum_couple_parties where id=$1',[f.entry]),'calendar_ready')
    const stable=await f.record(a)
    assert.equal(stable.orderId,a.orderId)
    assert.equal((await f.db.query('select count(*) n from quantum_private.calendar_payment_orders')).rows[0].n,2)
    assert.equal('paymentKey' in publicCalendarOrder(a),false)
  }finally{await f.db.close()}
})

test('callback key/amount/currency mismatch never reaches confirm or stores a paid receipt',async()=>{
  const f=await paymentFixture();try{
    const o=await f.prepareOrder()
    for(const patch of [{orderId:'calendar_'+'0'.repeat(32)},{currency:'USD'},{totalAmount:9999},{paymentKey:'different-key'}]){
      await assert.rejects(confirmCalendarPayment(f.service,provider(async()=>({...done(o),...patch})),o.ownerId,{...input(o),paymentKey:'fixture-'+o.intentId,amount:10000}),/evidence_mismatch/)
    }
    assert.equal((await f.read(o)).depositState,'unpaid')
    for(const patch of [{balanceAmount:9999},{approvedAt:null},{cancels:[{}]}])assert.equal(verifiedCalendarPaid({...done(o),...patch},o),false)
  }finally{await f.db.close()}
})

test('cancel during provider lookup blocks a new charge; late DONE creates a refund liability',async()=>{
  const f=await paymentFixture();try{
    const o=await f.prepareOrder(),key='fixture-'+o.intentId
    await assert.rejects(confirmCalendarPayment(f.service,provider(async()=>{await f.cancel();return {...done(o),status:'IN_PROGRESS',approvedAt:null}}),o.ownerId,{...input(o),paymentKey:key,amount:10000}),/calendar_event_closed/)
    const paid=await confirmCalendarPayment(f.service,provider(async()=>done(o)),o.ownerId,input(o))
    assert.equal(paid.depositState,'refund_due')
    assert.equal(await f.value('select status as value from public.quantum_couple_parties where id=$1',[f.entry]),'cancelled')
    assert.equal(await f.value('select state as value from quantum_private.calendar_refund_outbox where order_id=$1',[o.orderId]),'available')
  }finally{await f.db.close()}
})

test('provider confirm timeout recovers original order; duplicate confirmation uses lookup only',async()=>{
  const f=await paymentFixture();try{
    const o=await f.prepareOrder();let confirms=0,lookups=0
    const pg=provider(async()=>++lookups===1?{...done(o),status:'IN_PROGRESS',approvedAt:null}:done(o),{confirm:async()=>{confirms++;throw Error('lost response')}})
    const paid=await confirmCalendarPayment(f.service,pg,o.ownerId,{...input(o),paymentKey:'fixture-'+o.intentId,amount:10000})
    assert.equal(paid.depositState,'held');assert.equal(confirms,1)
    await confirmCalendarPayment(f.service,pg,o.ownerId,input(o));assert.equal(confirms,1)
  }finally{await f.db.close()}
})

test('refund needs owner request and exact saved transaction; duplicate refund cancels only once',async()=>{
  const f=await paymentFixture();try{
    const paid=await f.record(await f.prepareOrder());await f.cancel()
    let cancels=0,complete=false
    const pg=provider(async()=>complete?cancelled(paid):done(paid),{cancel:async args=>{assert.equal(args.paymentKey,paid.paymentKey);assert.equal(args.cancelAmount,10000);assert.equal('bankAccount'in args,false);cancels++;complete=true;return cancelled(paid)}})
    await assert.rejects(processCalendarRefund(f.service,pg,paid.ownerId,input(paid),randomUUID()),/calendar_refund_not_available/)
    const first=await f.request(paid),second=await f.request(paid);assert.equal(first.requestId,second.requestId)
    assert.equal((await processCalendarRefund(f.service,pg,paid.ownerId,input(paid),randomUUID())).depositState,'refunded')
    assert.equal((await processCalendarRefund(f.service,pg,paid.ownerId,input(paid),randomUUID())).depositState,'refunded')
    assert.equal(cancels,1)
  }finally{await f.db.close()}
})

test('lost cancel response retains request and the retry recovers without a second cancellation',async()=>{
  const f=await paymentFixture();try{
    const paid=await f.record(await f.prepareOrder());await f.cancel();await f.request(paid)
    let cancelledAtProvider=false,calls=0
    const pg=provider(async()=>cancelledAtProvider?cancelled(paid):done(paid),{cancel:async()=>{calls++;cancelledAtProvider=true;throw Error('timeout')}})
    await assert.rejects(processCalendarRefund(f.service,pg,paid.ownerId,input(paid),randomUUID()),/reconciliation/)
    assert.equal((await f.read(paid)).depositState,'refund_due')
    assert.equal((await processCalendarRefund(f.service,pg,paid.ownerId,input(paid),randomUUID())).depositState,'refunded')
    assert.equal(calls,1)
  }finally{await f.db.close()}
})

test('refund proof rejects partial, duplicate transaction and wrong original receipt',async()=>{
  const f=await paymentFixture();try{
    const o=await f.record(await f.prepareOrder())
    for(const patch of [{paymentKey:'other'},{orderId:'other'},{status:'PARTIAL_CANCELED'},{balanceAmount:1},{lastTransactionKey:'other'},{cancels:[...cancelled(o).cancels,...cancelled(o).cancels]}])assert.throws(()=>verifiedCalendarRefund({...cancelled(o),...patch},o),/proof_mismatch/)
  }finally{await f.db.close()}
})

test('late approval for retired order is preserved for refund even after a replacement order exists',async()=>{
  const f=await paymentFixture();try{
    const old=await f.prepareOrder()
    await f.db.query("update quantum_private.calendar_payment_orders set expires_at=now()-interval '1 minute'where order_id=$1",[old.orderId])
    await assert.rejects(confirmCalendarPayment(f.service,provider(async()=>{throw {status:404,code:'NOT_FOUND_PAYMENT'}}),old.ownerId,input(old)),/calendar_payment_aborted/)
    const replacement=await f.prepareOrder();assert.notEqual(replacement.orderId,old.orderId)
    const recovered=await confirmCalendarPayment(f.service,provider(async()=>done(old)),old.ownerId,input(old))
    assert.equal(recovered.depositState,'refund_due')
    assert.equal((await f.read(replacement)).state,'prepared')
  }finally{await f.db.close()}
})

test('single deposit finalizes the actual weekly application RPC with only the selected date; cancellation preserves refund',async()=>{
  const f=await paymentFixture();try{
    await installActualSoloWeeklyApplication(f)
    const entry=await f.rpc(f.ids.single,'prepare_calendar_single_application',{p_event_id:f.ids.window,p_idempotency_key:randomUUID(),p_participation_consent:true})
    const prepared=await f.service.rpc('prepare_calendar_payment_for_service',{p_actor:f.ids.single,p_audience:'single',p_event_id:f.ids.window,p_application_id:entry.entryId,p_intent_id:randomUUID(),p_provider_mode:'test'})
    assert.equal(prepared.error,null)
    const o=prepared.data
    const paid=await confirmCalendarPayment(f.service,provider(async()=>done(o)),f.ids.single,input(o))
    assert.equal(paid.depositState,'held')
    const finalize=()=>f.rpc(f.ids.single,'finalize_calendar_payment_application',{p_audience:'single',p_event_id:f.ids.window,p_application_id:entry.entryId})
    assert.equal((await finalize()).applicationFinalized,true)
    assert.equal((await finalize()).applicationFinalized,true)
    const application=(await f.db.query('select * from public.quantum_weekly_applications where user_id=$1',[f.ids.single])).rows
    assert.equal(application.length,1);assert.equal(application[0].idempotency_key,entry.entryId)
    assert.equal(application[0].party_type,'solo');assert.equal(application[0].party_size,1)
    const candidates=(await f.db.query('select window_id from public.quantum_weekly_application_candidates where application_id=$1',[application[0].id])).rows
    assert.deepEqual(candidates,[{window_id:f.ids.window}])
    await f.db.query("update public.quantum_weekly_applications set status='cancelled'where id=$1",[application[0].id])
    assert.equal(await f.value('select deposit_state as value from quantum_private.calendar_payment_orders where order_id=$1',[o.orderId]),'refund_due')
  }finally{await f.db.close()}
})

test('unreconciled prepared checkout prevents account erasure and its payment evidence being orphaned',async()=>{
  const f=await paymentFixture();try{
    await f.prepareOrder()
    await assert.rejects(f.db.query('delete from public.users where id=$1',[f.ids.leader]),/account_financial_retention_pending/)
  }finally{await f.db.close()}
})

test('a second refund worker cannot claim an active lease; only the matching lease can book completion',async()=>{
  const f=await paymentFixture();try{
    const paid=await f.record(await f.prepareOrder());await f.cancel();await f.request(paid)
    let unblock,entered
    const wait=new Promise(resolve=>{unblock=resolve}),started=new Promise(resolve=>{entered=resolve})
    let cancellations=0
    const pg=provider(async()=>{entered();await wait;return done(paid)},{cancel:async()=>{cancellations++;return cancelled(paid)}})
    const first=processCalendarRefund(f.service,pg,paid.ownerId,input(paid),randomUUID())
    await started
    await assert.rejects(processCalendarRefund(f.service,pg,paid.ownerId,input(paid),randomUUID()),/calendar_refund_busy/)
    unblock();assert.equal((await first).depositState,'refunded');assert.equal(cancellations,1)
    assert.equal((await confirmCalendarPayment(f.service,provider(()=>assert.fail('already refunded needs no charge')),paid.ownerId,input(paid))).depositState,'refunded')
  }finally{await f.db.close()}
})

test('server event start is retained and the calendar return month uses Korea time',async()=>{
  assert.equal(calendarEventMonth('2026-09-30T16:00:00Z'),'2026-10')
  const f=await paymentFixture();try{
    const order=await f.prepareOrder(),visible=publicCalendarOrder(order)
    assert.equal(visible.eventStartsAt,order.eventStartsAt)
    assert.ok(Number.isFinite(Date.parse(visible.eventStartsAt)))
    await f.cancel()
    const summary=await f.rpc(f.ids.leader,'get_my_calendar_couple_party',{p_event_id:f.ids.event})
    assert.equal(summary.checkoutEnabled,false)
  }finally{await f.db.close()}
})

test('school or relationship changes after preparation cannot start a new calendar charge',async()=>{
  const f=await paymentFixture();try{
    const order=await f.prepareOrder()
    await f.db.query("update public.users set school='different-school'where id=$1",[f.ids.partner])
    await assert.rejects(confirmCalendarPayment(f.service,provider(async()=>({...done(order),status:'IN_PROGRESS',approvedAt:null})),order.ownerId,{...input(order),paymentKey:'fixture-'+order.intentId,amount:10000}),/calendar_event_closed/)
    assert.equal((await f.read(order)).state,'prepared')
  }finally{await f.db.close()}
})
