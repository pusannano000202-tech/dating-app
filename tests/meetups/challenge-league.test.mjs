import assert from 'node:assert/strict'
import test from 'node:test'
import { LOL_TIERS, LOL_POSITIONS, teamCompatibility, isCompatible, parseLeagueState, validateLeagueAction } from '../../lib/meetups/challenge-league.ts'

test('internal self-report score considers strongest player, not official LP/MMR', () => {
  assert.equal(LOL_TIERS.gold, 400)
  assert.deepEqual(LOL_POSITIONS, ['top','jungle','mid','adc','support'])
  assert.equal(teamCompatibility([100,100,100,100,1100]), 540)
  assert.equal(teamCompatibility([400,400,400,400,400]), 400)
  assert.throws(() => teamCompatibility([]))
  assert.throws(() => teamCompatibility([NaN]))
})
test('commands reject extra fields, role spoofing, empty values and automatic sanctions',()=>{
 const id='10000000-0000-4000-8000-000000000001'
 assert.deepEqual(validateLeagueAction('queue',{team_id:id,gap:200,waiting:true}),{team_id:id,gap:200,waiting:true})
 assert.throws(()=>validateLeagueAction('queue',{team_id:id,gap:200,waiting:'true'}))
 assert.throws(()=>validateLeagueAction('queue',{team_id:id,gap:400,waiting:true}))
 assert.throws(()=>validateLeagueAction('profile',{team_id:id,position:'top',tier:'gold',score:999}))
 assert.throws(()=>validateLeagueAction('restrict',{report_id:id,days:14,note:'충분히 검토한 사유입니다.'}))
 assert.throws(()=>validateLeagueAction('restrict',{report_id:id,days:7,note:'충분히 검토한 사유입니다.'},true))
 assert.deepEqual(validateLeagueAction('restrict',{report_id:id,days:14,note:'충분히 검토한 사유입니다.'},true),{report_id:id,days:14,note:'충분히 검토한 사유입니다.'})
})
test('both teams retain their selected exact gap and strongest-player cap', () => {
  assert.equal(isCompatible([400,400,400,400,400],[600,600,600,600,600],200,300),true)
  assert.equal(isCompatible([400,400,400,400,400],[601,601,601,601,601],200,300),false)
  assert.equal(isCompatible([100,100,100,100,100],[100,100,100,100,900],300,300),false)
  assert.throws(() => isCompatible([100],[100],400,200))
})
test('league JSON parser fails closed for malformed/self-report evidence', () => {
  const state = {category:'gaming', my_department:'기계공학과', standings:[], my_teams:[], reports:[], restrictions:[]}
  assert.deepEqual(parseLeagueState(state),state)
  assert.equal(parseLeagueState({...state,category:'tennis'}),null)
  assert.equal(parseLeagueState({...state,standings:[{department:'컴공',played:0,wins:1,losses:0,draws:0,rank:1,is_me:false}]}),null)
})
