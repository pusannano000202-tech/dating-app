import test from 'node:test'
import assert from 'node:assert/strict'
import { assertSocialScenesSchemaReady, SOCIAL_SCENES_SCHEMA_PROBE_SQL } from '../../scripts/qa/social-scenes-schema-preflight.mjs'

const names = ['league_notices', 'admission_checkout', 'chat_sender_identity', 'native_polls', 'room_presentation', 'cancellation_liability', 'erasure_guard', 'admission_refunds', 'payment_reconciliation']
const ready = () => Object.fromEntries(names.map(name => [name, true]))

test('requires actual catalog evidence, not a migration filename snapshot', () => {
  assert.deepEqual(assertSocialScenesSchemaReady(JSON.stringify(ready())), { ready: true, checked: names })
  const missing = ready(); missing.chat_sender_identity = false; missing.admission_refunds = false
  assert.throws(() => assertSocialScenesSchemaReady(JSON.stringify(missing)), /social_scenes_schema_missing:chat_sender_identity,admission_refunds/)
})

test('fails closed on missing, malformed, or non-boolean catalog output', () => {
  for (const output of ['', 'null', '[]', '{}', '{secret}', JSON.stringify({...ready(), admission_refunds:'true'}), JSON.stringify({...ready(), extra:true})]) {
    assert.throws(() => assertSocialScenesSchemaReady(output), /social_scenes_schema_probe_invalid/)
  }
})

test('probe is read-only and checks identity plus money and legacy adapters', () => {
  assert.match(SOCIAL_SCENES_SCHEMA_PROBE_SQL, /BEGIN READ ONLY;/)
  assert.match(SOCIAL_SCENES_SCHEMA_PROBE_SQL, /ROLLBACK;/)
  assert.match(SOCIAL_SCENES_SCHEMA_PROBE_SQL, /get_my_activity_meetup_chat/)
  assert.match(SOCIAL_SCENES_SCHEMA_PROBE_SQL, /list_my_meetup_admission_refunds/)
  assert.doesNotMatch(SOCIAL_SCENES_SCHEMA_PROBE_SQL, /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\s/i)
})
