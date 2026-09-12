import test from 'node:test'
import assert from 'node:assert/strict'
import {parseStudyRoomList} from '../../lib/meetups/study-room-contract.ts'

const room={id:'11111111-1111-4111-8111-111111111111',course_id:'pnu:AN1600527',course_name:'공학미적분학',level:'beginner',department_label:'기계공학과',room_number:1,capacity:5,member_count:1,joined:true,current_session:1,status:'recruiting',admission_mode:'hosted',title:'함께 푸는 미적분',is_host:false}

test('study contract preserves the effective recruitment-closed flag without changing legacy status',()=>{
 for(const recruitment_closed of [true,false]){
  const result=parseStudyRoomList({rooms:[{...room,recruitment_closed}]})
  assert.equal(result.rooms[0].recruitment_closed,recruitment_closed)
  assert.equal(result.rooms[0].status,'recruiting')
 }
 assert.equal('recruitment_closed'in parseStudyRoomList({rooms:[room]}).rooms[0],false)
})

test('study contract rejects malformed recruitment flags instead of treating them as open',()=>{
 for(const recruitment_closed of ['true','false',0,1,null,{}])assert.equal(parseStudyRoomList({rooms:[{...room,recruitment_closed}]}),null)
})
