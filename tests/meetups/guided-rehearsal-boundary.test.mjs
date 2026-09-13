import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('rehearsal is restricted to development and offline UI server mode', () => {
  const source = readFileSync(new URL('../../app/meetups/dev-flow/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /process\.env\.NODE_ENV !== 'development'/)
  assert.match(source, /process\.env\.QUANTUM_LOCAL_RUNTIME_MODE !== 'offline-ui'/)
  assert.match(source, /notFound\(\)/)
  assert.ok(source.indexOf('notFound()') < source.indexOf('return <'))
  assert.doesNotMatch(source, /searchParams.*allow|auth.*bypass|SUPABASE_SERVICE/i)
})

test('rehearsal uses application views, labels examples, and writes no external state', () => {
  const source = readFileSync(new URL('../../components/qa/GuidedParticipationPreview.tsx', import.meta.url), 'utf8')
  for (const view of ['DepartmentLeagueJourney', 'MentoringExperience', 'DepartmentCourseDiscovery']) {
    assert.match(source, new RegExp('<' + view + '[^>]*demo'))
  }
  assert.match(source, /예시 체험/)
  assert.match(source, /실제 참가/)
  assert.doesNotMatch(source, /fetch\(|\.rpc\(|localStorage\.setItem|sessionStorage\.setItem/)
})
