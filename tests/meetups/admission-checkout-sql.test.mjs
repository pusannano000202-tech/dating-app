import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {nativeFixture} from './native-admission-fixture.mjs'
const migration=new URL('../../supabase/migrations/20260913102522_meetup_admission_checkout_orders.sql',import.meta.url)
async function setup(){const f=await nativeFixture();await f.db.exec(await readFile(migration,'utf8'));await f.enableNativePolicy();await f.db.query("update quantum_private.activity_meetup_admission_policies set amount_krw=10000,policy_version='fixture-approved-10000'where study_room_id=$1",[f.nativeRoom])
 f.service=async(name,args)=>{await f.db.exec("set role service_role;select set_config('request.jwt.claim.role','service_role',false)");try{return await f.value(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})as value`,args)}finally{await f.db.exec('reset role')}}
 f.order=(intent,kind='study',room=f.nativeRoom,user=f.users.mechanicalMember)=>f.service('prepare_meetup_admission_checkout_for_service',[user,kind,room,intent,'test'])
 f.record=(order,state='confirmed',key='provider-fixture',amount=10000)=>f.service('record_meetup_admission_checkout_for_service',[order.ownerId,order.room.kind,order.room.id,order.orderId,state,key,amount])
 return f}
test('canonical user, native role and room bindings persist in one idempotent order; no membership before approval',async()=>{
 const f=await setup();try{
  const prepared=await f.nativePrepare(),order=await f.order(prepared.intentId)
  assert.deepEqual(await f.order(prepared.intentId),order);assert.equal(order.amountKrw,10000);assert.deepEqual(order.room,{kind:'study',id:f.nativeRoom})
  await assert.rejects(f.service('prepare_meetup_admission_checkout_for_service',[f.users.mechanicalMember,'study',f.nativeRoom,prepared.intentId,'live']),/checkout_provider_changed/)
  await assert.rejects(f.order(prepared.intentId,'study',f.nativeRoom,f.users.mechanicalCaptain),/checkout_order_not_found/)
  await assert.rejects(f.order(prepared.intentId,'custom_meetup',f.roomId),/checkout_order_not_found/)
  assert.equal((await f.db.query('select count(*)as n from quantum_private.activity_meetup_admissions')).rows[0].n,0)
  await assert.rejects(f.record(order,'confirmed','provider-fixture',1),/checkout_evidence_mismatch/)
  await f.record(order,'confirming');const pending=await f.record(order)
  assert.equal(pending.admission,'pending');assert.equal(pending.payment,'held');assert.equal(pending.chatHref,null)
  assert.deepEqual(await f.record(order),pending)
  assert.equal((await f.db.query('select count(*)as n from quantum_private.activity_meetup_admission_deposits')).rows[0].n,1)
  assert.equal((await f.db.query('select count(*)as n from quantum_private.study_room_members where room_id=$1 and left_at is null',[f.nativeRoom])).rows[0].n,1)
 }finally{await f.db.close()}
})
test('browser roles cannot mint orders/receipts; expired paid attempts retain refund_due instead of false admission',async()=>{
 const f=await setup();try{
  const prepared=await f.nativePrepare(),order=await f.order(prepared.intentId)
  await f.db.exec('set role authenticated')
  await assert.rejects(f.value('select public.get_meetup_admission_checkout_for_service($1,$2,$3,$4)as value',[order.ownerId,'study',f.nativeRoom,order.orderId]),/permission denied/)
  await f.db.exec('reset role')
  await f.db.query("update quantum_private.activity_meetup_admission_intents set expires_at=now()-interval '1 minute'where id=$1",[prepared.intentId])
  const paid=await f.record(order);assert.equal(paid.admission,'cancelled');assert.equal(paid.payment,'refund_due')
  assert.equal((await f.db.query('select state from quantum_private.meetup_admission_checkout_orders where order_id=$1',[order.orderId])).rows[0].state,'confirmed')
  assert.deepEqual(await f.record(order),paid)
 }finally{await f.db.close()}
})
test('new applications require the approved 10000 quote; earlier quotes are not silently rewritten',async()=>{
 const f=await setup();try{
  await f.db.query("update quantum_private.activity_meetup_admission_policies set amount_krw=17000,policy_version='earlier-fixture'where study_room_id=$1",[f.nativeRoom])
  const prepared=await f.nativePrepare()
  await assert.rejects(f.order(prepared.intentId),/deposit_amount_policy_changed/)
  assert.equal((await f.db.query('select amount_krw from quantum_private.activity_meetup_admission_intents where id=$1',[prepared.intentId])).rows[0].amount_krw,17000)
  assert.equal((await f.db.query('select count(*)as n from quantum_private.meetup_admission_checkout_orders')).rows[0].n,0)
 }finally{await f.db.close()}
})
test('lost navigation can retrieve only its own pending order; expiry cannot mint another unresolved charge',async()=>{
 const f=await setup();try{
  const first=await f.nativePrepare(),order=await f.order(first.intentId)
  await f.as(f.users.mechanicalMember)
  assert.deepEqual(await f.value('select public.get_my_pending_meetup_admission_checkout($1,$2)as value',['study',f.nativeRoom]),{accountKey:f.users.mechanicalMember,order:{orderId:order.orderId,state:'prepared'}})
  await f.as(f.users.mechanicalCaptain)
  assert.equal((await f.value('select public.get_my_pending_meetup_admission_checkout($1,$2)as value',['study',f.nativeRoom])).order,null)
  await f.db.query("update quantum_private.activity_meetup_admission_intents set expires_at=now()-interval '1 minute'where id=$1",[first.intentId])
  await f.db.query("update quantum_private.activity_meetup_admission_quotes set expires_at=now()-interval '1 minute'where id=(select quote_id from quantum_private.activity_meetup_admission_intents where id=$1)",[first.intentId])
  const next=await f.nativePrepare()
  await assert.rejects(f.order(next.intentId),/checkout_reconciliation_required/)
  await f.record(order,'aborted','provider-expired')
  const nextOrder=await f.order(next.intentId);assert.notEqual(nextOrder.orderId,order.orderId)
 }finally{await f.db.close()}
})
