import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {registerHooks} from 'node:module'
import {nativeFixture} from './native-admission-fixture.mjs'
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('.')&&!specifier.endsWith('.ts')&&context.parentURL?.includes('/lib/meetups/')?specifier+'.ts':specifier,context)}})
const {confirmCheckoutOrder,resumeCheckoutOrder}=await import('../../lib/meetups/admission-checkout-server.ts')
const migration=new URL('../../supabase/migrations/20260913102522_meetup_admission_checkout_orders.sql',import.meta.url)
async function setup(){
 const f=await nativeFixture();await f.db.exec(await readFile(migration,'utf8'));await f.enableNativePolicy();await f.db.query('update quantum_private.activity_meetup_admission_policies set amount_krw=10000 where study_room_id=$1',[f.nativeRoom])
 f.service={rpc:async(name,args)=>{await f.db.exec("set role service_role;select set_config('request.jwt.claim.role','service_role',false)");try{return{data:await f.value(`select public.${name}(${Object.keys(args).map((key,i)=>key+'=> $'+(i+1)).join(',')})as value`,Object.values(args)),error:null}}catch(error){return{data:null,error}}finally{await f.db.exec('reset role')}}}
 f.owner=f.users.mechanicalMember;f.room={kind:'study',id:f.nativeRoom}
 f.order=async intent=>{const result=await f.service.rpc('prepare_meetup_admission_checkout_for_service',{p_actor:f.owner,p_kind:'study',p_room_id:f.nativeRoom,p_intent_id:intent,p_provider_mode:'test'});if(result.error)throw result.error;return result.data}
 f.expire=async order=>{await f.db.query("update quantum_private.activity_meetup_admission_intents set expires_at=now()-interval '1 minute'where id=$1",[order.intentId]);await f.db.query("update quantum_private.activity_meetup_admission_quotes set expires_at=now()-interval '1 minute'where id=(select quote_id from quantum_private.activity_meetup_admission_intents where id=$1)",[order.intentId]);await f.db.query("update quantum_private.meetup_admission_checkout_orders set expires_at=now()-interval '1 minute'where order_id=$1",[order.orderId])}
 f.state=async order=>(await f.db.query('select state,payment_key from quantum_private.meetup_admission_checkout_orders where order_id=$1',[order.orderId])).rows[0]
 return f
}
const absent={status:404,code:'NOT_FOUND_PAYMENT'}
const provider=error=>({mode:'test',lookup:async()=>{throw error},confirm:()=>assert.fail('must not charge')})
const input=(f,o,key=null)=>({room:f.room,orderId:o.orderId,paymentKey:key,amount:key?10000:null})
const inProgress=o=>({orderId:o.orderId,paymentKey:'fixture-payment',totalAmount:10000,balanceAmount:10000,currency:'KRW',status:'IN_PROGRESS',approvedAt:null,cancels:[]})
test('an expired prepared order with exact provider absence can recover; its old callback cannot restart payment',async()=>{
 const f=await setup();try{
  const original=await f.order((await f.nativePrepare()).intentId);await f.expire(original)
  await assert.rejects(resumeCheckoutOrder(f.service,f.owner,f.room,original.orderId,'test'),/deposit_quote_expired/)
  await assert.rejects(confirmCheckoutOrder(f.service,provider(absent),f.owner,input(f,original)),/checkout_aborted/)
  assert.deepEqual(await f.state(original),{state:'aborted',payment_key:null})
  const releaseArgs={p_actor:f.owner,p_kind:'study',p_room_id:f.nativeRoom,p_order_id:original.orderId,p_provider_mode:'test'}
  assert.equal((await f.service.rpc('abort_expired_unstarted_meetup_checkout_for_service',releaseArgs)).data.state,'aborted','duplicate recovery is idempotent')
  const next=await f.order((await f.nativePrepare()).intentId);assert.notEqual(next.orderId,original.orderId)
  await assert.rejects(confirmCheckoutOrder(f.service,{mode:'test',lookup:async()=>inProgress(original),confirm:()=>assert.fail('old callback must not charge')},f.owner,input(f,original,'fixture-payment')),/checkout_aborted/)
  assert.equal((await f.db.query('select count(*)as n from quantum_private.activity_meetup_admission_deposits')).rows[0].n,0)
 }finally{await f.db.close()}
})
test('network or ambiguous absence and any started order remain blocked; fresh absence can still be resumed',async()=>{
 const f=await setup();try{
  const original=await f.order((await f.nativePrepare()).intentId)
  await assert.rejects(confirmCheckoutOrder(f.service,provider(absent),f.owner,input(f,original)),/checkout_not_paid/)
  assert.equal((await resumeCheckoutOrder(f.service,f.owner,f.room,original.orderId,'test')).orderId,original.orderId)
  await f.expire(original)
  for(const error of [new Error('network timeout'),{status:404,code:'NOT_FOUND'},{status:503,code:'NOT_FOUND_PAYMENT'}]){
   await assert.rejects(confirmCheckoutOrder(f.service,provider(error),f.owner,input(f,original)),/checkout_reconciliation_required/);assert.equal((await f.state(original)).state,'prepared')
  }
  for(const state of ['confirming','reconciliation_required','confirmed']){
   await f.db.query('update quantum_private.meetup_admission_checkout_orders set state=$1,payment_key=$2 where order_id=$3',[state,'fixture-payment',original.orderId])
   await assert.rejects(confirmCheckoutOrder(f.service,provider(absent),f.owner,input(f,original)),/checkout_reconciliation_required/)
   assert.equal((await f.state(original)).state,state)
   const release=await f.service.rpc('abort_expired_unstarted_meetup_checkout_for_service',{p_actor:f.owner,p_kind:'study',p_room_id:f.nativeRoom,p_order_id:original.orderId,p_provider_mode:'test'})
   assert.match(release.error?.message??'',/checkout_reconciliation_required/);assert.equal((await f.state(original)).state,state)
  }
 }finally{await f.db.close()}
})
test('expiry or retirement between lookup and confirmation is rechecked atomically before any provider charge',async()=>{
 const f=await setup();try{
  const original=await f.order((await f.nativePrepare()).intentId)
  await assert.rejects(confirmCheckoutOrder(f.service,{mode:'test',lookup:async()=>{await f.expire(original);return inProgress(original)},confirm:()=>assert.fail('expired during lookup')},f.owner,input(f,original,'fixture-payment')),/deposit_quote_expired/)
  assert.equal((await f.state(original)).state,'prepared')
  await assert.rejects(confirmCheckoutOrder(f.service,provider(absent),f.owner,input(f,original)),/checkout_aborted/)
  const next=await f.order((await f.nativePrepare()).intentId)
  await assert.rejects(confirmCheckoutOrder(f.service,{mode:'test',lookup:async()=>{
   await f.expire(next)
   await assert.rejects(confirmCheckoutOrder(f.service,provider(absent),f.owner,input(f,next)),/checkout_aborted/)
   return inProgress(next)
  },confirm:()=>assert.fail('retired during lookup')},f.owner,input(f,next,'fixture-payment')),/checkout_aborted/)
  assert.equal((await f.state(next)).state,'aborted')
 }finally{await f.db.close()}
})
test('unstarted retirement is service-only and scoped to the saved actor, room and provider mode',async()=>{
 const f=await setup();try{
  const order=await f.order((await f.nativePrepare()).intentId);await f.expire(order)
  await f.db.exec('set role authenticated')
  await assert.rejects(f.value('select public.abort_expired_unstarted_meetup_checkout_for_service($1,$2,$3,$4,$5)as value',[f.owner,'study',f.nativeRoom,order.orderId,'test']),/permission denied/)
  await f.db.exec('reset role')
  const args={p_actor:f.owner,p_kind:'study',p_room_id:f.nativeRoom,p_order_id:order.orderId,p_provider_mode:'test'}
  for(const patch of [{p_actor:f.users.mechanicalCaptain},{p_provider_mode:'live'}]){const result=await f.service.rpc('abort_expired_unstarted_meetup_checkout_for_service',{...args,...patch});assert.ok(result.error);assert.equal((await f.state(order)).state,'prepared')}
 }finally{await f.db.close()}
})
test('record RPC takes the native canonical lock before user/order locks, and executes native locking for state transitions',async()=>{
 const f=await setup();try{
  const body=await f.value("select pg_get_functiondef('public.record_meetup_admission_checkout_for_service(uuid,text,uuid,text,text,text,integer)'::regprocedure)as value")
  assert.ok(body.indexOf('perform quantum_private.native_admission_lock')>=0,'native lock path is mandatory')
  assert.ok(body.indexOf('perform quantum_private.native_admission_lock')<body.indexOf('perform pg_advisory_xact_lock'),'native global/sorted-user lock precedes the custom-meetup-only user lock')
  await f.db.exec("alter function quantum_private.native_admission_lock(text,uuid,uuid[])rename to native_admission_lock_before_checkout_test;create function quantum_private.native_admission_lock(k text,r uuid,people uuid[])returns void language plpgsql as $$begin perform set_config('test.checkout_native_lock','seen',true);perform quantum_private.native_admission_lock_before_checkout_test(k,r,people);end$$;")
  const order=await f.order((await f.nativePrepare()).intentId)
  await f.db.exec('begin');await f.db.exec("select set_config('test.checkout_native_lock','',true)")
  const result=await f.service.rpc('record_meetup_admission_checkout_for_service',{p_actor:f.owner,p_kind:'study',p_room_id:f.nativeRoom,p_order_id:order.orderId,p_state:'confirming',p_payment_key:'fixture-payment',p_amount_krw:10000});assert.equal(result.error,null)
  assert.equal(await f.value("select current_setting('test.checkout_native_lock',true)as value"),'seen');await f.db.exec('rollback')
 }finally{await f.db.close()}
})
