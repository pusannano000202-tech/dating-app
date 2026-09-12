import test from 'node:test'
import assert from 'node:assert/strict'
let api;try{api=await import('../../lib/meetups/candidate-board-contract.ts')}catch{}
const id='11111111-1111-4111-8111-111111111111'
const base={scope_kind:'league',scope_key:'lol'}
test('candidate registration permits multiple canonical positions but never supplied identity or payment',()=>{
 assert.ok(api?.parseCandidateBoardArgs,'candidate board contract must exist')
 const good={...base,positions:['top','mid'],tier:'gold',intro:'차분하게 소통해요',availability:'월 · 수 / 저녁',consent:true,expected_revision:null,idempotency_key:id}
 assert.ok(api.parseCandidateBoardArgs('register',good))
 for(const patch of [{positions:['mid','mid']},{tier:'fake'},{owner_id:id},{paid:true},{consent:false},{intro:'x\u202e'}])assert.equal(api.parseCandidateBoardArgs('register',{...good,...patch}),null)
 assert.equal(api.parseCandidateBoardArgs('register',{...good,scope_kind:'study',scope_key:'pnu:AN1600527'}),null)
 assert.ok(api.parseCandidateBoardArgs('register',{...good,scope_kind:'study',scope_key:'pnu:AN1600527',positions:[],tier:null}))
})
test('candidate board requires exact owned envelope and never trusts arbitrary next destinations',()=>{
 assert.ok(api?.parseCandidateBoard,'candidate board response parser must exist')
 const board={owner_id:id,scope:{kind:'league',key:'lol'},department_label:'기계공학과',total_count:0,filtered_count:0,candidates:[],next_cursor:null,mine:null,incoming:[],outgoing:[],host_rooms:[],result:null}
 assert.ok(api.parseCandidateBoard(board))
 assert.equal(api.parseCandidateBoard({...board,result:{status:'joining',next_href:'https://evil.example',checkout_enabled:false}}),null)
 assert.equal(api.parseCandidateBoard({...board,filtered_count:1}),null)
})
