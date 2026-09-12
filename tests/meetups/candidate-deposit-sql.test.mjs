import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {candidateFixture,ids} from './candidate-board-fixture.mjs'

const migration=new URL('../../supabase/migrations/20260912152443_candidate_deposit_preparation_guard.sql',import.meta.url)
async function applyGuard(f){
 await f.db.exec(await readFile(migration,'utf8'))
}

test('unfunded first publication is rejected by the original SQL RPC with no candidate or request writes',async()=>{
 const f=await candidateFixture();try{
  await applyGuard(f)
  await assert.rejects(f.register(),/candidate_deposit_unavailable/)
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.meetup_candidates')).rows[0].n,0)
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.candidate_board_requests')).rows[0].n,0)
 }finally{await f.db.close()}
})

test('all scopes and client payment claims fail without creating requests, financial records or reservations',async()=>{
 const f=await candidateFixture();try{
  await applyGuard(f)
  const scopes=[f.scope,{scope_kind:'league',scope_key:'futsal'},{scope_kind:'study',scope_key:'pnu:AN1600527'},{scope_kind:'mentoring',scope_key:'career'},{scope_kind:'meetup',scope_key:'campus-cafe-chat'}]
  for(const scope of scopes)await assert.rejects(f.register(ids[1],scope),/candidate_deposit_unavailable/)
  const retry=crypto.randomUUID()
  for(let i=0;i<2;i++)await assert.rejects(f.register(ids[1],f.scope,{idempotency_key:retry}),/candidate_deposit_unavailable/)
  for(const claim of [{paid:true},{funding:'held'},{amount:10000},{deposit_id:crypto.randomUUID()},{owner_id:ids[2]}])await assert.rejects(f.register(ids[1],f.scope,claim),/invalid_candidate_action/)
  for(const table of ['meetup_candidates','candidate_board_requests','activity_meetup_admission_intents','activity_meetup_admission_deposits'])assert.equal((await f.db.query(`select count(*)::int n from quantum_private.${table}`)).rows[0].n,0,table)
 }finally{await f.db.close()}
})

test('historical active registration stays editable and idempotent but cancellation ends grandfathered publication',async()=>{
 const f=await candidateFixture();try{
  const old=(await f.register()).mine
  await applyGuard(f)
  const input={expected_revision:old.revision,intro:'수정한 자기소개',idempotency_key:crypto.randomUUID()}
  const changed=(await f.register(ids[1],f.scope,input)).mine
  assert.equal(changed.intro,input.intro);assert.equal(changed.revision,1)
  assert.equal((await f.register(ids[1],f.scope,input)).mine.revision,1)
  await f.board(ids[1],'cancel',{...f.scope,expected_revision:1,idempotency_key:crypto.randomUUID()})
  assert.equal((await f.overview()).mine.status,'cancelled')
  await assert.rejects(f.register(ids[1],f.scope,{expected_revision:2}),/candidate_deposit_unavailable/)
  assert.equal((await f.overview()).mine.status,'cancelled')
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.activity_meetup_admission_deposits')).rows[0].n,0)
 }finally{await f.db.close()}
})

test('existing invitation release, validated admission, and membership exit remain available after the guard',async()=>{
 const f=await candidateFixture();try{
  const scope={scope_kind:'study',scope_key:'pnu:AN1600527'},room=await f.study(),c=(await f.register(ids[1],scope)).mine
  await applyGuard(f)
  const sent=await f.board(ids[0],'invite',{...scope,candidate_id:c.id,candidate_revision:0,room_id:room.id,room_revision:0,slot:null,idempotency_key:crypto.randomUUID()})
  const args={...scope,invite_id:sent.outgoing[0].id,expected_revision:0,idempotency_key:crypto.randomUUID()}
  const joining=await f.board(ids[1],'accept',args)
  assert.equal(joining.mine.status,'joining')
  const released=await f.board(ids[1],'release',{...args,expected_revision:joining.incoming[0].revision,idempotency_key:crypto.randomUUID()})
  assert.equal(released.mine.status,'waiting')
  await f.board(ids[1],'accept',{...args,expected_revision:released.incoming[0].revision,idempotency_key:crypto.randomUUID()})
  await f.enable('study',room.id)
  const paid=await f.confirm((await f.prepare(ids[1],'study',room.id,{})).intentId)
  await f.decide(ids[0],'study',room.id,paid.id)
  assert.equal((await f.overview(ids[1],scope)).mine.status,'joined')
  // Local membership fixture, no real accounts or provider operations.
  await f.db.query('update quantum_private.study_room_members set left_at=clock_timestamp()where room_id=$1 and user_id=$2',[room.id,ids[1]])
  assert.equal((await f.db.query('select left_at is not null as departed from quantum_private.study_room_members where room_id=$1 and user_id=$2',[room.id,ids[1]])).rows[0].departed,true)
  await assert.rejects(f.register(ids[1],scope,{expected_revision:(await f.overview(ids[1],scope)).mine.revision}),/candidate_deposit_unavailable/)
 }finally{await f.db.close()}
})

test('SQL availability inherits board current-account and scope gates with no invented policy or money',async()=>{
 const f=await candidateFixture();try{
  await applyGuard(f)
  const get=(user,kind='league',key='lol')=>f.rpc(user,'get_meetup_candidate_deposit_context',[kind,key])
  assert.deepEqual(await get(ids[1]),{owner_id:ids[1],scope:{kind:'league',key:'lol'},quote:null,policy:null,checkout_enabled:false,preparation_only:true,funding:'unavailable'})
  await assert.rejects(get(null),/not_authenticated/)
  await assert.rejects(get(ids[1],'study','missing-course'),/invalid_candidate_scope/)
  await assert.rejects(get(ids[23]),/department_identity_required/)
  await f.db.query('insert into quantum_private.test_deletions values($1)',[ids[1]])
  await assert.rejects(get(ids[1]),/candidate_account_unavailable/)
  await f.db.exec('set role anon')
  await assert.rejects(f.db.query("select public.get_meetup_candidate_deposit_context('league','lol')"),/permission denied/)
  await f.db.exec('reset role;set role authenticated')
  await assert.rejects(f.db.query("select quantum_private.candidate_deposit_context('league','lol')"),/permission denied/)
  await assert.rejects(f.db.query("update quantum_private.meetup_candidates set status='waiting'"),/permission denied/)
  await f.db.exec('reset role')
 }finally{await f.db.close()}
})

test('table publication guard cannot reuse a historical active listing for another scope or identity',async()=>{
 const f=await candidateFixture();try{
  const c=(await f.register()).mine
  await applyGuard(f)
  for(const [column,value]of [['scope_key','futsal'],['owner_id',ids[2]],['school_key','other'],['department_key','other']])await assert.rejects(f.db.query(`update quantum_private.meetup_candidates set ${column}=$1 where id=$2`,[value,c.id]),/candidate_deposit_unavailable/)
  assert.equal((await f.overview()).mine.id,c.id)
 }finally{await f.db.close()}
})
