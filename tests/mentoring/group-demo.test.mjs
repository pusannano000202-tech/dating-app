import test from 'node:test'
import assert from 'node:assert/strict'
import {createMentoringDemo,advanceMentoringDemo} from '../../lib/mentoring/group-demo.ts'
import {parseGroupMentoringSnapshot} from '../../lib/mentoring/group-contract.ts'
test('the same group snapshot drives demo role, size, friend consent, whole-group consent, chat, meeting and post-end reporting',()=>{
 for(const side_size of [2,3]){
  let s=createMentoringDemo();const next=(action,args={})=>{s=advanceMentoringDemo(s,{action,args});assert.ok(parseGroupMentoringSnapshot(s),JSON.stringify(s))}
  next('join',{role:'mentee',side_size,friend_ids:[s.friends[0].user_id],client_id:crypto.randomUUID()});assert.equal(s.phase,'friends');assert.equal(s.party_accepted,1)
  next('demo_friend_accept');assert.equal(s.phase,'waiting');next('demo_offer');assert.equal(s.phase,'offered');assert.equal(s.member_count,side_size*2)
  next('demo_all_accept');assert.equal(s.phase,'offered','others cannot complete consent before the viewer accepts')
  next('accept');next('demo_all_accept');assert.equal(s.phase,'active');assert.equal(s.members.length,side_size*2)
  const message={session_id:s.session_id,text:'hello',client_id:crypto.randomUUID()};next('message',message);next('message',message);assert.equal(s.messages.filter(m=>m.text==='hello').length,1)
  next('plan',{session_id:s.session_id,starts_at:new Date(Date.now()+86400000).toISOString(),place:'공개 라운지',revision:0});assert.equal(s.meeting.revision,1)
  next('end',{session_id:s.session_id});assert.equal(s.phase,'ended');assert.equal(s.report_targets.length,side_size*2-1)
  next('report',{session_id:s.session_id,member_id:s.report_targets[0].id,reason:'example'});assert.deepEqual(s.messages,[])
 }
})
test('a received example invitation also requires explicit acceptance and the snapshot rejects leaked records',()=>{
 let s=advanceMentoringDemo(createMentoringDemo(),{action:'demo_invite',args:{}});assert.equal(s.phase,'idle');assert.equal(s.invitations.length,1)
 assert.equal(parseGroupMentoringSnapshot({...s,user_id:'hidden'}),null)
 assert.equal(parseGroupMentoringSnapshot({...s,report_targets:[{id:crypto.randomUUID(),label:'hidden'}]}),null)
 s=advanceMentoringDemo(s,{action:'party_accept',args:{party_id:s.invitations[0].party_id}});assert.equal(s.phase,'waiting');assert.ok(parseGroupMentoringSnapshot(s))
})
