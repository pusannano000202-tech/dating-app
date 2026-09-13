import assert from 'node:assert/strict'
import test from 'node:test'
import {datingAdmissionFailure,parseRelationshipState} from '../../lib/relationship/contract.ts'
const initial={status:'single',changed_at:null,next_change_at:null,can_change:true,server_now:'2026-09-10T00:00:00Z'}
test('relationship response rejects leaked identity, forged lock and invalid server snapshots',()=>{
  assert.ok(parseRelationshipState(initial))
  assert.equal(parseRelationshipState({...initial,user_id:'private'}),null)
  assert.equal(parseRelationshipState({...initial,status:'in_relationship'}),null)
  const changed={...initial,status:'in_relationship',changed_at:'2026-09-10T00:00:00Z',next_change_at:'2026-10-10T00:00:00Z',can_change:false}
  assert.ok(parseRelationshipState(changed))
  assert.equal(parseRelationshipState({...changed,can_change:true}),null)
  assert.equal(parseRelationshipState({...changed,next_change_at:'2026-10-09T00:00:00Z'}),null)
})
test('new dating preflight fails closed on absent/malformed API but permits valid single',async()=>{
  assert.equal(await datingAdmissionFailure({rpc:async()=>({data:initial,error:null})}),null)
  assert.equal((await datingAdmissionFailure({rpc:async()=>({data:null,error:{message:'function unavailable'}})}))?.status,503)
  assert.equal((await datingAdmissionFailure({rpc:async()=>({data:{...initial,status:'anything'},error:null})}))?.status,503)
  assert.equal((await datingAdmissionFailure({rpc:async()=>{throw new Error('offline')}}))?.status,503)
  assert.equal((await datingAdmissionFailure({rpc:async()=>({data:{...initial,status:'in_relationship',changed_at:'2026-09-10T00:00:00Z',next_change_at:'2026-10-10T00:00:00Z',can_change:false},error:null})}))?.error,'dating_participation_unavailable')
})
