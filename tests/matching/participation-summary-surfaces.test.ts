import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string): string {
  return readFileSync(path, 'utf8')
}

test('Tonight user API returns the authorized aggregate and the client parses it', () => {
  const route = source('app/api/tonight/route.ts')
  const adapter = source('components/tonight/live-adapters.ts')
  const types = source('components/tonight/types.ts')

  assert.match(route, /get_my_tonight_participation_summary/)
  assert.match(route, /participation_summary:\s*participationSummary/)
  assert.match(adapter, /parseParticipationSummary\(response\.participation_summary\)/)
  assert.match(types, /participationSummary:\s*ParticipationSummary/)
})

test('Tonight user UI displays every exact registered-gender bucket', () => {
  const experience = source('components/tonight/UserTonightExperience.tsx')
  assert.match(experience, /이번 회차 신청 현황/)
  assert.match(experience, /summary\?\.totalPeople/)
  assert.match(experience, /남성/)
  assert.match(experience, /여성/)
  assert.match(experience, /기타·미확인/)
  assert.match(experience, /취소를 제외한 유효 신청 기준/)
})

test('weekly date cards distinguish applicant people from assigned people', () => {
  const explorer = source('components/matching/WeeklyActivityExplorer.tsx')
  assert.match(explorer, /applicant_count:\s*number/)
  assert.match(explorer, /신청\s*\{window\.applicant_count\}명/)
  assert.match(explorer, /배정\s*\{window\.assigned_count\}명/)
})
