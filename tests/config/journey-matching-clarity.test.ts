import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return readFileSync(path, 'utf8')
}

test('today and scheduled entries navigate only to the returned canonical series id', () => {
  const tonight = source('components/tonight/TonightContinuationEntry.tsx')
  const scheduled = source('components/matching/ScheduledContinuationStartButton.tsx')

  for (const entry of [tonight, scheduled]) {
    assert.match(entry, /openContinuationSeries/)
    assert.match(entry, /result\.seriesId/)
    assert.match(entry, /resolveContinuationAttempt/)
    assert.doesNotMatch(entry, /\/match\/series\/current\?source_id/)
  }
})

test('discovery routes new enrollment through the calendar and preserves existing weekly participation', () => {
  const discovery = source('components/matching/QuantumMatchDiscovery.tsx')
  const weekly = source('components/matching/WeeklyActivityExplorer.tsx')
  const entryPolicy = source('lib/matching/match-entry-policy.ts')

  assert.match(discovery, /entry\.showTonight\s*\?\s*<EntryCard href="\/tonight"/)
  assert.match(discovery, /<EntryCard href=\{entry\.calendarHref\}/)
  assert.match(discovery, /matchingEntryFor\(state\?\.status \?\? null\)/)
  assert.match(discovery, /router\.replace\('\/match\/calendar'\)/)
  assert.match(entryPolicy, /calendarHref: '\/match\/calendar'/)
  assert.match(entryPolicy, /calendarHref: '\/match\/calendar\?audience=couple'/)
  assert.doesNotMatch(discovery, /<QuantumEventWheel|<WeeklyActivityExplorer/)
  assert.doesNotMatch(discovery, /role="tab(?:list)?"/)
  assert.doesNotMatch(discovery, /role="tabpanel"/)
  assert.match(discovery, /next\/image/)
  assert.match(weekly, /next\/image/)
  assert.match(weekly, /if \(!hasLiveApplication\)/)
  assert.match(weekly, /새 신청은 이벤트 캘린더에서 날짜를 고르고/)
  assert.match(weekly, /1인 보증금 1만원 확인 후 진행/)
  assert.match(weekly, /href=\{calendarHref\}/)
  assert.doesNotMatch(weekly, /\/api\/match\/weekly-availability\/apply|applyAttempt/)
  assert.match(weekly, /assigned_window_id/)
  assert.match(weekly, /확정된 한 일정/)
  assert.match(weekly, /ScheduledContinuationStartButton/)
  assert.match(weekly, /WeeklyPartyControls/)
  const partyControls = source('components/matching/WeeklyPartyControls.tsx')
  assert.match(partyControls, /cancelAttempt/)
  assert.match(partyControls, /resolveMutationAttempt/)
  assert.match(weekly, /다시 불러오기/)
  assert.match(weekly, /assignedWindow[\s\S]*?void load\(\)/)
  assert.doesNotMatch(weekly, /idempotency_key:\s*crypto\.randomUUID\(\)/)
  assert.doesNotMatch(weekly, /href=\{`\/match\/events\//)
})

test('home gives an active continuation priority and keeps the full calendar one tap away', () => {
  const home = source('components/home/QuantumHomeParticipation.tsx')
  const card = source('components/matching/FiveMeetingHomeNextActionCard.tsx')

  assert.match(home, /\/api\/match\/series\/current/)
  assert.match(home, /parseContinuationSeries/)
  assert.match(home, /FiveMeetingHomeNextActionCard/)
  assert.match(home, /initialSeries=/)
  assert.match(home, /continuationPayload === null/)
  assert.match(home, /continuation_payload_invalid/)
  assert.match(card, /href="\/calendar"/)
  assert.match(card, /전체 일정 보기/)
  assert.match(card, /actionLabel/)
})

test('calendar and post-flow separate loading, recoverable failure, and true blocked states', () => {
  const calendar = source('components/matching/FiveMeetingCalendar.tsx')
  const postFlow = source('components/matching/FiveMeetingPostFlow.tsx')

  assert.match(calendar, /type CalendarState = 'loading' \| 'ready' \| 'error'/)
  assert.match(calendar, /일정을 불러오지 못했어요/)
  assert.match(calendar, /다시 불러오기/)
  assert.match(calendar, /아직 확정된 다음 일정이 없어요/)
  assert.match(postFlow, /type AfterLoadState = 'loading' \| 'ready' \| 'blocked' \| 'error'/)
  assert.match(postFlow, /payload\?\.error === 'not_ready'/)
  assert.match(postFlow, /불러오지 못했어요/)
  assert.match(postFlow, /다시 확인/)
  assert.match(postFlow, /회차 화면으로 돌아가기/)
  assert.match(postFlow, /resolveMutationAttempt/)
  assert.doesNotMatch(postFlow, /idempotency_key:\s*crypto\.randomUUID\(\)/)
})

test('series screen exposes a direct CTA when the next occurrence is ready', () => {
  const series = source('components/matching/FiveMeetingSeriesExperience.tsx')

  assert.match(series, /series\.nextAction === 'open_occurrence'/)
  assert.match(series, /\/match\/occurrences\//)
  assert.match(series, /확정된 만남 열기/)
  assert.match(series, /href="\/calendar"/)
  assert.match(series, /resolveMutationAttempt/)
  assert.doesNotMatch(series, /idempotency_key:\s*crypto\.randomUUID\(\)/)
})
