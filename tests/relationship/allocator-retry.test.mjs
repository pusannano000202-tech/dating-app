import test from 'node:test'
import assert from 'node:assert/strict'
import {retryDatingAdmissionOnce} from '../../lib/relationship/allocator-retry.ts'
test('only a confirmed admission rollback retries once with a new snapshot',async()=>{
  const conflict={error:{message:'dating_participation_unavailable'}}
  let calls=0
  assert.equal(await retryDatingAdmissionOnce(conflict,async()=>{calls++;return conflict}),conflict)
  assert.equal(calls,1)
  for (const result of [{error:null},{error:{message:'network failure'}},{error:{message:'stale_revision'}}]) {
    assert.equal(await retryDatingAdmissionOnce(result,async()=>{throw new Error('must not replay')}),result)
  }
  const steps=[]
  const result=await retryDatingAdmissionOnce(conflict,async()=>{
    steps.push('fresh snapshot','recompute verified plan','publish same idempotency key');return {error:null}
  })
  assert.equal(result.error,null)
  assert.deepEqual(steps,['fresh snapshot','recompute verified plan','publish same idempotency key'])
})
