import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

test('matching entry preserves tonight and routes scheduled discovery to the event calendar', () => {
  const homeLead = read('components/home/QuantumHomeLead.tsx')
  const discovery = read('components/matching/QuantumMatchDiscovery.tsx')
  const policy = read('lib/matching/match-entry-policy.ts')

  assert.match(homeLead, /href="\/tonight"/)
  assert.match(homeLead, /사진 3장/)
  assert.match(discovery, /href="\/tonight"/)
  assert.match(discovery, /entry\.showTonight/)
  assert.match(discovery, /href=\{entry\.calendarHref\}/)
  assert.match(discovery, /get\('discovery'\) === 'scheduled'/)
  assert.match(discovery, /router\.replace\('\/match\/calendar'\)/)
  assert.match(policy, /\/match\/calendar\?audience=couple/)
  assert.match(policy, /이벤트 캘린더/)
  assert.doesNotMatch(discovery, /<WeeklyActivityExplorer/)
  assert.doesNotMatch(discovery, /<QuantumEventWheel/)
})
