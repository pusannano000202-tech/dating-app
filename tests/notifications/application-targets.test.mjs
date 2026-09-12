import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveSocialLink} from '../../lib/notifications/common-contract.ts'
const id='96000000-0000-4000-8000-000000000001'
test('host review and authorized social chat routes resolve without reassigning to another tab',()=>{
 for(const href of [`/meetups/${id}/applications`,`/meetups/${id}/apply`,`/chat/rooms/meetup/${id}`,`/chat/league-team/${id}`,`/chat/rooms/mentoring/${id}`]) assert.equal(resolveSocialLink({status:'current',href}),href)
})
test('notification payload cannot supply external or mismatched chat query targets',()=>{
 for(const href of [`/chat/rooms/meetup/${id}?next=https://evil.test`,`/chat/rooms/meetup/${id}?room=${id}`,`/chat/rooms/matching/${id}`,'//evil.test','https://evil.test','/chat/rooms/meetup/../admin']) assert.equal(resolveSocialLink({status:'current',href}),null)
 assert.equal(resolveSocialLink({status:'ended',href:`/chat/rooms/meetup/${id}`}),null)
})
