import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8')

test('create connection and trusted-origin errors are not disguised as invalid form input',()=>{
 const source=read('components/meetups/CreateMeetupForm.tsx')
 const fn=source.slice(source.indexOf('function getCreateError'))
 assert.match(fn,/error === 'request_not_allowed'/)
 assert.match(fn,/error === 'community_unavailable'/)
 assert.match(fn,/입력한 내용은 유지/)
 assert.match(read('app/api/meetups/route.ts'),/assertTrustedMutationOrigin\(req\)/)
})
test('next stages do not publish and unknown outcomes retain a bounded idempotent retry',()=>{
  const source=read('components/meetups/CreateMeetupForm.tsx')
  const submit=source.slice(source.indexOf('async function submit'),source.indexOf('  const photo'))
  assert.ok(submit.indexOf('if (step < 3) { nextStep(); return }')<submit.indexOf("fetch('/api/meetups'"))
  assert.ok(submit.includes('if (submitLock.current) return'))
  assert.ok(submit.includes('controller.abort(), 15000'))
  assert.ok(submit.includes('idempotency_key: attempt.idempotencyKey'))
  assert.ok(submit.includes('createdMeetupHref(payload)'))
  assert.ok(!submit.includes('createAttemptRef.current = null'))
})
test('department study discovery removes level entry but keeps old room level URLs usable',()=>{
  const discovery=read('components/meetups/DepartmentCourseDiscovery.tsx')
  const room=read('components/meetups/StudyRoomExperience.tsx')
  assert.ok(!discovery.includes('styles.levelPanel'))
  assert.ok(!discovery.includes('&level='))
  assert.ok(!room.includes('getStudyLevelOptions'))
  assert.ok(room.includes("isStudyRoomLevel(params.get('level'))"))
})
test('login return keeps custom room scope rather than silently switching to whole campus',()=>{
  const source=read('components/meetups/MeetupHub.tsx')
  assert.ok(source.includes("returnParams.set('scope_type', memberScope)"))
  assert.ok(source.includes("params.set('scope_type', memberScope)"))
  assert.ok(source.includes("createParams.set('scope', memberScope)"))
  assert.equal(source.match(/href=\{createHref\}/g)?.length,3)
  assert.ok(source.includes('if (categoryGroup) setDiscoveryScope(categoryGroup.id)'))
})
