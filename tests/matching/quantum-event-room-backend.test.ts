import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  parseQuantumEventRoomInviteCandidates,
  parseQuantumEventRoomInvites,
  parseQuantumEventRoomParticipants,
  parseQuantumEventRooms,
} from '../../lib/matching/quantum-event-rooms'

const MIGRATION_SUFFIX = '_matching_quantum_event_room_backend_hardening.sql'
const PREFERENCE_SECRET_ROLE_MIGRATION =
  'supabase/migrations/20260814030000_matching_profile_preference_secret_roles.sql'

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function findHardeningMigration() {
  return fs.readdirSync(path.join(process.cwd(), 'supabase/migrations'))
    .find((file) => file.endsWith(MIGRATION_SUFFIX))
}

function readHardeningMigration() {
  const migrationName = findHardeningMigration()
  assert.ok(migrationName, `missing ${MIGRATION_SUFFIX}`)
  return readSource(`supabase/migrations/${migrationName}`)
}

function extractFunction(sql: string, signature: RegExp) {
  const start = sql.search(signature)
  assert.notEqual(start, -1, `missing function ${signature}`)
  const tail = sql.slice(start)
  const end = tail.search(/\n\$\$;/)
  assert.notEqual(end, -1, `unterminated function ${signature}`)
  return tail.slice(0, end + 4)
}

test('room invitation notifications use the integration kind and exact safe payload', () => {
  const sql = readHardeningMigration()

  assert.match(sql, /'quantum_event_room_invite'/)
  assert.match(sql, /insert into public\.notifications/i)
  for (const key of [
    'token',
    'event_id',
    'event_mode',
    'event_title',
    'room_label',
    'expires_at',
    'inviter_display_name',
  ]) {
    assert.match(sql, new RegExp(`'${key}'`, 'i'))
  }
  assert.match(sql, /payload\s*-\s*array\[/i)
  assert.match(sql, /notifications_quantum_event_room_invite_unique/i)
})

test('invite lifecycle releases reservations and keeps each action idempotent', () => {
  const sql = readHardeningMigration()

  assert.match(sql, /status\s+in\s*\([^)]*'declined'/i)
  assert.match(sql, /idempotency_key/i)
  assert.match(sql, /expire_quantum_event_room_invites/i)
  assert.match(sql, /decline_quantum_event_room_invite/i)
  assert.match(sql, /cancel_quantum_event_room_invite/i)
  assert.match(sql, /invite\.status\s*=\s*'accepted'/i)
  assert.match(sql, /invite\.status\s+in\s*\(\s*'declined'\s*,\s*'cancelled'\s*,\s*'expired'\s*\)/i)

  const cancellation = extractFunction(
    sql,
    /create or replace function public\.cancel_my_quantum_event_participation\(\)/i,
  )
  assert.match(cancellation, /inviter_user_id\s*=\s*v_user_id/i)
  assert.match(cancellation, /invited_user_id\s*=\s*v_user_id/i)
  assert.match(cancellation, /invite\.status\s+IN\s*\(\s*'pending'\s*,\s*'accepted'\s*\)/i)
})

test('invite APIs expose accept, decline, and inviter-only cancellation actions', () => {
  const createRoute = readSource('app/api/match/event-room-invites/route.ts')
  const acceptRoute = readSource('app/api/match/event-room-invites/accept/route.ts')
  const declineRoute = readSource('app/api/match/event-room-invites/decline/route.ts')
  const cancelRoute = readSource('app/api/match/event-room-invites/cancel/route.ts')

  assert.match(createRoute, /Idempotency-Key/i)
  assert.match(createRoute, /p_idempotency_key/)
  assert.match(acceptRoute, /accept_quantum_event_room_invite/)
  assert.match(declineRoute, /decline_quantum_event_room_invite/)
  assert.match(cancelRoute, /cancel_quantum_event_room_invite/)
})

test('room security derives authorization from auth uid and the exact group id', () => {
  const sql = readHardeningMigration()
  const assign = extractFunction(
    sql,
    /create or replace function public\.assign_quantum_event_room\(/i,
  )
  const participate = extractFunction(
    sql,
    /create or replace function public\.set_my_quantum_event_participation\(/i,
  )
  const createInvite = extractFunction(
    sql,
    /create or replace function public\.create_quantum_event_room_invite\(/i,
  )

  assert.match(assign, /p_group_id\s+uuid/i)
  assert.match(assign, /member\.group_id\s*=\s*p_group_id/i)
  assert.doesNotMatch(assign, /order by\s+group_row\.updated_at\s+desc/i)
  assert.match(participate, /p_group_id/i)
  assert.match(participate, /assign_quantum_event_room\([\s\S]*p_group_id/i)

  for (const fn of [assign, participate, createInvite]) {
    assert.match(fn, /security definer/i)
    assert.match(fn, /set search_path\s*=\s*''/i)
    assert.match(fn, /auth\.uid\(\)/i)
  }

  assert.match(createInvite, /friendship\.status\s*=\s*'active'/i)
  assert.match(createInvite, /friend_gender_mismatch/i)
  assert.match(createInvite, /friend_school_mismatch/i)
  assert.match(createInvite, /occurrence_id\s*=\s*v_occurrence\.id/i)
  assert.match(sql, /revoke all on function public\.assign_quantum_event_room/i)
})

test('group members cannot enter a second room and can read the shared group lifecycle', () => {
  const sql = readHardeningMigration()
  const participate = extractFunction(
    sql,
    /create or replace function public\.set_my_quantum_event_participation\(/i,
  )
  const lifecycle = extractFunction(
    sql,
    /create or replace function public\.get_my_quantum_event_lifecycle\(\)/i,
  )

  assert.match(participate, /active_group_membership/i)
  assert.match(participate, /party_member_already_applied/i)
  assert.match(participate, /active_group_membership\.group_id\s+is\s+not\s+distinct\s+from\s+p_group_id/i)
  assert.match(lifecycle, /member\.user_id\s*=\s*v_user_id/i)
  assert.match(lifecycle, /select\s+v_user_id\s+as\s+user_id/i)
})

test('ten solo women fill five two-seat female room capacities', () => {
  const sql = readHardeningMigration()
  const assign = extractFunction(
    sql,
    /create or replace function public\.assign_quantum_event_room\(/i,
  )
  assert.match(assign, /order by\s+occurrence\.room_number/i)
  assert.match(assign, /v_current_female\s*\+\s*v_reserved_female\s*\+\s*p_incoming_count\s*<=\s*v_room\.female_capacity/i)
  assert.match(assign, /max\(occurrence\.room_number\)\s*\+\s*1/i)

  const roomLoads: number[] = []
  for (let applicant = 0; applicant < 10; applicant += 1) {
    const availableRoom = roomLoads.findIndex((load) => load + 1 <= 2)
    if (availableRoom >= 0) roomLoads[availableRoom] += 1
    else roomLoads.push(1)
  }
  assert.deepEqual(roomLoads, [2, 2, 2, 2, 2])
})

test('participant card endpoint returns only anonymous safe snapshot fields to room members', () => {
  const route = readSource('app/api/match/event-room-participants/route.ts')
  const sql = readSource(PREFERENCE_SECRET_ROLE_MIGRATION)
  const getter = extractFunction(
    sql,
    /create or replace function public\.get_my_quantum_event_room_participants\(\)/i,
  )

  assert.match(route, /get_my_quantum_event_room_participants/)
  assert.match(route, /const PRIVATE_NO_STORE_HEADERS = \{[\s\S]*Cache-Control[^\n]*no-store/i)
  assert.match(route, /Vary[^\n]*Cookie, Authorization/i)
  assert.match(route, /function jsonError[\s\S]*PRIVATE_NO_STORE_HEADERS/i)
  assert.doesNotMatch(
    route,
    /photo|real[_A-Z]?name|display[_A-Z]?name|department|contact|phone|user[_A-Z]?id|appearance/i,
  )

  assert.match(getter, /room_membership_required/i)
  assert.match(getter, /room_school_mismatch/i)
  assert.match(getter, /'seat_label'/i)
  assert.match(getter, /'gender'/i)
  assert.match(getter, /'ready'/i)
  assert.match(getter, /'profile_preference'/i)
  assert.match(getter, /'meeting_moment'/i)
  assert.match(getter, /private\.quantum_event_room_people/i)
  assert.match(getter, /left join public\.quantum_event_room_card_snapshots/i)
  assert.match(getter, /my_party\s+as\s*\(/i)
  assert.match(getter, /invite\.status\s*=\s*'accepted'/i)
  assert.match(getter, /not exists[\s\S]*my_party\.participant_user_id/i)
  for (const key of [
    'mbti',
    'conversation_energy',
    'plan_style',
    'interests',
    'favorite_music',
    'debate_answers',
    'mood',
    'expectation',
    'activity_choice',
  ]) {
    assert.match(sql, new RegExp(`'${key}'`, 'i'))
  }
  assert.doesNotMatch(
    getter,
    /'photo|'real_name|'display_name|'department|'contact|'phone|'user_id|'appearance/i,
  )
  assert.doesNotMatch(getter, /meetup_role|secret_role|role_key|'role'/i)
  assert.match(route, /return NextResponse\.json\(\s*\{ participants \}/)
})

test('participant v2 parser returns the exact API-safe shape and strips compatibility fields from JSON', async () => {
  const parsed = parseQuantumEventRoomParticipants([{
    seat_label: '참가자 A',
    gender: 'male',
    ready: true,
    user_id: '00000000-0000-4000-8000-000000000001',
    photo_url: 'https://example.com/private.jpg',
    profile_preference: {
      mbti: 'ENFP',
      conversation_energy: 'speaker',
      plan_style: 'spontaneous',
      interests: ['음악', '조깅', '영화'],
      favorite_music: '인디 팝',
      debate_answers: [{ question_id: 'mint', choice: 'A' }],
    },
    meeting_moment: {
      mood: 'bright',
      expectation: 'conversation',
      activity_choice: '천천히 이야기하기',
    },
  }])

  assert.ok(parsed)
  assert.deepEqual(Object.keys(parsed[0]).sort(), [
    'gender',
    'meeting_moment',
    'profile_preference',
    'ready',
    'seat_label',
  ])
  assert.deepEqual(Object.keys(parsed[0].profile_preference ?? {}).sort(), [
    'conversation_energy',
    'debate_answers',
    'favorite_music',
    'interests',
    'mbti',
    'plan_style',
  ])
  assert.deepEqual(Object.keys(parsed[0].meeting_moment ?? {}).sort(), [
    'activity_choice',
    'expectation',
    'mood',
  ])
  assert.equal('user_id' in parsed[0], false)
  assert.equal(parsed[0].alias, '참가자 A')
  assert.equal(parsed[0].preference_card.meetup_role, undefined)
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), [{
    seat_label: '참가자 A',
    gender: 'male',
    ready: true,
    profile_preference: {
      mbti: 'ENFP',
      conversation_energy: 'speaker',
      plan_style: 'spontaneous',
      interests: ['음악', '조깅', '영화'],
      favorite_music: '인디 팝',
      debate_answers: [{ question_id: 'mint', choice: 'A' }],
    },
    meeting_moment: {
      mood: 'bright',
      expectation: 'conversation',
      activity_choice: '천천히 이야기하기',
    },
  }])

  const apiResponse = new Response(JSON.stringify({ participants: parsed }), { status: 200 })
  assert.equal(apiResponse.status, 200)
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), JSON.parse(await apiResponse.text()).participants)

  assert.equal(parseQuantumEventRoomParticipants([{
    seat_label: '참가자 A',
    gender: 'male',
    ready: true,
    profile_preference: {
      mbti: null,
      conversation_energy: 'balanced',
      plan_style: 'balanced',
      interests: ['음악', '조깅', '영화'],
      favorite_music: '인디 팝',
      debate_answers: [{ question_id: 'mint', choice: 'A', phone: '010-0000-0000' }],
    },
    meeting_moment: {
      mood: 'bright',
      expectation: 'conversation',
      activity_choice: '천천히 이야기하기',
    },
  }]), null)

  assert.equal(parseQuantumEventRoomParticipants([{
    seat_label: '참가자 A',
    gender: 'male',
    ready: true,
    profile_preference: {
      mbti: null,
      conversation_energy: 'balanced',
      plan_style: 'balanced',
      interests: ['음악', '조깅', '영화'],
      favorite_music: 'ｎａｍｅ＠ｅｘａｍｐｌｅ．ｃｏｍ',
      debate_answers: [],
    },
    meeting_moment: {
      mood: 'bright',
      expectation: 'conversation',
      activity_choice: '천천히 이야기하기',
    },
  }]), null)
})

test('participant v2 parser keeps an unready seat with null cards', () => {
  const parsed = parseQuantumEventRoomParticipants([{
    seat_label: '참가자 B',
    gender: 'female',
    ready: false,
    profile_preference: null,
    meeting_moment: null,
  }])

  assert.ok(parsed)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].ready, false)
  assert.equal(parsed[0].profile_preference, null)
  assert.equal(parsed[0].meeting_moment, null)
})

test('room and invite parsers strip fields outside their public response contracts', () => {
  const rooms = parseQuantumEventRooms([{
    occurrence_id: '00000000-0000-4000-8000-000000000001',
    room_number: 1,
    room_label: '1팀',
    room_code: 'ABC123',
    total: 1,
    male: 1,
    female: 0,
    reserved_total: 0,
    reserved_male: 0,
    reserved_female: 0,
    required_total: 5,
    male_capacity: 3,
    female_capacity: 2,
    is_my_room: true,
    participant_user_ids: ['00000000-0000-4000-8000-000000000002'],
  }])
  const candidates = parseQuantumEventRoomInviteCandidates([{
    user_id: '00000000-0000-4000-8000-000000000002',
    display_name: '친구',
    avatar_url: null,
    phone: '010-0000-0000',
  }])
  const invites = parseQuantumEventRoomInvites([{
    token: 'a'.repeat(32),
    role: 'inviter',
    counterpart_user_id: '00000000-0000-4000-8000-000000000002',
    counterpart_display_name: '친구',
    event_id: 'scheduled-walk',
    event_mode: 'scheduled',
    room_number: 1,
    room_label: '1팀',
    room_code: 'ABC123',
    status: 'pending',
    expires_at: '2026-08-14T12:00:00.000Z',
    counterpart_phone: '010-0000-0000',
  }])

  assert.ok(rooms)
  assert.ok(candidates)
  assert.ok(invites)
  assert.equal('participant_user_ids' in rooms[0], false)
  assert.equal('phone' in candidates[0], false)
  assert.equal('counterpart_phone' in invites[0], false)
})

test('participant card snapshots cover participant cleanup with a foreign-key index', () => {
  const migrations = fs.readdirSync(path.join(process.cwd(), 'supabase/migrations'))
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readSource(`supabase/migrations/${file}`))
    .join('\n')

  assert.match(
    migrations,
    /create\s+index\s+if\s+not\s+exists\s+quantum_event_room_card_snapshots_participant_idx\s+on\s+public\.quantum_event_room_card_snapshots\s*\(participant_user_id\)/i,
  )
})

test('room invitation and application paths share the same per-user transaction lock', () => {
  const sql = readHardeningMigration()
  const participate = extractFunction(
    sql,
    /create or replace function public\.set_my_quantum_event_participation\(/i,
  )
  const createInvite = extractFunction(
    sql,
    /create or replace function public\.create_quantum_event_room_invite\(/i,
  )
  const acceptInvite = extractFunction(
    sql,
    /create or replace function public\.accept_quantum_event_room_invite\(/i,
  )

  for (const fn of [participate, createInvite, acceptInvite]) {
    assert.match(fn, /pg_advisory_xact_lock/i)
    assert.match(fn, /'quantum-event-user\|'/i)
  }
})

test('participation cancellation closes related invitation notifications', () => {
  const sql = readHardeningMigration()
  const cancellation = extractFunction(
    sql,
    /create or replace function public\.cancel_my_quantum_event_participation\(\)/i,
  )

  assert.match(cancellation, /update public\.notifications/i)
  assert.match(cancellation, /quantum_event_room_invite/i)
  assert.match(cancellation, /notification\.read_at/i)
})

test('all client RPCs have fixed search paths and least-privilege grants', () => {
  const sql = readHardeningMigration()
  const publicFunctions = [
    'set_my_quantum_event_participation',
    'get_quantum_event_room_invite_candidates',
    'create_quantum_event_room_invite',
    'get_my_quantum_event_room_invites',
    'accept_quantum_event_room_invite',
    'decline_quantum_event_room_invite',
    'cancel_quantum_event_room_invite',
    'list_quantum_event_rooms',
    'get_my_quantum_event_room_participants',
  ]

  for (const name of publicFunctions) {
    const fn = extractFunction(
      sql,
      new RegExp(`create or replace function public\\.${name}\\(`, 'i'),
    )
    assert.match(fn, /set search_path\s*=\s*''/i)
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}`, 'i'))
  }
})

test('remote event-room E2E covers the current B precard, hard capacity, invite expiry, and outsider denial', () => {
  const script = readSource('scripts/qa/release-e2e-event-room.mjs')

  assert.match(script, /quantum-precard-b-v1/)
  assert.match(script, /draft\?\.completed_items !== 7/)
  assert.match(script, /first_room_capacity_exceeded/)
  assert.match(script, /second_room_overflow_failed/)
  assert.match(script, /invite_reservation_not_fifteen_minutes/)
  assert.match(script, /outsider_participant_lookup_not_blocked/)
  assert.match(script, /wrong_invitee_accept_not_blocked/)
})
