import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

test('campus seven API reads only the authenticated dashboard RPC', () => {
  const route = read('app/api/campus-seven/route.ts')

  assert.match(route, /supabase\.auth\.getUser\(\)/)
  assert.match(route, /get_my_campus_seven_dashboard/)
  assert.match(route, /getCampusSevenFeatureState/)
  assert.match(route, /getCampusSevenLiveGuide/)
  assert.match(route, /getCampusSevenActionAvailability/)
  assert.match(route, /const now = new Date\(\)\.toISOString\(\)/)
  assert.match(route, /now,/)
  assert.match(route, /redactCampusSevenLocation/)
  assert.match(route, /liveGuide/)
  assert.match(route, /actionAvailability/)
  assert.doesNotMatch(route, /\.from\(['"]campus_seven_/)
})

test('applications require their own server flag and submit through the eligibility RPC', () => {
  const route = read('app/api/campus-seven/apply/route.ts')
  const env = read('.env.example')
  const localEnv = read('.env.local.example')

  assert.match(route, /applicationsOpen/)
  assert.match(route, /apply_to_campus_seven/)
  assert.match(route, /containsProhibitedContact/)
  assert.match(route, /cohort_photo_display/)
  assert.match(route, /profile_photo_required/)
  assert.match(route, /campus-seven-v2/)
  assert.match(env, /NEXT_PUBLIC_CAMPUS_SEVEN_ENABLED=false/)
  assert.match(env, /CAMPUS_SEVEN_APPLICATIONS_OPEN=false/)
  assert.match(env, /CAMPUS_SEVEN_CARD_PAYMENTS_ENABLED=false/)
  assert.match(localEnv, /NEXT_PUBLIC_CAMPUS_SEVEN_ENABLED=false/)
})

test('action API uses an explicit allowlist instead of caller-provided RPC names', () => {
  const route = read('app/api/campus-seven/actions/route.ts')

  assert.match(route, /switch \(body\.action\)/)
  assert.match(route, /submit_campus_seven_interest_vote/)
  assert.match(route, /submit_campus_seven_safety_report/)
  assert.match(route, /submit_campus_seven_game_rank/)
  assert.match(route, /appeal_campus_seven_deposit_review/)
  assert.match(route, /respond_campus_seven_final_proposal/)
  assert.match(route, /day_six_choice_closed/)
  assert.match(route, /date_response_window_closed/)
  assert.match(route, /final_response_window_closed/)
  assert.doesNotMatch(route, /rpc\(body\.(action|rpc)/)
})

test('attendance upload is private and scoped to the authenticated user folder', () => {
  const route = read('app/api/campus-seven/attendance-upload/route.ts')

  assert.match(route, /campus-seven-attendance/)
  assert.match(route, /user\.id/)
  assert.match(route, /createSignedUploadUrl/)
  assert.match(route, /get_my_campus_seven_dashboard/)
  assert.match(route, /dashboard\.schedule\.id !== scheduleId/)
  assert.doesNotMatch(route, /getPublicUrl|publicUrl/)
})

test('card payment endpoint remains absent until payment and legal review are approved', () => {
  assert.equal(existsSync(join(ROOT, 'app/api/campus-seven/card-purchase/route.ts')), false)
})
