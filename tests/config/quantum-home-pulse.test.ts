import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()

function readSource(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

test('home connects the Quantum pulse to live meetup, hot-post, and notification entry points', () => {
  const page = readSource('app/page.tsx')
  const pulsePath = join(ROOT, 'components/home/QuantumHomePulse.tsx')

  assert.ok(existsSync(pulsePath), 'the home live-data pulse component should exist')
  assert.match(page, /import NotificationBell from '@\/components\/NotificationBell'/)
  assert.match(page, /<NotificationBell\s*\/>/)
  assert.match(page, /<QuantumHomePulse\s*\/>/)

  const pulse = readFileSync(pulsePath, 'utf8')
  assert.match(pulse, /\/api\/meetups\?limit=3/)
  assert.match(pulse, /\/api\/community\/posts\?feed=hot&limit=3/)
  assert.match(pulse, /slice\(0, 3\)/)
  assert.match(pulse, /최근 7일 핫글/)
  assert.match(pulse, /href="\/meetups"/)
  assert.match(pulse, /href="\/community\/hot"/)
})

test('home live-data empty states stay honest and keep a next action available', () => {
  const pulsePath = join(ROOT, 'components/home/QuantumHomePulse.tsx')
  assert.ok(existsSync(pulsePath), 'the home live-data pulse component should exist')
  const pulse = readFileSync(pulsePath, 'utf8')

  assert.match(pulse, /아직 모집 중인 모임이 없어요/)
  assert.match(pulse, /최근 7일 핫글이 아직 없어요/)
  assert.match(pulse, /모임 만들기/)
  assert.match(pulse, /커뮤니티 보기/)
  assert.doesNotMatch(pulse, /featuredMeetupIdeas|like_count \?\? [1-9]/)
})

test('home surfaces only a real saved Quantum event participation', () => {
  const page = readSource('app/page.tsx')
  const participation = readSource('components/home/QuantumHomeParticipation.tsx')
  const commandCenter = readSource('components/matching/QuantumParticipationCommandCenter.tsx')

  assert.match(page, /QuantumHomeParticipation/)
  assert.match(page, /<QuantumHomeParticipation\s+fallback=\{<QuantumHomeLead\s*\/>\}\s*\/>/)
  assert.match(participation, /\/api\/match\/event-participation/)
  assert.match(participation, /QuantumParticipationCommandCenter/)
  assert.match(participation, /신청 상태를 불러오지 못했어요/)
  assert.match(commandCenter, /지금 편성 중/)
  assert.match(commandCenter, /내 신청 현황 보기/)
  assert.doesNotMatch(participation, /mock|fixture|fake/i)
})
