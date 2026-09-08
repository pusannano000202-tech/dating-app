// Dedicated local stack only. Creates labeled local QA meetups; no remote URL,
// service-role access, account/profile edits or cleanup of user data is allowed.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const cli = 'C:/Users/82108/AppData/Local/npm-cache/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-windows-x64/bin/supabase.exe'
const status = JSON.parse(execFileSync(cli, ['status', '--workdir', '.tmp/integrated-live-local', '-o', 'json'], {
  encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
}))
assert.equal(status.API_URL, 'http://127.0.0.1:56421')
const app = 'http://localhost:3010'
const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const sent = await client.auth.signInWithOtp({ phone: '821000000002' })
assert.equal(sent.error, null, 'local test OTP request')
const verified = await client.auth.verifyOtp({ phone: '821000000002', token: '100002', type: 'sms' })
assert.equal(verified.error, null, 'local test OTP verification')
assert.ok(verified.data.session?.access_token)
const token = verified.data.session.access_token

async function request(path, method = 'GET', body) {
  const response = await fetch(`${app}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: app },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}
const base = {
  category: 'running', title: '[로컬 검수] 여자끼리 저녁 러닝',
  description: '실제 모집이 아닌 로컬 성별 조건 검수용 모임입니다.', place_name: '부산대 정문',
  scheduled_at: new Date(Date.now() + 48 * 3600_000).toISOString(), capacity: 4,
}
let count = 0
function checked() { count += 1 }
const profile = await request('/api/profile/basic')
assert.equal(profile.status, 200); assert.equal(profile.body.profile.gender, 'female'); checked()
for (const mode of [null, '', 'mixed', true]) {
  const invalid = await request('/api/meetups', 'POST', { ...base, gender_mode: mode })
  assert.equal(invalid.status, 400); assert.equal(invalid.body.error, 'invalid_gender_mode'); checked()
}
const denied = await request('/api/meetups', 'POST', { ...base, gender_mode: 'male_only', gender: 'male' })
assert.equal(denied.status, 403); assert.equal(denied.body.error, 'meetup_gender_restricted'); checked()
const directDenied = await client.rpc('create_activity_meetup_v2', {
  p_category: base.category, p_title: base.title, p_description: base.description,
  p_place_name: base.place_name, p_scheduled_at: base.scheduled_at, p_capacity: base.capacity, p_gender_mode: 'male_only',
})
assert.equal(directDenied.error?.message, 'meetup_gender_restricted'); checked()
const invalidQuery = await request('/api/meetups?gender_mode=mixed')
assert.equal(invalidQuery.status, 400); checked()
const rowsBefore = await request('/api/meetups')
assert.equal(rowsBefore.status, 200); assert.equal(rowsBefore.body.availability, 'ready')
let row = rowsBefore.body.meetups.find(value => value.title === base.title && value.is_host)
if (!row) {
  const created = await request('/api/meetups', 'POST', { ...base, gender_mode: 'female_only' })
  assert.equal(created.status, 201); row = created.body.meetup
}
assert.equal(row.gender_mode, 'female_only'); assert.equal(row.gender_eligibility, 'eligible'); checked()
const listed = await request('/api/meetups?gender_mode=female_only')
assert.ok(listed.body.meetups.some(value => value.id === row.id))
assert.ok(listed.body.meetups.every(value => value.gender_mode === 'female_only'))
assert.ok(listed.body.meetups.every(value => !('community_gender' in value) && !('host_user_id' in value)))
checked()
const maleList = await request('/api/meetups?gender_mode=male_only')
assert.ok(maleList.body.meetups.every(value => value.gender_mode === 'male_only'))
assert.ok(!maleList.body.meetups.some(value => value.id === row.id)); checked()
const repeated = await request(`/api/meetups/${row.id}/join`, 'POST')
assert.equal(repeated.status, 200); assert.equal(repeated.body.membership.reused, true); checked()
console.log(JSON.stringify({ result: 'PASS', checks: count, scope: 'dedicated-local-otp-api-and-rpc', labeledLocalMeetupId: row.id, secretsLogged: false }))
