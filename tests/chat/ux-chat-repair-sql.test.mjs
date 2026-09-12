import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {setup,ids} from './social-chat-fixture.mjs'
const source=name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')
async function installFunction(db,file,name){const sql=await source(file),at=sql.indexOf('create or replace function '+name+'('),tail=sql.slice(at);assert.ok(at>=0);await db.exec(tail.slice(0,tail.indexOf('$$;')+3))}
async function repaired(){
 const f=await setup()
 await f.db.exec('alter table public.friendships add primary key(user_id,friend_user_id)')
 const poll=await source('20260908164747_activity_room_chat_polls.sql')
 await f.db.exec('begin;\n'+poll.slice(poll.indexOf('create table quantum_private.activity_room_poll_agreements (')))
 await f.db.exec(await source('20260911141714_social_chat_read_positions.sql'))
 await f.db.exec(await source('20260911141729_league_team_private_polls.sql'))
 return {...f,mark:(user,kind,id,message_ids)=>f.rpc(user,'mark_social_chat_read',[kind,id,message_ids])}
}
test('directory previews and per-user receipts preserve unseen history, reject outsider and cross-room messages',async()=>{
 const f=await repaired();try{
  const c=await f.create(),invite=await f.invite(c);await f.accept(c,invite)
  const sent=await f.chat(ids[0],'send',{team_id:c.team_id,body:'금요일 저녁 어떠세요?',idempotency_key:crypto.randomUUID()})
  let r=(await f.rooms(ids[1])).rooms[0]
  assert.equal(r.latest_message?.body,'금요일 저녁 어떠세요?');assert.equal(r.unread_count,1)
  assert.equal((await f.rooms(ids[0])).rooms[0].unread_count,0,'own sends are not unread')
  await f.db.query("insert into quantum_private.league_team_chat_messages(team_id,sender_id,idempotency_key,alias,body,created_at)select $1,$2,gen_random_uuid(),'별친구','이전 대화 '||n,now()-interval '1 hour'+n*interval '1 second'from generate_series(1,55)n",[c.team_id,ids[0]])
  await f.mark(ids[1],'league_team',c.team_id,[sent.message.id])
  await f.mark(ids[1],'league_team',c.team_id,[sent.message.id])
  assert.equal((await f.rooms(ids[1])).rooms[0].unread_count,55,'marking visible latest never erases an unseen page')
  await assert.rejects(f.mark(ids[5],'league_team',c.team_id,[sent.message.id]),/membership_required/)
  await assert.rejects(f.mark(ids[1],'league_team',c.team_id,[crypto.randomUUID()]),/invalid_message/)
  await assert.rejects(f.mark(ids[1],'match',c.team_id,[sent.message.id]),/invalid_request/)
  const other=await f.create(ids[5]);await assert.rejects(f.mark(ids[1],'league_team',other.team_id,[sent.message.id]),/membership_required/)
  await f.db.query("update public.department_challenge_roster set status='left'where team_id=$1 and user_id=$2",[c.team_id,ids[1]])
  await assert.rejects(f.mark(ids[1],'league_team',c.team_id,[sent.message.id]),/membership_required/)
  assert.equal((await f.rooms(ids[1])).rooms.length,0)
 }finally{await f.db.close()}
})
test('our-team polls use exact accepted team roster including schedule and place proposals; outsiders and opponent never vote',async()=>{
 const f=await repaired();try{
  const c=await f.create(),invite=await f.invite(c)
  const create=(user,purpose,key=crypto.randomUUID())=>f.rpc(user,'create_chat_room_poll',['league_team',c.team_id,purpose,'우리 팀 '+purpose,'single',['금요일 19시 · 정문','토요일 14시 · 도서관'],key])
  await assert.rejects(create(ids[1],'schedule'),/forbidden/)
  await f.accept(c,invite)
  const key=crypto.randomUUID(),poll=await create(ids[0],'schedule',key)
  assert.equal((await create(ids[0],'schedule',key)).id,poll.id)
  assert.equal(poll.title,'우리 팀 schedule');assert.equal(poll.options.length,2)
  await create(ids[1],'place')
  const board=await f.rpc(ids[1],'get_chat_room_polls',['league_team',c.team_id]);assert.equal(board.polls.length,2)
  await assert.rejects(f.rpc(null,'get_chat_room_polls',['league_team',c.team_id]),/forbidden/)
  await f.db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[0],ids[1]])
  await assert.rejects(f.rpc(ids[1],'get_chat_room_polls',['league_team',c.team_id]),/forbidden/)
  await f.db.exec('delete from quantum_private.test_blocks')
  await f.db.query('insert into quantum_private.test_deletions values($1)',[ids[1]])
  await assert.rejects(f.rpc(ids[1],'get_chat_room_polls',['league_team',c.team_id]),/forbidden/)
  await f.db.exec('delete from quantum_private.test_deletions')
  const vote=(user,room=c.team_id)=>f.rpc(user,'vote_chat_room_poll',['league_team',room,poll.id,[poll.options[0].id]])
  await vote(ids[1]);await vote(ids[1])
  assert.equal((await f.rpc(ids[0],'get_chat_room_polls',['league_team',c.team_id])).polls.find(p=>p.id===poll.id).ballot_count,1)
  await assert.rejects(vote(ids[5]),/forbidden/)
  const other=await f.create(ids[5]);await assert.rejects(vote(ids[5],other.team_id),/not_found/)
  await assert.rejects(f.rpc(ids[1],'vote_chat_room_poll',['department_challenge',c.challenge_id,poll.id,[poll.options[0].id]]),/not_found/)
  const current=(await f.rpc(ids[0],'get_chat_room_polls',['league_team',c.team_id])).polls.find(p=>p.id===poll.id)
  const closed=await f.rpc(ids[0],'close_chat_room_poll',['league_team',c.team_id,poll.id,current.revision])
  await assert.rejects(vote(ids[1]),/not_open/)
  const agreement=await f.rpc(ids[0],'propose_chat_room_poll_agreement',['league_team',c.team_id,poll.id,poll.options[0].id,closed.revision,crypto.randomUUID(),'금요일 19시 정문'])
  assert.equal(agreement.required_count,2)
  await f.db.query("update public.department_challenge_roster set status='left'where team_id=$1 and user_id=$2",[c.team_id,ids[1]])
  await assert.rejects(f.rpc(ids[1],'get_chat_room_polls',['league_team',c.team_id]),/forbidden/)
  await assert.rejects(f.rpc(ids[0],'confirm_chat_room_poll_agreement',['league_team',c.team_id,poll.id,agreement.id,agreement.version]),/membership_changed/)
  const a=await f.team(10),b=await f.team(15)
  for(const t of[a,b])await f.act(t.actor,'queue',{team_id:t.team,waiting:true,gap:200})
  await f.act(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team});await f.act(b.actor,'accept',{team_id:b.team,opponent_team_id:a.team})
  await assert.rejects(f.rpc(b.actor,'get_chat_room_polls',['league_team',a.team]),/forbidden/)
  await f.db.query("update public.department_challenges set status='completed',first_score=1,second_score=0 where id=$1",[a.id])
  await assert.rejects(f.rpc(a.actor,'create_chat_room_poll',['league_team',a.team,'general','종료 후 질문','single',['하나','둘'],crypto.randomUUID()]),/forbidden/)
 }finally{await f.db.close()}
})

test('all authorized rooms are ordered by unread and latest activity before stable cursor pagination',async()=>{
 const f=await repaired();try{
  await f.db.query("insert into public.activity_meetups(host_user_id,school,category,title,place_name,scheduled_at,capacity,created_at,updated_at)select $1,'부산대','study','대화 '||n,'도서관',now(),5,now()-n*interval '1 day',now()-n*interval '1 day' from generate_series(1,65)n",[ids[0]])
  await f.db.query("insert into public.activity_meetup_members(meetup_id,user_id,role)select id,$1,'host'from public.activity_meetups",[ids[0]])
  const old=(await f.db.query("select id from public.activity_meetups where title='대화 65'")).rows[0].id
  await f.db.query("insert into public.activity_meetup_messages(meetup_id,sender_user_id,idempotency_key,message,created_at)values($1,$2,gen_random_uuid(),'오래된 방의 새 답장',now()-interval '1 hour')",[old,ids[1]])
  const first=await f.rooms(ids[0]);assert.equal(first.rooms[0].id,old);assert.equal(first.rooms[0].unread_count,1);assert.equal(first.rooms.length,50);assert.ok(first.next_cursor.includes('|'))
  const second=await f.rooms(ids[0],{kind:null,id:null,cursor:first.next_cursor});assert.equal(second.rooms.length,15);assert.equal(new Set([...first.rooms,...second.rooms].map(r=>r.id)).size,65)
  await f.db.query("update public.activity_meetup_members set status='left'where meetup_id=$1 and user_id=$2",[first.rooms.at(-1).id,ids[0]])
  assert.deepEqual((await f.rooms(ids[0],{kind:null,id:null,cursor:first.next_cursor})).rooms.map(r=>r.id),second.rooms.map(r=>r.id))
  const access=(await f.db.query("select has_table_privilege('authenticated','quantum_private.social_chat_read_positions','select') direct,has_function_privilege('anon','public.mark_social_chat_read(text,uuid,uuid[])','execute') anon,has_function_privilege('authenticated','quantum_private.social_chat_message_rows(text,uuid,uuid)','execute') helper")).rows[0]
  assert.deepEqual(access,{direct:false,anon:false,helper:false})
 }finally{await f.db.close()}
})

test('a blocked meetup sender stays hidden in original chat, directory preview/count/time and read receipts',async()=>{
 const f=await repaired();try{
  await f.db.exec("alter table public.activity_meetup_messages add sender_alias_snapshot text default '별친구'")
  await installFunction(f.db,'20260908165129_daily_identity.sql','public.get_my_activity_meetup_chat')
  const room=(await f.db.query("insert into public.activity_meetups(host_user_id,school,category,title,place_name,scheduled_at,capacity,updated_at)values($1,'부산대','study','차단 확인','도서관',now(),5,now()-interval '1 day')returning id",[ids[0]])).rows[0]
  await f.db.query("insert into public.activity_meetup_members(meetup_id,user_id,role)values($1,$2,'host'),($1,$3,'member')",[room.id,ids[0],ids[1]])
  const visible=(await f.db.query("insert into public.activity_meetup_messages(meetup_id,sender_user_id,idempotency_key,message,created_at)values($1,$2,gen_random_uuid(),'내가 볼 수 있는 대화',now()-interval '2 hours')returning id",[room.id,ids[0]])).rows[0]
  const hidden=(await f.db.query("insert into public.activity_meetup_messages(meetup_id,sender_user_id,idempotency_key,message)values($1,$2,gen_random_uuid(),'차단한 사람의 비공개 본문')returning id",[room.id,ids[1]])).rows[0]
  assert.equal((await f.rpc(ids[0],'get_my_activity_meetup_chat',[room.id])).messages.length,2)
  await f.db.query("insert into public.friendships(user_id,friend_user_id,status)values($1,$2,'blocked')",[ids[0],ids[1]])
  const canonical=await f.rpc(ids[0],'get_my_activity_meetup_chat',[room.id]);assert.deepEqual(canonical.messages.map(m=>m.id),[visible.id])
  const listed=(await f.rooms(ids[0],{kind:'meetup',id:room.id,cursor:null})).rooms[0]
  assert.equal(listed.latest_message?.id,visible.id);assert.equal(listed.unread_count,0)
  assert.equal(Date.parse(listed.updated_at),Date.parse(canonical.messages[0].created_at),'hidden newest timestamp cannot influence list activity')
  await assert.rejects(f.mark(ids[0],'meetup',room.id,[hidden.id]),/invalid_message/)
  await f.db.query('delete from public.activity_meetup_messages where id=$1',[visible.id])
  const empty=(await f.rooms(ids[0],{kind:'meetup',id:room.id,cursor:null})).rooms[0]
  assert.equal(empty.latest_message,null);assert.equal(empty.unread_count,0)
 }finally{await f.db.close()}
})

test('activity-room metadata excludes messages from a sender no longer eligible for the pool, like canonical history',async()=>{
 const f=await repaired();try{
  await f.db.exec("alter table quantum_private.activity_room_messages add sender_alias_snapshot text default '별친구';alter table quantum_private.activity_room_members add identity_alias_snapshot text default '별친구'")
  await installFunction(f.db,'20260908165129_daily_identity.sql','public.get_activity_room')
  await installFunction(f.db,'20260908165129_daily_identity.sql','public.get_activity_room_messages')
  const pool=(await f.db.query("insert into quantum_private.activity_room_pools(school_scope,activity_key,category,gender_mode,capacity)values('pnu_self_selected','campus-walk','walking','all',5)returning id")).rows[0].id
  const room=(await f.db.query('insert into quantum_private.activity_room_rooms(pool_id,room_number)values($1,1)returning id',[pool])).rows[0].id
  await f.db.query("insert into quantum_private.activity_room_members(pool_id,room_id,user_id,school_scope_snapshot,community_gender_snapshot)values($1,$2,$3,'pnu_self_selected','male'),($1,$2,$4,'pnu_self_selected','male')",[pool,room,ids[0],ids[1]])
  const hidden=(await f.db.query("insert into quantum_private.activity_room_messages(room_id,sender_user_id,idempotency_key,message)values($1,$2,gen_random_uuid(),'자격이 만료된 작성자의 본문')returning id",[room,ids[1]])).rows[0]
  assert.equal((await f.rpc(ids[0],'get_activity_room_messages',[room,null,null])).messages.length,1)
  await f.db.query("update quantum_private.community_member_profiles set school_scope='other_school' where user_id=$1",[ids[1]])
  assert.equal((await f.rpc(ids[0],'get_activity_room_messages',[room,null,null])).messages.length,0)
  const listed=(await f.rooms(ids[0],{kind:'activity_room',id:room,cursor:null})).rooms[0]
  assert.equal(listed.latest_message,null);assert.equal(listed.unread_count,0)
  await assert.rejects(f.mark(ids[0],'activity_room',room,[hidden.id]),/invalid_message/)
 }finally{await f.db.close()}
})

test('team and study metadata retain departed authors exactly as their canonical history does',async()=>{
 const f=await repaired();try{
  const c=await f.create(),invite=await f.invite(c);await f.accept(c,invite)
  const sent=await f.chat(ids[1],'send',{team_id:c.team_id,body:'퇴장 전 우리 팀 대화',idempotency_key:crypto.randomUUID()})
  await f.db.query("update public.department_challenge_roster set status='left',left_at=now()where team_id=$1 and user_id=$2",[c.team_id,ids[1]])
  assert.equal((await f.chat(ids[0],'read',{team_id:c.team_id,before:null})).chat.messages[0].id,sent.message.id)
  let listed=(await f.rooms(ids[0],{kind:'league_team',id:c.team_id,cursor:null})).rooms[0]
  assert.equal(listed.latest_message.id,sent.message.id);assert.equal(listed.unread_count,1)
  await f.mark(ids[0],'league_team',c.team_id,[sent.message.id])
  assert.equal((await f.rooms(ids[0],{kind:'league_team',id:c.team_id,cursor:null})).rooms[0].unread_count,0)

  const pool=(await f.db.query("insert into quantum_private.study_room_pools(school_key,department_key,department_label,course_id,course_name,level)select school_scope_key,department_key,'기계공학과','custom:history','과거 대화','beginner'from quantum_private.get_member_department_identity($1)returning id",[ids[0]])).rows[0].id
  const room=(await f.db.query('insert into quantum_private.study_rooms(pool_id,room_number)values($1,1)returning id',[pool])).rows[0].id
  await f.db.query("insert into quantum_private.study_room_members(pool_id,room_id,user_id,alias,joined_session)values($1,$2,$3,'친구 하나',1),($1,$2,$4,'친구 둘',1)",[pool,room,ids[0],ids[1]])
  const message=(await f.db.query("insert into quantum_private.study_room_messages(room_id,user_id,sender_alias,message,idempotency_key)values($1,$2,'친구 둘','남겨진 스터디 대화',gen_random_uuid())returning id",[room,ids[1]])).rows[0]
  await f.db.query('update quantum_private.study_room_members set left_at=now()where room_id=$1 and user_id=$2',[room,ids[1]])
  const history=await f.rpc(ids[0],'study_room_action',['history',JSON.stringify({room_id:room})])
  assert.equal(history.messages[0].id,message.id)
  listed=(await f.rooms(ids[0],{kind:'study_room',id:room,cursor:null})).rooms[0]
  assert.equal(listed.latest_message.id,message.id);assert.equal(listed.unread_count,1)
  await f.mark(ids[0],'study_room',room,[message.id])
  assert.equal((await f.rooms(ids[0],{kind:'study_room',id:room,cursor:null})).rooms[0].unread_count,0)
  await assert.rejects(f.mark(ids[1],'study_room',room,[message.id]),/membership_required/)
 }finally{await f.db.close()}
})

test('match metadata and receipts omit a raw sender without the canonical captured alias membership',async()=>{
 const f=await repaired();try{
  const a=await f.team(0),b=await f.team(5)
  for(const t of[a,b])await f.act(t.actor,'queue',{team_id:t.team,waiting:true,gap:200})
  await f.act(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team});await f.act(b.actor,'accept',{team_id:b.team,opponent_team_id:a.team})
  const visible=(await f.db.query("insert into quantum_private.challenge_match_chat_messages(challenge_id,sender_id,body,created_at)values($1,$2,'경기 참가자의 대화',now()-interval '1 hour')returning id",[a.id,b.actor])).rows[0]
  const hidden=(await f.db.query("insert into quantum_private.challenge_match_chat_messages(challenge_id,sender_id,body)values($1,$2,'별칭 소속 없는 원시 행')returning id",[a.id,ids[20]])).rows[0]
  const canonical=await f.rpc(a.actor,'department_league_lobby',['chat_read',JSON.stringify({challenge_id:a.id,before:null})])
  assert.deepEqual(canonical.messages.map(m=>m.id),[visible.id])
  const listed=(await f.rooms(a.actor,{kind:'league_match',id:a.id,cursor:null})).rooms[0]
  assert.equal(listed.latest_message.id,visible.id);assert.equal(listed.unread_count,1)
  await assert.rejects(f.mark(a.actor,'league_match',a.id,[hidden.id]),/invalid_message/)
  await f.mark(a.actor,'league_match',a.id,[visible.id])
  await f.db.query('insert into quantum_private.test_blocks values($1,$2)',[a.actor,b.actor])
  await assert.rejects(f.rooms(a.actor,{kind:'league_match',id:a.id,cursor:null}),/membership_required/)
  await assert.rejects(f.mark(a.actor,'league_match',a.id,[visible.id]),/membership_required/)
 }finally{await f.db.close()}
})

test('mentoring metadata matches the canonical alias projection and its latest 100-message visibility window',async()=>{
 const f=await repaired();try{
  // No friend invitations in this fixture; keep that unrelated sidebar empty.
  await f.db.exec("create function public.get_friend_summaries()returns table(user_id uuid,display_name text,status text)language sql as $$select null::uuid,null::text,null::text where false$$")
  const session=(await f.db.query("insert into quantum_private.group_mentoring_sessions(side_size,school_key,department_key,status,expires_at)select 2,school_scope_key,department_key,'active',now()+interval '1 day'from quantum_private.get_member_department_identity($1)returning id",[ids[0]])).rows[0].id
  for(let i=0;i<4;i++){
   const role=i<2?'mentor':'mentee'
   const party=(await f.db.query("insert into quantum_private.group_mentoring_parties(owner_id,role,side_size,school_key,department_key,status,client_id,request_args,session_id,expires_at)select $1,$2,2,school_scope_key,department_key,'active',gen_random_uuid(),'{}',$3,now()+interval '1 day'from quantum_private.get_member_department_identity($1)returning id",[ids[i],role,session])).rows[0].id
   await f.db.query('insert into quantum_private.group_mentoring_party_members values($1,$2,true,true)',[party,ids[i]])
   await f.db.query("insert into quantum_private.group_mentoring_members(session_id,party_id,user_id,role,alias,accepted)values($1,$2,$3,$4,'멤버',true)",[session,party,ids[i],role])
  }
  await f.db.query("insert into quantum_private.group_mentoring_messages(session_id,author_id,client_id,body,created_at)select $1,$2,gen_random_uuid(),'멘토링 대화 '||n,now()-interval '1 hour'+n*interval '1 second'from generate_series(1,101)n",[session,ids[1]])
  const hidden=(await f.db.query("insert into quantum_private.group_mentoring_messages(session_id,author_id,client_id,body)values($1,$2,gen_random_uuid(),'별칭 없는 원시 메시지')returning id",[session,ids[4]])).rows[0]
  const old=(await f.db.query('select id from quantum_private.group_mentoring_messages where session_id=$1 order by created_at,id limit 1',[session])).rows[0]
  const canonical=await f.rpc(ids[0],'mentoring_group_action',['status','{}'])
  assert.equal(canonical.phase,'active');assert.equal(canonical.messages.length,99)
  const listed=(await f.rooms(ids[0],{kind:'mentoring',id:session,cursor:null})).rooms[0]
  assert.equal(listed.latest_message.id,canonical.messages.at(-1).id);assert.equal(listed.unread_count,99)
  await assert.rejects(f.mark(ids[0],'mentoring',session,[hidden.id]),/invalid_message/)
  await assert.rejects(f.mark(ids[0],'mentoring',session,[old.id]),/invalid_message/)
  await f.mark(ids[0],'mentoring',session,canonical.messages.map(m=>m.id))
  assert.equal((await f.rooms(ids[0],{kind:'mentoring',id:session,cursor:null})).rooms[0].unread_count,0)
  await f.db.query("update quantum_private.group_mentoring_sessions set status='ended'where id=$1",[session])
  await assert.rejects(f.rooms(ids[0],{kind:'mentoring',id:session,cursor:null}),/membership_required/)
  await assert.rejects(f.mark(ids[0],'mentoring',session,[canonical.messages[0].id]),/membership_required/)
 }finally{await f.db.close()}
})
