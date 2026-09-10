import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {registerHooks} from 'node:module'
import {fixture,ids} from './challenge-league-fixture.mjs'
registerHooks({resolve(specifier,context,next){return next(specifier==='./challenge-journey'?'./challenge-journey.ts':specifier,context)}})
const {parseLeagueInviteState}=await import('../../lib/meetups/league-invites.ts')

const migration=new URL('../../supabase/migrations/20260910102511_department_league_position_invites.sql',import.meta.url)
const journeyMigration=new URL('../../supabase/migrations/20260910035348_department_league_position_journey.sql',import.meta.url)
const lobbyMigration=new URL('../../supabase/migrations/20260910095144_department_league_manual_lobby.sql',import.meta.url)
async function setup(){
 const f=await fixture([journeyMigration]),{db}=f
 try{
 await db.exec(`alter table quantum_private.community_member_profiles add column display_name text default '친구별명',add column friend_recognition_name text;
 create table public.friend_requests(id uuid primary key,sender_user_id uuid,receiver_user_id uuid,status text);
 create table public.friendships(user_id uuid,friend_user_id uuid,status text,created_from_request_id uuid);
 create function quantum_private.resolve_chat_poll_room(text,uuid,uuid,boolean)returns uuid language sql as $$select $2$$;`)
 const friends=await readFile(new URL('../../supabase/migrations/20260907085612_friend_scene.sql',import.meta.url),'utf8')
 const pair=friends.slice(friends.indexOf('create or replace function quantum_private.is_active_accepted_friend_pair('))
 await db.exec(pair.slice(0,pair.indexOf('$$;')+3))
 await db.exec(friends.slice(friends.indexOf('create unique index department_challenge_friend_invites_pending_idx'),friends.indexOf('comment on function public.get_my_friend_scene_summaries')))
 const notifications=await readFile(new URL('../../supabase/migrations/20260522000009_z39_notifications_system.sql',import.meta.url),'utf8')
 await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS notifications ('),notifications.indexOf('CREATE INDEX IF NOT EXISTS idx_notifications_user')))
 await db.exec(await readFile(lobbyMigration,'utf8'))
 await db.exec(await readFile(migration,'utf8'))
 const exists=(await db.query("select to_regprocedure('public.department_league_invites(text,jsonb)') is not null present")).rows[0].present
 assert.equal(exists,true,'position invitation RPC must support the new map invitation workflow')
 async function friend(a,b){const id=crypto.randomUUID();await db.query("insert into public.friend_requests values($1,$2,$3,'accepted')",[id,a,b]);await db.query("insert into public.friendships values($1,$2,'active',$3)",[a<b?a:b,a<b?b:a,id])}
 const journey=(user,action,args)=>f.rpc(user,'department_league_journey',[action,JSON.stringify(args)])
 const call=(user,action,args)=>f.rpc(user,'department_league_invites',[action,JSON.stringify(args)])
 const revision=async challenge=>(await db.query('select revision from public.department_challenges where id=$1',[challenge])).rows[0].revision
 const overview=async(user,sport='lol',challenge_id=null)=>{const state=await call(user,'overview',{sport,challenge_id});assert.ok(parseLeagueInviteState(state),'SQL projection must satisfy the frontend contract');return state}
 const create=(user=ids[0],sport='lol')=>journey(user,'create',{sport,title:'우리 학과 자리 초대',slot:sport==='lol'?'mid':'gk',tier:sport==='lol'?'gold':'intermediate',idempotency_key:crypto.randomUUID()})
 const send=async(c,recipient=ids[1],slot='top',sport='lol',actor=ids[0],key=crypto.randomUUID())=>call(actor,'invite',{sport,challenge_id:c.challenge_id,team_id:c.team_id,friend_user_id:recipient,slot,expected_revision:await revision(c.challenge_id),idempotency_key:key})
 const respond=async(actor,action,invite,tier='gold',sport='lol',key=crypto.randomUUID())=>call(actor,action,{sport,invite_id:invite.id,...(action==='accept'?{tier}:{}),expected_revision:await revision(invite.challenge_id),idempotency_key:key})
 return {...f,friend,journey,call,revision,overview,create,send,respond}
 }catch(error){await db.close();throw error}
}

test('a map slot invitation notifies once and recipient self-declaration atomically admits that exact slot',async()=>{
 const f=await setup();try{
  const {db,friend,create,send,overview,call,revision}=f
  await friend(ids[0],ids[1]);const c=await create(),key=crypto.randomUUID()
  const args={sport:'lol',challenge_id:c.challenge_id,team_id:c.team_id,friend_user_id:ids[1],slot:'top',expected_revision:await revision(c.challenge_id),idempotency_key:key}
  const sent=await call(ids[0],'invite',args);assert.equal(sent.status,'pending')
  assert.equal((await call(ids[0],'invite',args)).replayed,true)
  await assert.rejects(call(ids[0],'invite',{...args,slot:'jungle'}),/idempotency_key_reused/)
  const inbox=await overview(ids[1]);assert.equal(inbox.incoming[0].slot,'top');assert.equal(inbox.sent.length,0)
  const scoped=await overview(ids[1],'lol',c.challenge_id);assert.equal(scoped.preview.players.length,1)
  assert.equal(scoped.preview.players[0].slot,'mid');assert.equal(scoped.candidates.length,0)
  const count=async()=>(await db.query("select count(*)::int n from public.department_challenge_roster where challenge_id=$1 and status='accepted'",[c.challenge_id])).rows[0].n
  assert.equal(await count(),1)
  let notifications=(await db.query('select kind,payload,read_at from public.notifications')).rows
  assert.equal(notifications.length,1);assert.equal(notifications[0].kind,'department_league_invite')
  assert.equal(notifications[0].payload.href,`/meetups/league?sport=lol&invite=${sent.id}&challenge=${c.challenge_id}`)
  assert.ok(!JSON.stringify(notifications[0].payload).includes(ids[0]))
  const acceptArgs={sport:'lol',invite_id:sent.id,tier:'diamond',expected_revision:await revision(c.challenge_id),idempotency_key:crypto.randomUUID()}
  assert.equal((await call(ids[1],'accept',acceptArgs)).status,'accepted')
  assert.equal((await call(ids[1],'accept',acceptArgs)).replayed,true)
  assert.equal(await count(),2)
  const player=(await db.query('select r.status,p.position,p.slot_key,p.tier from public.department_challenge_roster r join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.user_id=$1 and r.challenge_id=$2',[ids[1],c.challenge_id])).rows[0]
  assert.deepEqual(player,{status:'accepted',position:'top',slot_key:'top',tier:'diamond'})
  notifications=(await db.query('select payload,read_at from public.notifications')).rows
  assert.equal(notifications.length,1);assert.equal(notifications[0].payload.status,'accepted');assert.ok(notifications[0].read_at)
  await db.query("insert into public.notifications(user_id,kind)values($1,'match_created')",[ids[0]])
 }finally{await f.db.close()}
})

test('captain, recipient, same department, friendship, block and suspension boundaries are enforced',async()=>{
 const f=await setup();try{
  const{db,friend,create,send,respond,overview,rpc}=f
  await friend(ids[0],ids[1]);await friend(ids[0],ids[2]);await friend(ids[0],ids[5]);const c=await create()
  await assert.rejects(send(c,ids[1],'top','lol',ids[2]),/captain_required/)
  await assert.rejects(send(c,ids[3]),/friendship_required/)
  await assert.rejects(send(c,ids[5]),/department_restricted/)
  await db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[0],ids[2]])
  await assert.rejects(send(c,ids[2]),/blocked_forbidden/)
  assert.ok(!(await overview(ids[0],'lol',c.challenge_id)).candidates.some(x=>x.user_id===ids[2]))
  const sent=await send(c)
  await assert.rejects(respond(ids[2],'accept',sent),/invite_not_found/)
  await assert.rejects(respond(ids[1],'cancel',sent),/captain_required/)
  await assert.rejects(overview(ids[4],'lol',c.challenge_id),/membership_required/)
  await db.query('update quantum_private.community_member_profiles set department=$2 where user_id=$1',[ids[1],'전자공학과'])
  assert.equal((await overview(ids[1],'lol',c.challenge_id)).preview,null)
  await assert.rejects(respond(ids[1],'accept',sent),/department_restricted/)
  await db.query('update quantum_private.community_member_profiles set department=$2 where user_id=$1',[ids[1],'기계공학과'])
  await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[ids[1]])
  await assert.rejects(respond(ids[1],'accept',sent),/forbidden/)
  await db.query('update auth.users set banned_until=null where id=$1',[ids[1]])
  const target=(await db.query("insert into quantum_private.challenge_match_players(challenge_id,team_id,user_id,alias,position,tier)values($1,$2,$3,'친구','top','gold')returning id",[c.challenge_id,c.team_id,ids[1]])).rows[0].id
  const report=(await db.query("insert into quantum_private.challenge_fair_reports(challenge_id,reporter_id,target_player_id,reason)values($1,$2,$3,'검증용 기존 경기 신고 사유입니다.')returning id",[c.challenge_id,ids[0],target])).rows[0].id
  await db.query("insert into quantum_private.challenge_restrictions(user_id,report_id,duration_days,ends_at,reason,created_by)values($1,$2,14,now()+interval '14 days','검증용 참가 제한 사유입니다.',$3)",[ids[1],report,ids[0]])
  await assert.rejects(respond(ids[1],'accept',sent),/challenge_restricted_forbidden/)
  await assert.rejects(rpc(null,'department_league_invites',['overview',JSON.stringify({sport:'lol',challenge_id:null})]),/not_authenticated/)
  const permissions=(await db.query("select has_function_privilege('service_role','public.department_league_invites(text,jsonb)','execute') service,has_function_privilege('anon','public.department_league_invites(text,jsonb)','execute') anon,has_table_privilege('authenticated','public.department_challenge_friend_invites','select') direct_read")).rows[0]
  assert.deepEqual(permissions,{service:false,anon:false,direct_read:false})
 }finally{await f.db.close()}
})

test('slot reservations, valid tiers, current revision and exact sport cannot be bypassed',async()=>{
 const f=await setup();try{
  const {friend,create,send,respond,call,revision}=f
  await friend(ids[0],ids[1]);await friend(ids[0],ids[2]);const c=await create()
  await assert.rejects(send(c,ids[1],'gk'),/invalid_slot/)
  await assert.rejects(send(c,ids[1],'mid'),/slot_occupied_conflict/)
  const sent=await send(c)
  await assert.rejects(send(c,ids[2],'top'),/slot_invite_pending_conflict/)
  await assert.rejects(send(c,ids[1],'jungle'),/already_invited/)
  await assert.rejects(respond(ids[1],'accept',sent,'advanced'),/invalid_tier/)
  await assert.rejects(respond(ids[1],'accept',sent,'advanced','futsal'),/invalid_sport/)
  const oldRevision=await revision(c.challenge_id);await send(c,ids[2],'jungle')
  await assert.rejects(call(ids[1],'accept',{sport:'lol',invite_id:sent.id,tier:'silver',expected_revision:oldRevision,idempotency_key:crypto.randomUUID()}),/stale_revision/)
  assert.equal((await respond(ids[1],'accept',sent,'silver')).status,'accepted')
 }finally{await f.db.close()}
})

test('decline, cancellation and expiry make an invitation unusable and resolve its notification',async()=>{
 for(const terminal of ['decline','cancel','expiry']){
  const f=await setup();try{
   const{db,friend,create,send,respond,overview}=f
   await friend(ids[0],ids[1]);const c=await create(),sent=await send(c)
   if(terminal==='expiry'){
    await db.query("update public.department_challenge_friend_invites set created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=$1",[sent.id])
    await overview(ids[1])
   }else await respond(terminal==='cancel'?ids[0]:ids[1],terminal,sent)
   assert.equal((await overview(ids[1],'lol',c.challenge_id)).preview,null,'terminal invitations cannot reveal the current team roster')
   await assert.rejects(respond(ids[1],'accept',sent),/not_pending|expired/)
   const notification=(await db.query('select payload,read_at from public.notifications')).rows[0]
   assert.equal(notification.payload.status,{decline:'declined',cancel:'cancelled',expiry:'expired'}[terminal]);assert.ok(notification.read_at)
   assert.equal((await db.query("select count(*)::int n from public.department_challenge_roster where user_id=$1 and status='accepted'",[ids[1]])).rows[0].n,0)
  }finally{await f.db.close()}
 }
})

test('a slot filled through normal joining cancels the old invitation instead of double-booking',async()=>{
 const f=await setup();try{
  const{db,friend,create,send,journey,rpc,revision,respond}=f
  await friend(ids[0],ids[1]);const c=await create(),sent=await send(c)
  const joined=await journey(ids[2],'join',{sport:'lol',challenge_id:c.challenge_id,team_id:c.team_id,slot:'top',tier:'gold',expected_revision:await revision(c.challenge_id),idempotency_key:crypto.randomUUID()})
  await rpc(ids[0],'accept_department_challenge_roster_request',[c.challenge_id,joined.roster_id,joined.revision,crypto.randomUUID()])
  assert.equal((await db.query('select status from public.department_challenge_friend_invites where id=$1',[sent.id])).rows[0].status,'cancelled')
  await assert.rejects(respond(ids[1],'accept',sent),/not_pending/)
  assert.equal((await db.query("select count(*)::int n from public.department_challenge_roster r join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.team_id=$1 and r.status='accepted' and p.slot_key='top'",[c.team_id])).rows[0].n,1)
 }finally{await f.db.close()}
})

test('captain transfer and sport format changes cancel pending invites and notify the terminal state',async()=>{
 const f=await setup();try{
  const{db,friend,create,send,respond}=f
  await friend(ids[0],ids[1]);await friend(ids[0],ids[2]);const c=await create()
  await respond(ids[2],'accept',await send(c,ids[2],'jungle'))
  const sent=await send(c)
  await db.query('update public.department_challenge_teams set captain_user_id=$1 where id=$2',[ids[2],c.team_id])
  assert.equal((await db.query('select status from public.department_challenge_friend_invites where id=$1',[sent.id])).rows[0].status,'cancelled')
  await assert.rejects(respond(ids[1],'accept',sent),/not_pending/)
  const pitch=await create(ids[0],'futsal'),pitchInvite=await send(pitch,ids[1],'ld','futsal')
  await db.query("update quantum_private.challenge_journey_formats set sport='football' where challenge_id=$1",[pitch.challenge_id])
  assert.equal((await db.query('select status from public.department_challenge_friend_invites where id=$1',[pitchInvite.id])).rows[0].status,'cancelled')
  assert.ok((await db.query('select payload,read_at from public.notifications')).rows.every(n=>n.payload.status!=='pending'&&n.read_at))
 }finally{await f.db.close()}
})

test('futsal and full football retain exact distinct slots and require self-reported ability',async()=>{
 for(const [sport,slot] of [['futsal','rd'],['football','rcb']]){
  const f=await setup();try{
   const{db,friend,create,send,respond,overview}=f
   await friend(ids[0],ids[1]);const c=await create(ids[0],sport),sent=await send(c,ids[1],slot,sport)
   assert.equal((await overview(ids[1],sport)).incoming[0].slot,slot)
   await assert.rejects(respond(ids[1],'accept',sent,'gold',sport),/invalid_tier/)
   await respond(ids[1],'accept',sent,'beginner',sport)
   const profile=(await db.query('select slot_key,position,tier from quantum_private.challenge_skill_profiles p join public.department_challenge_roster r on r.id=p.roster_id where r.user_id=$1 and r.challenge_id=$2',[ids[1],c.challenge_id])).rows[0]
   assert.deepEqual(profile,{slot_key:slot,position:'defender',tier:'beginner'})
  }finally{await f.db.close()}
 }
})

test('moving an accepted player onto an invited slot revokes that invitation and a full roster cannot be overfilled',async()=>{
 const f=await setup();try{
  const{db,friend,create,send,respond,journey,revision}=f
  for(const user of ids.slice(1,5))await friend(ids[0],user)
  const c=await create(),sent=await send(c)
  await journey(ids[0],'profile',{sport:'lol',challenge_id:c.challenge_id,team_id:c.team_id,slot:'top',tier:'gold',expected_revision:await revision(c.challenge_id),idempotency_key:crypto.randomUUID()})
  await assert.rejects(respond(ids[1],'accept',sent),/not_pending/)
  for(const[index,slot]of ['mid','jungle','adc','support'].entries())await respond(ids[index+1],'accept',await send(c,ids[index+1],slot))
  await db.query('update quantum_private.community_member_profiles set department=$2 where user_id=$1',[ids[15],'기계공학과'])
  await friend(ids[0],ids[15])
  await assert.rejects(send(c,ids[15],'mid'),/team_full/)
  assert.equal((await db.query("select count(*)::int n from public.department_challenge_roster where team_id=$1 and status='accepted'",[c.team_id])).rows[0].n,5)
 }finally{await f.db.close()}
})

test('notification insert failure rolls back the invitation and challenge revision in the same transaction',async()=>{
 const f=await setup();try{
  const{db,friend,create,send,revision}=f
  await friend(ids[0],ids[1]);const c=await create(),before=await revision(c.challenge_id)
  await db.exec("alter table public.notifications add constraint test_delivery_failure check(kind<>'department_league_invite')")
  await assert.rejects(send(c),/test_delivery_failure/)
  assert.equal((await db.query('select count(*)::int n from public.department_challenge_friend_invites')).rows[0].n,0)
  assert.equal(await revision(c.challenge_id),before)
  assert.equal((await db.query('select count(*)::int n from quantum_private.challenge_position_invite_requests')).rows[0].n,0)
 }finally{await f.db.close()}
})

test('legacy acceptance cannot bypass the exact-slot declaration on an inferred LoL team',async()=>{
 const f=await setup();try{
  const{db,rpc,act,friend,send,respond,revision}=f
  await friend(ids[0],ids[1])
  const created=await rpc(ids[0],'create_department_challenge',['gaming','Legacy inferred challenge','',5,crypto.randomUUID()])
  const teamId=created.teams[0].id
  await act(ids[0],'profile',{team_id:teamId,position:'mid',tier:'gold'})
  assert.equal((await db.query('select count(*)::int n from quantum_private.challenge_journey_formats where challenge_id=$1',[created.id])).rows[0].n,0)
  const sent=await send({challenge_id:created.id,team_id:teamId},ids[1],'top')
  await assert.rejects(rpc(ids[1],'accept_my_department_challenge_invite',[sent.id,await revision(created.id),crypto.randomUUID()]),/position_invite_profile_required/)
  assert.equal((await db.query('select status from public.department_challenge_friend_invites where id=$1',[sent.id])).rows[0].status,'pending')
  assert.equal((await db.query("select count(*)::int n from public.department_challenge_roster where challenge_id=$1 and user_id=$2 and status='accepted'",[created.id,ids[1]])).rows[0].n,0)
  await respond(ids[1],'accept',sent,'platinum')
  const player=(await db.query('select r.status,p.slot_key,p.tier from public.department_challenge_roster r join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.challenge_id=$1 and r.user_id=$2',[created.id,ids[1]])).rows[0]
  assert.deepEqual(player,{status:'accepted',slot_key:'top',tier:'platinum'})
 }finally{await f.db.close()}
})

test('the legacy acceptance wrapper preserves ordinary invitations without a sport or slot',async()=>{
 const f=await setup();try{
  const{db,rpc,friend,revision}=f
  await friend(ids[0],ids[1])
  const created=await rpc(ids[0],'create_department_challenge',['gaming','Legacy ordinary invite','',5,crypto.randomUUID()])
  const sent=await rpc(ids[0],'invite_friend_to_department_challenge',[created.id,created.teams[0].id,ids[1],await revision(created.id),crypto.randomUUID()])
  const shape=(await db.query('select sport,slot_key from public.department_challenge_friend_invites where id=$1',[sent.invite_id])).rows[0]
  assert.deepEqual(shape,{sport:null,slot_key:null})
  const key=crypto.randomUUID(),args=[sent.invite_id,await revision(created.id),key]
  assert.equal((await rpc(ids[1],'accept_my_department_challenge_invite',args)).status,'accepted')
  assert.equal((await rpc(ids[1],'accept_my_department_challenge_invite',args)).replayed,true)
  const permissions=(await db.query("select has_function_privilege('authenticated','quantum_private.accept_department_challenge_legacy_invite(uuid,integer,uuid)','execute') member,has_function_privilege('service_role','quantum_private.accept_department_challenge_legacy_invite(uuid,integer,uuid)','execute') service")).rows[0]
  assert.deepEqual(permissions,{member:false,service:false})
 }finally{await f.db.close()}
})
