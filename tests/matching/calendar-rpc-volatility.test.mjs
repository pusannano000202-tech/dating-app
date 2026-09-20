import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {paymentFixture} from './calendar-payment-fixture.mjs'
import {source} from './event-calendar-fixture.mjs'
import {installActualCalendarRelationshipReads,postgrestCalendarRpc,volatilityMigration} from './calendar-rpc-transport-fixture.mjs'

const targets=['quantum_private.calendar_actor()','public.get_my_event_calendar(date,text)',
  'public.get_my_calendar_couple_party(uuid)','public.get_my_calendar_single_application(uuid)']
const calls=f=>[
  [f.ids.leader,'get_my_event_calendar',{p_month:f.month,p_audience:'couple'}],
  [f.ids.leader,'get_my_calendar_couple_party',{p_event_id:f.ids.event}],
  [f.ids.single,'get_my_calendar_single_application',{p_event_id:f.ids.window}],
]
async function fixture(){
  const f=await paymentFixture()
  await f.db.exec(await source('supabase/migrations/20260914193252_calendar_dated_couple_assignment.sql'))
  await f.db.exec(await source('supabase/migrations/20260914194527_calendar_operator_publication.sql'))
  await installActualCalendarRelationshipReads(f)
  return f
}

test('actual relationship row-lock path reproduces SQLSTATE 25006 for all three pre-fix stable RPCs',async()=>{
  const f=await fixture();try{
    for(const call of calls(f))await assert.rejects(postgrestCalendarRpc(f,...call),error=>
      error.code==='25006'&&/SELECT FOR UPDATE/.test(error.message))
  }finally{await f.db.close()}
})

test('forward correction makes existing POST RPC reads work without changing bodies, grants, search_path, or relationship data',async()=>{
  const f=await fixture();try{
    const identity=()=>f.db.query(`select oid::regprocedure::text as signature,prosrc,proacl,prosecdef,proconfig
      from pg_proc where oid=any($1::regprocedure[]) order by oid::regprocedure::text`,[targets])
    const before=(await identity()).rows
    const stateBefore=(await f.db.query('select * from quantum_private.relationship_states order by user_id')).rows
    await f.db.exec(await source(volatilityMigration))
    for(const signature of targets)assert.equal(await f.value('select provolatile as value from pg_proc where oid=$1::regprocedure',[signature]),'v')
    assert.deepEqual((await identity()).rows,before)
    const [calendar,couple,single]=await Promise.all(calls(f).map(call=>postgrestCalendarRpc(f,...call)))
    assert.equal(calendar.relationshipStatus,'in_relationship');assert.ok(calendar.events.length>0)
    assert.equal(couple.entryId,f.entry);assert.equal(couple.status,'payment_pending');assert.equal(single,null)
    assert.deepEqual((await f.db.query('select * from quantum_private.relationship_states order by user_id')).rows,stateBefore)
    // The owner-only single read also works once a real preparation exists.
    const entry=await postgrestCalendarRpc(f,f.ids.single,'prepare_calendar_single_application',{
      p_event_id:f.ids.window,p_idempotency_key:randomUUID(),p_participation_consent:true})
    assert.equal((await postgrestCalendarRpc(f,...calls(f)[2])).entryId,entry.entryId)
  }finally{await f.db.close()}
})

test('correction preserves anonymous, banned, deleting-account and private-application boundaries',async()=>{
  const f=await fixture();try{
    await f.db.exec(await source(volatilityMigration))
    await assert.rejects(postgrestCalendarRpc(f,null,'get_my_event_calendar',{p_month:f.month,p_audience:'couple'}),/not_authenticated/)
    assert.equal(await postgrestCalendarRpc(f,f.ids.outsider,'get_my_calendar_couple_party',{p_event_id:f.ids.event}),null)
    await f.db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[f.ids.leader])
    await assert.rejects(postgrestCalendarRpc(f,...calls(f)[0]),/relationship_forbidden/)
    await f.db.query("insert into quantum_private.account_deletion_requests(user_id,idempotency_key,status) values($1,$2,'requested')",[f.ids.single,randomUUID()])
    await assert.rejects(postgrestCalendarRpc(f,...calls(f)[2]),/relationship_forbidden/)
  }finally{await f.db.close()}
})

test('read-only transport still cannot take relationship locks, while genuinely read-only service/count helpers stay stable',async()=>{
  const f=await fixture();try{
    await f.db.exec(await source(volatilityMigration))
    await assert.rejects(postgrestCalendarRpc(f,...calls(f)[0],'GET'),error=>error.code==='25006')
    for(const signature of ['public.get_calendar_payment_for_service(uuid,text,uuid,text)',
      'public.get_my_current_tonight_team_count(uuid)','quantum_private.calendar_payment_summary(text,uuid,uuid)',
      'quantum_private.calendar_pair_ready(public.quantum_couple_parties)'])
      assert.equal(await f.value('select provolatile as value from pg_proc where oid=$1::regprocedure',[signature]),'s')
  }finally{await f.db.close()}
})
