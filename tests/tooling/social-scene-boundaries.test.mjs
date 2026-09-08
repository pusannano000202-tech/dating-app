import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import test from 'node:test'

test('switching a voice photo clears the previous team entry before opening another topic', () => {
  const source = readFileSync('components/voice/VoiceHub.tsx','utf8')
  assert.match(source,/onChange=\{\(id\) => \{\s*setCheerOpen\(false\)\s*setSelectedTeamId\(null\)\s*setRulesConfirmed\(false\)\s*setJoinError\(''\)/)
})

test('places has a real category destination and never presents unverified places as a live tournament', () => {
  assert.ok(existsSync('app/community/places/page.tsx'))
  const source=readFileSync('components/community/PlaceExperienceExplorer.tsx','utf8')
  for(const label of ['PC방','헬스장','보드게임방']) assert.ok(source.includes(label))
  assert.match(source,/PhotoSceneCarousel/)
  assert.match(source,/후보.*확인 중/)
  assert.match(source,/rel="noopener noreferrer"/)
})

test('public matching discovery no longer reveals upcoming continuation days', () => {
  const source=readFileSync('components/matching/QuantumMatchDiscovery.tsx','utf8')
  assert.doesNotMatch(source,/ContinuationJourneyGuide|ContinuationContentGuide|5일 코스|Day [1-5]/)
  assert.match(source,/WeeklyActivityExplorer/)
  assert.match(source,/TonightRankedEntryCard/)
  assert.ok(existsSync('components/matching/ContinuationContentGuide.tsx'), 'private content implementation must not be deleted')
  const entry=readFileSync('components/tonight/TonightContinuationEntry.tsx','utf8')
  assert.doesNotMatch(entry,/Day [1-5]|보드게임|5일 코스/)
  assert.match(entry,/내 선택은 다른 사람에게 공개되지/)
})
