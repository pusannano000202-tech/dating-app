import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {fixture,ids} from '../meetups/challenge-league-fixture.mjs'

const dir=new URL('../../supabase/migrations/',import.meta.url)
const source=name=>readFile(new URL(name,dir),'utf8')
const fn=(sql,start)=>{const tail=sql.slice(sql.indexOf(start));assert.ok(sql.includes(start),start);return tail.slice(0,tail.indexOf('$$;')+3)}
const migration='20260910142923_social_activity_notifications.sql'
async function setup(){
 const f=await fixture([new URL('20260910035348_department_league_position_journey.sql',dir)]),{db}=f
 try{
  await db.exec(`alter table quantum_private.community_member_profiles add column display_name text default '친구별명',add column friend_recognition_name text;
   create table public.friend_requests(id uuid primary key,sender_user_id uuid,receiver_user_id uuid,status text);
   create table public.friendships(user_id uuid,friend_user_id uuid,status text,created_from_request_id uuid);
   create function quantum_private.resolve_chat_poll_room(text,uuid,uuid,boolean)returns uuid language sql as $$select $2$$;
   create function quantum_private.get_or_create_daily_identity(uuid,timestamptz) returns jsonb language sql as $$select jsonb_build_object('display_name','별명')$$;
   create function quantum_private.meetup_gender_eligibility(uuid,text) returns text language sql as $$select 'eligible'::text$$;
   create function quantum_private.friend_pair_lock_key(x uuid,y uuid)returns bigint language sql immutable as $$select hashtextextended(least(x,y)::text||':'||greatest(x,y)::text,0)$$;
   create function public.get_friend_summaries()returns table(user_id uuid,display_name text,status text)language sql as $$select null::uuid,'친구','active' where false$$;`)
  const friends=await source('20260907085612_friend_scene.sql')
  await db.exec(fn(friends,'create or replace function quantum_private.is_active_accepted_friend_pair('))
  await db.exec(friends.slice(friends.indexOf('create unique index department_challenge_friend_invites_pending_idx'),friends.indexOf('comment on function public.get_my_friend_scene_summaries')))
  const notifications=await source('20260522000009_z39_notifications_system.sql')
  await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS notifications ('),notifications.indexOf('CREATE INDEX IF NOT EXISTS idx_notifications_user')))
  for(const file of ['20260910095144_department_league_manual_lobby.sql','20260910102511_department_league_position_invites.sql','20260910120701_department_league_recruitment.sql','20260910125457_department_league_application_intro.sql'])await db.exec(await source(file))
  const meetup=await source('20260808093918_community_activity_meetups_and_posts.sql')
  await db.exec(meetup.slice(meetup.indexOf('CREATE TABLE public.activity_meetups ('),meetup.indexOf('CREATE TABLE public.community_posts (')))
  const base=(await source('20260906181225_community_social_integrated.sql')).replace(/\r\n/g,'\n')
  const meetupColumnsStart=base.indexOf('alter table public.activity_meetups\n')
  const meetupColumnsEnd=base.indexOf('create table public.activity_meetup_events (')
  assert.ok(meetupColumnsStart>=0&&meetupColumnsEnd>meetupColumnsStart,'social_transition_fixture_meetup_schema_markers_missing')
  await db.exec(base.slice(meetupColumnsStart,meetupColumnsEnd))
  await db.exec(base.slice(base.indexOf('create table public.activity_meetup_events ('),base.indexOf('create table public.activity_meetup_messages (')))
  await db.exec("alter table public.activity_meetups add column gender_mode text not null default 'all'")
  await db.exec(fn(base,'create or replace function quantum_private.activity_meetup_scope_eligible('))
  for(const name of ['join_activity_meetup','leave_activity_meetup'])await db.exec(fn(base,`create or replace function public.${name}(`))
  let automatic=await source('20260907113358_automatic_activity_rooms.sql')
  automatic=automatic.replace(fn(automatic,'create function quantum_private.assert_activity_room_access('),'')
  await db.exec(automatic)
  for(const file of ['20260909150749_meetup_recurring_study_rooms.sql','20260909170157_mentoring_role_matching.sql','20260910034819_group_mentoring_consent.sql',migration])await db.exec(await source(file))
  const journey=(user,action,args)=>f.rpc(user,'department_league_journey',[action,JSON.stringify(args)])
  const create=()=>journey(ids[0],'create',{sport:'lol',title:'우리 과 테스트팀',slot:'mid',tier:'gold',idempotency_key:crypto.randomUUID()})
  const revision=async id=>(await db.query('select revision from public.department_challenges where id=$1',[id])).rows[0].revision
  const notes=async user=>(await db.query("select id,user_id,payload from public.notifications where kind='social_activity' and($1::uuid is null or user_id=$1)order by created_at,id",[user??null])).rows
  return {...f,journey,create,revision,notes}
 }catch(error){await db.close();throw error}
}

test('league application, approval and retry emit private recipient-specific durable notifications',async()=>{
 const f=await setup();try{
  const c=await f.create(),key=crypto.randomUUID(),args={sport:'lol',challenge_id:c.challenge_id,team_id:c.team_id,slot:'top',tier:'gold',expected_revision:await f.revision(c.challenge_id),idempotency_key:key}
  const request=await f.journey(ids[1],'join',args)
  const received=(await f.notes(ids[0])).filter(n=>n.payload.event==='application_received')
  assert.equal(received.length,1,'captain receives the actual pending application once')
  assert.equal(received[0].payload.context_label,'우리 과 테스트팀','the notification identifies the actual independent team name')
  await f.journey(ids[1],'join',args)
  assert.equal((await f.notes(ids[0])).filter(n=>n.payload.event==='application_received').length,1)
  await f.rpc(ids[0],'accept_department_challenge_roster_request',[c.challenge_id,request.roster_id,await f.revision(c.challenge_id),crypto.randomUUID()])
  assert.equal((await f.notes(ids[1])).filter(n=>n.payload.event==='application_accepted').length,1)
  const terminal=await f.rpc(ids[0],'resolve_my_social_notification',[received[0].id])
  assert.deepEqual(terminal,{href:null,status:'ended'})
  await assert.rejects(f.rpc(ids[2],'resolve_my_social_notification',[received[0].id]),/notification_not_found/)
  for(const note of await f.notes())assert.ok(!JSON.stringify(note.payload).includes(ids[1]),'no participant UUID in payload')
 }finally{await f.db.close()}
})

test('decline, reapplication, block and suspension revoke old notification actions',async()=>{
 const f=await setup();try{
  const c=await f.create(),join=()=>f.journey(ids[1],'join',{sport:'lol',challenge_id:c.challenge_id,team_id:c.team_id,slot:'top',tier:'gold',expected_revision:0,idempotency_key:crypto.randomUUID()})
  const a=await join(),note=(await f.notes(ids[0])).find(n=>n.payload.event==='application_received')
  const current=await f.rpc(ids[0],'resolve_my_social_notification',[note.id]);assert.equal(current.status,'current');assert.ok(current.href.endsWith('&panel=applications&slot=top'))
  await f.rpc(ids[0],'department_league_recruitment',['reject',JSON.stringify({sport:'lol',team_id:c.team_id,roster_id:a.roster_id,expected_revision:await f.revision(c.challenge_id),idempotency_key:crypto.randomUUID()})])
  assert.equal((await f.notes(ids[1])).filter(n=>n.payload.event==='application_declined').length,1)
  await f.journey(ids[1],'join',{sport:'lol',challenge_id:c.challenge_id,team_id:c.team_id,slot:'top',tier:'gold',expected_revision:await f.revision(c.challenge_id),idempotency_key:crypto.randomUUID()})
  assert.equal((await f.notes(ids[0])).filter(n=>n.payload.event==='application_received').length,2)
  assert.deepEqual(await f.rpc(ids[0],'resolve_my_social_notification',[note.id]),{href:null,status:'ended'})
  const latest=(await f.notes(ids[0])).filter(n=>n.payload.event==='application_received').find(n=>n.id!==note.id)
  await f.db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[0],ids[1]])
  assert.equal((await f.rpc(ids[0],'resolve_my_social_notification',[latest.id])).status,'ended')
  await f.db.exec('delete from quantum_private.test_blocks')
  await f.db.query("update auth.users set banned_until=now()+interval '1 day'where id=$1",[ids[1]])
  assert.equal((await f.rpc(ids[0],'resolve_my_social_notification',[latest.id])).status,'ended')
 }finally{await f.db.close()}
})

test('current captain ownership is required even when the previous captain still owns an old alert',async()=>{
 const f=await setup();try{
  const c=await f.create()
  const join=async(i,slot)=>f.journey(ids[i],'join',{sport:'lol',challenge_id:c.challenge_id,team_id:c.team_id,slot,tier:'gold',expected_revision:await f.revision(c.challenge_id),idempotency_key:crypto.randomUUID()})
  const next=await join(1,'top');await f.rpc(ids[0],'accept_department_challenge_roster_request',[c.challenge_id,next.roster_id,await f.revision(c.challenge_id),crypto.randomUUID()])
  await join(2,'jungle');const note=(await f.notes(ids[0])).filter(n=>n.payload.event==='application_received').find(n=>n.payload.status==='current'&&n.id)
  const last=(await f.notes(ids[0])).filter(n=>n.payload.event==='application_received').at(-1)
  const transfer=await f.rpc(ids[0],'department_league_lobby',['transfer_propose',JSON.stringify({team_id:c.team_id,recipient_roster_id:next.roster_id,expected_revision:await f.revision(c.challenge_id),idempotency_key:crypto.randomUUID()})])
  await f.rpc(ids[1],'department_league_lobby',['transfer_respond',JSON.stringify({transfer_id:transfer.transfer_id,accept:true,idempotency_key:crypto.randomUUID()})])
  assert.ok(note);assert.equal((await f.rpc(ids[0],'resolve_my_social_notification',[last.id])).status,'ended')
 }finally{await f.db.close()}
})

test('notification storage failure rolls back the actual participation transaction and private helpers are not callable',async()=>{
 const f=await setup();try{
  const c=await f.create(),before=await f.revision(c.challenge_id)
  await f.db.exec("alter table public.notifications add constraint test_reject_social check(kind<>'social_activity')")
  await assert.rejects(f.journey(ids[1],'join',{sport:'lol',challenge_id:c.challenge_id,team_id:c.team_id,slot:'top',tier:'gold',aspiration:'개인 포부',strengths:'개인 장점',expected_revision:before,idempotency_key:crypto.randomUUID()}),/test_reject_social/)
  assert.equal((await f.db.query('select count(*)::int n from public.department_challenge_roster where user_id=$1',[ids[1]])).rows[0].n,0)
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.challenge_application_intros')).rows[0].n,0)
  assert.equal(await f.revision(c.challenge_id),before)
  await f.db.exec('alter table public.notifications drop constraint test_reject_social')
  await f.journey(ids[1],'join',{sport:'lol',challenge_id:c.challenge_id,team_id:c.team_id,slot:'top',tier:'gold',aspiration:'개인 포부',strengths:'개인 장점',expected_revision:before,idempotency_key:crypto.randomUUID()})
  assert.ok(!(await f.notes()).some(n=>JSON.stringify(n.payload).includes('개인')))
  const privileges=(await f.db.query("select has_function_privilege('authenticated','quantum_private.emit_social_notification(text,uuid,uuid,text,uuid,text,uuid,uuid,text,text)','execute')as helper,has_table_privilege('authenticated','quantum_private.social_notification_events','select')as ledger,has_function_privilege('anon','public.get_my_notifications_page(integer,timestamptz,uuid)','execute')as anonymous")).rows[0]
  assert.deepEqual(privileges,{helper:false,ledger:false,anonymous:false})
 }finally{await f.db.close()}
})

test('mentoring friend party invitations have exact targets and explicit declines notify only their organizer',async()=>{
 const f=await setup();try{
  const key=crypto.randomUUID();await f.db.query("insert into public.friend_requests values($1,$2,$3,'accepted')",[key,ids[0],ids[1]])
  await f.db.query("insert into public.friendships values($1,$2,'active',$3)",[ids[0],ids[1],key])
  const act=(u,a,args)=>f.rpc(u,'mentoring_group_action',[a,JSON.stringify(args)])
  const party=await act(ids[0],'join',{role:'mentor',side_size:2,friend_ids:[ids[1]],client_id:crypto.randomUUID()})
  const invite=(await f.notes(ids[1]))[0];assert.equal(invite.payload.event,'invitation_received')
  assert.equal((await f.rpc(ids[1],'resolve_my_social_notification',[invite.id])).href,'/meetups/department/mentoring?party='+party.party_id)
  await act(ids[1],'party_decline',{party_id:party.party_id})
  assert.equal((await f.notes(ids[0])).filter(n=>n.payload.event==='invitation_declined').length,1)
  assert.equal((await f.rpc(ids[1],'resolve_my_social_notification',[invite.id])).status,'ended')
  assert.equal((await f.notes(ids[2])).length,0)
 }finally{await f.db.close()}
})

test('map invite consent emits one captain response, no phantom application, and refill has a new full event',async()=>{
 const f=await setup();try{
  const c=await f.create(),{db}=f
  const friend=async(a,b)=>{const key=crypto.randomUUID();await db.query("insert into public.friend_requests values($1,$2,$3,'accepted')",[key,a,b]);await db.query("insert into public.friendships values($1,$2,'active',$3)",[a<b?a:b,a<b?b:a,key])}
  for(let i=1;i<5;i++){
   await friend(ids[0],ids[i]);const invite=await f.rpc(ids[0],'department_league_invites',['invite',JSON.stringify({sport:'lol',challenge_id:c.challenge_id,team_id:c.team_id,friend_user_id:ids[i],slot:['','top','jungle','adc','support'][i],expected_revision:await f.revision(c.challenge_id),idempotency_key:crypto.randomUUID()})])
   if(i===4)assert.equal((await f.notes()).filter(n=>n.payload.event==='room_ready').length,0,'pending invitation is not an accepted player')
   const args={sport:'lol',invite_id:invite.id,tier:'gold',expected_revision:await f.revision(c.challenge_id),idempotency_key:crypto.randomUUID()}
   await f.rpc(ids[i],'department_league_invites',['accept',JSON.stringify(args)]);await f.rpc(ids[i],'department_league_invites',['accept',JSON.stringify(args)])
  }
  assert.equal((await f.notes(ids[0])).filter(n=>n.payload.event==='invitation_accepted').length,4)
  assert.equal((await f.notes()).filter(n=>n.payload.event.startsWith('application_')).length,0)
  assert.equal((await f.notes()).filter(n=>n.payload.event==='room_ready').length,5)
  await f.rpc(ids[4],'leave_my_department_challenge_roster',[c.challenge_id,c.team_id,await f.revision(c.challenge_id),crypto.randomUUID()])
  assert.equal((await f.notes(ids[0])).filter(n=>n.payload.event==='member_left').length,1)
  const req=await f.journey(ids[4],'join',{sport:'lol',challenge_id:c.challenge_id,team_id:c.team_id,slot:'support',tier:'gold',expected_revision:await f.revision(c.challenge_id),idempotency_key:crypto.randomUUID()})
  await f.rpc(ids[0],'accept_department_challenge_roster_request',[c.challenge_id,req.roster_id,await f.revision(c.challenge_id),crypto.randomUUID()])
  assert.equal((await f.notes()).filter(n=>n.payload.event==='room_ready').length,10,'a real refill is a new cycle')
 }finally{await f.db.close()}
})

test('scheduled meetup actual join/leave RPCs notify host and active participants without approval fiction',async()=>{
 const f=await setup();try{
  const id=crypto.randomUUID()
  await f.db.query("insert into public.activity_meetups(id,host_user_id,school,category,title,place_name,scheduled_at,ends_at,capacity)values($1,$2,'부산대','study','공부 약속','도서관',now()+interval '1 day',now()+interval '2 days',2)",[id,ids[0]])
  await f.db.query("insert into public.activity_meetup_members(meetup_id,user_id,role)values($1,$2,'host')",[id,ids[0]])
  await f.rpc(ids[1],'join_activity_meetup',[id]);await f.rpc(ids[1],'join_activity_meetup',[id])
  assert.equal((await f.notes(ids[0])).filter(n=>n.payload.event==='member_joined').length,2)
  assert.equal((await f.notes()).filter(n=>n.payload.event==='room_ready').length,2)
  const own=(await f.notes(ids[1])).find(n=>n.payload.event==='member_joined')
  assert.equal(own.payload.context_label,'공부 약속')
  assert.equal((await f.rpc(ids[1],'resolve_my_social_notification',[own.id])).href,'/meetups/'+id)
  await f.rpc(ids[1],'leave_activity_meetup',[id])
  assert.equal((await f.notes(ids[0])).filter(n=>n.payload.event==='member_left').length,1)
  assert.equal((await f.rpc(ids[1],'resolve_my_social_notification',[own.id])).status,'ended')
  assert.ok(!(await f.notes()).some(n=>n.payload.event.startsWith('application_')))
 }finally{await f.db.close()}
})

test('automatic room join/full/leave persists once and clicks cannot reopen a departed room',async()=>{
 const f=await setup();try{
  const lobby=await f.rpc(ids[0],'ensure_activity_room_pool',['evening-badminton','all']),room=lobby.rooms[0].id
  for(let i=0;i<4;i++)await f.rpc(ids[i],'join_activity_room',[room])
  const before=(await f.notes()).length;await f.rpc(ids[3],'join_activity_room',[room]);assert.equal((await f.notes()).length,before)
  assert.equal((await f.notes()).filter(n=>n.payload.event==='room_ready').length,4)
  const own=(await f.notes(ids[3]))[0];assert.equal((await f.rpc(ids[3],'resolve_my_social_notification',[own.id])).href,'/meetups/rooms/'+room)
  assert.equal(own.payload.context_label,'저녁 배드민턴')
  await f.rpc(ids[3],'leave_activity_room',[room]);assert.equal((await f.rpc(ids[3],'resolve_my_social_notification',[own.id])).status,'ended')
  assert.equal((await f.notes(ids[0])).filter(n=>n.payload.event==='member_left').length,1)
 }finally{await f.db.close()}
})

test('study actual create/join/leave RPCs notify only the same-scope members and preserve the exact room link',async()=>{
 const f=await setup();try{
  const act=(u,a,args={})=>f.rpc(u,'study_room_action',[a,JSON.stringify(args)])
  const room=await act(ids[0],'create',{course_id:'pnu:AN1600527',level:'beginner'})
  for(let i=1;i<5;i++)await act(ids[i],'join',{room_id:room.id})
  assert.equal((await f.notes()).filter(n=>n.payload.event==='room_ready').length,5)
  const note=(await f.notes(ids[1]))[0];assert.equal((await f.rpc(ids[1],'resolve_my_social_notification',[note.id])).href,'/meetups/study?room='+room.id)
  assert.equal(note.payload.context_label,'공학미적분학')
  await assert.rejects(act(ids[5],'join',{room_id:room.id}),/forbidden/)
  assert.equal((await f.notes(ids[5])).length,0)
  await act(ids[1],'leave',{room_id:room.id});assert.equal((await f.rpc(ids[1],'resolve_my_social_notification',[note.id])).status,'ended')
  assert.equal((await f.notes(ids[0])).filter(n=>n.payload.event==='member_left').length,1)
 }finally{await f.db.close()}
})

test('group mentoring offer, all-person consent and decline notify without exposing aliases',async()=>{
 const f=await setup();try{
  const act=(u,a='status',args={})=>f.rpc(u,'mentoring_group_action',[a,JSON.stringify(args)])
  for(let i=0;i<4;i++)await act(ids[i],'join',{role:i<2?'mentor':'mentee',side_size:2,friend_ids:[],client_id:crypto.randomUUID()})
  const offered=await act(ids[0]);assert.equal(offered.phase,'offered')
  assert.equal((await f.notes()).filter(n=>n.payload.event==='invitation_received').length,4)
  for(let i=0;i<4;i++)await act(ids[i],'accept',{session_id:offered.session_id})
  assert.equal((await f.notes()).filter(n=>n.payload.event==='room_ready').length,4)
  const own=(await f.notes(ids[0])).find(n=>n.payload.event==='room_ready')
  assert.equal(own.payload.context_label,'멘토링 2대2')
  assert.equal((await f.rpc(ids[0],'resolve_my_social_notification',[own.id])).href,'/meetups/department/mentoring?session='+offered.session_id)
  await act(ids[0],'end',{session_id:offered.session_id});assert.equal((await f.rpc(ids[0],'resolve_my_social_notification',[own.id])).status,'ended')
  assert.ok(!(await f.notes()).some(n=>JSON.stringify(n.payload).includes('별명')))
 }finally{await f.db.close()}
})

test('own notification pagination is stable over ties, isolates cursors and preserves all old kinds',async()=>{
 const f=await setup();try{
  for(let i=0;i<5;i++)await f.db.query("insert into public.notifications(user_id,kind,created_at)values($1,'match_created','2026-01-01T00:00:00Z')",[ids[0]])
  const one=await f.rpc(ids[0],'get_my_notifications_page',[2,null,null]);assert.equal(one.notifications.length,2);assert.equal(one.has_more,true)
  const two=await f.rpc(ids[0],'get_my_notifications_page',[2,one.next_cursor.created_at,one.next_cursor.id])
  const three=await f.rpc(ids[0],'get_my_notifications_page',[2,two.next_cursor.created_at,two.next_cursor.id])
  assert.equal(three.has_more,false);assert.equal(three.next_cursor,null)
  assert.equal(new Set([...one.notifications,...two.notifications,...three.notifications].map(n=>n.id)).size,5)
  await assert.rejects(f.rpc(ids[1],'get_my_notifications_page',[2,one.next_cursor.created_at,one.next_cursor.id]),/invalid_notification_cursor/)
  await assert.rejects(f.rpc(null,'get_my_notifications_page',[2,null,null]),/not_authenticated/)
  assert.deepEqual((await f.rpc(ids[1],'get_my_notifications_page',[100,null,null])).notifications,[])
 }finally{await f.db.close()}
})

test('a full stored roster containing a suspended participant is not announced as a ready room',async()=>{
 const f=await setup();try{
  const act=(u,a,args={})=>f.rpc(u,'study_room_action',[a,JSON.stringify(args)])
  const room=await act(ids[0],'create',{course_id:'pnu:AN1600527',level:'beginner'})
  await f.db.query("update auth.users set banned_until=now()+interval '1 day'where id=$1",[ids[0]])
  for(let i=1;i<5;i++)await act(ids[i],'join',{room_id:room.id})
  assert.equal((await f.notes()).filter(n=>n.payload.event==='room_ready').length,0,'full means currently eligible people, not stale rows')
 }finally{await f.db.close()}
})

test('context labels snapshot only public entities, remove hidden controls, cap Unicode and omit title contacts',async()=>{
 const f=await setup();try{
  const c=await f.create()
  await f.db.query('update public.department_challenge_teams set team_name=$1 where id=$2',['A팀',c.team_id])
  await f.journey(ids[1],'join',{sport:'lol',challenge_id:c.challenge_id,team_id:c.team_id,slot:'top',tier:'gold',aspiration:'개인 포부 비공개',strengths:'개인 장점 비공개',expected_revision:await f.revision(c.challenge_id),idempotency_key:crypto.randomUUID()})
  const original=(await f.notes(ids[0])).find(n=>n.payload.event==='application_received')
  assert.equal(original.payload.context_label,'A팀','independent team name, not its challenge title')
  assert.ok(!JSON.stringify(original.payload).includes('비공개'))
  await f.db.query('update public.department_challenge_teams set team_name=$1 where id=$2',['B팀',c.team_id])
  assert.equal((await f.notes(ids[0])).find(n=>n.id===original.id).payload.context_label,'A팀','a historical event does not silently change its old label')

  const act=(u,a,args={})=>f.rpc(u,'study_room_action',[a,JSON.stringify(args)])
  const room=await act(ids[0],'create',{course_id:'pnu:AN1600527',level:'beginner'})
  await f.db.query('update quantum_private.study_room_pools set course_name=$1 where id=(select pool_id from quantum_private.study_rooms where id=$2)',['\u200b\n'+ '공부😀'.repeat(35)+'\u202e',room.id])
  await act(ids[1],'join',{room_id:room.id})
  const long=(await f.notes(ids[1])).find(n=>n.payload.domain==='study_room')
  assert.equal(Array.from(long.payload.context_label).length,80)
  assert.ok(!/[\u0000-\u001f\u200b\u202e]/u.test(long.payload.context_label))

  for(const title of ['연락 010-1234-5678','연락 test@example.com','연락 https://example.com']){
   const id=crypto.randomUUID();await f.db.query("insert into public.activity_meetups(id,host_user_id,school,category,title,place_name,scheduled_at,ends_at,capacity)values($1,$2,'부산대','study',$3,'도서관',now()+interval '1 day',now()+interval '2 days',2)",[id,ids[0],title])
   await f.db.query("insert into public.activity_meetup_members(meetup_id,user_id,role)values($1,$2,'host')",[id,ids[0]])
   const note=(await f.notes(ids[0])).find(n=>n.payload.entity_id===id)
   assert.equal(note.payload.context_label,'모임')
   assert.ok(!JSON.stringify(note.payload).includes(title))
  }
 }finally{await f.db.close()}
})
