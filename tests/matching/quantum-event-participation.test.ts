import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('participation input accepts only catalog events and approved party types', () => {
  const helperPath = path.join(process.cwd(), 'lib/matching/quantum-event-participation.ts')
  assert.ok(fs.existsSync(helperPath), 'quantum-event-participation.ts must exist')

  const contract = require('../../lib/matching/quantum-event-participation') as {
    parseQuantumEventParticipationInput: (value: unknown) =>
      | { ok: true; value: { eventId: string; eventMode: string; partyType: string; groupId: string | null } }
      | { ok: false; error: string }
  }

  assert.deepEqual(
    contract.parseQuantumEventParticipationInput({
      event_id: 'tonight-board-game',
      party_type: 'solo',
    }),
    {
      ok: true,
      value: {
        eventId: 'tonight-board-game',
        eventMode: 'tonight',
        partyType: 'solo',
        groupId: null,
      },
    },
  )
  assert.deepEqual(
    contract.parseQuantumEventParticipationInput({
      event_id: 'tonight-board-game',
      party_type: 'friends',
      group_id: '83a1a5ce-1b3d-4a0e-9d50-d3a3e620398a',
    }),
    {
      ok: true,
      value: {
        eventId: 'tonight-board-game',
        eventMode: 'tonight',
        partyType: 'friends',
        groupId: '83a1a5ce-1b3d-4a0e-9d50-d3a3e620398a',
      },
    },
  )
  assert.deepEqual(
    contract.parseQuantumEventParticipationInput({ event_id: 'tonight-board-game', party_type: 'friends' }),
    { ok: false, error: 'friend_group_required' },
  )
  assert.deepEqual(
    contract.parseQuantumEventParticipationInput({ event_id: 'fake-event', party_type: 'solo' }),
    { ok: false, error: 'invalid_event' },
  )
  assert.deepEqual(
    contract.parseQuantumEventParticipationInput({ event_id: 'tonight-board-game', party_type: 'mixed' }),
    { ok: false, error: 'invalid_party_type' },
  )
})

test('participation API has read, atomic meeting readiness, and cancel boundaries', () => {
  const routePath = path.join(process.cwd(), 'app/api/match/event-participation/route.ts')
  assert.ok(fs.existsSync(routePath), 'event participation API route must exist')
  const route = fs.readFileSync(routePath, 'utf8')

  assert.match(route, /export async function GET/)
  assert.match(route, /export async function POST/)
  assert.match(route, /export async function DELETE/)
  assert.match(route, /get_my_quantum_event_participation/)
  assert.match(route, /save_my_quantum_event_meeting_moment_and_participate/)
  assert.match(route, /parseParticipationMeetingMoment/)
  assert.match(route, /parseMySecretRole/)
  assert.match(route, /role_confirmation_required/)
  assert.match(route, /application_confirmed/)
  assert.match(route, /secret_role/)
  assert.doesNotMatch(route, /\.rpc\('set_my_quantum_event_participation'/)
  assert.match(route, /cancel_my_quantum_event_participation/)
  assert.match(route, /auth_required/)
  assert.match(route, /schema_unavailable/)
})

test('participation API marks every private response as non-cacheable', () => {
  const routePath = path.join(process.cwd(), 'app/api/match/event-participation/route.ts')
  const route = fs.readFileSync(routePath, 'utf8')

  assert.match(route, /const PRIVATE_NO_STORE_HEADERS = \{ 'Cache-Control': 'private, no-store, max-age=0' \}/)
  assert.match(route, /function json\(body: unknown, init\?: ResponseInit\)/)
  assert.match(route, /const headers = new Headers\(init\?\.headers\)/)
  assert.match(route, /headers\.set\(name, value\)/)
  assert.equal(route.match(/NextResponse\.json\(/g)?.length, 1)
})

test('application UI recovers when the saved preference disappears during submission', () => {
  const sourcePath = path.join(process.cwd(), 'components/matching/QuantumEventApplicationStatus.tsx')
  const source = fs.readFileSync(sourcePath, 'utf8')

  assert.match(source, /payload\.error === 'profile_preference_required'/)
  assert.match(source, /setPreparationState\('missing_preference'\)/)
  assert.match(source, /내 취향 카드가 바뀌었어요\. 다시 확인하면 이 신청으로 돌아올게요\./)
  assert.match(source, /if \(error === 'profile_preference_required'\) return '내 취향 카드를 먼저 완성해 주세요\.'/)
})

test('cancellation API preserves boolean and structured RPC results for the client', () => {
  const routePath = path.join(process.cwd(), 'app/api/match/event-participation/route.ts')
  const route = fs.readFileSync(routePath, 'utf8')

  assert.match(route, /const \{ data, error \} = await supabase\.rpc\('cancel_my_quantum_event_participation'\)/)
  assert.match(route, /const cancellation = normalizeCancellationResponse\(data\)/)
  assert.match(route, /return json\(cancellation\)/)
  assert.match(route, /if \(typeof data === 'boolean'\) \{\s*return \{ cancelled: data, participation: null \}/)
  assert.match(route, /remaining_participation/)
  assert.match(route, /return \{ cancelled: result\.cancelled === true, participation \}/)
})

test('cancel false recovers the current participation through the shared lifecycle reader', () => {
  const routePath = path.join(process.cwd(), 'app/api/match/event-participation/route.ts')
  const route = fs.readFileSync(routePath, 'utf8')

  assert.match(route, /isActiveQuantumEventLifecycle/)
  assert.match(route, /async function readCurrentParticipation\(/)
  assert.match(route, /const current = await readCurrentParticipation\(supabase\)/)
  assert.match(route, /if \(!cancellation\.cancelled\) \{[\s\S]*?if \(current\.kind !== 'ready'\) return jsonError\('participation_lookup_failed', 500\)/)
  assert.match(route, /cancelled: current\.activeParticipation === null/)
  assert.match(route, /participation: current\.activeParticipation/)
})

test('cancellation UI blocks duplicate requests and branches between a remaining participation and discovery', () => {
  const wheelPath = path.join(process.cwd(), 'components/matching/QuantumEventWheel.tsx')
  const wheel = fs.readFileSync(wheelPath, 'utf8')

  assert.match(wheel, /if \(!participation \|\| saving\) return\s*\n\s*if \(cancelInFlightRef\.current\) return\s*\n\s*\n\s*cancelInFlightRef\.current = true\s*\n\s*setSaving\(true\)/)
  assert.doesNotMatch(wheel, /window\.confirm\('이 약속 참여를 취소할까요\?'/)
  assert.match(wheel, /const remainingParticipation = getCancellationParticipation\(cancellation\.participation\)/)
  assert.match(wheel, /if \(remainingParticipation\) \{\s*setParticipation\(remainingParticipation\)/)
  assert.match(wheel, /if \(!cancellation\?\.cancelled\) \{\s*setMessageTone\('error'\)\s*setMessage\('참여 취소에 실패했어요\. 잠시 후 다시 시도해 주세요\.'\)/)
  const discoveryRedirect = wheel.match(/window\.setTimeout\(\(\) => \{[\s\S]*?\}, 650\)/)?.[0]
  assert.ok(discoveryRedirect, 'successful cancellation must schedule discovery navigation')
  assert.match(
    discoveryRedirect,
    /cancelInFlightRef\.current = false\s*if \(!isMountedRef\.current\) return\s*setSaving\(false\)\s*router\.replace\('\/match\?choose=another'\)\s*router\.refresh\(\)/,
  )
  assert.match(wheel, /router\.replace\('\/match\?choose=another'\)/)
  assert.match(wheel, /router\.refresh\(\)/)
})

test('cancellation request and delayed redirect are cleaned up on unmount', () => {
  const wheelPath = path.join(process.cwd(), 'components/matching/QuantumEventWheel.tsx')
  const wheel = fs.readFileSync(wheelPath, 'utf8')

  assert.match(wheel, /const cancelRequestControllerRef = useRef<AbortController \| null>\(null\)/)
  assert.match(wheel, /const cancelRedirectTimerRef = useRef<number \| null>\(null\)/)
  assert.match(wheel, /function clearCancelRedirectTimer\(\) \{[\s\S]*?window\.clearTimeout\(cancelRedirectTimerRef\.current\)/)
  assert.match(wheel, /cancelRequestControllerRef\.current\?\.abort\(\)/)
  assert.match(wheel, /signal: cancelController\.signal/)
  assert.match(wheel, /\} \| null\s*\n\s*if \(!isMountedRef\.current\) return/)
  assert.match(wheel, /clearCancelRedirectTimer\(\)\s*\n\s*cancelRequestControllerRef\.current = null\s*\n\s*cancelRedirectTimerRef\.current = window\.setTimeout/)
  assert.match(wheel, /cancelRedirectTimerRef\.current = null\s*\n\s*cancelRequestControllerRef\.current = null\s*\n\s*cancelInFlightRef\.current = false/)
})

test('cancellation feedback remains visible while the current participation stays on screen', () => {
  const wheelPath = path.join(process.cwd(), 'components/matching/QuantumEventWheel.tsx')
  const wheel = fs.readFileSync(wheelPath, 'utf8')
  const commandCenterBranch = wheel.match(
    /if \(participation && !dismissedCancelledParticipation\) \{[\s\S]*?\n  \}\n\n  return \(/,
  )?.[0]

  assert.ok(commandCenterBranch, 'active participation branch must exist')
  assert.match(commandCenterBranch, /QuantumParticipationCommandCenter/)
  assert.match(commandCenterBranch, /role="status"/)
  assert.match(commandCenterBranch, /\{message\}/)
})

test('remote QA event stats do not fake a friend-party application without a group', () => {
  const scriptPath = path.join(process.cwd(), 'scripts/run-remote-product-e2e.mjs')
  const script = fs.readFileSync(scriptPath, 'utf8')

  assert.doesNotMatch(script, /\[userB, 'friends'\]/)
  assert.match(script, /for \(const user of \[userA, userB\]\)/)
  assert.match(script, /party_type: 'solo'/)
})

test('event lifecycle QA can use an isolated event instead of colliding with a live application', () => {
  const scriptPath = path.join(process.cwd(), 'scripts/run-quantum-event-lifecycle-e2e.mjs')
  const script = fs.readFileSync(scriptPath, 'utf8')

  assert.match(script, /process\.env\.QA_EVENT_ID/)
  assert.doesNotMatch(script, /const eventId = 'tonight-onsenjjang-run'/)
})

test('event lifecycle QA follows the occurrence gender capacities instead of assuming 3:2', () => {
  const scriptPath = path.join(process.cwd(), 'scripts/run-quantum-event-lifecycle-e2e.mjs')
  const script = fs.readFileSync(scriptPath, 'utf8')

  assert.match(script, /get_or_create_quantum_event_occurrence/)
  assert.match(script, /male_capacity,female_capacity,required_total/)
  assert.match(script, /Array\(maleCapacity\)\.fill\('male'\)/)
  assert.match(script, /Array\(femaleCapacity\)\.fill\('female'\)/)
  assert.doesNotMatch(script, /const genders = \['male', 'male', 'male', 'female', 'female', 'male'\]/)
})

test('event room QA requires an empty event selected through environment variables', () => {
  const scriptPath = path.join(process.cwd(), 'scripts/qa/release-e2e-event-room.mjs')
  const script = fs.readFileSync(scriptPath, 'utf8')

  assert.match(script, /process\.env\.QA_EVENT_ID/)
  assert.match(script, /process\.env\.QA_EVENT_MODE/)
  assert.match(script, /assertQaEventIsIsolated/)
  assert.match(script, /qa_event_not_isolated/)
  assert.doesNotMatch(script, /event_id:\s*'tonight-onsenjjang-run'/)
})
