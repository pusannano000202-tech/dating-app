import assert from 'node:assert/strict'
import test from 'node:test'
import {registerHooks} from 'node:module'
registerHooks({resolve(specifier,context,next){return next(specifier==='./challenge-journey'?'./challenge-journey.ts':specifier,context)}})
const {leagueRecruitmentHref,validateLeagueRecruitmentCommand,parseLeagueRecruitmentBrowse,parseLeagueRecruitmentNotices,parseLeagueRecruitmentResult}=await import('../../lib/meetups/league-recruitment.ts')
const teamId='10000000-0000-4000-8000-000000000001',challengeId='10000000-0000-4000-8000-000000000002',id='10000000-0000-4000-8000-000000000003'
const stamp='2026-09-11T12:00:00.000Z'
const notice={id,team_id:teamId,challenge_id:challengeId,team_name:'A팀',department:'기계공학과',sport:'lol',capacity:5,accepted_count:1,empty_slots:['jungle','adc','support'],reserved_slots:['top'],preferred_at:stamp,summary:'내일 저녁 함께해요',status:'open',expires_at:stamp,created_at:stamp,updated_at:stamp,revision:2,is_captain:false,href:leagueRecruitmentHref('lol',challengeId)}
const team={team_id:teamId,challenge_id:challengeId,team_name:'A팀',title:'A팀',department:'기계공학과',sport:'lol',status:'recruiting',revision:2,capacity:5,accepted_count:1,empty_slots:['jungle','adc','support'],reserved_slots:['top'],is_captain:false,my_status:'none',may_join:true,notice}
test('recruitment commands allow only documented action keys and server-owned scope',()=>{
 const publish={sport:'lol',team_id:teamId,preferred_at:stamp,summary:'같이 뛰어요',expected_revision:2,idempotency_key:id}
 for(const[action,args]of[['browse',{sport:'lol',cursor:null}],['notices',{sport:'football',cursor:id}],['detail',{sport:'futsal',challenge_id:challengeId}],['publish',publish],['close',{sport:'lol',team_id:teamId,expected_revision:2,idempotency_key:id}],['reject',{sport:'lol',team_id:teamId,roster_id:id,expected_revision:2,idempotency_key:id}]])assert.deepEqual(validateLeagueRecruitmentCommand(action,args),args)
 for(const[action,args]of[['accept',publish],['publish',{...publish,user_id:id}],['browse',{sport:'lol',cursor:null,department:'기계공학과'}],['publish',{...publish,team_id:'not-uuid'}],['publish',{...publish,expected_revision:-1}],['publish',{...publish,expected_revision:2.5}],['publish',{...publish,summary:'\u202e숨김'}],['publish',{...publish,summary:'x'.repeat(161)}],['publish',{...publish,preferred_at:'infinity'}]])assert.throws(()=>validateLeagueRecruitmentCommand(action,args))
})
test('browse and notices reject malformed slots, false join permission and unsafe target links',()=>{
 const page={sport:'lol',my_department:'기계공학과',total_count:1,next_cursor:null,teams:[team]}
 assert.ok(parseLeagueRecruitmentBrowse(page));assert.ok(parseLeagueRecruitmentNotices({...page,notices:[notice]}))
 for(const bad of[{...team,reserved_slots:['jungle']},{...team,capacity:6},{...team,my_status:'accepted'},{...team,team_name:'A'},{...team,notice:{...notice,href:'https://evil.test'}}])assert.equal(parseLeagueRecruitmentBrowse({...page,teams:[bad]}),null)
 assert.equal(parseLeagueRecruitmentBrowse({...page,teams:Array(21).fill(team)}),null)
 assert.equal(leagueRecruitmentHref('other',challengeId),null);assert.equal(leagueRecruitmentHref('lol','../settings'),null)
})
test('successful mutation DTO must bind its notice to the same team challenge and revision',()=>{
 const response={team_id:teamId,challenge_id:challengeId,revision:2,notice,replayed:false}
 assert.ok(parseLeagueRecruitmentResult(response,'lol'));assert.ok(parseLeagueRecruitmentResult({...response,notice:null},'lol'))
 for(const value of[{},null,{...response,replayed:1},{...response,notice:{...notice,team_id:id}},{...response,notice:{...notice,challenge_id:id}},{...response,notice:{...notice,revision:3}}])assert.equal(parseLeagueRecruitmentResult(value,'lol'),null)
})
