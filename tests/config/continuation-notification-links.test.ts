import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { continuationNotificationPresentation } from '../../lib/notifications/continuation-presentation'
test('candidate can navigate straight to private join consent without series access', () => {
  const value = continuationNotificationPresentation('meeting_reminder', {continuation_kind:'join_consent_request',deep_link:'/match/series/join'})
  assert.equal(value?.href, '/match/series/join')
  assert.match(value?.title ?? '', /합류.*동의/)
  assert.equal(continuationNotificationPresentation('meeting_reminder',{continuation_kind:'join_consent_request',deep_link:'https://evil.test'}), null)
})
test('continuation notification URLs accept only their exact first-party destination', () => {
  const id='1f503975-90ad-4bb3-b48e-a9c8d7ab6098'
  assert.equal(continuationNotificationPresentation('meeting_reminder',{continuation_kind:'schedule_changed',deep_link:`/match/occurrences/${id}`})?.href, `/match/occurrences/${id}`)
  for (const deep_link of ['//evil.test','/match/series/join?next=//evil.test','/admin','/match/series/../admin']) {
    assert.equal(continuationNotificationPresentation('meeting_reminder',{continuation_kind:'series_closed',deep_link}), null)
  }
  const page=readFileSync('app/notifications/page.tsx','utf8')
  assert.ok((page.match(/continuationNotificationPresentation\(kind, payload\)/g) ?? []).length >= 3)
})
