import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('participation preview stays inside the development-only offline UI guard', () => {
  const route = readFileSync('app/community/voice/dev-global-runtime/page.tsx', 'utf8')
  assert.match(route, /process\.env\.NODE_ENV === 'production'/)
  assert.match(route, /process\.env\.QUANTUM_LOCAL_RUNTIME_MODE !== 'offline-ui'/)
  assert.ok(route.indexOf('notFound()') < route.indexOf("params.panel === 'participation'"))
  assert.match(route, /return <VoiceGlobalDockFixture initialState=/)
})

test('participation preview explicitly labels sample states and never enters a voice queue', () => {
  const source = readFileSync('components/qa/VoiceParticipationFixture.tsx', 'utf8')
  assert.match(source, /예시 데이터 · 실제 대기\/통화 연결 없음/)
  assert.match(source, /VoiceParticipation state=\{state\}/)
  for (const scenario of ['people', 'zero', 'one', 'unknown', 'loading', 'error']) {
    assert.ok(source.includes(`id: '${scenario}'`))
  }
  assert.doesNotMatch(source, /\bfetch\s*\(|\bvoiceFetch\s*\(|cancelWaiting\(|sessionCommand\(/)
})
