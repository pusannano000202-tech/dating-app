import test from 'node:test'
import assert from 'node:assert/strict'
import {parseHostedMentoringCommand, parseHostedMentoringList, parseHostedMentoringDetail} from '../../lib/mentoring/hosted-contract.ts'
const id='51000000-0000-4000-8000-000000000001'
const room={id,title:'학교생활 함께 이야기해요',topic:'campus',side_size:2,mentor_count:1,mentee_count:0,member_count:1,status:'open',joined:true,is_host:true,revision:0,expires_at:'2026-09-26T03:00:00Z',department_label:'미래에너지공학과'}
test('hosted creation requires explicit individual role, size, title and request key; cannot accept friends or money',()=>{
 const args={title:room.title,topic:'campus',role:'mentor',side_size:2,client_id:id}
 assert.ok(parseHostedMentoringCommand({action:'create',args}))
 for(const extra of [{friend_ids:[id]},{user_id:id},{paid:true},{amount:0}])assert.equal(parseHostedMentoringCommand({action:'create',args:{...args,...extra}}),null)
 for(const invalid of [{side_size:1},{role:'admin'},{title:' '},{client_id:'bad'}])assert.equal(parseHostedMentoringCommand({action:'create',args:{...args,...invalid}}),null)
 assert.equal(parseHostedMentoringCommand({action:'join',args:{session_id:id}}),null)
})
test('one accepted host is a valid current room; overquota and leaked roster fields are rejected',()=>{
 assert.ok(parseHostedMentoringList({owner_id:id,rooms:[room]}))
 assert.equal(parseHostedMentoringList({owner_id:id,rooms:[{...room,mentor_count:3,member_count:3}]}),null)
 assert.equal(parseHostedMentoringList({owner_id:id,rooms:[{...room,members:[id]}]}),null)
 const data={owner_id:id,room:{...room,my_role:'mentor',members:[{id,role:'mentor',label:'멘토 1',mine:true,is_host:true}],messages:[],meeting:null,report_targets:[]}}
 assert.ok(parseHostedMentoringDetail(data))
 assert.equal(parseHostedMentoringDetail({...data,room:{...data.room,members:[{...data.room.members[0],user_id:id}]}}),null)
})

test('restricted participation recovery accepts only a closed redacted row, never active or malformed flags',()=>{
 const restricted={...room,title:'참여 상태를 확인할 멘토링',department_label:'참여 관리',participation_restricted:true,joined:false,is_host:false,status:'closed',mentor_count:0,mentee_count:0,member_count:0}
 assert.ok(parseHostedMentoringList({owner_id:id,rooms:[restricted]}))
 assert.ok(parseHostedMentoringList({owner_id:id,rooms:[{...room,participation_restricted:false}]}))
 for(const change of [{participation_restricted:'true'},{participation_restricted:null},{joined:true},{is_host:true},{status:'open'},{mentor_count:1,member_count:1}]) {
  assert.equal(parseHostedMentoringList({owner_id:id,rooms:[{...restricted,...change}]}),null)
 }
 const detail={...restricted,my_role:'mentee',members:[],messages:[],meeting:null,report_targets:[]}
 assert.ok(parseHostedMentoringDetail({owner_id:id,room:detail}))
 assert.equal(parseHostedMentoringDetail({owner_id:id,room:{...detail,members:[{id,role:'mentor',label:'알 수 없는 상대',mine:false,is_host:true}]}}),null)
})
