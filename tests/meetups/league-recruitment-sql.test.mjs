import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {registerHooks} from 'node:module'
import {fixture,ids} from './challenge-league-fixture.mjs'
registerHooks({resolve(specifier,context,next){return next(specifier==='./challenge-journey'?'./challenge-journey.ts':specifier,context)}})
const {parseLeagueRecruitmentBrowse,parseLeagueRecruitmentDetail,parseLeagueRecruitmentNotices}=await import('../../lib/meetups/league-recruitment.ts')
const migration=new URL('../../supabase/migrations/20260910120701_department_league_recruitment.sql',import.meta.url)
const sql=name=>new URL(`../../supabase/migrations/${name}.sql`,import.meta.url)
async function setup({apply=true}={}){
 const f=await fixture([sql('20260910035348_department_league_position_journey')]),{db}=f
 try{
  await db.exec(`alter table quantum_private.community_member_profiles add column display_name text default '별친구',add column friend_recognition_name text;
   create table public.friend_requests(id uuid primary key,sender_user_id uuid,receiver_user_id uuid,status text);
   create table public.friendships(user_id uuid,friend_user_id uuid,status text,created_from_request_id uuid);
   create function quantum_private.resolve_chat_poll_room(text,uuid,uuid,boolean)returns uuid language sql as $$select $2$$;`)
  const friends=await readFile(sql('20260907085612_friend_scene'),'utf8'),pair=friends.slice(friends.indexOf('create or replace function quantum_private.is_active_accepted_friend_pair('))
  await db.exec(pair.slice(0,pair.indexOf('$$;')+3));await db.exec(friends.slice(friends.indexOf('create unique index department_challenge_friend_invites_pending_idx'),friends.indexOf('comment on function public.get_my_friend_scene_summaries')))
  const notifications=await readFile(sql('20260522000009_z39_notifications_system'),'utf8')
  await db.exec(notifications.slice(notifications.indexOf('CREATE TABLE IF NOT EXISTS notifications ('),notifications.indexOf('CREATE INDEX IF NOT EXISTS idx_notifications_user')))
  await db.exec(await readFile(sql('20260910095144_department_league_manual_lobby'),'utf8'))
  await db.exec(await readFile(sql('20260910102511_department_league_position_invites'),'utf8'))
  if(apply)await db.exec(await readFile(migration,'utf8'))
  const revision=async id=>(await db.query('select revision from public.department_challenges where id=$1',[id])).rows[0].revision
  const journey=(user,action,args)=>f.rpc(user,'department_league_journey',[action,JSON.stringify(args)])
  const raw=(user,action,args)=>f.rpc(user,'department_league_recruitment',[action,JSON.stringify(args)])
  const create=(name='우리 학과 팀',user=ids[0],sport='lol')=>journey(user,'create',{sport,title:name,slot:sport==='lol'?'mid':'gk',tier:sport==='lol'?'gold':'intermediate',idempotency_key:crypto.randomUUID()})
  const browse=async(user=ids[1],sport='lol',cursor=null)=>{const state=await raw(user,'browse',{sport,cursor});assert.ok(parseLeagueRecruitmentBrowse(state));return state}
  const detail=async(c,user=ids[1],sport='lol')=>{const state=await raw(user,'detail',{sport,challenge_id:c.challenge_id});assert.ok(parseLeagueRecruitmentDetail(state));return state}
  const notices=async(user=ids[1],sport='lol',cursor=null)=>{const state=await raw(user,'notices',{sport,cursor});assert.ok(parseLeagueRecruitmentNotices(state));return state}
  const command=async(c,action,args={},user=ids[0],sport='lol',key=crypto.randomUUID())=>raw(user,action,{sport,team_id:c.team_id,...args,expected_revision:await revision(c.challenge_id),idempotency_key:key})
  const publish=(c,user=ids[0],sport='lol')=>command(c,'publish',{preferred_at:new Date(Date.now()+86400000).toISOString(),summary:'내일 저녁 같이 뛰어요'},user,sport)
  const join=async(c,user,slot,sport='lol')=>journey(user,'join',{sport,challenge_id:c.challenge_id,team_id:c.team_id,slot,tier:sport==='lol'?'gold':'intermediate',expected_revision:await revision(c.challenge_id),idempotency_key:crypto.randomUUID()})
  const approve=async(c,roster,captain=ids[0])=>f.rpc(captain,'accept_department_challenge_roster_request',[c.challenge_id,roster,await revision(c.challenge_id),crypto.randomUUID()])
  async function friend(a,b){const request=crypto.randomUUID();await db.query("insert into public.friend_requests values($1,$2,$3,'accepted')",[request,a,b]);await db.query("insert into public.friendships values($1,$2,'active',$3)",[a<b?a:b,a<b?b:a,request])}
  const invite=async(c,user,slot)=>f.rpc(ids[0],'department_league_invites',['invite',JSON.stringify({sport:'lol',challenge_id:c.challenge_id,team_id:c.team_id,friend_user_id:user,slot,expected_revision:await revision(c.challenge_id),idempotency_key:crypto.randomUUID()})])
  return {...f,revision,journey,raw,create,browse,detail,notices,command,publish,join,approve,friend,invite}
 }catch(error){await db.close();throw error}
}

test('two-character team names are stored separately and appear in journey and recruitment projections',async()=>{
 const f=await setup();try{
  const c=await f.create('A팀')
  assert.equal((await f.db.query('select team_name from public.department_challenge_teams where id=$1',[c.team_id])).rows[0].team_name,'A팀')
  assert.equal((await f.detail(c)).challenge.teams[0].team_name,'A팀')
  assert.equal((await f.browse()).teams[0].team_name,'A팀')
  assert.equal((await f.journey(ids[0],'overview',{sport:'lol'})).challenges[0].teams[0].team_name,'A팀')
  await assert.rejects(f.create('A'),/invalid_challenge_input/)
  await assert.rejects(f.create('A\u0001팀'),/invalid_challenge_input/)
 }finally{await f.db.close()}
})

test('forward backfill restores the original names of already paired teams',async()=>{
 const f=await setup({apply:false});try{
  const a=await f.team(0),b=await f.team(5)
  for(const t of[a,b])await f.act(t.actor,'queue',{team_id:t.team,waiting:true,gap:200})
  await f.act(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team});await f.act(b.actor,'accept',{team_id:b.team,opponent_team_id:a.team})
  await f.db.exec(await readFile(migration,'utf8'))
  const names=(await f.db.query('select id,team_name from public.department_challenge_teams where id=any($1::uuid[])',[[a.team,b.team]])).rows
  assert.equal(names.find(t=>t.id===a.team).team_name,'우리 팀 0');assert.equal(names.find(t=>t.id===b.team).team_name,'우리 팀 5')
 }finally{await f.db.close()}
})
test('legacy invisible prefix and whitespace are normalized before validating backfilled team names',async()=>{
 const f=await setup({apply:false});try{
  const created=await f.rpc(ids[0],'create_department_challenge',['gaming','\u200b A팀','',5,crypto.randomUUID()])
  await f.db.exec(await readFile(migration,'utf8'))
  assert.equal((await f.db.query('select team_name from public.department_challenge_teams where id=$1',[created.teams[0].id])).rows[0].team_name,'A팀')
  assert.equal((await f.browse()).teams[0].title,'A팀');assert.equal((await f.detail({challenge_id:created.id})).challenge.title,'A팀')
  assert.equal((await f.db.query('select title from public.department_challenges where id=$1',[created.id])).rows[0].title,'\u200b A팀','original title history is not rewritten')
 }finally{await f.db.close()}
})

test('notice pagination stays scoped, captain transfer closes authorship and cancellation cannot republish',async()=>{
 const f=await setup();try{
  const own=[];for(let n=0;n<21;n++){const c=await f.create(`학과 모집 ${n}`);own.push(c);await f.publish(c)}
  const outsider=await f.create('외부 모집',ids[5]);const external=await f.publish(outsider,ids[5])
  const first=await f.notices(),second=await f.notices(ids[1],'lol',first.next_cursor)
  assert.equal(first.total_count,21);assert.equal(first.notices.length,20);assert.equal(second.notices.length,1);assert.equal(second.next_cursor,null)
  await assert.rejects(f.notices(ids[1],'lol',external.notice.id),/invalid_cursor/)
  const c=own[0],member=await f.join(c,ids[1],'top');await f.approve(c,member.roster_id)
  const transfer=await f.rpc(ids[0],'department_league_lobby',['transfer_propose',JSON.stringify({team_id:c.team_id,recipient_roster_id:member.roster_id,expected_revision:await f.revision(c.challenge_id),idempotency_key:crypto.randomUUID()})])
  await f.rpc(ids[1],'department_league_lobby',['transfer_respond',JSON.stringify({transfer_id:transfer.transfer_id,accept:true,idempotency_key:crypto.randomUUID()})])
  assert.equal((await f.detail(c,ids[1])).notice.status,'closed');await assert.rejects(f.publish(c),/captain_required/)
  await f.publish(c,ids[1]);assert.equal((await f.detail(c,ids[1])).notice.status,'open')
  await f.db.query("update public.department_challenges set status='cancelled'where id=$1",[c.challenge_id])
  await assert.rejects(f.publish(c,ids[1]),/closed/);assert.equal((await f.notices()).notices.find(n=>n.team_id===c.team_id).status,'closed')
  await assert.rejects(f.detail(c),/not_found/)
 }finally{await f.db.close()}
})

test('last-slot invited acceptance and existing request approval serialize safely in either order',async()=>{
 const f=await setup();try{
  await f.db.query("update quantum_private.community_member_profiles set department='기계공학과'where user_id=$1",[ids[10]])
  await f.friend(ids[0],ids[1])
  for(const invitedFirst of[true,false]){
   const c=await f.create('마지막 빈자리'),requested=await f.join(c,ids[2],'top');await f.publish(c)
   for(const[user,slot]of[[ids[10],'jungle'],[ids[3],'adc'],[ids[4],'support']])await f.approve(c,(await f.join(c,user,slot)).roster_id)
   const invitation=await f.invite(c,ids[1],'top'),revision=await f.revision(c.challenge_id)
   const accept=()=>f.rpc(ids[1],'department_league_invites',['accept',JSON.stringify({sport:'lol',invite_id:invitation.id,tier:'gold',expected_revision:revision,idempotency_key:crypto.randomUUID()})])
   const approve=()=>f.rpc(ids[0],'accept_department_challenge_roster_request',[c.challenge_id,requested.roster_id,revision,crypto.randomUUID()])
   if(invitedFirst){await accept();await assert.rejects(approve(),/stale|full|occupied/)}else{await approve();await assert.rejects(accept(),/stale|pending|occupied/)}
   const slot=(await f.db.query("select count(*)::int n from public.department_challenge_roster r join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.team_id=$1 and r.status='accepted'and p.slot_key='top'",[c.team_id])).rows[0]
   assert.equal(slot.n,1);assert.equal((await f.detail(c,ids[0])).notice.status,'filled')
  }
 }finally{await f.db.close()}
})

test('expired reservations release slots without leaking identities or reopening manually closed notices',async()=>{
 const f=await setup();try{
  const c=await f.create();await f.publish(c);await f.friend(ids[0],ids[1]);const invite=await f.invite(c,ids[1],'top')
  assert.ok((await f.detail(c,ids[2])).reserved_slots.includes('top'))
  await f.db.query("update public.department_challenge_friend_invites set created_at=now()-interval '8 days',expires_at=now()-interval '1 second'where id=$1",[invite.id])
  const detail=await f.detail(c,ids[2]);assert.ok(detail.empty_slots.includes('top'));assert.deepEqual(detail.reserved_slots,[])
  await f.command(c,'close');await f.join(c,ids[2],'top')
  assert.equal((await f.detail(c,ids[2])).notice.status,'closed')
  assert.ok(ids.every(id=>!JSON.stringify(detail).includes(id)))
 }finally{await f.db.close()}
})

test('department and exact sport filter precede pagination and detail resolves a team outside school overview 50',async()=>{
 const f=await setup();try{
  const own=[];for(let n=0;n<23;n++)own.push(await f.create(`우리과 ${n} 팀`))
  const first=own[0]
  const foreign=[];for(let n=0;n<55;n++)foreign.push(await f.create(`다른과 ${n} 팀`,ids[5]))
  await f.create('우리과 풋살',ids[0],'futsal');await f.create('우리과 축구',ids[0],'football')
  assert.ok(!(await f.journey(ids[1],'overview',{sport:'lol'})).challenges.some(c=>c.id===first.challenge_id))
  const page1=await f.browse(),page2=await f.browse(ids[1],'lol',page1.next_cursor)
  assert.equal(page1.total_count,23);assert.equal(page1.teams.length,20);assert.equal(page2.teams.length,3);assert.equal(page2.next_cursor,null)
  assert.equal(new Set([...page1.teams,...page2.teams].map(t=>t.team_id)).size,23)
  assert.equal((await f.browse(ids[1],'futsal')).total_count,1);assert.equal((await f.browse(ids[1],'football')).total_count,1)
  await assert.rejects(f.browse(ids[1],'lol',foreign[0].team_id),/invalid_cursor/)
  await assert.rejects(f.detail(foreign[0]),/not_found/)
  assert.equal((await f.detail(first)).challenge.id,first.challenge_id)
  assert.ok(ids.every(id=>!JSON.stringify(page1).includes(id)))
 }finally{await f.db.close()}
})

test('an outside-overview voluntary request needs captain approval and supports self cancellation and requested-only rejection',async()=>{
 const f=await setup();try{
  const c=await f.create('신청 팀'),first=await f.join(c,ids[1],'top')
  assert.equal((await f.detail(c)).challenge.teams[0].players.find(p=>p.is_me).status,'requested')
  assert.equal((await f.browse()).teams[0].accepted_count,1)
  await f.approve(c,first.roster_id)
  assert.equal((await f.browse()).teams[0].accepted_count,2)
  const second=await f.join(c,ids[2],'jungle')
  await assert.rejects(f.command(c,'reject',{roster_id:second.roster_id},ids[1]),/captain_required/)
  await f.command(c,'reject',{roster_id:second.roster_id})
  assert.equal((await f.db.query('select status from public.department_challenge_roster where id=$1',[second.roster_id])).rows[0].status,'declined')
  await assert.rejects(f.command(c,'reject',{roster_id:first.roster_id}),/not_pending/)
  const third=await f.join(c,ids[3],'adc')
  await f.rpc(ids[3],'leave_my_department_challenge_roster',[c.challenge_id,c.team_id,await f.revision(c.challenge_id),crypto.randomUUID()])
  assert.equal((await f.db.query('select status from public.department_challenge_roster where id=$1',[third.roster_id])).rows[0].status,'left')
  assert.equal((await f.detail(c,ids[4])).challenge.teams[0].players.length,2,'other applicants are private')
 }finally{await f.db.close()}
})

test('a captain publishes or updates one notice with revision and idempotency and can close it',async()=>{
 const f=await setup();try{
  const c=await f.create(),args={sport:'lol',team_id:c.team_id,preferred_at:new Date(Date.now()+86400000).toISOString(),summary:'내일 저녁 함께해요',expected_revision:await f.revision(c.challenge_id),idempotency_key:crypto.randomUUID()}
  const first=await f.raw(ids[0],'publish',args)
  assert.equal(first.notice.status,'open');assert.equal((await f.raw(ids[0],'publish',args)).replayed,true)
  await assert.rejects(f.raw(ids[0],'publish',{...args,summary:'다른 내용으로 덮어쓰기'}),/idempotency_key_reused/)
  await assert.rejects(f.raw(ids[0],'publish',{...args,idempotency_key:crypto.randomUUID()}),/stale_revision/)
  await assert.rejects(f.publish(c,ids[1]),/captain_required/)
  const updated=await f.publish(c);assert.equal(updated.notice.id,first.notice.id)
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.challenge_recruitment_notices')).rows[0].n,1)
  assert.equal((await f.notices()).notices[0].team_name,c.team_name??'우리 학과 팀')
  await f.command(c,'close');assert.equal((await f.notices()).notices[0].status,'closed')
  await f.publish(c)
  await f.db.query("update quantum_private.challenge_recruitment_notices set preferred_at=now()-interval '1 minute' where team_id=$1",[c.team_id])
  assert.equal((await f.notices()).notices[0].status,'expired')
 }finally{await f.db.close()}
})

test('reserved invitation slots are unavailable for new voluntary requests and fullness closes notices without inflating roster counts',async()=>{
 const f=await setup();try{
  const c=await f.create();await f.publish(c);await f.friend(ids[0],ids[1]);await f.invite(c,ids[1],'top')
  const team=(await f.browse()).teams[0]
  assert.equal(team.accepted_count,1);assert.ok(team.reserved_slots.includes('top'));assert.ok(!team.empty_slots.includes('top'))
  await assert.rejects(f.join(c,ids[2],'top'),/slot_reserved_conflict/)
  for(const [user,slot]of [[ids[2],'jungle'],[ids[3],'adc'],[ids[4],'support']])await f.approve(c,(await f.join(c,user,slot)).roster_id)
  const pending=(await f.rpc(ids[1],'department_league_invites',['overview',JSON.stringify({sport:'lol',challenge_id:null})])).incoming[0]
  assert.equal((await f.notices()).notices[0].status,'filled');assert.equal((await f.notices()).notices[0].accepted_count,4)
  await f.rpc(ids[1],'department_league_invites',['accept',JSON.stringify({sport:'lol',invite_id:pending.id,tier:'silver',expected_revision:pending.revision,idempotency_key:crypto.randomUUID()})])
  await f.rpc(ids[1],'leave_my_department_challenge_roster',[c.challenge_id,c.team_id,await f.revision(c.challenge_id),crypto.randomUUID()])
  assert.equal((await f.notices()).notices[0].status,'filled','a fulfilled notice does not silently reopen after someone leaves')
  await f.publish(c);assert.equal((await f.notices()).notices[0].status,'open')
 }finally{await f.db.close()}
})

test('current school, department, account access and blocks gate reads and captain mutations',async()=>{
 const f=await setup();try{
  const c=await f.create();await f.publish(c)
  await assert.rejects(f.raw(ids[0],'browse',{sport:'lol',cursor:null,school_scope_key:'other'}),/invalid_recruitment_action/)
  await assert.rejects(f.raw(ids[5],'publish',{sport:'lol',team_id:c.team_id,preferred_at:new Date(Date.now()+86400000).toISOString(),summary:'외부 학과 변경',expected_revision:await f.revision(c.challenge_id),idempotency_key:crypto.randomUUID()}),/not_found|captain_required/)
  await f.db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[0],ids[1]])
  assert.equal((await f.browse()).teams.length,0);assert.equal((await f.notices()).notices.length,0);await assert.rejects(f.detail(c),/not_found/)
  await f.db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[ids[2]])
  await assert.rejects(f.browse(ids[2]),/forbidden/)
  await f.db.query('update auth.users set deleted_at=now() where id=$1',[ids[0]])
  assert.equal((await f.browse(ids[3])).teams.length,0);assert.equal((await f.notices(ids[3])).notices.length,0)
  await assert.rejects(f.publish(c),/forbidden/)
  const permissions=(await f.db.query("select has_function_privilege('service_role','public.department_league_recruitment(text,jsonb)','execute') service,has_table_privilege('authenticated','quantum_private.challenge_recruitment_notices','select') direct")).rows[0]
  assert.deepEqual(permissions,{service:false,direct:false})
 }finally{await f.db.close()}
})

test('paired and completed matches retain both independent team names and close both recruitment notices',async()=>{
 const f=await setup();try{
  const a=await f.create('A팀'),b=await f.create('B팀',ids[5]);await f.publish(a);await f.publish(b,ids[5])
  for(const [team,offset]of [[a,0],[b,5]])for(const [index,slot]of ['top','jungle','adc','support'].entries())await f.approve(team,(await f.join(team,ids[offset+index+1],slot)).roster_id,ids[offset])
  for(const [team,actor]of [[a,ids[0]],[b,ids[5]]])await f.act(actor,'queue',{team_id:team.team_id,waiting:true,gap:200})
  const lobby=await f.rpc(ids[0],'department_league_lobby',['overview',JSON.stringify({sport:'lol',team_id:a.team_id,cursor:null})])
  assert.deepEqual(new Set(lobby.teams.map(t=>t.team_name)),new Set(['A팀','B팀']))
  await f.act(ids[0],'propose',{team_id:a.team_id,opponent_team_id:b.team_id});const pair=await f.act(ids[5],'accept',{team_id:b.team_id,opponent_team_id:a.team_id})
  assert.equal(pair.challenge_id,a.challenge_id)
  assert.deepEqual(new Set((await f.detail(a,ids[0])).challenge.teams.map(t=>t.team_name)),new Set(['A팀','B팀']))
  assert.equal((await f.notices(ids[0])).notices[0].status,'matched');assert.equal((await f.notices(ids[5])).notices[0].status,'matched')
  const aliases=(await f.db.query('select user_id,alias from quantum_private.challenge_match_chat_members where challenge_id=$1 order by user_id',[pair.challenge_id])).rows
  const starts=new Date(Date.now()+7200000).toISOString(),ends=new Date(Date.now()+10800000).toISOString()
  const first=await f.rpc(ids[0],'confirm_my_department_challenge_schedule',[pair.challenge_id,starts,ends,'교내 PC방',await f.revision(pair.challenge_id),crypto.randomUUID()])
  await f.rpc(ids[5],'confirm_my_department_challenge_schedule',[pair.challenge_id,starts,ends,'교내 PC방',first.revision,crypto.randomUUID()])
  await f.db.query("update public.department_challenges set scheduled_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=$1",[pair.challenge_id])
  const result=await f.rpc(ids[0],'confirm_my_department_challenge_result',[pair.challenge_id,2,1,await f.revision(pair.challenge_id),crypto.randomUUID()])
  await f.rpc(ids[5],'confirm_my_department_challenge_result',[pair.challenge_id,1,2,result.revision,crypto.randomUUID()])
  assert.deepEqual(new Set((await f.detail(a,ids[0])).challenge.teams.map(t=>t.team_name)),new Set(['A팀','B팀']))
  assert.deepEqual((await f.db.query('select user_id,alias from quantum_private.challenge_match_chat_members where challenge_id=$1 order by user_id',[pair.challenge_id])).rows,aliases)
 }finally{await f.db.close()}
})
