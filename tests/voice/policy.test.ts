import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRoomInput, parseVoiceCommand, voiceProviderConfig, mayPair } from '../../lib/voice/policy'
import { makeParticipationSummary, parseParticipationSummary } from '../../lib/participation/summary'

test('public totals include a single participant without an optional disclosure switch', () => {
  const result = makeParticipationSummary('r', ['female'], 'connected_to_voice', new Date('2026-09-07T01:00:00Z'))
  assert.equal(result.genderBreakdown.femalePeople, 1)
  assert.equal(result.totalPeople, 1)
  assert.equal(result.disclosureBasis, 'all_valid_participants')
  assert.deepEqual(parseParticipationSummary(result), result)
  assert.throws(() => parseParticipationSummary({...result,totalPeople:2}))
  assert.throws(() => parseParticipationSummary({...result,genderBreakdown:null}))
})
test('unrecognized gender is not guessed and duplicates must be removed by the scoped DB query', () => {
  const result = makeParticipationSummary('r',['male','female','unknown','other','prefer_not_to_say'],'waiting_for_voice')
  assert.equal(result.genderBreakdown.otherOrUnspecifiedPeople,3)
  assert.equal(result.totalPeople,5)
})
test('operator room validation bounds capacity and requires verified sports source', () => {
  const room = {title:'오늘 야구 같이 볼 사람',topic:'baseball',description:'중계는 각자, 응원은 함께',capacity:12,startsAt:'2026-09-08T10:00:00Z',endsAt:'2026-09-08T13:00:00Z',scope:'school',departmentKey:null,sourceUrl:'https://www.koreabaseball.com/Schedule/Schedule.aspx',sourceRevision:'2026-09-07 확인',sourceEventKey:'20260908-example-game'}
  assert.equal(parseRoomInput(room).capacity,12)
  assert.throws(() => parseRoomInput({...room,sourceUrl:null}))
  assert.throws(() => parseRoomInput({...room,capacity:200}))
  assert.throws(() => parseRoomInput({...room,endsAt:room.startsAt}))
  assert.throws(() => parseRoomInput({...room,scope:'department',departmentKey:null}))
  assert.throws(() => parseRoomInput({...room,sourceEventKey:'not a key'}), /invalid_input/)
  assert.throws(() => parseRoomInput({...room,sourceUrl:'invalid url'}), /invalid_input/)
})
test('missing provider never pretends that audio works', () => {
  assert.equal(voiceProviderConfig({}),null)
  assert.equal(voiceProviderConfig({LIVEKIT_URL:'wss://live.example',LIVEKIT_API_KEY:'key'}),null)
  assert.throws(() => voiceProviderConfig({LIVEKIT_URL:'http://untrusted.example',LIVEKIT_API_KEY:'key',LIVEKIT_API_SECRET:'secret'}))
  assert.equal(voiceProviderConfig({LIVEKIT_URL:'ws://127.0.0.1:7880',LIVEKIT_API_KEY:'key',LIVEKIT_API_SECRET:'secret'})?.url,'ws://127.0.0.1:7880')
  for (const url of ['wss://voice.example/path','wss://voice.example/?token=x','wss://voice.example/#x']) {
    assert.throws(() => voiceProviderConfig({LIVEKIT_URL:url,LIVEKIT_API_KEY:'key',LIVEKIT_API_SECRET:'secret'}), /invalid_voice_provider/)
  }
  assert.throws(() => voiceProviderConfig({NODE_ENV:'production',LIVEKIT_URL:'ws://127.0.0.1:7880',LIVEKIT_API_KEY:'key',LIVEKIT_API_SECRET:'secret'}))
})
test('commands require revision and UUID idempotency; clients cannot supply identity or force microphones', () => {
  const command={action:'join',expectedRevision:0,idempotencyKey:'11111111-1111-4111-8111-111111111111',mode:'listen'}
  assert.equal(parseVoiceCommand(command).action,'join')
  assert.throws(() => parseVoiceCommand({...command,userId:'attacker'}))
  assert.throws(() => parseVoiceCommand({...command,expectedRevision:-1}))
  assert.throws(() => parseVoiceCommand({...command,action:'force_mic'}))
})
test('random voice pairs same school/topic, excludes block/skip/self, but not same department', () => {
  const a={userId:'a',school:'pnu',topic:'worries',eligible:true,department:'mechanical'}
  const b={...a,userId:'b'}
  assert.equal(mayPair(a,b,[],[]),true)
  assert.equal(mayPair(a,b,[['a','b']],[]),false)
  assert.equal(mayPair(a,b,[],[['b','a']]),false)
  assert.equal(mayPair(a,{...b,school:'other'},[],[]),false)
  assert.equal(mayPair(a,{...b,eligible:false},[],[]),false)
})
