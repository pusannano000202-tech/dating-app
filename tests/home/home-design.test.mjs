import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
test('own meetings precede discovery and retain actual auth boundary', () => {
  const home = read('app/page.tsx')
  assert.match(home, /오늘은 누구랑 놀까/)
  assert.ok(home.indexOf('<QuantumHomeMyMeetups') < home.indexOf('<QuantumHomeRecommendations'))
  assert.match(home, /supabase.auth.getUser\(\)/)
  assert.match(home, /getOnboardingRedirect\(supabase\)/)
})
test('selected playmaker photo and all discovery journeys are linked', () => {
  const source = read('components/home/QuantumHomeRecommendations.tsx')
  for (const value of ['home-playmaker-football.webp', '/community/department', '/community/voice', '/community', '우리 과 이름으로']) assert.ok(source.includes(value), value)
  assert.doesNotMatch(source, /두 가지만 골랐어요/)
})
test('home matching and continuation use compact presentation without public future schedules', () => {
  assert.match(read('components/home/QuantumHomeParticipation.tsx'), /initialSeries=\{continuation\} compact/)
  assert.match(read('components/matching/QuantumParticipationCommandCenter.tsx'), /placement === 'home'\) \{/)
  assert.match(read('components/matching/FiveMeetingHomeNextActionCard.tsx'), /if \(compact\)/)
})
test('weekly home entry opens the scheduled discovery rather than the tonight default', () => {
  assert.ok(read('components/home/QuantumHomeLead.tsx').includes('/match?discovery=scheduled'))
  assert.ok(read('components/matching/QuantumMatchDiscovery.tsx').includes("get('discovery') === 'scheduled'"))
})
