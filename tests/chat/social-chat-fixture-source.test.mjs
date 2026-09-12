import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {meetupSchemaSection} from './social-chat-fixture.mjs'

const path=new URL('../../supabase/migrations/20260906181225_community_social_integrated.sql',import.meta.url)
for(const newline of ['\n','\r\n']){
 test(`meetup fixture loads real schema with ${newline==='\n'?'LF':'CRLF'} checkouts`,async()=>{
  const source=(await readFile(path,'utf8')).replace(/\r\n/g,'\n').replace(/\n/g,newline)
  const section=meetupSchemaSection(source)
  assert.ok(section.startsWith('alter table public.activity_meetups\n'))
  assert.ok(section.includes('add column department_label text'))
  assert.ok(section.includes('create table public.activity_meetup_messages ('))
  assert.equal(section.includes('create table public.department_challenges ('),false)
  assert.equal(section.includes('\r'),false)
 })
}
test('missing or reversed schema markers fail before a fixture can execute an empty section',()=>{
 const start='alter table public.activity_meetups\n',end='create table public.department_challenges ('
 for(const source of ['',end,start,end+'\n'+start]){
  assert.throws(()=>meetupSchemaSection(source),/social_chat_fixture_meetup_schema_markers_missing/)
 }
})
