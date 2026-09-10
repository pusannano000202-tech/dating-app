import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {fixture,ids} from './challenge-league-fixture.mjs'
import {parseJourneyState} from '../../lib/meetups/challenge-journey.ts'
const sql=name=>new URL(`../../supabase/migrations/${name}.sql`,import.meta.url)
const migration=sql('20260910125457_department_league_application_intro')
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
  for(const name of['20260910095144_department_league_manual_lobby','20260910102511_department_league_position_invites','20260910120701_department_league_recruitment'])await db.exec(await readFile(sql(name),'utf8'))
  if(apply)await db.exec(await readFile(migration,'utf8'))
  const revision=async c=>(await db.query('select revision from public.department_challenges where id=$1',[c.challenge_id])).rows[0].revision
  const journey=(actor,action,args)=>f.rpc(actor,'department_league_journey',[action,JSON.stringify(args)])
  const create=(actor=ids[0],sport='lol')=>journey(actor,'create',{sport,title:'우리 지원 팀',slot:sport==='lol'?'mid':'gk',tier:sport==='lol'?'gold':'intermediate',idempotency_key:crypto.randomUUID()})
  const joinArgs=async(c,extra={},sport='lol')=>({sport,challenge_id:c.challenge_id,team_id:c.team_id,slot:sport==='lol'?'top':'st',tier:sport==='lol'?'silver':'intermediate',expected_revision:await revision(c),idempotency_key:crypto.randomUUID(),...extra})
  const overview=async(actor=ids[1],sport='lol')=>{const result=await journey(actor,'overview',{sport});assert.ok(parseJourneyState(result));return result}
  const detail=(c,actor=ids[1],sport='lol')=>f.rpc(actor,'department_league_recruitment',['detail',JSON.stringify({sport,challenge_id:c.challenge_id})])
  const approve=async(c,r,actor=ids[0])=>f.rpc(actor,'accept_department_challenge_roster_request',[c.challenge_id,r,await revision(c),crypto.randomUUID()])
  const leave=async(c,actor=ids[1])=>f.rpc(actor,'leave_my_department_challenge_roster',[c.challenge_id,c.team_id,await revision(c),crypto.randomUUID()])
  return {...f,revision,journey,create,joinArgs,overview,detail,approve,leave}
 }catch(error){await db.close();throw error}
}
const player=(state,teamId,rosterId)=>state.challenges.flatMap(c=>c.teams).find(t=>t.id===teamId)?.players.find(p=>p.id===rosterId)
test('a requested application stores the introduction atomically and exposes it only to its author and own captain',async()=>{
 const f=await setup();try{
  const c=await f.create(),intro={aspiration:'팀을 위해 끝까지 할게요',strengths:'침착한 콜과 운영'}
  const args=await f.joinArgs(c,intro),joined=await f.journey(ids[1],'join',args)
  assert.deepEqual(player(await f.overview(ids[1]),c.team_id,joined.roster_id).application_intro,intro)
  assert.deepEqual(player(await f.overview(ids[0]),c.team_id,joined.roster_id).application_intro,intro)
  assert.deepEqual((await f.detail(c,ids[0])).challenge.teams[0].players.find(p=>p.id===joined.roster_id).application_intro,intro)
  assert.ok(!JSON.stringify(await f.overview(ids[2])).includes(intro.aspiration));assert.ok(!JSON.stringify(await f.detail(c,ids[2])).includes(intro.strengths))
  const browse=await f.rpc(ids[0],'department_league_recruitment',['browse',JSON.stringify({sport:'lol',cursor:null})]);assert.ok(!JSON.stringify(browse).includes(intro.aspiration))
  await f.approve(c,joined.roster_id)
  assert.deepEqual(player(await f.overview(ids[1]),c.team_id,joined.roster_id).application_intro,intro)
  assert.ok(!Object.hasOwn(player(await f.overview(ids[2]),c.team_id,joined.roster_id),'application_intro'))
  assert.equal((await f.db.query("select count(*)::int n from public.notifications where payload::text like $1",['%'+intro.aspiration+'%'])).rows[0].n,0)
  assert.equal((await f.db.query("select count(*)::int n from public.department_challenge_events where result::text like $1",['%'+intro.aspiration+'%'])).rows[0].n,0)
 }finally{await f.db.close()}
})
test('optional introduction validation is identical at the SQL boundary and empty old-client payloads still work',async()=>{
 const f=await setup();try{
  const c=await f.create(),args=await f.joinArgs(c)
  for(const bad of[{aspiration:null},{strengths:3},{aspiration:[]},{aspiration:'😀'.repeat(81)},{strengths:'😀'.repeat(121)},{aspiration:'한\n줄'},{strengths:'줄\r바꿈'},{strengths:'강'.repeat(120)+'\n'},{aspiration:'숨\u202e김'},{strengths:'제어\u0085문자'},{aspiration:'안\u200b녕'},{application_intro:{aspiration:'위조'}}])await assert.rejects(f.journey(ids[1],'join',{...args,...bad}),/invalid_application_intro|invalid_journey/)
  assert.equal(await f.revision(c),args.expected_revision)
  const accepted=await f.journey(ids[1],'join',{...args,aspiration:'😀'.repeat(80),strengths:'⚽'.repeat(120)})
  assert.equal(Array.from(player(await f.overview(),c.team_id,accepted.roster_id).application_intro.aspiration).length,80)
  await f.leave(c)
  const empty=await f.journey(ids[1],'join',await f.joinArgs(c,{aspiration:'   ',strengths:''}))
  assert.equal(player(await f.overview(),c.team_id,empty.roster_id).application_intro??null,null)
  await f.leave(c)
  const multiline=await f.journey(ids[1],'join',await f.joinArgs(c,{strengths:'\n수비와 패스\n침착한 콜\n'}))
  assert.equal(player(await f.overview(),c.team_id,multiline.roster_id).application_intro.strengths,'수비와 패스\n침착한 콜')
 }finally{await f.db.close()}
})
test('same-key replay includes the introduction hash and cannot overwrite a later application or a cancelled request',async()=>{
 const f=await setup();try{
  const c=await f.create(),args=await f.joinArgs(c,{aspiration:'첫 포부',strengths:'패스'}),first=await f.journey(ids[1],'join',args)
  assert.deepEqual(await f.journey(ids[1],'join',args),first)
  await assert.rejects(f.journey(ids[1],'join',{...args,strengths:'다른 장점'}),/idempotency_key_reused/)
  await f.leave(c)
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.challenge_application_intros where roster_id=$1',[first.roster_id])).rows[0].n,0)
  const later=await f.journey(ids[1],'join',await f.joinArgs(c,{aspiration:'새 지원',strengths:'수비'}))
  await f.journey(ids[1],'join',args)
  assert.equal(player(await f.overview(),c.team_id,later.roster_id).application_intro.aspiration,'새 지원')
  await f.rpc(ids[0],'department_league_recruitment',['reject',JSON.stringify({sport:'lol',team_id:c.team_id,roster_id:later.roster_id,expected_revision:await f.revision(c),idempotency_key:crypto.randomUUID()})])
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.challenge_application_intros')).rows[0].n,0)
  assert.ok(!JSON.stringify(await f.overview(ids[0])).includes('새 지원'))
 }finally{await f.db.close()}
})
test('pre-migration old-client replays and whitespace normalization retain one request without manufacturing an introduction',async()=>{
 const f=await setup({apply:false});try{
  const c=await f.create(),args=await f.joinArgs(c),first=await f.journey(ids[1],'join',args)
  await f.db.exec(await readFile(migration,'utf8'))
  assert.deepEqual(await f.journey(ids[1],'join',{...args,aspiration:' ',strengths:''}),first)
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.challenge_application_intros')).rows[0].n,0)
  await f.leave(c)
  const nextArgs=await f.joinArgs(c,{aspiration:'\u00a0 새 각오 \u3000',strengths:'  패스  '}),next=await f.journey(ids[1],'join',nextArgs)
  assert.deepEqual(player(await f.overview(),c.team_id,next.roster_id).application_intro,{aspiration:'새 각오',strengths:'패스'})
  assert.deepEqual(await f.journey(ids[1],'join',{...nextArgs,aspiration:'새 각오',strengths:'패스'}),next)
 }finally{await f.db.close()}
})
test('captain handover grants the new captain access and revokes the previous captain without changing author consent',async()=>{
 const f=await setup();try{
  const c=await f.create(),applicant=await f.journey(ids[1],'join',await f.joinArgs(c,{aspiration:'지원자의 포부',strengths:'꾸준한 플레이'}))
  const captain=await f.journey(ids[2],'join',await f.joinArgs(c,{slot:'jungle'}));await f.approve(c,captain.roster_id)
  const transfer=await f.rpc(ids[0],'department_league_lobby',['transfer_propose',JSON.stringify({team_id:c.team_id,recipient_roster_id:captain.roster_id,expected_revision:await f.revision(c),idempotency_key:crypto.randomUUID()})])
  await f.rpc(ids[2],'department_league_lobby',['transfer_respond',JSON.stringify({transfer_id:transfer.transfer_id,accept:true,idempotency_key:crypto.randomUUID()})])
  assert.equal(player(await f.overview(ids[2]),c.team_id,applicant.roster_id).application_intro.aspiration,'지원자의 포부')
  assert.ok(!JSON.stringify(await f.overview(ids[0])).includes('지원자의 포부'))
  assert.equal(player(await f.overview(ids[1]),c.team_id,applicant.roster_id).application_intro.aspiration,'지원자의 포부')
  await f.approve(c,applicant.roster_id,ids[2])
  assert.ok(!Object.hasOwn(player(await f.overview(ids[0]),c.team_id,applicant.roster_id),'application_intro'))
 }finally{await f.db.close()}
})
test('blocks, deletion, sanctions and direct schema access cannot reveal private introductions',async()=>{
 const f=await setup();try{
  const c=await f.create(),applicant=await f.journey(ids[1],'join',await f.joinArgs(c,{aspiration:'민감한 지원 소개',strengths:'소통'}))
  await f.db.query("update quantum_private.community_member_profiles set department='전자공학과'where user_id=$1",[ids[1]])
  assert.ok(!JSON.stringify(await f.overview(ids[0])).includes('민감한 지원 소개'));assert.ok(!JSON.stringify(await f.overview(ids[1])).includes('민감한 지원 소개'))
  await f.db.query("update quantum_private.community_member_profiles set department='기계공학과'where user_id=$1",[ids[1]])
  await f.db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[0],ids[1]])
  assert.ok(!JSON.stringify(await f.overview(ids[0])).includes('민감한 지원 소개'))
  await f.db.exec('delete from quantum_private.test_blocks')
  await f.db.query('update auth.users set deleted_at=now()where id=$1',[ids[1]])
  assert.ok(!JSON.stringify(await f.overview(ids[0])).includes('민감한 지원 소개'));await assert.rejects(f.overview(ids[1]),/forbidden/)
  await f.db.query('update auth.users set deleted_at=null where id=$1',[ids[1]])
  const target=(await f.db.query("insert into quantum_private.challenge_match_players(challenge_id,team_id,user_id,alias,position,tier)values($1,$2,$3,'검증','top','gold')returning id",[c.challenge_id,c.team_id,ids[1]])).rows[0].id
  const report=(await f.db.query("insert into quantum_private.challenge_fair_reports(challenge_id,reporter_id,target_player_id,reason)values($1,$2,$3,'검증을 위한 신고 사유입니다.')returning id",[c.challenge_id,ids[0],target])).rows[0].id
  await f.db.query("insert into quantum_private.challenge_restrictions(user_id,report_id,duration_days,ends_at,reason,created_by)values($1,$2,14,now()+interval '14 days','검증을 위한 참가 제한입니다.',$3)",[ids[1],report,ids[0]])
  assert.ok(!JSON.stringify(await f.overview(ids[0])).includes('민감한 지원 소개'));assert.ok(!JSON.stringify(await f.overview(ids[1])).includes('민감한 지원 소개'))
  const acl=(await f.db.query("select has_table_privilege('authenticated','quantum_private.challenge_application_intros','select') direct,has_function_privilege('authenticated','quantum_private.challenge_application_intro_for(uuid,uuid)','execute') helper,has_function_privilege('authenticated','quantum_private.department_league_journey_pre_application_intro(text,jsonb)','execute') legacy,has_function_privilege('service_role','quantum_private.department_league_journey(text,jsonb)','execute') service")).rows[0]
  assert.deepEqual(acl,{direct:false,helper:false,legacy:false,service:false})
  await f.db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[2]])
  assert.equal((await f.db.query('select quantum_private.challenge_application_intro_for($1,$2)value',[applicant.roster_id,ids[0]])).rows[0].value,null,'even a privileged forged actor argument is not authority')
 }finally{await f.db.close()}
})
test('private introduction failure rolls back the roster, profile, revision and idempotency ledger atomically',async()=>{
 const f=await setup();try{
  const c=await f.create(),args=await f.joinArgs(c,{aspiration:'원자적 저장',strengths:'협업'})
  await f.db.exec("create function quantum_private.test_intro_failure()returns trigger language plpgsql as $$begin raise exception 'test_intro_failed';end$$;create trigger test_intro_failure before insert on quantum_private.challenge_application_intros for each row execute function quantum_private.test_intro_failure();")
  await assert.rejects(f.journey(ids[1],'join',args),/test_intro_failed/)
  assert.equal(await f.revision(c),args.expected_revision)
  assert.equal((await f.db.query('select count(*)::int n from public.department_challenge_roster where team_id=$1 and user_id=$2',[c.team_id,ids[1]])).rows[0].n,0)
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.challenge_journey_requests where actor_id=$1 and idempotency_key=$2',[ids[1],args.idempotency_key])).rows[0].n,0)
  await f.db.exec('drop trigger test_intro_failure on quantum_private.challenge_application_intros')
  await f.journey(ids[1],'join',args)
 }finally{await f.db.close()}
})
test('paired opponents, public lobby, match snapshots and invited previews never receive another team introduction',async()=>{
 const f=await setup();try{
  const a=await f.create(),b=await f.create(ids[5])
  for(const[c,offset]of[[a,0],[b,5]])for(const[index,slot]of['top','jungle','adc','support'].entries()){
   const r=await f.journey(ids[offset+index+1],'join',await f.joinArgs(c,{slot,aspiration:`비공개 소개 ${offset}`,strengths:'패스'}));await f.approve(c,r.roster_id,ids[offset])
  }
  for(const[c,actor]of[[a,ids[0]],[b,ids[5]]])await f.act(actor,'queue',{team_id:c.team_id,waiting:true,gap:200})
  const lobby=await f.rpc(ids[0],'department_league_lobby',['overview',JSON.stringify({sport:'lol',team_id:a.team_id,cursor:null})]);assert.ok(!JSON.stringify(lobby).includes('비공개 소개'))
  const preview=await f.rpc(ids[0],'department_league_invites',['overview',JSON.stringify({sport:'lol',challenge_id:a.challenge_id})]);assert.ok(!JSON.stringify(preview).includes('비공개 소개'))
  await f.act(ids[0],'propose',{team_id:a.team_id,opponent_team_id:b.team_id});await f.act(ids[5],'accept',{team_id:b.team_id,opponent_team_id:a.team_id})
  const own=await f.overview(ids[0]),other=await f.overview(ids[5]);assert.ok(JSON.stringify(own).includes('비공개 소개 0'));assert.ok(!JSON.stringify(own).includes('비공개 소개 5'));assert.ok(!JSON.stringify(other).includes('비공개 소개 0'))
  assert.ok(!JSON.stringify((await f.detail(a,ids[5])).challenge.teams.find(t=>t.id===a.team_id)).includes('비공개 소개'))
  assert.ok(!JSON.stringify((await f.db.query('select * from quantum_private.challenge_match_chat_members')).rows).includes('비공개 소개'))
 }finally{await f.db.close()}
})
test('introductions do not bypass reserved slots, captain approval or recipient friend-invite consent',async()=>{
 const f=await setup();try{
  const c=await f.create(),friendship=crypto.randomUUID()
  await f.db.query("update quantum_private.community_member_profiles set department='기계공학과'where user_id=$1",[ids[10]])
  await f.db.query("insert into public.friend_requests values($1,$2,$3,'accepted')",[friendship,ids[0],ids[1]])
  await f.db.query("insert into public.friendships values($1,$2,'active',$3)",[ids[0],ids[1],friendship])
  const requested=await f.journey(ids[2],'join',await f.joinArgs(c,{aspiration:'지원으로 합류할게요',strengths:'탑 운영'}))
  for(const[actor,slot]of[[ids[10],'jungle'],[ids[3],'adc'],[ids[4],'support']]){
   const r=await f.journey(actor,'join',await f.joinArgs(c,{slot}));await f.approve(c,r.roster_id)
  }
  const invite=await f.rpc(ids[0],'department_league_invites',['invite',JSON.stringify({sport:'lol',challenge_id:c.challenge_id,team_id:c.team_id,friend_user_id:ids[1],slot:'top',expected_revision:await f.revision(c),idempotency_key:crypto.randomUUID()})])
  await assert.rejects(f.journey(ids[1],'join',await f.joinArgs(c,{aspiration:'초대 건너뛰기'})),/slot_reserved_conflict/)
  assert.equal((await f.db.query("select count(*)::int n from public.department_challenge_roster where team_id=$1 and status='accepted'",[c.team_id])).rows[0].n,4)
  const revision=await f.revision(c)
  await f.rpc(ids[1],'department_league_invites',['accept',JSON.stringify({sport:'lol',invite_id:invite.id,tier:'silver',expected_revision:revision,idempotency_key:crypto.randomUUID()})])
  await assert.rejects(f.rpc(ids[0],'accept_department_challenge_roster_request',[c.challenge_id,requested.roster_id,revision,crypto.randomUUID()]),/stale|occupied|full/)
  assert.equal((await f.db.query("select count(*)::int n from public.department_challenge_roster r join quantum_private.challenge_skill_profiles p on p.roster_id=r.id where r.team_id=$1 and r.status='accepted'and p.slot_key='top'",[c.team_id])).rows[0].n,1)
  assert.equal((await f.db.query('select count(*)::int n from quantum_private.challenge_application_intros')).rows[0].n,1,'only the voluntary applicant authored an introduction')
 }finally{await f.db.close()}
})
