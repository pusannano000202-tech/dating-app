import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {lifecycleFixture} from '../meetups/admission-lifecycle-fixture.mjs'

const migration=new URL('../../supabase/migrations/20260913103032_meetup_chat_sender_identity.sql',import.meta.url)
async function fixture(){
 const f=await lifecycleFixture()
 try{
  await f.db.exec(await readFile(migration,'utf8'))
  await f.db.query("insert into public.activity_meetup_members(meetup_id,user_id,role,status)values($1,$2,'member','joined')",[f.roomId,f.users.mechanicalMember])
  for(const actor of [f.users.mechanicalCaptain,f.users.mechanicalMember])await f.db.query("insert into public.activity_meetup_messages(meetup_id,sender_user_id,sender_alias_snapshot,message,idempotency_key)values($1,$2,'똑같은 별명','안녕하세요',gen_random_uuid())",[f.roomId,actor])
  f.chat=async actor=>{await f.as(actor);return f.value('select public.get_my_activity_meetup_chat($1)as value',[f.roomId])}
  return f
 }catch(e){await f.db.close();throw e}
}
test('identical aliases still produce own/other bubbles without exposing account identifiers',async()=>{
 const f=await fixture();try{
  const captain=await f.chat(f.users.mechanicalCaptain),member=await f.chat(f.users.mechanicalMember)
  assert.deepEqual(captain.messages.map(m=>m.is_me),[true,false])
  assert.deepEqual(member.messages.map(m=>m.is_me),[false,true])
  for(const actor of Object.values(f.users))assert.ok(!JSON.stringify(captain).includes(actor))
  assert.equal(captain.phase,'send')
  const permissions=(await f.db.query("select has_function_privilege('anon','public.get_my_activity_meetup_chat(uuid)','EXECUTE')as anon,has_function_privilege('authenticated','public.get_my_activity_meetup_chat(uuid)','EXECUTE')as member,has_function_privilege('service_role','public.get_my_activity_meetup_chat(uuid)','EXECUTE')as service")).rows[0]
  assert.deepEqual(permissions,{anon:false,member:true,service:false})
  await f.db.exec('set role authenticated')
  try { assert.equal((await f.chat(f.users.mechanicalCaptain)).messages.length,2) } finally { await f.db.exec('reset role') }
  await f.db.query("update public.activity_meetups set status='completed' where id=$1",[f.roomId])
  assert.equal((await f.chat(f.users.mechanicalCaptain)).phase,'read_only')
 }finally{await f.db.close()}
})
test('membership, both-direction blocks and account restrictions still guard chat reads',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.chat(''),/not_authenticated/)
  await assert.rejects(f.chat(f.users.mechanicalReserve),/meetup_not_found/)
  await assert.rejects(f.chat(f.users.otherSchool),/meetup_not_found/)
  await f.db.query("insert into public.friendships values($1,$2,'blocked')",[f.users.mechanicalMember,f.users.mechanicalCaptain])
  assert.equal((await f.chat(f.users.mechanicalCaptain)).messages.length,1)
  assert.equal((await f.chat(f.users.mechanicalMember)).messages.length,1)
  await f.db.query("update public.activity_meetup_members set status='left' where meetup_id=$1 and user_id=$2",[f.roomId,f.users.mechanicalMember])
  await assert.rejects(f.chat(f.users.mechanicalMember),/meetup_not_found/)
  await f.db.query('insert into quantum_private.admission_test_account_gate(user_id,blocked)values($1,true)',[f.users.mechanicalCaptain])
  await assert.rejects(f.chat(f.users.mechanicalCaptain),/account/)
 }finally{await f.db.close()}
})
