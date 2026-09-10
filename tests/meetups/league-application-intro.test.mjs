import assert from 'node:assert/strict'
import test from 'node:test'
import {validateJourneyCommand,parseJourneyState} from '../../lib/meetups/challenge-journey.ts'
const id='10000000-0000-4000-8000-000000000001'
const args={sport:'lol',challenge_id:id,team_id:id,slot:'top',tier:'gold',expected_revision:0,idempotency_key:id}
test('voluntary applications allow optional short introductions, including empty and Unicode maximums',()=>{
 for(const extra of[{}, {aspiration:'',strengths:''},{aspiration:'팀을 위해 열심히 할게요'},{strengths:'수비와\n패스가 장점이에요'},{aspiration:'⚽'.repeat(80),strengths:'😀'.repeat(120)}])assert.deepEqual(validateJourneyCommand('join',{...args,...extra}),{...args,...extra})
})
test('introduction input rejects wrong types, overlong values, hidden controls and introduction fields on other actions',()=>{
 for(const extra of[{aspiration:null},{strengths:[]},{aspiration:4},{aspiration:'😀'.repeat(81)},{strengths:'강'.repeat(121)},{aspiration:'안녕\n팀원'},{strengths:'강'.repeat(120)+'\n'},{strengths:'수비\r패스'},{strengths:'숨김\u200b글자'},{aspiration:'방향\u202e변경'},{strengths:'제어\u0085문자'},{application_intro:{aspiration:'위조',strengths:''}}])assert.throws(()=>validateJourneyCommand('join',{...args,...extra}))
 assert.throws(()=>validateJourneyCommand('profile',{...args,aspiration:'프로필 우회'}))
})
test('journey parsing accepts authorized introduction DTOs but rejects malformed or unauthorized private fields',()=>{
 const player={id,alias:'별친구',status:'requested',is_me:true,slot:'top',position:'top',tier:'gold'}
 const team={id,department:'기계공학과',is_mine:true,is_captain:false,may_join:false,ready:false,waiting:false,gap:200,score:null,players:[player]}
 const base={sport:'lol',my_department:'기계공학과',month:'2026-09',standings:[],monthly_standings:[],challenges:[{id,title:'우리 팀',status:'recruiting',revision:0,scheduled_at:null,ends_at:null,place_name:null,schedule_proposals:[],result:null,teams:[team]}]}
 const state=(intro,override={})=>({...base,challenges:[{...base.challenges[0],teams:[{...team,...override,players:[{...player,application_intro:intro,...(override.player??{})}]}]}]})
 assert.ok(parseJourneyState(base));assert.ok(parseJourneyState(state({aspiration:'열심히',strengths:'패스'})));assert.ok(parseJourneyState(state(null)))
 for(const bad of[{aspiration:'x'.repeat(81),strengths:''},{aspiration:'',strengths:null},{aspiration:'',strengths:'',user_id:id},{aspiration:'\u0001',strengths:''}])assert.equal(parseJourneyState(state(bad)),null)
 assert.equal(parseJourneyState(state({aspiration:'비공개',strengths:''},{is_mine:false,player:{is_me:false}})),null)
 assert.ok(parseJourneyState(state({aspiration:'비공개',strengths:''},{is_captain:true,player:{is_me:false}})))
})
