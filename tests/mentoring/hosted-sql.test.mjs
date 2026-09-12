import test from 'node:test'
import assert from 'node:assert/strict'
import {setup,ids} from './hosted-fixture.mjs'
import {parseHostedMentoringDetail,parseHostedMentoringList} from '../../lib/mentoring/hosted-contract.ts'
import {readFile} from 'node:fs/promises'
test('hosted RPC exists without allowing direct paid-admission bypass',async()=>{
 const f=await setup();try{
  const row=(await f.db.query("select to_regprocedure('public.mentoring_hosted_action(text,jsonb)') fn")).rows[0]
  assert.ok(row.fn,'A hosted room RPC must exist instead of automatic queue-only admission')
  assert.equal((await f.db.query("select has_function_privilege('authenticated','quantum_private.hosted_mentoring_admit(uuid,uuid,jsonb)','execute') allowed")).rows[0].allowed,false)
 }finally{await f.db.close()}
})
test('host creates one immediately writable room and read-only nonmembers cannot read roster or history',async()=>{
 const f=await setup();try{
  const first=await f.create();assert.ok(parseHostedMentoringDetail(first));assert.equal(first.room.member_count,1);assert.equal(first.room.joined,true)
  const list=await f.act(ids[1],'list');assert.ok(parseHostedMentoringList(list));assert.equal(list.rooms[0].joined,false)
  const no=await f.act(ids[1],'status',{session_id:first.room.id});assert.deepEqual(no.room.messages,[]);assert.deepEqual(no.room.members,[])
  await assert.rejects(f.act(ids[1],'message',{session_id:first.room.id,text:'우회',client_id:crypto.randomUUID()}),/forbidden/)
  const chats=await f.rooms(ids[0],{kind:'mentoring',id:first.room.id,cursor:null});assert.equal(chats.rooms[0].recruitment_mode,'hosted');assert.equal(chats.rooms[0].member_count,1)
  assert.equal((await f.act(ids[5],'list')).rooms.length,0)
 }finally{await f.db.close()}
})
test('approval enforces role quotas, duplicate replay and current membership; message history becomes available after approval',async()=>{
 const f=await setup();try{
  const r=(await f.create()).room.id;const msg={session_id:r,text:'다음 주에 카페에서 만나요',client_id:crypto.randomUUID()}
  await f.act(ids[0],'message',msg);await f.act(ids[0],'message',msg)
  await f.admit(r,ids[1],'mentor');await f.admit(r,ids[1],'mentor');await assert.rejects(f.admit(r,ids[2],'mentor'),/full/)
  await f.admit(r,ids[2],'mentee');await f.admit(r,ids[3],'mentee')
  const s=await f.act(ids[1],'status',{session_id:r});assert.ok(parseHostedMentoringDetail(s));assert.equal(s.room.messages.length,1);assert.equal(s.room.status,'full')
  await assert.rejects(f.admit(r,ids[4],'mentee'),/full/)
  await f.act(ids[1],'leave',{session_id:r});const partial=await f.act(ids[0],'status',{session_id:r});assert.equal(partial.room.member_count,3);assert.equal(partial.room.status,'open')
  await assert.rejects(f.act(ids[1],'message',{session_id:r,text:'떠난 뒤',client_id:crypto.randomUUID()}),/forbidden/)
  await f.admit(r,ids[4],'mentor');assert.equal((await f.act(ids[4],'status',{session_id:r})).room.messages.length,1)
 }finally{await f.db.close()}
})
test('creation replay, no direct join and 3+3 roles are preserved without silently admitting friends',async()=>{
 const f=await setup();try{
  const key=crypto.randomUUID(),r=await f.create(ids[0],{side_size:3,client_id:key});assert.equal((await f.create(ids[0],{side_size:3,client_id:key})).room.id,r.room.id)
  await assert.rejects(f.create(ids[0],{title:'내용 변경',side_size:3,client_id:key}),/conflict/)
  await assert.rejects(f.create(ids[0]),/already_active/)
  await assert.rejects(f.act(ids[1],'create',{title:'친구도 자동',topic:'campus',role:'mentor',side_size:2,client_id:key,friend_ids:[ids[2]]}),/invalid/)
  await assert.rejects(f.rpc(ids[1],'mentoring_group_action',['join',JSON.stringify({role:'mentee',side_size:2,friend_ids:[],client_id:crypto.randomUUID()})]),/approval_required/)
  await assert.rejects(f.act(ids[1],'join',{session_id:r.room.id}),/invalid/)
  for(const [index,role]of [[1,'mentor'],[2,'mentor'],[3,'mentee'],[4,'mentee']])await f.admit(r.room.id,ids[index],role)
  assert.equal((await f.act(ids[0],'status',{session_id:r.room.id})).room.member_count,5)
  await assert.rejects(f.admit(r.room.id,ids[5],'mentee'),/forbidden/)
  await f.db.query("update quantum_private.community_member_profiles set department='기계공학과'where user_id=$1",[ids[5]])
  await f.admit(r.room.id,ids[5],'mentee');assert.equal((await f.act(ids[0],'status',{session_id:r.room.id})).room.status,'full')
 }finally{await f.db.close()}
})
test('current scope/block changes close disclosure, while individual leave and evidence-based report remain usable',async()=>{
 const f=await setup();try{
  const r=(await f.create()).room.id;await f.admit(r,ids[1]);await f.admit(r,ids[2]);
  const before=await f.act(ids[1],'status',{session_id:r}),target=before.room.members.find(m=>m.is_host).id
  await f.db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[0],ids[1]])
  await assert.rejects(f.rooms(ids[1],{kind:'mentoring',id:r,cursor:null}),/chat_membership_required/)
  await assert.rejects(f.act(ids[1],'message',{session_id:r,text:'차단',client_id:crypto.randomUUID()}),/forbidden/)
  const left=await f.act(ids[1],'report',{session_id:r,member_id:target,reason:'불편한 행동의 근거를 제출합니다'});assert.ok(parseHostedMentoringDetail(left));assert.equal(left.room.joined,false)
  assert.equal((await f.act(ids[0],'status',{session_id:r})).room.member_count,2)
  await f.db.query("update quantum_private.community_member_profiles set department='전자공학과'where user_id=$1",[ids[2]])
  const changed=await f.act(ids[2],'leave',{session_id:r});assert.equal(changed.room.joined,false)
  assert.equal((await f.act(ids[0],'status',{session_id:r})).room.member_count,1)
 }finally{await f.db.close()}
})

test('restricted current members retain only their redacted management row and can leave after block or department change',async()=>{
 const f=await setup();try{
  const r=(await f.create()).room.id;await f.admit(r,ids[1]);await f.admit(r,ids[2]);
  await f.act(ids[0],'message',{session_id:r,text:'현재 대화 비공개',client_id:crypto.randomUUID()})
  await f.db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[0],ids[1]])
  await f.db.query("update quantum_private.group_mentoring_sessions set title='차단 이후 바뀐 비공개 제목',revision=37 where id=$1",[r])
  const recovered=await f.act(ids[1],'list');assert.equal(recovered.rooms.length,1,'my accepted unleft membership must not vanish behind eligibility filters')
  assert.ok(parseHostedMentoringList(recovered));const row=recovered.rooms[0]
  assert.equal(row.id,r);assert.equal(row.participation_restricted,true);assert.equal(row.joined,false);assert.equal(row.status,'closed');assert.equal(row.is_host,false)
  assert.deepEqual([row.mentor_count,row.mentee_count,row.member_count],[0,0,0]);assert.equal(row.revision,0);assert.equal(row.title,'참여 상태를 확인할 멘토링');assert.equal(row.department_label,'참여 관리')
  assert.equal(JSON.stringify(row).includes('비공개'),false)
  const detail=await f.act(ids[1],'status',{session_id:r});assert.ok(parseHostedMentoringDetail(detail));assert.equal(detail.room.participation_restricted,true)
  assert.deepEqual(detail.room.messages,[]);assert.deepEqual(detail.room.members,[]);assert.equal(detail.room.meeting,null)
  assert.equal((await f.act(ids[3],'list')).rooms.some(v=>v.id===r),false,'a nonparticipant cannot recover a blocked room')
  await assert.rejects(f.rooms(ids[1],{kind:'mentoring',id:r,cursor:null}),/chat_membership_required/)
  await assert.rejects(f.act(ids[1],'message',{session_id:r,text:'우회 불가',client_id:crypto.randomUUID()}),/forbidden/)
  assert.equal((await f.db.query('select quantum_private.hosted_mentoring_target($1,$2)t',[r,ids[1]])).rows[0].t,null)
  await f.act(ids[1],'leave',{session_id:r});assert.equal((await f.act(ids[1],'list')).rooms.some(v=>v.id===r),false,'an already-left record is not a recovery row')
  await f.db.query("update quantum_private.community_member_profiles set department='전자공학과'where user_id=$1",[ids[2]])
  const changed=await f.act(ids[2],'list');assert.equal(changed.rooms.find(v=>v.id===r)?.participation_restricted,true,'recovery uses the actor membership, not the new profile department')
  await assert.rejects(f.rooms(ids[2],{kind:'mentoring',id:r,cursor:null}),/chat_membership_required/)
  await f.act(ids[2],'leave',{session_id:r});assert.equal((await f.act(ids[2],'list')).rooms.some(v=>v.id===r),false)
  assert.equal((await f.act(ids[0],'list')).rooms.find(v=>v.id===r)?.joined,true)
 }finally{await f.db.close()}
})

test('unaccepted membership and legacy invitations never become restricted hosted recovery rows',async()=>{
 let invitation;
 const f=await setup({beforeMigration:async f=>{
  const key=crypto.randomUUID();await f.db.query("insert into public.friend_requests values($1,$2,$3,'accepted')",[key,ids[3],ids[4]])
  await f.db.query("insert into public.friendships(user_id,friend_user_id,status,created_from_request_id)values($1,$2,'active',$3)",[ids[3],ids[4],key])
  invitation=await f.rpc(ids[3],'mentoring_group_action',['join',JSON.stringify({role:'mentor',side_size:2,friend_ids:[ids[4]],client_id:crypto.randomUUID()})])
 }});try{
  assert.ok(invitation.party_id);const r=(await f.create()).room.id
  await f.db.query("insert into quantum_private.group_mentoring_members(session_id,user_id,role,alias,accepted) values($1,$2,'mentee','미수락 초대',false)",[r,ids[4]])
  await f.db.query("update quantum_private.community_member_profiles set department='전자공학과'where user_id=$1",[ids[4]])
  const list=await f.act(ids[4],'list');assert.ok(parseHostedMentoringList(list));assert.deepEqual(list.rooms,[])
  await assert.rejects(f.act(ids[4],'status',{session_id:r}),/forbidden/)
 }finally{await f.db.close()}
})
test('host departure transfers ownership, last leave closes room, and completed dates are only proposals',async()=>{
 const f=await setup();try{
  const r=(await f.create()).room.id;await f.admit(r,ids[1]);
  const when=new Date(Date.now()+3600000).toISOString();const proposal={session_id:r,starts_at:when,place:'도서관 앞 카페',revision:0}
  const planned=await f.act(ids[0],'plan',proposal);assert.equal(planned.room.meeting.revision,1);assert.equal(planned.room.meeting.place,'도서관 앞 카페');assert.equal(planned.room.meeting.confirmed,undefined)
  await assert.rejects(f.act(ids[1],'plan',proposal),/conflict/)
  await f.act(ids[0],'leave',{session_id:r});assert.equal((await f.act(ids[1],'status',{session_id:r})).room.is_host,true)
  const done=await f.act(ids[1],'leave',{session_id:r});assert.ok(parseHostedMentoringDetail(done));assert.equal(done.room.status,'closed')
  assert.equal((await f.act(ids[1],'list')).rooms.length,0)
  await assert.rejects(f.admit(r,ids[2]),/closed/)
 }finally{await f.db.close()}
})
test('existing offered group consent and legacy active chat remain usable and cannot destroy hosted partial rooms',async()=>{
 let legacy;
 const f=await setup({beforeMigration:async f=>{
  for(let i=0;i<4;i++)legacy=await f.rpc(ids[i],'mentoring_group_action',['join',JSON.stringify({role:i<2?'mentor':'mentee',side_size:2,friend_ids:[],client_id:crypto.randomUUID()})])
 }});try{
  assert.equal(legacy.phase,'offered');const r=(await f.create(ids[4])).room.id
  for(let i=0;i<4;i++)await f.rpc(ids[i],'mentoring_group_action',['accept',JSON.stringify({session_id:legacy.session_id})])
  const old=await f.rpc(ids[0],'mentoring_group_action',['status','{}']);assert.equal(old.phase,'active')
  assert.equal((await f.act(ids[4],'status',{session_id:r})).room.status,'open')
  const oldChat=await f.rooms(ids[0],{kind:'mentoring',id:legacy.session_id,cursor:null});assert.equal(oldChat.rooms[0].recruitment_mode,'legacy')
  await f.rpc(ids[0],'mentoring_group_action',['message',JSON.stringify({session_id:legacy.session_id,text:'기존 동의 방',client_id:crypto.randomUUID()})])
  await f.rpc(ids[0],'mentoring_group_action',['end',JSON.stringify({session_id:legacy.session_id})]);assert.equal((await f.rpc(ids[0],'mentoring_group_action',['status','{}'])).phase,'ended')
 }finally{await f.db.close()}
})
test('legacy status cannot compose waiting parties after transition',async()=>{
 const f=await setup({beforeMigration:async f=>{
  for(let i=0;i<4;i++){
   const party=crypto.randomUUID();await f.db.query("insert into quantum_private.group_mentoring_parties(id,owner_id,role,side_size,school_key,department_key,status,client_id,request_args,expires_at)select $1,$2,$3,2,i.school_scope_key,i.department_key,'waiting',$1,'{}',now()+interval'30 minutes'from quantum_private.get_member_department_identity($2)i",[party,ids[i],i<2?'mentor':'mentee'])
   await f.db.query('insert into quantum_private.group_mentoring_party_members values($1,$2,true,true)',[party,ids[i]])
  }
 }});try{
  for(let i=0;i<4;i++)assert.equal((await f.rpc(ids[i],'mentoring_group_action',['status','{}'])).phase,'waiting')
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.group_mentoring_sessions')).rows[0].n,0)
  await f.rpc(ids[0],'mentoring_group_action',['cancel','{}']);assert.equal((await f.rpc(ids[0],'mentoring_group_action',['status','{}'])).phase,'idle')
 }finally{await f.db.close()}
})
test('real message trigger and queued push use hosted current membership, not exact full group size',async()=>{
 const source=name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')
 const f=await setup({beforeMigration:async f=>{
  await f.db.exec(`create table quantum_private.social_notification_events(notification_id uuid primary key,domain text,entity_id uuid,recipient_id uuid,team_id uuid,entity_type text,actor_id uuid);
   create function quantum_private.social_notification_scope(text,uuid,uuid,uuid,text)returns boolean language sql stable as $$select true$$;`)
  await f.db.exec(await source('20260912025017_common_notifications_web_push.sql'))
  await f.db.exec(await source('20260912025919_social_chat_message_notifications.sql'))
 }});try{
  const r=(await f.create()).room.id;await f.admit(r,ids[1]);
  await f.act(ids[0],'message',{session_id:r,text:'잠금 화면에 노출하면 안 되는 내용',client_id:crypto.randomUUID()})
  const note=(await f.db.query("select * from notifications where user_id=$1 and kind='social_chat_message'",[ids[1]])).rows[0];assert.ok(note);assert.ok(!JSON.stringify(note.payload).includes('잠금 화면'))
  assert.equal((await f.db.query('select quantum_private.common_web_push_notification_current($1)c',[note.id])).rows[0].c,true)
  await f.act(ids[1],'leave',{session_id:r});assert.equal((await f.db.query('select quantum_private.common_web_push_notification_current($1)c',[note.id])).rows[0].c,false)
 }finally{await f.db.close()}
})
test('already-issued friend consent remains explicit and cannot bypass another current hosted membership',async()=>{
 let invitation;
 const f=await setup({beforeMigration:async f=>{
  const key=crypto.randomUUID();await f.db.query("insert into public.friend_requests values($1,$2,$3,'accepted')",[key,ids[0],ids[1]])
  await f.db.query("insert into public.friendships(user_id,friend_user_id,status,created_from_request_id)values($1,$2,'active',$3)",[ids[0],ids[1],key])
  invitation=await f.rpc(ids[0],'mentoring_group_action',['join',JSON.stringify({role:'mentor',side_size:2,friend_ids:[ids[1]],client_id:crypto.randomUUID()})])
 }});try{
  const pending=await f.rpc(ids[1],'mentoring_group_action',['status','{}']);assert.equal(pending.invitations[0].party_id,invitation.party_id)
  const mine=(await f.create(ids[1])).room.id
  await assert.rejects(f.rpc(ids[1],'mentoring_group_action',['party_accept',JSON.stringify({party_id:invitation.party_id})]),/already_waiting/)
  await f.act(ids[1],'leave',{session_id:mine})
  const accepted=await f.rpc(ids[1],'mentoring_group_action',['party_accept',JSON.stringify({party_id:invitation.party_id})]);assert.equal(accepted.phase,'waiting');assert.equal(accepted.party_accepted,2)
  assert.equal((await f.db.query("select count(*)::int n from quantum_private.group_mentoring_sessions where recruitment_mode='legacy'")).rows[0].n,0)
 }finally{await f.db.close()}
})
test('account deletion, bans, unauthenticated calls and helper grants fail closed',async()=>{
 const f=await setup();try{
  const r=(await f.create()).room.id
  await assert.rejects(f.act(null,'status',{session_id:r}),/not_authenticated/)
  await f.db.query("update auth.users set banned_until=now()+interval'1 day'where id=$1",[ids[1]])
  await assert.rejects(f.admit(r,ids[1]),/forbidden/)
  await f.db.query('insert into quantum_private.test_deletions values($1)',[ids[2]]);await assert.rejects(f.admit(r,ids[2]),/forbidden/)
  await f.db.exec('set role authenticated');try{
   await assert.rejects(f.db.query('select quantum_private.hosted_mentoring_admit($1,$2,$3)',[r,ids[3],JSON.stringify({role:'mentee'})]),/permission denied/)
   await assert.rejects(f.db.query("select quantum_private.group_mentoring_preserved_action('join','{}')"),/permission denied/)
   await assert.rejects(f.db.query('select * from quantum_private.group_mentoring_members'),/permission denied/)
  }finally{await f.db.exec('reset role')}
  const target=(await f.db.query('select quantum_private.hosted_mentoring_target($1,$2)t',[r,ids[1]])).rows[0].t;assert.equal(target,null)
 }finally{await f.db.close()}
})
