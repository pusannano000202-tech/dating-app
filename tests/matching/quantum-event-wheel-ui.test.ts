import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const source = readFileSync(join(process.cwd(), 'components/matching/QuantumEventWheel.tsx'), 'utf8')
const discovery = readFileSync(join(process.cwd(), 'components/matching/QuantumMatchDiscovery.tsx'), 'utf8')
const commandCenter = readFileSync(join(process.cwd(), 'components/matching/QuantumParticipationCommandCenter.tsx'), 'utf8')

test('event wheel exposes full mobile touch targets and stable portrait cards', () => {
  assert.match(source, /h-14 w-14/)
  assert.match(source, /aspect-\[4\/5\]/)
  assert.match(source, /object-position-center/)
  assert.match(source, /이전 활동/)
  assert.match(source, /다음 활동/)
})

test('legacy wheel owns its participation state but discovery navigates into the dated calendar', () => {
  assert.match(source, /onParticipationStateChange/)
  assert.match(source, /if \(participation && !dismissedCancelledParticipation\)/)
  assert.match(source, /chooseAnother && participationStage === 'cancelled'/)
  assert.match(source, /QuantumParticipationCommandCenter/)
  assert.match(discovery, /href=\{entry\.calendarHref\}/)
  assert.match(discovery, /router\.replace\('\/match\/calendar'\)/)
  assert.doesNotMatch(discovery, /<QuantumEventWheel|<WeeklyActivityExplorer/)
  assert.doesNotMatch(discovery, /hasParticipation/)
  assert.doesNotMatch(discovery, /onParticipationStateChange/)
  assert.match(source, /if \(!participation \|\| saving\) return/)
  assert.match(commandCenter, /이 약속 참여 취소/)
})
