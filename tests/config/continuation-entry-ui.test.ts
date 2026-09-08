import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('matching discovery keeps both first-meeting modes without revealing future continuation days', () => {
  const source = readFileSync('components/matching/QuantumMatchDiscovery.tsx', 'utf8')
  assert.match(source, /TonightRankedEntryCard/)
  assert.match(source, /WeeklyActivityExplorer/)
  assert.doesNotMatch(source, /ContinuationJourneyGuide|ContinuationContentGuide|Day [1-5]|5일 코스/)
  const guide = readFileSync('components/matching/ContinuationJourneyGuide.tsx', 'utf8')
  assert.match(guide, /이어 만나는 5일 코스 알아보기/)
  assert.match(guide, /보드게임으로 처음 만났다면 Day 2/)
  assert.match(guide, /다른 활동으로 만났다면 Day 1/)
  assert.match(guide, /getContinuationDayDefinitions/)
  assert.match(guide, /<ContinuationContentGuide/)
  assert.doesNotMatch(guide, /fetch\(|method:\s*['"]POST|localStorage|sessionStorage/)
})

test('Tonight continuation opens the canonical returned series and leaves choices private', () => {
  const entry = readFileSync('components/tonight/TonightContinuationEntry.tsx', 'utf8')
  const journey = readFileSync('lib/matching/continuation-journey-client.ts', 'utf8')
  assert.match(entry, /openContinuationSeries/)
  assert.match(entry, /resolveContinuationAttempt/)
  assert.match(entry, /result\.seriesId/)
  assert.match(entry, /source_not_ready/)
  assert.match(entry, /다른 사람에게 공개되지/)
  assert.doesNotMatch(entry, /\/match\/series\/current\?source_id/)
  assert.match(journey, /source-from-tonight/)
  assert.match(journey, /request\('\/api\/match\/series'/)
  assert.match(journey, /idempotency_key: attempt\.sourceKey/)
  assert.match(journey, /idempotency_key: attempt\.seriesKey/)
  const parent = readFileSync('components/tonight/UserTonightExperience.tsx', 'utf8')
  assert.match(parent, /mode === 'live' && data.round.status === 'completed' && journey\?\.teamId/)
})
