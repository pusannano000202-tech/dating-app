import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {setup as chatFixture,ids} from '../chat/social-chat-fixture.mjs'

const source=name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')
async function setup(){
 const f=await chatFixture()
 try{
  await f.db.exec(await source('20260910142923_social_activity_notifications.sql'))
  // The pre-existing delivery gate is independently covered by push-ledger tests.
  await f.db.exec(`create function quantum_private.common_web_push_notification_current(uuid)returns boolean language sql as $$select true$$;`)
  await f.db.exec(await source('20260913074852_league_admission_awareness.sql'))
  const room=await f.create(),invite=await f.invite(room)
  await f.accept(room,invite)
  const revision=async()=> (await f.db.query('select revision from public.department_challenges where id=$1',[room.challenge_id])).rows[0].revision
  const join=async(user=ids[2],slot='jungle',key=crypto.randomUUID())=>f.rpc(user,'department_league_journey',['join',JSON.stringify({sport:'lol',challenge_id:room.challenge_id,team_id:room.team_id,slot,tier:'silver',expected_revision:await revision(),idempotency_key:key})])
  const notes=async(user)=>(await f.db.query("select id,payload from public.notifications where user_id=$1 and payload->>'event'='application_notice' order by created_at,id",[user])).rows
  const notices=user=>f.rpc(user,'get_my_league_recruitment_notices',[room.team_id])
  return {...f,room,revision,join,notes,notices}
 }catch(error){await f.db.close();throw error}
}

test('a real pending request informs the captain and existing team, without applicant details',async()=>{
 const f=await setup();try{
  await f.join()
  const captain=(await f.db.query("select payload from public.notifications where user_id=$1 and payload->>'event'='application_received'",[ids[0]])).rows
  assert.equal(captain.length,1)
  const member=await f.notes(ids[1]);assert.equal(member.length,1)
  assert.equal(member[0].payload.href,`/chat/league-team/${f.room.team_id}`)
  assert.equal((await f.notes(ids[2])).length,0)
  const view=await f.notices(ids[1]);assert.equal(view.notices.filter(n=>n.kind==='application_received').length,1)
  const notice=view.notices.find(n=>n.kind==='application_received')
  assert.equal(notice.state,'pending')
  for(const privateValue of [ids[2],'silver','jungle','aspiration','strengths'])assert.ok(!JSON.stringify(notice).includes(privateValue))
  await assert.rejects(f.notices(ids[2]),/team_chat_membership_required/)
  await assert.rejects(f.notices(ids[5]),/team_chat_membership_required/)
 }finally{await f.db.close()}
})

test('approval notification opens only the approved own-team chat; prior request notice expires',async()=>{
 const f=await setup();try{
  const request=await f.join(),memberNote=(await f.notes(ids[1]))[0]
  await f.rpc(ids[0],'accept_department_challenge_roster_request',[f.room.challenge_id,request.roster_id,await f.revision(),crypto.randomUUID()])
  const accepted=(await f.db.query("select id from public.notifications where user_id=$1 and payload->>'event'='application_accepted'",[ids[2]])).rows[0]
  assert.deepEqual(await f.rpc(ids[2],'resolve_my_social_notification',[accepted.id]),{status:'current',href:`/chat/league-team/${f.room.team_id}`})
  assert.deepEqual(await f.rpc(ids[1],'resolve_my_social_notification',[memberNote.id]),{status:'ended',href:null})
  const view=await f.notices(ids[1]);assert.equal(view.notices.find(n=>n.kind==='application_received').state,'reviewed')
  await assert.rejects(f.rpc(ids[5],'resolve_my_social_notification',[accepted.id]),/notification_not_found/)
  await f.db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[1],ids[2]])
  assert.deepEqual(await f.rpc(ids[2],'resolve_my_social_notification',[accepted.id]),{status:'ended',href:null})
 }finally{await f.db.close()}
})

test('same-state updates do not duplicate room notices; withdrawal removes the actionable invitation',async()=>{
 const f=await setup();try{
  const request=await f.join(),note=(await f.notes(ids[1]))[0]
  await f.db.query("update public.department_challenge_roster set status='requested' where id=$1",[request.roster_id])
  assert.equal((await f.notes(ids[1])).length,1)
  await f.rpc(ids[2],'leave_my_department_challenge_roster',[f.room.challenge_id,f.room.team_id,await f.revision(),crypto.randomUUID()])
  assert.deepEqual(await f.rpc(ids[1],'resolve_my_social_notification',[note.id]),{status:'ended',href:null})
  const gate=(await f.db.query('select quantum_private.common_web_push_notification_current($1) as current',[note.id])).rows[0].current
  assert.equal(gate,false)
  await f.db.query("update public.department_challenge_roster set status='left' where user_id=$1 and team_id=$2",[ids[1],f.room.team_id])
  await assert.rejects(f.notices(ids[1]),/team_chat_membership_required/)
 }finally{await f.db.close()}
})
