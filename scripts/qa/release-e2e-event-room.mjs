import {
  cleanupUsersByRunId,
  createQaAccount,
  createRuntime,
  executeWithCleanup,
} from './release-e2e-runtime.mjs'
import { progress } from './release-e2e-safety.mjs'

const baseUrl = process.env.QA_BASE_URL?.replace(/\/$/, '')
if (!baseUrl) throw new Error('qa_base_url_missing')
const eventId = process.env.QA_EVENT_ID?.trim()
const eventMode = process.env.QA_EVENT_MODE?.trim()
if (!eventId || !eventMode) throw new Error('qa_event_required')
if (!['tonight', 'scheduled'].includes(eventMode)) throw new Error('qa_event_mode_invalid')

const runtime = await createRuntime('event-room')
const eventInput = {
  event_id: eventId,
  event_mode: eventMode,
  party_type: 'solo',
  group_id: null,
}
const forbiddenParticipantKeys = [
  'user_id', 'display_name', 'avatar_url', 'photo_url', 'department', 'school',
  'appearance_score', 'score', 'phone', 'email', 'contact',
]

async function api(account, path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${account.token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  }
}

async function rpc(account, fn, args = {}) {
  const { data, error } = await account.client.rpc(fn, args)
  if (error) {
    const safeMessage = /^[a-z][a-z0-9_]+$/.test(error.message || '')
      ? error.message
      : 'redacted'
    console.error(`release-e2e rpc=${fn} code=${error.code || 'unknown'} message=${safeMessage}`)
    throw new Error(`${fn}_failed`)
  }
  return data
}

async function assertQaEventIsIsolated() {
  const { data, error } = await runtime.admin
    .from('quantum_event_occurrences')
    .select('id')
    .eq('event_id', eventId)
    .limit(1)
  if (error) throw new Error('qa_event_isolation_lookup_failed')
  if ((data || []).length > 0) throw new Error('qa_event_not_isolated')
}

async function activateFriendship(left, right) {
  const created = await api(left, '/api/friend-requests', {
    method: 'POST',
    body: { receiver_user_id: right.id, message: 'release-check' },
  })
  if (created.status !== 201 || !created.body?.request?.id) {
    throw new Error('friendship_request_failed')
  }
  const accepted = await rpc(right, 'accept_friend_request', {
    p_request_id: created.body.request.id,
  })
  if (!Array.isArray(accepted) || accepted.length !== 1) {
    throw new Error('friendship_accept_failed')
  }
}

async function saveProfilePreference(account, index) {
  const preference = {
    schemaVersion: 2,
    mbti: index % 2 === 0 ? 'ENFP' : 'ISFJ',
    relationshipBoundary: '가벼운 대화와 활동을 편하게 즐겨요',
    conversationEnergy: index % 3 === 0 ? 'speaker' : index % 3 === 1 ? 'balanced' : 'listener',
    planStyle: index % 2 === 0 ? 'spontaneous' : 'planner',
    interests: index % 2 === 0
      ? ['러닝', '음악', '맛집']
      : ['산책', '카페', '영화'],
    favoriteMusic: index % 2 === 0 ? '밝은 밴드 음악' : '잔잔한 인디 음악',
    debateAnswers: [
      { questionId: 'jjajang-jjamppong', choice: index % 2 === 0 ? 'A' : 'B', shareOnCard: true },
      { questionId: 'tangsuyuk', choice: index % 2 === 0 ? 'B' : 'A', shareOnCard: true },
      { questionId: 'mint-chocolate', choice: index % 2 === 0 ? 'A' : 'B', shareOnCard: true },
      { questionId: 'naengmyeon', choice: index % 2 === 0 ? 'B' : 'A', shareOnCard: false },
    ],
    questionBankVersion: 'quantum-debate-v1',
    updatedAt: null,
  }
  const result = await api(account, '/api/profile/quantum-preferences', {
    method: 'PUT',
    body: { preference },
  })
  if (result.status !== 200 || result.body?.preference?.schemaVersion !== 2) {
    console.error(`release-e2e preference_save status=${result.status} code=${result.body?.error || 'invalid_response'}`)
    throw new Error('profile_preference_save_failed')
  }
}

function meetingMomentDraft(index) {
  const moods = ['calm', 'bright', 'curious', 'energetic']
  const expectations = ['conversation', 'activity', 'new_people', 'easy_company']
  return {
    mood: moods[index % moods.length],
    expectation: expectations[index % expectations.length],
    activityChoice: index % 2 === 0 ? '편하게 함께 움직이기' : '새로운 사람과 대화하기',
  }
}

function meetingMoment(index, occurrenceKey) {
  return { occurrenceKey, ...meetingMomentDraft(index) }
}

async function saveMeetingMoment(account, index, occurrenceId) {
  const result = await api(account, '/api/match/event-meeting-moment', {
    method: 'PUT',
    body: {
      event_key: eventInput.event_id,
      meeting_moment: meetingMoment(index, occurrenceId),
    },
  })
  if (result.status !== 200
    || result.body?.meeting_moment?.occurrenceKey !== occurrenceId) {
    throw new Error('meeting_moment_save_failed')
  }
}

async function assertInviteReservation(invite) {
  const { data, error } = await runtime.admin
    .from('quantum_event_room_invites')
    .select('created_at, expires_at, status')
    .eq('token', invite.token)
    .single()
  if (error || data?.status !== 'pending') throw new Error('invite_reservation_lookup_failed')

  const createdAt = new Date(data.created_at).getTime()
  const expiresAt = new Date(data.expires_at).getTime()
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)
    || Math.abs((expiresAt - createdAt) - 15 * 60 * 1000) > 1000) {
    throw new Error('invite_reservation_not_fifteen_minutes')
  }
  if (Math.abs(new Date(invite.expires_at).getTime() - expiresAt) > 1000) {
    throw new Error('invite_expiry_response_mismatch')
  }
}

async function roomHeadcount(occurrenceId) {
  const { count, error } = await runtime.admin
    .from('quantum_event_participations')
    .select('user_id', { count: 'exact', head: true })
    .eq('occurrence_id', occurrenceId)
    .in('status', ['recruiting', 'confirmed'])
  if (error || typeof count !== 'number') throw new Error('room_headcount_lookup_failed')
  return count
}

async function apply(account, index) {
  const result = await api(account, '/api/match/event-participation', {
    method: 'POST',
    body: {
      ...eventInput,
      meeting_moment: meetingMomentDraft(index),
    },
  })
  const occurrenceId = result.body?.participation?.occurrence_id
  if (result.status !== 200
    || !occurrenceId
    || result.body?.meeting_moment?.occurrenceKey !== occurrenceId
    || result.body?.secret_role?.occurrenceId !== occurrenceId
    || typeof result.body?.role_confirmation_required !== 'boolean'
    || result.body?.role_confirmation_required !== !result.body?.secret_role?.roleConfirmed
    || typeof result.body?.application_confirmed !== 'boolean'
    || result.body?.application_confirmed !== result.body?.secret_role?.applicationConfirmed) {
    console.error(
      `release-e2e event_application status=${result.status} code=${result.body?.error || 'invalid_response'}`,
    )
    throw new Error('event_application_failed')
  }
  return result.body.participation
}

async function createInvite(inviter, invitee, key) {
  const result = await api(inviter, '/api/match/event-room-invites', {
    method: 'POST',
    body: { invited_user_id: invitee.id },
    headers: { 'Idempotency-Key': key },
  })
  if (result.status !== 201 || !result.body?.invite?.token) {
    throw new Error('create_quantum_event_room_invite_failed')
  }
  return result.body.invite
}

function assertLifecycle(result, errorCode) {
  if (result.status !== 200 || !result.body?.participation?.occurrence_id) {
    throw new Error(errorCode)
  }
  return result.body.participation
}

function assertSafeParticipant(participant) {
  const keys = Object.keys(participant || {})
  if (forbiddenParticipantKeys.some((key) => keys.includes(key))) {
    throw new Error('participant_identity_exposed')
  }
  if (keys.sort().join(',') !== 'gender,meeting_moment,profile_preference,ready,seat_label') {
    throw new Error('participant_contract_expanded')
  }
  if (participant.ready !== true) throw new Error('participant_card_not_ready')
  const preferenceKeys = Object.keys(participant.profile_preference || {}).sort().join(',')
  if (preferenceKeys !== 'conversation_energy,debate_answers,favorite_music,interests,mbti,plan_style') {
    throw new Error('profile_preference_contract_expanded')
  }
  const momentKeys = Object.keys(participant.meeting_moment || {}).sort().join(',')
  if (momentKeys !== 'activity_choice,expectation,mood') {
    throw new Error('meeting_moment_contract_expanded')
  }
  const serialized = JSON.stringify(participant)
  if (serialized.includes('@')
    || serialized.includes('010-')
    || serialized.includes('Release QA')
    || ['explorer', 'reactor', 'observer', 'bridge', 'pace_maker'].some((role) => serialized.includes(role))) {
    throw new Error('participant_private_data_exposed')
  }
}

async function confirmSecretRole(account, occurrenceId) {
  const before = await api(account, `/api/match/event-secret-role?occurrence_id=${occurrenceId}`)
  if (before.status !== 200
    || before.body?.secret_role?.occurrenceId !== occurrenceId
    || before.body?.secret_role?.roleConfirmed !== false) {
    throw new Error('secret_role_lookup_failed')
  }
  const confirmed = await api(account, '/api/match/event-secret-role', {
    method: 'PUT',
    body: { occurrence_id: occurrenceId },
  })
  if (confirmed.status !== 200
    || confirmed.body?.secret_role?.occurrenceId !== occurrenceId
    || confirmed.body?.secret_role?.roleConfirmed !== true
    || confirmed.body?.secret_role?.applicationConfirmed !== true) {
    throw new Error('secret_role_confirmation_failed')
  }
}

async function assertCancelledArtifacts(account, occurrenceId) {
  const [moment, role, preference, snapshot] = await Promise.all([
    api(account, `/api/match/event-meeting-moment?event_key=${eventInput.event_id}&occurrence_key=${occurrenceId}`),
    api(account, `/api/match/event-secret-role?occurrence_id=${occurrenceId}`),
    api(account, '/api/profile/quantum-preferences'),
    runtime.admin
      .from('quantum_event_room_card_snapshots')
      .select('participant_user_id', { count: 'exact', head: true })
      .eq('occurrence_id', occurrenceId)
      .eq('participant_user_id', account.id),
  ])
  if (moment.status !== 409 || moment.body?.error !== 'meeting_moment_not_available') {
    throw new Error('cancelled_meeting_moment_still_available')
  }
  if (role.status !== 409 || role.body?.error !== 'secret_role_unavailable') {
    throw new Error('cancelled_secret_role_still_available')
  }
  if (preference.status !== 200 || preference.body?.preference?.schemaVersion !== 2) {
    throw new Error('persistent_profile_preference_lost')
  }
  if (snapshot.error || snapshot.count !== 0) {
    throw new Error('cancelled_snapshot_not_removed')
  }
}

await assertQaEventIsIsolated()

await executeWithCleanup(runtime, async () => {
  const accounts = await Promise.all([
    createQaAccount(runtime, 'room-a', 'female'),
    createQaAccount(runtime, 'room-b', 'female'),
    createQaAccount(runtime, 'room-c', 'male'),
    createQaAccount(runtime, 'room-d', 'male'),
    createQaAccount(runtime, 'room-e', 'male'),
    createQaAccount(runtime, 'room-f', 'male'),
    createQaAccount(runtime, 'room-g', 'male'),
    createQaAccount(runtime, 'room-h', 'male'),
  ])
  const [a, b, c, d, e, f, g, h] = accounts
  await Promise.all(accounts.map(saveProfilePreference))
  await Promise.all([
    activateFriendship(a, b),
    activateFriendship(c, d),
    activateFriendship(f, g),
    activateFriendship(f, h),
  ])

  const aRoom = await apply(a, 0)
  const abInvite = await createInvite(a, b, `${runtime.runId}-ab`)
  await assertInviteReservation(abInvite)
  progress({ suite: runtime.suite, runId: runtime.runId, check: 'invite_fifteen_minutes', status: 'pass' })

  const wrongInviteeAccept = await api(h, '/api/match/event-room-invites/accept', {
    method: 'POST',
    body: { token: abInvite.token },
  })
  if (wrongInviteeAccept.status !== 404 || wrongInviteeAccept.body?.error !== 'invite_not_found') {
    throw new Error('wrong_invitee_accept_not_blocked')
  }

  const unreadBeforeAccept = await api(b, '/api/notifications?unread=true&limit=50')
  const notification = unreadBeforeAccept.body?.notifications?.find(
    (item) => item.kind === 'quantum_event_room_invite'
      && item.payload?.token === abInvite.token,
  )
  if (unreadBeforeAccept.status !== 200 || !notification
    || notification.payload?.event_id !== eventInput.event_id
    || notification.payload?.room_label !== aRoom.room_label) {
    throw new Error('quantum_event_room_invite_notification_failed')
  }

  const accepted = await api(b, '/api/match/event-room-invites/accept', {
    method: 'POST',
    body: { token: abInvite.token },
  })
  const bRoom = assertLifecycle(accepted, 'accept_quantum_event_room_invite_failed')
  const same_room_after_accept = bRoom.occurrence_id === aRoom.occurrence_id
  if (!same_room_after_accept || bRoom.party_members?.length !== 2) {
    throw new Error('same_room_after_accept_failed')
  }
  await saveMeetingMoment(b, 1, bRoom.occurrence_id)
  const unreadAfterAccept = await api(b, '/api/notifications?unread=true&limit=50')
  if (unreadAfterAccept.body?.notifications?.some((item) => item.payload?.token === abInvite.token)) {
    throw new Error('accepted_notification_not_read')
  }

  const cRoom = await apply(c, 2)
  if (cRoom.occurrence_id !== aRoom.occurrence_id) throw new Error('first_room_not_reused')
  const cdInvite = await createInvite(c, d, `${runtime.runId}-cd`)
  const dAccepted = await api(d, '/api/match/event-room-invites/accept', {
    method: 'POST',
    body: { token: cdInvite.token },
  })
  const dRoom = assertLifecycle(dAccepted, 'second_friend_accept_failed')
  if (dRoom.occurrence_id !== aRoom.occurrence_id) throw new Error('friend_room_changed')
  await saveMeetingMoment(d, 3, dRoom.occurrence_id)
  const eRoom = await apply(e, 4)
  if (eRoom.occurrence_id !== aRoom.occurrence_id || eRoom.participant_counts?.total !== 5) {
    throw new Error('first_room_not_filled')
  }

  const fRoom = await apply(f, 5)
  if (fRoom.occurrence_id === aRoom.occurrence_id || fRoom.room_number === aRoom.room_number) {
    throw new Error('second_room_not_created')
  }
  const [firstRoomHeadcount, secondRoomHeadcount] = await Promise.all([
    roomHeadcount(aRoom.occurrence_id),
    roomHeadcount(fRoom.occurrence_id),
  ])
  if (firstRoomHeadcount > 5 || firstRoomHeadcount !== 5) {
    throw new Error('first_room_capacity_exceeded')
  }
  if (secondRoomHeadcount !== 1) throw new Error('second_room_overflow_failed')
  progress({ suite: runtime.suite, runId: runtime.runId, check: 'second_room_overflow', status: 'pass' })

  const participantResult = await api(a, '/api/match/event-room-participants')
  const participants = participantResult.body?.participants
  if (participantResult.status !== 200 || !Array.isArray(participants) || participants.length !== 3) {
    console.error(`release-e2e participant_lookup status=${participantResult.status} code=${participantResult.body?.error || 'invalid_response'} count=${Array.isArray(participants) ? participants.length : 'invalid'}`)
    const snapshotDiagnostic = await runtime.admin
      .from('quantum_event_room_card_snapshots')
      .select('participant_user_id, safe_payload')
      .eq('occurrence_id', aRoom.occurrence_id)
    const snapshotShape = (snapshotDiagnostic.data || []).map((row) => ({
      account: accounts.findIndex((account) => account.id === row.participant_user_id),
      cardKeys: Object.keys(row.safe_payload || {}).sort(),
    }))
    console.error(
      `release-e2e participant_snapshot error=${snapshotDiagnostic.error?.code || 'none'} rows=${JSON.stringify(snapshotShape)}`,
    )
    const direct = await a.client.rpc('get_my_quantum_event_room_participants')
    const directRows = Array.isArray(direct.data) ? direct.data : []
    const shape = directRows.map((row) => ({
      keys: Object.keys(row || {}).sort(),
      aliasType: typeof row?.alias,
      gender: row?.gender,
      cardKeys: Object.keys(row?.preference_card || {}).sort(),
      cardTypes: Object.fromEntries(Object.entries(row?.preference_card || {}).map(([key, value]) => [
        key,
        Array.isArray(value) ? `array:${value.length}` : value === null ? 'null' : typeof value,
      ])),
    }))
    console.error(`release-e2e participant_shape error=${direct.error?.code || 'none'} rows=${JSON.stringify(shape)}`)
    throw new Error('get_my_quantum_event_room_participants_failed')
  }
  participants.forEach(assertSafeParticipant)
  progress({ suite: runtime.suite, runId: runtime.runId, check: 'safe_profile_preference', status: 'pass' })

  const outsiderParticipantResult = await api(h, '/api/match/event-room-participants')
  if (outsiderParticipantResult.status !== 403
    || outsiderParticipantResult.body?.error !== 'room_membership_required') {
    throw new Error('outsider_participant_lookup_not_blocked')
  }

  const cancelledInviteFixture = await createInvite(f, h, `${runtime.runId}-fh-cancel`)
  const cancelledInvite = await api(f, '/api/match/event-room-invites/cancel', {
    method: 'POST',
    body: { token: cancelledInviteFixture.token },
  })
  if (cancelledInvite.status !== 200 || cancelledInvite.body?.cancelled !== true) {
    throw new Error('cancel_quantum_event_room_invite_failed')
  }

  const declineInvite = await createInvite(f, h, `${runtime.runId}-fh-decline`)
  const declined = await api(h, '/api/match/event-room-invites/decline', {
    method: 'POST',
    body: { token: declineInvite.token },
  })
  if (declined.status !== 200 || declined.body?.declined !== true) {
    throw new Error('decline_quantum_event_room_invite_failed')
  }

  const expiredInvite = await createInvite(f, h, `${runtime.runId}-fh-expire`)
  const { error: expireClockError } = await runtime.admin
    .from('quantum_event_room_invites')
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq('token', expiredInvite.token)
  if (expireClockError) throw new Error('invite_expiry_clock_setup_failed')
  const inviteListAfterExpiry = await api(f, '/api/match/event-room-invites')
  const { data: expiredRow, error: expiredLookupError } = await runtime.admin
    .from('quantum_event_room_invites')
    .select('status')
    .eq('token', expiredInvite.token)
    .single()
  if (inviteListAfterExpiry.status !== 200
    || expiredLookupError
    || expiredRow?.status !== 'expired') {
    throw new Error('invite_expiry_simulated_failed')
  }
  progress({ suite: runtime.suite, runId: runtime.runId, check: 'invite_expiry_simulated', status: 'pass' })

  const fgInvite = await createInvite(f, g, `${runtime.runId}-fg-accept`)
  const gAccepted = await api(g, '/api/match/event-room-invites/accept', {
    method: 'POST',
    body: { token: fgInvite.token },
  })
  const gRoom = assertLifecycle(gAccepted, 'third_friend_accept_failed')
  if (gRoom.occurrence_id !== fRoom.occurrence_id || gRoom.party_members?.length !== 2) {
    throw new Error('second_room_friend_join_failed')
  }
  await saveMeetingMoment(g, 6, gRoom.occurrence_id)

  await Promise.all([
    confirmSecretRole(a, aRoom.occurrence_id),
    confirmSecretRole(b, aRoom.occurrence_id),
    confirmSecretRole(c, aRoom.occurrence_id),
    confirmSecretRole(d, aRoom.occurrence_id),
  ])
  await confirmSecretRole(e, aRoom.occurrence_id)
  progress({ suite: runtime.suite, runId: runtime.runId, check: 'role_confirmation_required', status: 'pass' })

  const cancelledParticipation = await api(f, '/api/match/event-participation', { method: 'DELETE' })
  if (cancelledParticipation.status !== 200 || cancelledParticipation.body?.participation !== null) {
    throw new Error('participation_cancel_failed')
  }
  const fAfterCancel = assertLifecycle(
    await api(f, '/api/match/event-participation'),
    'cancelled_lifecycle_lookup_failed',
  )
  if (fAfterCancel.status !== 'cancelled') throw new Error('cancelled_status_not_visible')
  const gAfterCancel = assertLifecycle(
    await api(g, '/api/match/event-participation'),
    'remaining_friend_lifecycle_failed',
  )
  if (gAfterCancel.occurrence_id !== fRoom.occurrence_id
    || gAfterCancel.status !== 'recruiting'
    || gAfterCancel.party_members?.length !== 1
    || gAfterCancel.party_members[0]?.display_name !== '나') {
    throw new Error('cancelled_friend_still_linked')
  }
  await assertCancelledArtifacts(f, fRoom.occurrence_id)

  const confirmedCancel = await api(a, '/api/match/event-participation', { method: 'DELETE' })
  if (confirmedCancel.status !== 409 || confirmedCancel.body?.error !== 'event_state_locked') {
    throw new Error('confirmed_participation_cancel_not_blocked')
  }

  // Keep cleanupUsersByRunId visibly tied to this suite's isolated-account contract.
  if (typeof cleanupUsersByRunId !== 'function') throw new Error('cleanup_contract_missing')
})
