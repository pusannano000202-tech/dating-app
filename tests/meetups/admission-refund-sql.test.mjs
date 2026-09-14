import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {refundFixture,refundRpcContract} from './admission-refund-fixture.mjs'
import {runRefundPostgresConcurrency} from './admission-refund-postgres-fixture.mjs'

function safe(value) {
  const serialized=JSON.stringify(value)
  for(const forbidden of ['paymentKey','receipt_ref','receiptRef','providerTransactionKey','fixture-payment-','fixture-cancel-','orderId','intentId']) assert.equal(serialized.includes(forbidden),false,forbidden)
}

test('refund liability requires the owner request and current super-admin approval before any worker claim',async()=>{
 const f=await refundFixture();try{
  const paid=await f.paid()
  assert.deepEqual(await f.claim(),[])
  const available=await f.owner('list_my_meetup_admission_refunds');assert.equal(available[0].refundState,'available');safe(available)
  await assert.rejects(f.request(paid.depositId,f.users.mechanicalCaptain),/refund_not_found/)
  assert.deepEqual(await f.owner('list_my_meetup_admission_refunds',[],f.users.mechanicalCaptain),[])
  const request=await f.request(paid.depositId);assert.equal(request.refundState,'requested');safe(request)
  assert.deepEqual(Object.keys(request).sort(),refundRpcContract.summary.toSorted());assert.equal(request.roomTitle,'함께 푸는 미적분')
  assert.deepEqual(await f.request(paid.depositId),request)
  assert.deepEqual(await f.claim(),[])
  await assert.rejects(f.review(paid.depositId,request.requestId,'approve',f.users.mechanicalCaptain),/super_admin_required/)
  await assert.rejects(f.review(paid.depositId,randomUUID()),/refund_request_conflict/)
  const approved=await f.review(paid.depositId,request.requestId);assert.equal(approved.refundState,'approved')
  assert.deepEqual(await f.review(paid.depositId,request.requestId),approved)
  safe(await f.service('list_meetup_admission_refunds_for_service',[f.users.computerCaptain]))
  const claims=await f.claim();assert.equal(claims.length,1);assert.equal(claims[0].requestId,request.requestId);assert.equal(claims[0].paymentKey,paid.paymentKey)
  assert.deepEqual(Object.keys(claims[0]).sort(),refundRpcContract.claim.toSorted())
  assert.deepEqual(await f.claim(),[])
 }finally{await f.db.close()}
})

test('held deposits remain visible but unavailable; browser and forged roles cannot call private/service operations',async()=>{
 const f=await refundFixture();try{
  const paid=await f.paid({due:false})
  assert.equal((await f.owner('list_my_meetup_admission_refunds'))[0].refundState,'unavailable')
  await assert.rejects(f.request(paid.depositId),/refund_not_available/)
  await assert.rejects(f.service('request_my_meetup_admission_refund',[paid.depositId]),/permission denied/)
  await f.db.exec('set role anon')
  await assert.rejects(f.rpc('list_my_meetup_admission_refunds'),/permission denied/)
  await f.db.exec('reset role');await f.as(f.users.mechanicalMember)
  await f.db.exec("set role authenticated;select set_config('request.jwt.claim.role','service_role',false)")
  await assert.rejects(f.rpc('claim_meetup_admission_refunds_for_service',[randomUUID(),1,'test']),/permission denied/)
  await assert.rejects(f.db.query('select * from quantum_private.activity_meetup_admission_refund_outbox'),/permission denied/)
  await assert.rejects(f.db.query('select * from quantum_private.meetup_admission_refund_audit'),/permission denied/)
  await f.db.exec('reset role')
  await f.db.exec("set role service_role;select set_config('request.jwt.claim.role','authenticated',false)")
  await assert.rejects(f.rpc('claim_meetup_admission_refunds_for_service',[randomUUID(),1,'test']),/service_only/)
  await f.db.exec('reset role')
 }finally{await f.db.close()}
})

test('claims bind exact confirmed checkout, owner, mode, original amount and provider receipt',async()=>{
 const f=await refundFixture();try{
  const paid=await f.paid(),request=await f.request(paid.depositId);await f.review(paid.depositId,request.requestId)
  assert.deepEqual(await f.claim(randomUUID(),'live'),[])
  const mismatches=[['state','prepared'],['user_id',f.users.mechanicalCaptain],['payment_key','foreign-key'],['amount_krw',9999],['room_id',randomUUID()],['policy_version','foreign-policy']]
  for(const [column,value]of mismatches){
   const before=(await f.db.query(`select ${column} from quantum_private.meetup_admission_checkout_orders where order_id=$1`,[paid.orderId])).rows[0][column]
   await f.db.query(`update quantum_private.meetup_admission_checkout_orders set ${column}=$2 where order_id=$1`,[paid.orderId,value])
   assert.deepEqual(await f.claim(),[],column)
   await f.db.query(`update quantum_private.meetup_admission_checkout_orders set ${column}=$2 where order_id=$1`,[paid.orderId,before])
  }
  const [claim]=await f.claim();assert.equal(claim.amountKrw,10000)
  await assert.rejects(f.finalize(claim,{amountKrw:9999}),/refund_proof_mismatch/)
  await assert.rejects(f.finalize(claim,{paymentKey:'other-key'}),/refund_proof_mismatch/)
  await assert.rejects(f.finalize(claim,{orderId:'other-order'}),/refund_proof_mismatch/)
  await assert.rejects(f.finalize(claim,{providerTransactionKey:''}),/refund_proof_mismatch/)
  assert.equal((await f.owner('list_my_meetup_admission_refunds'))[0].payment,'refund_due')
 }finally{await f.db.close()}
})

test('expired leases are reclaimed; stale finalizers cannot mutate the durable stable request',async()=>{
 const f=await refundFixture();try{
  const paid=await f.paid(),request=await f.request(paid.depositId);await f.review(paid.depositId,request.requestId)
  const [first]=await f.claim()
  await f.db.query("update quantum_private.activity_meetup_admission_refund_outbox set lease_expires_at=clock_timestamp()-interval '1 second'where deposit_id=$1",[paid.depositId])
  await assert.rejects(f.finalize(first),/refund_lease_conflict/)
  const [second]=await f.claim();assert.equal(second.requestId,first.requestId);assert.notEqual(second.leaseId,first.leaseId)
  await assert.rejects(f.finalize(first),/refund_lease_conflict/)
  await assert.rejects(f.release(first),/refund_lease_conflict/)
  const completed=await f.finalize(second);assert.equal(completed.payment,'refunded');assert.equal(completed.refundState,'completed');assert.ok(completed.completedAt);safe(completed)
  assert.deepEqual(await f.finalize(second),completed)
  assert.deepEqual(await f.release(second),completed)
  assert.deepEqual(await f.request(paid.depositId),completed)
  assert.deepEqual(await f.review(paid.depositId,request.requestId,'retry'),completed)
  assert.deepEqual(await f.claim(),[])
  assert.equal((await f.db.query("select count(*)::int n from quantum_private.meetup_admission_refund_audit where deposit_id=$1 and event='completed'",[paid.depositId])).rows[0].n,1)
  await assert.rejects(f.db.query('delete from quantum_private.meetup_admission_refund_audit where deposit_id=$1',[paid.depositId]),/refund_audit_immutable/)
 }finally{await f.db.close()}
})

test('provider failure is sanitized, backs off, retains request ID and exhausts after five attempts',async()=>{
 const f=await refundFixture();try{
  const paid=await f.paid(),request=await f.request(paid.depositId);await f.review(paid.depositId,request.requestId)
  for(let attempt=1;attempt<=5;attempt++){
   const [claim]=await f.claim();assert.equal(claim.requestId,request.requestId)
   const failed=await f.release(claim,'provider returned a secret paymentKey',true)
   assert.equal(failed.refundState,'failed');assert.equal(failed.lastError,'refund_provider_failed');safe(failed)
   assert.deepEqual(await f.claim(),[])
   await f.db.query("update quantum_private.activity_meetup_admission_refund_outbox set next_attempt_at=clock_timestamp()-interval '1 second'where deposit_id=$1",[paid.depositId])
  }
  assert.deepEqual(await f.claim(),[])
  await assert.rejects(f.review(paid.depositId,request.requestId,'retry'),/refund_attempts_exhausted/)
  assert.equal((await f.db.query('select attempt_count from quantum_private.activity_meetup_admission_refund_outbox where deposit_id=$1',[paid.depositId])).rows[0].attempt_count,5)
  assert.equal((await f.owner('list_my_meetup_admission_refunds'))[0].payment,'refund_due')
 }finally{await f.db.close()}
})

test('revoked operator role blocks review; explicit operator retry cannot reset approval or request identity',async()=>{
 const f=await refundFixture();try{
  const paid=await f.paid(),request=await f.request(paid.depositId)
  await f.db.query("update public.admins set role='admin'where user_id=$1",[f.users.computerCaptain])
  await assert.rejects(f.review(paid.depositId,request.requestId),/super_admin_required/)
  await assert.rejects(f.service('list_meetup_admission_refunds_for_service',[f.users.computerCaptain]),/super_admin_required/)
  await f.db.query("update public.admins set role='super_admin'where user_id=$1",[f.users.computerCaptain])
  const approved=await f.review(paid.depositId,request.requestId),[claim]=await f.claim()
  await f.release(claim,'refund_proof_mismatch',false)
  assert.deepEqual(await f.claim(),[])
  const retry=await f.review(paid.depositId,request.requestId,'retry');assert.equal(retry.requestId,request.requestId);assert.equal(retry.approvedAt,approved.approvedAt)
  assert.deepEqual(await f.review(paid.depositId,request.requestId,'retry'),retry)
  assert.equal((await f.claim()).length,1)
 }finally{await f.db.close()}
})

test('deleting the original room preserves immutable checkout origin and the owner refund path',async()=>{
 const f=await refundFixture();try{
  const paid=await f.paid({due:false})
  // Current study membership FK first prevents a raw hard-delete. A legitimate
  // cleanup removes the synthetic membership before deleting the source room.
  await assert.rejects(f.db.query('delete from quantum_private.study_rooms where id=$1',[f.nativeRoom]),/study_room_members_room_id_pool_id_fkey/)
  await f.db.query('delete from quantum_private.study_room_members where room_id=$1',[f.nativeRoom])
  await f.db.query('delete from quantum_private.study_room_sessions where room_id=$1',[f.nativeRoom])
  await f.db.query('delete from quantum_private.study_rooms where id=$1',[f.nativeRoom])
  const stored=(await f.db.query('select state,study_room_id,source_kind,source_room_id from quantum_private.activity_meetup_admission_deposits where id=$1',[paid.depositId])).rows[0]
  assert.deepEqual(stored,{state:'refund_due',study_room_id:null,source_kind:'study',source_room_id:f.nativeRoom})
  const request=await f.request(paid.depositId)
  assert.equal(request.roomTitle,null);assert.deepEqual(request.room,{kind:'study',id:f.nativeRoom})
  await f.review(paid.depositId,request.requestId)
  const [claim]=await f.claim();assert.equal(claim.orderId,paid.orderId);assert.equal(claim.paymentKey,paid.paymentKey)
  assert.deepEqual(claim.room,{kind:'study',id:f.nativeRoom})
  assert.equal((await f.finalize(claim)).payment,'refunded')
 }finally{await f.db.close()}
})

test('explicit operator retry resumes a failed backoff without resetting identity, approval, attempts or a live lease',async()=>{
 const f=await refundFixture();try{
  const paid=await f.paid(),request=await f.request(paid.depositId)
  const approved=await f.review(paid.depositId,request.requestId),[first]=await f.claim()
  const failed=await f.release(first,'provider_unavailable',true)
  assert.equal(failed.refundState,'failed')
  assert.equal((await f.db.query('select state from quantum_private.activity_meetup_admission_refund_outbox where deposit_id=$1',[paid.depositId])).rows[0].state,'pending')
  const retry=await f.review(paid.depositId,request.requestId,'retry')
  assert.equal(retry.refundState,'approved');assert.equal(retry.requestId,request.requestId)
  assert.equal(retry.approvedAt,approved.approvedAt);assert.equal(retry.lastError,null)
  assert.equal((await f.db.query('select attempt_count from quantum_private.activity_meetup_admission_refund_outbox where deposit_id=$1',[paid.depositId])).rows[0].attempt_count,1)
  const [second]=await f.claim();assert.equal(second.requestId,request.requestId)
  const leased=(await f.db.query('select lease_id,attempt_count from quantum_private.activity_meetup_admission_refund_outbox where deposit_id=$1',[paid.depositId])).rows[0]
  await assert.rejects(f.review(paid.depositId,request.requestId,'retry'),/refund_state_conflict/)
  assert.deepEqual((await f.db.query('select lease_id,attempt_count from quantum_private.activity_meetup_admission_refund_outbox where deposit_id=$1',[paid.depositId])).rows[0],leased)
  assert.equal(leased.attempt_count,2)
 }finally{await f.db.close()}
})

test('isolated PostgreSQL serializes duplicate requests/finalizers and skips another worker lease',{
 skip:process.env.RUN_ADMISSION_REFUND_POSTGRES!=='1',
},async()=>{
 const result=await runRefundPostgresConcurrency()
 assert.equal(result.distinctWorkerClaims,2);assert.equal(result.concurrentFinalizerCompletions,1);assert.equal(result.providerCalls,0)
})
