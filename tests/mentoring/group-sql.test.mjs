import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { parseGroupMentoringSnapshot } from '../../lib/mentoring/group-contract.ts'
const ids=Array.from({length:12},(_,i)=>`41000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`)
const join=(role='mentor',side_size=2,friend_ids=[])=>({role,side_size,friend_ids,client_id:crypto.randomUUID()})
async function fixture() {
  const db=new PGlite()
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema quantum_private;create table public.users(id uuid primary key);
    create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
    create table quantum_private.community_member_profiles(user_id uuid primary key,school_scope text,department text,community_gender text);
    create table quantum_private.test_blocks(a uuid,b uuid);create table quantum_private.test_friends(a uuid,b uuid);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function quantum_private.account_deletion_blocks_access(uuid) returns boolean language sql stable as $$select false$$;
    create function quantum_private.resolve_profile_readiness(uuid) returns table(minimum_signup_complete boolean) language sql stable as $$select true$$;
    create function quantum_private.get_or_create_daily_identity(uuid,timestamptz) returns jsonb language sql as $$select jsonb_build_object('display_name','별명')$$;
    create function quantum_private.tonight_invite_pair_is_blocked(x uuid,y uuid) returns boolean language sql stable as $$select exists(select 1 from quantum_private.test_blocks where (a=x and b=y) or(a=y and b=x))$$;
    create function quantum_private.is_active_accepted_friend_pair(x uuid,y uuid) returns boolean language sql stable as $$select exists(select 1 from quantum_private.test_friends where (a=x and b=y) or(a=y and b=x))$$;
    create function quantum_private.friend_pair_lock_key(x uuid,y uuid) returns bigint language sql immutable as $$select hashtextextended(least(x,y)::text||':'||greatest(x,y)::text,0)$$;
    create function public.get_friend_summaries() returns table(user_id uuid,display_name text,status text) language sql security definer as $$select case when a=auth.uid() then b else a end,'친구','active' from quantum_private.test_friends where auth.uid() in(a,b)$$;`)
  const source=await readFile(new URL('../../supabase/migrations/20260906181225_community_social_integrated.sql',import.meta.url),'utf8')
  for(const name of ['canonical_department_key','canonical_school_scope_key','get_member_department_identity']) {const tail=source.slice(source.indexOf(`create or replace function quantum_private.${name}(`));await db.exec(tail.slice(0,tail.indexOf('$$;')+3))}
  const access=await readFile(new URL('../../supabase/migrations/20260907113358_automatic_activity_rooms.sql',import.meta.url),'utf8');const tail=access.slice(access.indexOf('create function quantum_private.assert_activity_room_access('));await db.exec(tail.slice(0,tail.indexOf('$$;')+3))
  for(let i=0;i<ids.length;i++){await db.query('insert into auth.users(id) values($1)',[ids[i]]);await db.query('insert into public.users values($1)',[ids[i]]);await db.query('insert into quantum_private.community_member_profiles values($1,$2,$3,$4)',[ids[i],'pnu_self_selected',i===11?'다른학과':'미래에너지공학과',i%2?'female':'male'])}
  for(const file of ['20260909170157_mentoring_role_matching.sql','20260910034819_group_mentoring_consent.sql'])await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'))
  const act=async(user,action='status',args={})=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);await db.exec('set role authenticated');try{const result=(await db.query('select public.mentoring_group_action($1,$2::jsonb) v',[action,JSON.stringify(args)])).rows[0].v;assert.ok(parseGroupMentoringSnapshot(result),JSON.stringify(result));return result}finally{await db.exec('reset role')}}
  const friend=async(a,b)=>db.query('insert into quantum_private.test_friends values($1,$2)',[a,b])
  return {db,act,friend}
}
async function group(act,n=2){for(let i=0;i<n*2;i++)await act(ids[i],'join',join(i<n?'mentor':'mentee',n));return act(ids[0])}
async function acceptAll(act,sid,n=2){for(let i=0;i<n*2;i++)await act(ids[i],'accept',{session_id:sid});return act(ids[0])}

test('a long queue in one role cannot hide the opposite role from exact group composition',async()=>{
 const {db,act}=await fixture();try{
  for(let i=1;i<=25;i++){
   const user=`43000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
   await db.query('insert into auth.users(id) values($1)',[user]);await db.query('insert into public.users values($1)',[user]);
   await db.query('insert into quantum_private.community_member_profiles values($1,$2,$3,$4)',[user,'pnu_self_selected','미래에너지공학과','male']);
   assert.equal((await act(user,'join',join('mentor'))).phase,'waiting');
  }
  assert.equal((await act(ids[0],'join',join('mentee'))).phase,'waiting');
  const offered=await act(ids[1],'join',join('mentee'));assert.equal(offered.phase,'offered');assert.equal(offered.member_count,4);
  assert.equal((await act(ids[0])).session_id,offered.session_id);
 }finally{await db.close()}
})

test('candidate bounds preserve party sizes needed to complete a 3+3 group',async()=>{
 const {db,act}=await fixture();try{
  let sequence=0,owner;
  for(const [role,amount] of [['mentor',3],...Array.from({length:13},()=>['mentee',2]),['mentee',1]]){
   const partyId=crypto.randomUUID();const people=[];
   for(let i=0;i<amount;i++){
    const user=`44000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`;people.push(user);
    await db.query('insert into auth.users(id) values($1)',[user]);await db.query('insert into public.users values($1)',[user]);
    await db.query('insert into quantum_private.community_member_profiles values($1,$2,$3,$4)',[user,'pnu_self_selected','미래에너지공학과','male']);
   }
   if(role==='mentor')owner=people[0];
   await db.query(`insert into quantum_private.group_mentoring_parties(id,owner_id,role,side_size,school_key,department_key,status,client_id,request_args,expires_at)
    select $1,$2,$3,3,i.school_scope_key,i.department_key,'waiting',$4,'{}',now()+interval '30 minutes' from quantum_private.get_member_department_identity($2) i`,[partyId,people[0],role,crypto.randomUUID()]);
   for(const user of people){await db.query('insert into quantum_private.group_mentoring_party_members values($1,$2,true,true)',[partyId,user]);if(user!==people[0])await db.query('insert into quantum_private.test_friends values($1,$2)',[people[0],user])}
  }
  const offered=await act(owner);assert.equal(offered.phase,'offered');assert.equal(offered.member_count,6);
 }finally{await db.close()}
})

test('group mentoring requires exact 2+2 / 3+3 and every member acceptance before private chat',async()=>{
 const {db,act}=await fixture();try{
  await act(ids[0],'join',join());assert.equal((await act(ids[1],'join',join('mentee'))).phase,'waiting','no 1:1 fallback');await act(ids[1],'cancel');
  await act(ids[2],'join',join('mentor'));await act(ids[3],'join',join('mentee'));const offered=await act(ids[1],'join',join('mentee'));
  assert.equal(offered.phase,'offered');assert.equal(offered.member_count,4);assert.deepEqual(offered.members,[]);assert.deepEqual(offered.messages,[]);
  await assert.rejects(act(ids[0],'message',{session_id:offered.session_id,text:'too soon',client_id:crypto.randomUUID()}),/not_active/);
  for(const user of ids.slice(0,3))assert.equal((await act(user,'accept',{session_id:offered.session_id})).phase,'offered');
  const active=await act(ids[3],'accept',{session_id:offered.session_id});assert.equal(active.phase,'active');assert.equal(active.members.length,4);
  await assert.rejects(act(ids[4],'accept',{session_id:offered.session_id}),/forbidden/);
  await act(ids[0],'end',{session_id:offered.session_id});for(const user of ids.slice(0,4)){assert.equal((await act(user)).phase,'ended');await act(user,'cancel')}
  const six=await group(act,3);assert.equal(six.member_count,6);assert.equal((await acceptAll(act,six.session_id,3)).members.length,6);
 }finally{await db.close()}
})
test('friends opt in separately, stay in their role as an atomic party, and may decline without silent queueing',async()=>{
 const {db,act,friend}=await fixture();try{
  await friend(ids[0],ids[1]);const args=join('mentor',2,[ids[1]]);const party=await act(ids[0],'join',args);
  assert.equal(party.phase,'friends');assert.equal(party.party_accepted,1);assert.equal((await act(ids[1])).phase,'idle');assert.equal((await act(ids[1])).invitations.length,1);
  await act(ids[2],'join',join('mentee'));await act(ids[3],'join',join('mentee'));assert.equal((await act(ids[2])).phase,'waiting');
  const offered=await act(ids[1],'party_accept',{party_id:party.party_id});assert.equal(offered.phase,'offered');assert.equal((await act(ids[0])).session_id,offered.session_id);
  assert.equal((await db.query('select count(distinct party_id)::int n from quantum_private.group_mentoring_members where session_id=$1 and role=\'mentor\'',[offered.session_id])).rows[0].n,1);
  await act(ids[0],'decline',{session_id:offered.session_id});assert.equal((await act(ids[1])).phase,'ended');
  await friend(ids[4],ids[5]);const second=await act(ids[4],'join',join('mentee',3,[ids[5]]));await act(ids[5],'party_decline',{party_id:second.party_id});assert.equal((await act(ids[4])).phase,'idle');
  assert.equal((await act(ids[0],'join',args)).phase,'ended','replayed join never creates fresh membership');
 }finally{await db.close()}
})
test('duplicate waits, forged actors, unavailable friends, outside scope and pending friend concurrency fail closed',async()=>{
 const {db,act,friend}=await fixture();try{
  const args=join();const first=await act(ids[0],'join',args);assert.equal((await act(ids[0],'join',args)).party_id,first.party_id);
  await assert.rejects(act(ids[0],'join',join('mentee')),/already_waiting/);await assert.rejects(act(ids[2],'join',{...join(),user_id:ids[3]}),/invalid/);
  await assert.rejects(act(ids[2],'join',join('mentor',2,[ids[3]])),/friend_unavailable/);await friend(ids[2],ids[11]);await assert.rejects(act(ids[2],'join',join('mentor',2,[ids[11]])),/friend_unavailable/);
  await friend(ids[2],ids[4]);await friend(ids[3],ids[4]);const a=await act(ids[2],'join',join('mentor',2,[ids[4]]));const b=await act(ids[3],'join',join('mentor',2,[ids[4]]));
  await act(ids[4],'party_accept',{party_id:a.party_id});await assert.rejects(act(ids[4],'party_accept',{party_id:b.party_id}),/already_waiting/);
  assert.equal((await db.query('select count(*)::int n from quantum_private.group_mentoring_party_members where user_id=$1 and active',[ids[4]])).rows[0].n,1);
  assert.equal((await act(ids[11],'join',join('mentee'))).phase,'waiting');
 }finally{await db.close()}
})
test('blocking, missing member, cancelled party and offer expiry never produce a partial or automatically renewed group',async()=>{
 const {db,act}=await fixture();try{
  const offered=await group(act);await db.query("update quantum_private.group_mentoring_sessions set expires_at=now()-interval '1 second' where id=$1",[offered.session_id]);assert.equal((await act(ids[0])).phase,'expired');
  for(const user of ids.slice(0,4))await act(user,'cancel');const next=await group(act);await acceptAll(act,next.session_id);
  await db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[0],ids[3]]);const closed=await act(ids[1]);assert.equal(closed.phase,'ended');assert.deepEqual(closed.members,[]);assert.deepEqual(closed.messages,[]);
  assert.equal((await db.query('select count(*)::int n from quantum_private.group_mentoring_party_members where active')).rows[0].n,0);
 }finally{await db.close()}
})
test('idempotent messages, revisioned meeting proposals and targeted private reports operate only inside the accepted group',async()=>{
 const {db,act}=await fixture();try{
  const offer=await group(act);const active=await acceptAll(act,offer.session_id);const command={session_id:offer.session_id,text:'도서관에서 이야기해요',client_id:crypto.randomUUID()};
  await act(ids[0],'message',command);assert.equal((await act(ids[0],'message',command)).messages.length,1);await assert.rejects(act(ids[0],'message',{...command,text:'different'}),/conflict/);
  await assert.rejects(act(ids[5],'message',command),/forbidden/);
  const plan={session_id:offer.session_id,starts_at:new Date(Date.now()+86400000).toISOString(),place:'학생회관 공개 라운지',revision:0};
  const planned=await act(ids[0],'plan',plan);assert.equal(planned.meeting.revision,1);await assert.rejects(act(ids[1],'plan',plan),/conflict/);
  const target=active.members.find(m=>!m.mine);const report={session_id:offer.session_id,member_id:target.id,reason:'부적절한 행동'};
  await assert.rejects(act(ids[0],'report',{...report,member_id:active.members.find(m=>m.mine).id}),/forbidden/);
  const ended=await act(ids[0],'end',{session_id:offer.session_id});assert.equal(ended.report_targets.length,3);assert.deepEqual(ended.members,[]);assert.deepEqual(ended.messages,[]);
  await db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[0],ids[1]]);
  assert.equal((await act(ids[0],'report',report)).phase,'ended');assert.equal(JSON.stringify(await act(ids[1])).includes(report.reason),false);
  assert.equal((await db.query('select count(*)::int n from quantum_private.group_mentoring_reports')).rows[0].n,1);
 }finally{await db.close()}
})
test('anonymous/direct table access denied; old topic intake retired with history preserved',async()=>{
 const {db,act}=await fixture();try{
  await assert.rejects(act(null),/not_authenticated/);await db.exec('set role authenticated');
  await assert.rejects(db.exec('select * from quantum_private.group_mentoring_messages'),/permission denied/);
  await assert.rejects(db.exec("select quantum_private.group_mentoring_action('status','{}')"),/permission denied/);
  await assert.rejects(db.exec("select public.mentoring_action('join','{}')"),/group_required/);
  await db.exec('reset role;set role anon');await assert.rejects(db.exec("select public.mentoring_group_action('status','{}')"),/permission denied/);await db.exec('reset role');
  assert.equal((await db.query("select to_regclass('quantum_private.mentoring_sessions') is not null ok")).rows[0].ok,true);
 }finally{await db.close()}
})
test('queued simultaneous join callers cannot claim a person twice; pre-existing blocks exclude the whole candidate group',async()=>{
 const {db,act}=await fixture();try{
  const enter=(user,role)=>db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);await tx.exec('set local role authenticated');return(await tx.query("select public.mentoring_group_action('join',$1::jsonb) v",[JSON.stringify(join(role))])).rows[0].v})
  // PGlite serializes its connection: caller overlap is tested here; independent
  // PostgreSQL connections and actual advisory-lock contention remain separate.
  const results=await Promise.all([enter(ids[0],'mentor'),enter(ids[1],'mentor'),enter(ids[2],'mentee'),enter(ids[3],'mentee'),enter(ids[4],'mentee')]);
  assert.equal(results.filter(r=>r.phase==='offered').length,1);assert.equal((await db.query('select count(*)::int n from quantum_private.group_mentoring_sessions')).rows[0].n,1);
  assert.equal((await db.query('select count(distinct user_id)::int n from quantum_private.group_mentoring_members')).rows[0].n,4);
  for(const user of ids.slice(0,5))await act(user,'cancel');await db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[0],ids[2]]);
  for(let i=0;i<4;i++)assert.equal((await act(ids[i],'join',join(i<2?'mentor':'mentee'))).phase,'waiting');
  assert.equal((await db.query("select count(*)::int n from quantum_private.group_mentoring_sessions where status='offered'")).rows[0].n,0);
 }finally{await db.close()}
})
test('removing an account is not blocked by historical party membership and closes the remaining group',async()=>{
 const {db,act}=await fixture();try{
  const offered=await group(act);await acceptAll(act,offered.session_id);
  await db.query('delete from public.users where id=$1',[ids[0]]);
  const after=await act(ids[1]);assert.equal(after.phase,'ended');assert.deepEqual(after.members,[]);assert.deepEqual(after.messages,[]);
  assert.equal((await db.query('select count(*)::int n from quantum_private.group_mentoring_party_members where active')).rows[0].n,0);
 }finally{await db.close()}
})

test('status rechecks block visibility at the final snapshot pair-lock boundary',async()=>{
 const {db,act}=await fixture();try{
  const offered=await group(act);await acceptAll(act,offered.session_id);
  // Inject a newly committed block at the lock boundary, after the first
  // cleanup pass. This tests revalidation, not real connection contention.
  await db.exec(`create or replace function quantum_private.group_mentoring_lock_pairs(p_users uuid[]) returns void
    language plpgsql security definer set search_path='' as $$begin
      insert into quantum_private.test_blocks values('${ids[0]}','${ids[3]}');
    end $$;`);
  const closed=await act(ids[0]);assert.equal(closed.phase,'ended');assert.deepEqual(closed.members,[]);assert.deepEqual(closed.messages,[]);
  assert.equal((await db.query('select count(*)::int n from quantum_private.group_mentoring_party_members where active')).rows[0].n,0);
 }finally{await db.close()}
})

for(const source of ['group','legacy'])test(`${source} reports exclude only the actual pair from future groups without leaking reports or globally banning either person`,async()=>{
 const {db,act}=await fixture();try{
  if(source==='group'){
   const offer=await group(act);const active=await acceptAll(act,offer.session_id);
   const target=(await db.query('select id from quantum_private.group_mentoring_members where session_id=$1 and user_id=$2',[offer.session_id,ids[2]])).rows[0].id;
   await assert.rejects(act(ids[5],'report',{session_id:offer.session_id,member_id:target,reason:'private report boundary'}),/forbidden/);
   await act(ids[0],'report',{session_id:offer.session_id,member_id:target,reason:'private report boundary'});
  }else{
   const old=(await db.query(`insert into quantum_private.mentoring_sessions(mentor_id,mentee_id,school_key,department_key,topic,status,mentor_accepted,mentee_accepted,mentor_alias,mentee_alias,expires_at)
    select $1,$2,i.school_scope_key,i.department_key,'courses','ended',true,true,'old mentor','old mentee',now()+interval '1 day' from quantum_private.get_member_department_identity($1) i returning id`,[ids[0],ids[2]])).rows[0].id;
   await db.query('insert into quantum_private.mentoring_reports(session_id,reporter_id,reported_id,reason) values($1,$2,$3,$4)',[old,ids[0],ids[2],'private report boundary']);
  }
  for(let i=0;i<4;i++)assert.equal((await act(ids[i],'join',join(i<2?'mentor':'mentee'))).phase,'waiting');
  const other=await act(ids[4],'join',join('mentee'));assert.equal(other.phase,'offered','reporter may still match with other people');
  const matched=(await db.query('select user_id from quantum_private.group_mentoring_members where session_id=$1',[other.session_id])).rows.map(r=>r.user_id);
  assert.ok(matched.includes(ids[0]));assert.equal(matched.includes(ids[2]),false);
  assert.equal(JSON.stringify(await act(ids[4])).includes('private report boundary'),false);
  await db.exec('set role authenticated');
  await assert.rejects(db.exec('select * from quantum_private.group_mentoring_reports'),/permission denied/);
  await assert.rejects(db.exec('select * from quantum_private.mentoring_reports'),/permission denied/);
  await assert.rejects(db.query('select quantum_private.group_mentoring_pair_excluded($1,$2)',[ids[0],ids[2]]),/permission denied/);
  await db.exec('reset role');
  for(const user of [ids[0],ids[1],ids[3],ids[4]])await act(user,'cancel');
  await act(ids[5],'join',join('mentor'));await act(ids[6],'join',join('mentor'));const forReported=await act(ids[7],'join',join('mentee'));
  assert.equal(forReported.phase,'offered');assert.equal((await act(ids[2])).session_id,forReported.session_id,'reported person is not globally banned');
 }finally{await db.close()}
})
