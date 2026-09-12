import test from 'node:test'
import assert from 'node:assert/strict'
import * as v from '../../lib/meetups/application-view.ts'
const owner='97000000-0000-4000-8000-000000000001',room='97000000-0000-4000-8000-000000000002'
const app={id:'97000000-0000-4000-8000-000000000003',admission:'accepted',payment:'held',amountKrw:17000,revision:1,chatHref:`/chat/rooms/study_room/${room}`}
test('native application links keep exact affiliation; general default stays unchanged',()=>{
 assert.equal(v.applicationBasePath(room,'study'),`/api/meetups/participation/study/${room}`)
 assert.equal(v.applicationPagePath(room,'mentoring'),`/meetups/participation/mentoring/${room}`)
 assert.equal(v.applicationBasePath(room),`/api/meetups/${room}`)
})
test('study status accepts only the current study chat, never a meetup or another room',()=>{
 assert.ok(v.parseApplicationStatusView({accountKey:owner,application:app},owner,room,'study'))
 assert.equal(v.parseApplicationStatusView({accountKey:owner,application:{...app,chatHref:`/chat/rooms/meetup/${room}`}},owner,room,'study'),null)
 assert.equal(v.parseApplicationStatusView({accountKey:owner,application:app},owner,room),null)
 assert.equal(v.parseApplicationStatusView({accountKey:owner,application:app},owner,owner,'study'),null)
})
test('mentoring role metadata is validated and private introductions remain host-only',()=>{
 const payload={accountKey:owner,room:{id:room,title:'전공 친구',memberCount:2,capacity:4},isHost:true,pendingCount:1,applications:[{...app,alias:'신청자',intro:'같이 해요',strength:'',createdAt:'2026-09-12T03:00:00Z',metadata:{role:'mentee'}}],notices:[],hasMore:false,nextCursor:null}
 assert.ok(v.parseApplicationManagementView(payload,owner,room,'mentoring'))
 assert.equal(v.parseApplicationManagementView({...payload,isHost:false},owner,room,'mentoring'),null)
 assert.equal(v.parseApplicationManagementView({...payload,applications:[{...payload.applications[0],metadata:{role:'admin'}}]},owner,room,'mentoring'),null)
})
