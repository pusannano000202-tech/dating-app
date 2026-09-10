import assert from 'node:assert/strict'
import test from 'node:test'
import {registerHooks} from 'node:module'
registerHooks({resolve(specifier,context,next){return next(specifier==='./challenge-journey'?'./challenge-journey.ts':specifier,context)}})
const{validateLeagueInviteCommand,parseLeagueInviteState,leagueInviteHref}=await import('../../lib/meetups/league-invites.ts')
const id='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002'
const invite={id,challenge_id:other,team_id:id,title:'우리 학과 팀',department:'기계공학과',sport:'lol',slot:'top',inviter_name:'별친구',invitee_name:'달친구',status:'pending',expires_at:'2026-10-01T00:00:00Z',revision:1,is_recipient:true,can_cancel:false}
const state={sport:'lol',challenge_id:null,revision:null,candidates:[],incoming:[invite],sent:[],preview:null}
test('exact invite and recipient consent shapes reject spoofed role, slot and tier fields',()=>{
 const args={sport:'lol',challenge_id:id,team_id:other,friend_user_id:other,slot:'top',expected_revision:0,idempotency_key:id}
 assert.deepEqual(validateLeagueInviteCommand('invite',args),args)
 assert.throws(()=>validateLeagueInviteCommand('invite',{...args,captain_user_id:id}),/invalid_invite_action/)
 assert.throws(()=>validateLeagueInviteCommand('invite',{...args,slot:'gk'}),/invalid_slot/)
 const accept={sport:'lol',invite_id:id,tier:'diamond',expected_revision:1,idempotency_key:other}
 assert.deepEqual(validateLeagueInviteCommand('accept',accept),accept)
 assert.throws(()=>validateLeagueInviteCommand('accept',{...accept,slot:'mid'}),/invalid_invite_action/)
 assert.throws(()=>validateLeagueInviteCommand('accept',{...accept,tier:'advanced'}),/invalid_tier/)
 assert.throws(()=>validateLeagueInviteCommand('accept',{...accept,expected_revision:1.5}),/invalid_revision/)
 assert.throws(()=>validateLeagueInviteCommand('accept',{...accept,expected_revision:2147483648}),/invalid_revision/)
})
test('football and futsal invite contracts distinguish exact seats and skill choices',()=>{
 const args={sport:'football',challenge_id:id,team_id:other,friend_user_id:other,slot:'rcb',expected_revision:2,idempotency_key:id}
 assert.deepEqual(validateLeagueInviteCommand('invite',args),args)
 assert.throws(()=>validateLeagueInviteCommand('invite',{...args,sport:'futsal'}),/invalid_slot/)
 assert.throws(()=>validateLeagueInviteCommand('accept',{sport:'football',invite_id:id,tier:'gold',expected_revision:0,idempotency_key:other}),/invalid_tier/)
})
test('notification routes are rebuilt only from valid sport and identifiers',()=>{
 assert.equal(leagueInviteHref('lol',id,other),`/meetups/league?sport=lol&invite=${id}&challenge=${other}`)
 assert.equal(leagueInviteHref('javascript:alert(1)',id,other),null)
 assert.equal(leagueInviteHref('lol',`${id}&redirect=https://example.com`,other),null)
 assert.equal(leagueInviteHref('lol',id,null),null)
})
test('received and sent projections enforce privacy roles and valid formation data',()=>{
 assert.deepEqual(parseLeagueInviteState(state),state)
 assert.equal(parseLeagueInviteState({...state,incoming:[{...invite,can_cancel:true}]}),null)
 assert.equal(parseLeagueInviteState({...state,incoming:[],sent:[invite]}),null)
 assert.equal(parseLeagueInviteState({...state,incoming:[{...invite,sport:'futsal'}]}),null)
 const player={id,alias:'별친구',status:'accepted',is_me:false,slot:'mid',position:'mid',tier:'gold'}
 const scoped={...state,challenge_id:other,revision:1,preview:{challenge_id:other,team_id:id,title:'우리 학과 팀',department:'기계공학과',capacity:5,players:[player]}}
 assert.ok(parseLeagueInviteState(scoped))
 assert.equal(parseLeagueInviteState({...scoped,preview:{...scoped.preview,players:[{...player,status:'requested'}]}}),null)
 assert.equal(parseLeagueInviteState({...scoped,preview:{...scoped.preview,players:[player,{...player,id:other}]}}),null)
})
