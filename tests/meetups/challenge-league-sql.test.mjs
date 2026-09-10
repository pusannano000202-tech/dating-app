import assert from 'node:assert/strict'
import test from 'node:test'
import {parseLeagueState} from '../../lib/meetups/challenge-league.ts'
import {fixture,ids} from './challenge-league-fixture.mjs'
test('league keeps two full teams and requires bilateral match consent, exact tolerance and validated standings',async()=>{
 const {db,act,team,rpc}=await fixture();try{
 const a=await team(0),b=await team(5);
 assert.ok(parseLeagueState(await act(ids[0],'overview',{category:'gaming'})));
 assert.deepEqual((await act(ids[0],'overview',{category:'gaming'})).standings,[]);
 await act(a.actor,'queue',{team_id:a.team,waiting:true,gap:200});await act(b.actor,'queue',{team_id:b.team,waiting:true,gap:300});
 const oldPoll=(await db.query("insert into quantum_private.activity_room_polls(room_kind,room_id,creator_user_id,creator_alias_snapshot,purpose,title,selection_mode,idempotency_key)values('department_challenge',$1,$2,'별친구','place','우리 팀이 정한 장소는?','single',$3)returning id",[b.id,b.actor,crypto.randomUUID()])).rows[0].id;
 await db.query("insert into quantum_private.activity_room_poll_options(poll_id,label,position)values($1,'도서관 앞 PC방',0)",[oldPoll]);
 assert.equal((await act(a.actor,'candidates',{team_id:a.team})).length,1);
 const proposed=await act(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team});assert.equal(proposed.status,'pending');
 await assert.rejects(act(a.actor,'accept',{team_id:a.team,opponent_team_id:b.team}),/proposal_not_available/);
 const paired=await act(b.actor,'accept',{team_id:b.team,opponent_team_id:a.team});assert.equal(paired.status,'opponent_pending');
 const bState=await act(b.actor,'overview',{category:'gaming'});assert.equal(bState.my_teams[0].prior_polls[0].id,oldPoll);assert.ok(parseLeagueState(bState));
 assert.deepEqual((await act(a.actor,'overview',{category:'gaming'})).my_teams[0].prior_polls,[]);
 const rows=await db.query('select id,challenge_id,side from public.department_challenge_teams order by side');assert.equal(rows.rows.length,2);assert.equal(rows.rows[0].challenge_id,rows.rows[1].challenge_id);
 assert.equal((await db.query('select count(*)::int n from public.department_challenge_roster where challenge_id=$1',[paired.challenge_id])).rows[0].n,10);
 await assert.rejects(act(a.actor,'profile',{team_id:a.team,position:'mid',tier:'challenger'}),/profile_locked/);
 // Preserve existing bilateral schedule/result engine; never manufacture its result.
 const start=new Date(Date.now()+7200000).toISOString(),end=new Date(Date.now()+10800000).toISOString();
 let rev=(await db.query('select revision from public.department_challenges where id=$1',[paired.challenge_id])).rows[0].revision;
 const s=await rpc(a.actor,'confirm_my_department_challenge_schedule',[paired.challenge_id,start,end,'교내 PC방',rev,crypto.randomUUID()]);
 await rpc(b.actor,'confirm_my_department_challenge_schedule',[paired.challenge_id,start,end,'교내 PC방',s.revision,crypto.randomUUID()]);
 await db.query("update public.department_challenges set scheduled_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=$1",[paired.challenge_id]);
 rev=(await db.query('select revision from public.department_challenges where id=$1',[paired.challenge_id])).rows[0].revision;
 const result=await rpc(a.actor,'confirm_my_department_challenge_result',[paired.challenge_id,2,1,rev,crypto.randomUUID()]);
 assert.deepEqual((await act(a.actor,'overview',{category:'gaming'})).standings,[]);
 const disagreement=await rpc(b.actor,'confirm_my_department_challenge_result',[paired.challenge_id,1,3,result.revision,crypto.randomUUID()]);assert.equal(disagreement.status,'result_pending');
 assert.deepEqual((await act(a.actor,'overview',{category:'gaming'})).standings,[]);
 const resultKey=crypto.randomUUID();const completed=await rpc(b.actor,'confirm_my_department_challenge_result',[paired.challenge_id,1,2,disagreement.revision,resultKey]);
 assert.deepEqual(await rpc(b.actor,'confirm_my_department_challenge_result',[paired.challenge_id,1,2,disagreement.revision,resultKey]),completed);
 const standings=(await act(a.actor,'overview',{category:'gaming'})).standings;assert.equal(standings.length,2);assert.equal(standings[0].department,'기계공학과');assert.equal(standings[0].wins,1);assert.equal(standings[1].losses,1);
 assert.ok(standings.every(row=>row.played===1));
 }finally{await db.close()}
});
test('queue rejects ambiguous LoL lines, member/campus spoofing, blocks and does not relax after waiting',async()=>{
 const {db,act,team,rpc}=await fixture();try{
 const a=await team(0),b=await team(5,['diamond','diamond','diamond','diamond','diamond']);
 await assert.rejects(rpc(ids[15],'accept_department_challenge_opponent',[a.id,8,crypto.randomUUID()]),/fair_pairing_required/);
 await assert.rejects(act(ids[1],'profile',{team_id:a.team,position:'top',tier:'silver'}),/position_conflict/);
 await assert.rejects(act(ids[5],'profile',{team_id:a.team,position:'top',tier:'gold'}),/membership_required/);
 await assert.rejects(act(ids[23],'overview',{category:'gaming'}),/department_identity_required/);
 await assert.rejects(act(ids[1],'queue',{team_id:a.team,gap:200,waiting:true}),/captain_required/);
 await act(a.actor,'queue',{team_id:a.team,waiting:true,gap:200});await act(b.actor,'queue',{team_id:b.team,waiting:true,gap:300});
 await db.exec("update quantum_private.challenge_team_preferences set updated_at=now()-interval '30 days'");
 assert.deepEqual(await act(a.actor,'candidates',{team_id:a.team}),[]);
 await assert.rejects(act(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team}),/opponent_not_available/);
 await act(a.actor,'queue',{team_id:a.team,waiting:true,gap:300});assert.equal((await act(a.actor,'candidates',{team_id:a.team})).length,1);
 await db.query('insert into quantum_private.test_blocks values($1,$2)',[ids[1],ids[6]]);assert.deepEqual(await act(a.actor,'candidates',{team_id:a.team}),[]);
 await assert.rejects(act(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team}),/opponent_not_available/);
 await db.exec('delete from quantum_private.test_blocks');
 await act(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team});
 await act(ids[1],'profile',{team_id:a.team,position:'jungle',tier:'platinum'});
 await assert.rejects(act(b.actor,'accept',{team_id:b.team,opponent_team_id:a.team}),/opponent_not_available/);
 // Direct legacy create still cannot bypass new LoL five-player requirement.
 await assert.rejects(rpc(ids[15],'create_department_challenge',['gaming','정원을 우회한 팀','',4,crypto.randomUUID()]),/invalid_lol_capacity/);
 await db.exec('set role authenticated');await assert.rejects(db.query('select * from quantum_private.challenge_skill_profiles'),/permission denied/);await assert.rejects(db.query('select quantum_private.challenge_team_ready($1)',[a.team]),/permission denied/);await db.exec('reset role');
 }finally{await db.close()}
});
test('a real opponent-only report requires independent MFA operator review, 14/21 days and owner-only appeal',async()=>{
 const {db,act,team,rpc}=await fixture();try{
 const a=await team(0),b=await team(5);await act(a.actor,'queue',{team_id:a.team,waiting:true,gap:200});await act(b.actor,'queue',{team_id:b.team,waiting:true,gap:200});await act(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team});const pair=await act(b.actor,'accept',{team_id:b.team,opponent_team_id:a.team});
 let rev=(await db.query('select revision from public.department_challenges where id=$1',[pair.challenge_id])).rows[0].revision;
 const start=new Date(Date.now()+7200000).toISOString(),end=new Date(Date.now()+10800000).toISOString();const s=await rpc(a.actor,'confirm_my_department_challenge_schedule',[pair.challenge_id,start,end,'학교 운동장',rev,crypto.randomUUID()]);await rpc(b.actor,'confirm_my_department_challenge_schedule',[pair.challenge_id,start,end,'학교 운동장',s.revision,crypto.randomUUID()]);
 await assert.rejects(act(a.actor,'report_targets',{challenge_id:pair.challenge_id}),/match_not_available/);
 await db.query("update public.department_challenges set scheduled_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=$1",[pair.challenge_id]);
 await db.query("update public.department_challenge_roster set accepted_at=now()-interval '3 hours' where challenge_id=$1",[pair.challenge_id]);
 const targets=await act(a.actor,'report_targets',{challenge_id:pair.challenge_id});assert.equal(targets.length,5);assert.ok(!JSON.stringify(targets).includes(ids[5]));
 await assert.rejects(act(ids[15],'report_targets',{challenge_id:pair.challenge_id}),/participant_required/);
 const own=(await db.query('select id from quantum_private.challenge_match_players where user_id=$1',[a.actor])).rows[0].id;
 await assert.rejects(act(a.actor,'report',{challenge_id:pair.challenge_id,target_player_id:own,reason:'같은 팀을 부당하게 신고하려는 요청'}),/opponent_participant_required/);
 const report=await act(a.actor,'report',{challenge_id:pair.challenge_id,target_player_id:targets[0].id,reason:'경기 중 반복적인 욕설과 위협이 있었습니다.'});
 assert.equal((await db.query('select count(*)::int n from quantum_private.challenge_restrictions')).rows[0].n,0);
 const mod=(user,action,args)=>rpc(user,'department_league_moderate',[action,JSON.stringify(args)]);
 await db.query('insert into quantum_private.test_admins values($1,$2,true,true)',[ids[20],'partner']);await assert.rejects(mod(ids[20],'restrict',{report_id:report.id,days:14,note:'양쪽 설명을 확인하여 조치합니다.'}),/super_admin_required/);
 await db.query("update quantum_private.test_admins set role='super_admin',mfa=false where id=$1",[ids[20]]);await assert.rejects(mod(ids[20],'list',{}),/mfa_required/);
 await db.query('update quantum_private.test_admins set mfa=true where id=$1',[ids[20]]);
 assert.equal((await mod(ids[20],'list',{})).length,1);
 await db.query('update quantum_private.test_admins set recent=false where id=$1',[ids[20]]);await assert.rejects(mod(ids[20],'list',{}),/super_admin_required/);
 await db.query('update quantum_private.test_admins set recent=true where id=$1',[ids[20]]);
 await db.query("insert into quantum_private.test_admins values($1,'super_admin',true,true)",[a.actor]);await assert.rejects(mod(a.actor,'restrict',{report_id:report.id,days:14,note:'신고자가 직접 처리해서는 안 됩니다.'}),/independent_operator_required/);
 await assert.rejects(mod(ids[20],'restrict',{report_id:report.id,days:7,note:'양쪽 설명을 확인하여 조치합니다.'}),/invalid_restriction_duration/);
 await mod(ids[20],'restrict',{report_id:report.id,days:14,note:'양쪽 설명을 확인하여 조치합니다.'});
 const restricted=(await db.query('select * from quantum_private.challenge_restrictions')).rows[0];assert.ok(Math.abs((Date.parse(restricted.ends_at)-Date.parse(restricted.starts_at))/86400000-14)<.001);
 await assert.rejects(rpc(restricted.user_id,'create_department_challenge',['gaming','정지 중 신규 팀','',5,crypto.randomUUID()]),/restricted_forbidden/);
 await assert.rejects(act(ids[15],'appeal',{restriction_id:restricted.id,reason:'다른 사람의 정지를 조작하려는 요청'}),/restriction_not_found/);
 await act(restricted.user_id,'appeal',{restriction_id:restricted.id,reason:'경기 상황에 대한 추가 설명을 제출합니다.'});
 assert.equal((await mod(ids[20],'list',{}))[0].appeal_text,'경기 상황에 대한 추가 설명을 제출합니다.');
 await mod(ids[20],'restore',{report_id:report.id,note:'새로운 자료를 검토하여 제한을 복구합니다.'});
 assert.ok((await db.query('select revoked_at from quantum_private.challenge_restrictions')).rows[0].revoked_at);
 assert.equal((await db.query('select count(*)::int n from quantum_private.challenge_moderation_audit')).rows[0].n,2);
 const report21=await act(a.actor,'report',{challenge_id:pair.challenge_id,target_player_id:targets[1].id,reason:'두 번째 상대 선수의 허위 실력 신고를 검토해 주세요.'});
 await mod(ids[20],'restrict',{report_id:report21.id,days:21,note:'양 팀의 자료와 해명을 검토한 뒤 21일로 결정했습니다.'});
 const restricted21=(await db.query('select * from quantum_private.challenge_restrictions where report_id=$1',[report21.id])).rows[0];
 assert.ok(Math.abs((Date.parse(restricted21.ends_at)-Date.parse(restricted21.starts_at))/86400000-21)<.001);
 await assert.rejects(mod(ids[20],'restrict',{report_id:report21.id,days:21,note:'같은 신고를 다시 처리해서는 안 됩니다.'}),/report_already_reviewed/);
 assert.equal((await db.query('select count(*)::int n from quantum_private.challenge_restrictions where report_id=$1',[report21.id])).rows[0].n,1);
 }finally{await db.close()}
});
test('fair match accepts leaving but rejects undeclared replacements and incomplete result publication',async()=>{
 const{db,act,team,rpc}=await fixture();try{
 const a=await team(0),b=await team(5);
 await db.query("update quantum_private.community_member_profiles set department='기계공학과' where user_id in($1,$2)",[ids[15],ids[16]]);
 const beforePairRevision=(await db.query('select revision from public.department_challenges where id=$1',[a.id])).rows[0].revision;
 const pending=await rpc(ids[15],'request_department_challenge_roster',[a.id,a.team,beforePairRevision,crypto.randomUUID()]);
 await act(a.actor,'queue',{team_id:a.team,waiting:true,gap:200});await act(b.actor,'queue',{team_id:b.team,waiting:true,gap:200});await act(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team});const paired=await act(b.actor,'accept',{team_id:b.team,opponent_team_id:a.team});
 const projection=(await db.query('select quantum_private.department_challenge_projection($1,$2) value',[paired.challenge_id,ids[16]])).rows[0].value;
 assert.ok(projection.teams.every(t=>t.may_request_roster===false));
 let rev=(await db.query('select revision from public.department_challenges where id=$1',[paired.challenge_id])).rows[0].revision;
 const start=new Date(Date.now()+7200000).toISOString(),end=new Date(Date.now()+10800000).toISOString();const s=await rpc(a.actor,'confirm_my_department_challenge_schedule',[paired.challenge_id,start,end,'교내 PC방',rev,crypto.randomUUID()]);await rpc(b.actor,'confirm_my_department_challenge_schedule',[paired.challenge_id,start,end,'교내 PC방',s.revision,crypto.randomUUID()]);
 rev=(await db.query('select revision from public.department_challenges where id=$1',[paired.challenge_id])).rows[0].revision;
 await rpc(ids[1],'leave_my_department_challenge_roster',[paired.challenge_id,a.team,rev,crypto.randomUUID()]);
 rev=(await db.query('select revision from public.department_challenges where id=$1',[paired.challenge_id])).rows[0].revision;
 await assert.rejects(rpc(a.actor,'accept_department_challenge_roster_request',[paired.challenge_id,pending.roster_id,rev,crypto.randomUUID()]),/fair_roster_locked_conflict/);
 await assert.rejects(rpc(ids[1],'request_department_challenge_roster',[paired.challenge_id,a.team,rev,crypto.randomUUID()]),/fair_roster_locked_conflict/);
 await db.query("update quantum_private.community_member_profiles set department='기계공학과' where user_id=$1",[ids[16]]);
 await assert.rejects(rpc(ids[16],'request_department_challenge_roster',[paired.challenge_id,a.team,rev,crypto.randomUUID()]),/fair_roster_locked_conflict/);
 await db.query("update public.department_challenges set scheduled_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=$1",[paired.challenge_id]);
 await assert.rejects(rpc(a.actor,'confirm_my_department_challenge_result',[paired.challenge_id,2,1,rev,crypto.randomUUID()]),/fair_team_required/);
 assert.equal((await db.query('select count(*)::int n from public.department_challenge_result_confirmations where challenge_id=$1',[paired.challenge_id])).rows[0].n,0);
 assert.equal((await db.query("select count(*)::int n from public.department_challenge_roster where challenge_id=$1 and status='accepted'",[paired.challenge_id])).rows[0].n,9);
 assert.equal((await db.query('select count(*)::int n from quantum_private.challenge_match_players where challenge_id=$1',[paired.challenge_id])).rows[0].n,10);
 assert.equal((await db.query('select count(*)::int n from quantum_private.challenge_match_players where challenge_id=$1 and user_id in($2,$3)',[paired.challenge_id,ids[15],ids[16]])).rows[0].n,0);
 }finally{await db.close()}
});

test('leaving after one captain submits a result prevents final publication without manufacturing a standing',async()=>{
 const{db,act,team,rpc}=await fixture();try{
 const a=await team(0),b=await team(5);await act(a.actor,'queue',{team_id:a.team,waiting:true,gap:200});await act(b.actor,'queue',{team_id:b.team,waiting:true,gap:200});await act(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team});const paired=await act(b.actor,'accept',{team_id:b.team,opponent_team_id:a.team});
 let rev=(await db.query('select revision from public.department_challenges where id=$1',[paired.challenge_id])).rows[0].revision;
 const start=new Date(Date.now()+7200000).toISOString(),end=new Date(Date.now()+10800000).toISOString();const s=await rpc(a.actor,'confirm_my_department_challenge_schedule',[paired.challenge_id,start,end,'교내 PC방',rev,crypto.randomUUID()]);const scheduled=await rpc(b.actor,'confirm_my_department_challenge_schedule',[paired.challenge_id,start,end,'교내 PC방',s.revision,crypto.randomUUID()]);
 await db.query("update public.department_challenges set scheduled_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' where id=$1",[paired.challenge_id]);
 const partial=await rpc(a.actor,'confirm_my_department_challenge_result',[paired.challenge_id,2,1,scheduled.revision,crypto.randomUUID()]);
 assert.equal(partial.status,'result_pending');rev=partial.revision;
 for(let i=1;i<5;i++)rev=(await rpc(ids[i],'leave_my_department_challenge_roster',[paired.challenge_id,a.team,rev,crypto.randomUUID()])).revision;
 await assert.rejects(rpc(b.actor,'confirm_my_department_challenge_result',[paired.challenge_id,1,2,rev,crypto.randomUUID()]),/fair_team_required/);
 assert.equal((await db.query('select status from public.department_challenges where id=$1',[paired.challenge_id])).rows[0].status,'result_pending');
 assert.equal((await db.query('select count(*)::int n from public.department_challenge_result_confirmations where challenge_id=$1',[paired.challenge_id])).rows[0].n,1);
 assert.deepEqual((await act(a.actor,'overview',{category:'gaming'})).standings,[]);
 }finally{await db.close()}
});

test('football keeps its own positions, self-assessment scale, equal roster size and bilateral pairing',async()=>{
 const{db,act,rpc,team}=await fixture();try{
 async function football(offset,tier){
  const c=await rpc(ids[offset],'create_department_challenge',['soccer','우리 학과 풋살 팀','',2,crypto.randomUUID()]);const t=c.teams[0].id;
  const request=await rpc(ids[offset+1],'request_department_challenge_roster',[c.id,t,c.revision,crypto.randomUUID()]);await rpc(ids[offset],'accept_department_challenge_roster_request',[c.id,request.roster_id,request.revision,crypto.randomUUID()]);
  await act(ids[offset],'profile',{team_id:t,position:'goalkeeper',tier});await act(ids[offset+1],'profile',{team_id:t,position:'forward',tier});
  return{id:c.id,team:t,actor:ids[offset]};
 }
 const a=await football(0,'intermediate'),b=await football(5,'advanced'),gaming=await team(10);
 await assert.rejects(act(a.actor,'profile',{team_id:a.team,position:'top',tier:'gold'}),/invalid_skill_profile/);
 for(const t of[a,b,gaming])await act(t.actor,'queue',{team_id:t.team,waiting:true,gap:200});
 const candidates=await act(a.actor,'candidates',{team_id:a.team});assert.equal(candidates.length,1);assert.equal(candidates[0].team_id,b.team);
 await assert.rejects(act(a.actor,'propose',{team_id:a.team,opponent_team_id:gaming.team}),/opponent_not_available/);
 await act(a.actor,'propose',{team_id:a.team,opponent_team_id:b.team});const pair=await act(b.actor,'accept',{team_id:b.team,opponent_team_id:a.team});assert.equal(pair.status,'opponent_pending');
 const state=await act(a.actor,'overview',{category:'soccer'});assert.ok(parseLeagueState(state));assert.deepEqual(state.my_teams[0].players.map(p=>p.position).sort(),['forward','goalkeeper']);
 assert.deepEqual((await act(a.actor,'overview',{category:'gaming'})).my_teams,[]);
 }finally{await db.close()}
});
