import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function readSource(relativePath: string) {
  const absolutePath = path.join(process.cwd(), relativePath)
  assert.ok(fs.existsSync(absolutePath), `missing ${relativePath}`)
  return fs.readFileSync(absolutePath, 'utf8')
}

const ROUTES = {
  preference: 'app/api/profile/quantum-preferences/route.ts',
  moment: 'app/api/match/event-meeting-moment/route.ts',
  role: 'app/api/match/event-secret-role/route.ts',
  guesses: 'app/api/match/event-role-guesses/route.ts',
} as const

test('private preference and role APIs use the shared cookie and bearer auth boundary', () => {
  for (const routePath of Object.values(ROUTES)) {
    const route = readSource(routePath)
    assert.match(route, /createSupabaseRequestClient\(request\)/)
    assert.match(route, /supabase\.auth\.getUser\(\)/)
    assert.match(route, /jsonError\(['"]auth_required['"],\s*401\)/)
    assert.match(route, /Cache-Control['"]:\s*['"]private, no-store/)
    assert.doesNotMatch(route, /SUPABASE_SERVICE_ROLE|service_role/i)
  }
})

test('profile preference API validates and returns only the normalized preference', () => {
  const route = readSource(ROUTES.preference)

  assert.match(route, /export async function GET/)
  assert.match(route, /export async function PUT/)
  assert.match(route, /get_my_quantum_profile_preference/)
  assert.match(route, /save_my_quantum_profile_preference/)
  assert.match(route, /parseQuantumProfilePreference/)
  assert.match(route, /CURRENT_QUANTUM_DEBATE_QUESTION_BANK/)
  assert.match(route, /MAX_JSON_BODY_BYTES/)
  assert.match(route, /request_too_large/)
  assert.match(route, /p_question_bank_version/)
  assert.match(route, /invalid_profile_preference/)
  assert.doesNotMatch(route, /parseQuestionBankVersion/)
  assert.doesNotMatch(route, /user_id|target_user_id|photo_url|appearance_score/i)
})

test('meeting moment API binds the catalog event and occurrence to validated data', () => {
  const route = readSource(ROUTES.moment)

  assert.match(route, /export async function GET/)
  assert.match(route, /export async function PUT/)
  assert.match(route, /getQuantumEventById/)
  assert.match(route, /parseQuantumMeetingMoment/)
  assert.match(route, /get_my_quantum_event_meeting_moment/)
  assert.match(route, /save_my_quantum_event_meeting_moment/)
  assert.match(route, /p_event_key/)
  assert.match(route, /p_occurrence_key/)
  assert.doesNotMatch(route, /user_id|target_user_id|secret_role|appearance_score/i)
})

test('secret role API scopes read, change, and confirmation to one caller occurrence', () => {
  const route = readSource(ROUTES.role)

  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /export async function PUT/)
  assert.match(route, /get_my_quantum_event_secret_role/)
  assert.match(route, /change_my_quantum_event_secret_role/)
  assert.match(route, /confirm_my_quantum_event_secret_role/)
  assert.match(route, /p_occurrence_id/)
  assert.match(route, /occurrence_id/)
  assert.match(route, /UUID_PATTERN/)
  assert.match(route, /invalid_occurrence/)
  assert.match(route, /parseMySecretRole/)
  assert.doesNotMatch(route, /target_user_id|participant_user_id|swap_target|other_user/i)
})

test('role guess API accepts anonymous seats and five approved roles only', () => {
  const route = readSource(ROUTES.guesses)

  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /get_my_quantum_event_role_guess_state/)
  assert.match(route, /submit_my_quantum_event_role_guesses/)
  assert.match(route, /parseQuantumRoleGuessState/)
  assert.match(route, /SECRET_ROLE_KEYS/)
  assert.match(route, /UUID_PATTERN/)
  assert.match(route, /seat_label/)
  assert.doesNotMatch(route, /target_user_id|participant_user_id|answer_role\s*:/i)
})

test('role guessing maps the migration permission boundary without exposing a server error', () => {
  const route = readSource(ROUTES.guesses)

  assert.match(route, /role_guessing_not_available/)
  assert.match(route, /jsonError\('role_guessing_not_available', 403\)/)
})

test('all private workflow APIs generalize storage errors and reject malformed JSON', () => {
  for (const routePath of Object.values(ROUTES)) {
    const route = readSource(routePath)
    assert.match(route, /schema_unavailable/)
    assert.match(route, /response_invalid/)
  }

  for (const routePath of [ROUTES.preference, ROUTES.moment, ROUTES.role, ROUTES.guesses]) {
    const route = readSource(routePath)
    assert.match(route, /readJson/)
    assert.match(route, /jsonError\([^\n]+,\s*400\)/)
  }
})
