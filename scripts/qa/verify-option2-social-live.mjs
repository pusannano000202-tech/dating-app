import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { QA, qaSql, readQaStatus } from './option2-local-environment.mjs'

const ACCOUNTS_PATH = join(QA.runtimeRoot, 'accounts.json')
const RESULTS_PATH = join(QA.workspaceRoot, 'artifacts/option2-live-20260908/social-live-results.json')
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ACCOUNT_COUNT = 8
const PUBLIC_ACCOUNT_LABELS = Array.from({ length: ACCOUNT_COUNT }, (_, index) => `testphone${String(index + 1).padStart(3, '0')}`)
const FORBIDDEN_PUBLIC_KEYS = new Set([
  'email', 'phone', 'user_id', 'sender_user_id', 'captain_user_id', 'created_by',
  'friend_user_id', 'invitee_user_id', 'inviter_user_id',
])

class QaFailure extends Error {
  constructor(code) {
    super(code)
    this.name = 'QaFailure'
    this.code = code
  }
}

function check(condition, code) {
  if (!condition) throw new QaFailure(code)
}

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function normalizeRpcData(data) {
  return Array.isArray(data) && data.length === 1 ? data[0] : data
}

function rpcErrorName(error) {
  if (!error) return 'unknown_rpc_error'
  const message = typeof error.message === 'string' ? error.message : ''
  const match = message.match(/(?:^|\s)([a-z][a-z0-9_]{2,80})(?:$|\s)/)
  return match?.[1] ?? (typeof error.code === 'string' ? error.code : 'rpc_rejected')
}

async function rpc(client, name, args = {}, options = {}) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw new QaFailure(`${name}:${rpcErrorName(error)}`)
  return options.keepRows ? data : normalizeRpcData(data)
}

async function expectRpcDenied(client, name, args, acceptableNames = []) {
  const { error } = await client.rpc(name, args)
  check(Boolean(error), `${name}:unexpectedly_allowed`)
  if (acceptableNames.length > 0) {
    const safeName = rpcErrorName(error)
    check(acceptableNames.includes(safeName), `${name}:unexpected_denial`)
  }
}

function assertNoPublicIdentifiers(value, context, allowed = new Set()) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPublicIdentifiers(entry, `${context}[${index}]`, allowed))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, entry] of Object.entries(value)) {
    check(!FORBIDDEN_PUBLIC_KEYS.has(key) || allowed.has(key), `${context}:private_key_${key}`)
    assertNoPublicIdentifiers(entry, `${context}.${key}`, allowed)
  }
}

function assertNoContactValues(value, context) {
  const serialized = JSON.stringify(value)
  check(!/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(serialized), `${context}:email_value`)
  check(!/(?:\+?82|0)10[- ]?\d{3,4}[- ]?\d{4}/.test(serialized), `${context}:phone_value`)
}

function buildClient(apiUrl, key) {
  return createClient(apiUrl, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })
}

async function writePrivateJson(path, value, options = {}) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, ...options })
}

async function replacePrivateJson(path, value) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writePrivateJson(temporaryPath, value, { flag: 'wx' })
  await rename(temporaryPath, path)
}

function validateStoredAccounts(document) {
  check(document?.version === 1, 'accounts_file_version')
  check(document.projectId === QA.projectId && document.apiUrl === QA.apiUrl, 'accounts_file_target')
  check(document.state === 'seeding' || document.state === 'ready', 'accounts_file_state')
  check(Array.isArray(document.accounts) && document.accounts.length <= ACCOUNT_COUNT, 'accounts_file_count')
  const seenLabels = new Set()
  for (const account of document.accounts) {
    const index = PUBLIC_ACCOUNT_LABELS.indexOf(account.label)
    check(index >= 0 && !seenLabels.has(account.label), 'accounts_file_label')
    seenLabels.add(account.label)
    check(isUuid(account.userId), 'accounts_file_user_id')
    check(account.email === `qa.option2.${String(index + 1).padStart(3, '0')}@example.invalid`, 'accounts_file_email')
    check(account.phone === `8210000000${String(index + 1).padStart(2, '0')}`, 'accounts_file_phone')
    check(typeof account.password === 'string' && account.password.length >= 32, 'accounts_file_password')
    check(typeof account.department === 'string' && account.department.length >= 2, 'accounts_file_department')
  }
  if (document.state === 'ready') check(document.accounts.length === ACCOUNT_COUNT, 'accounts_file_ready_count')
  return document
}

async function loadAccounts() {
  try {
    return validateStoredAccounts(JSON.parse(await readFile(ACCOUNTS_PATH, 'utf8')))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return null
  }
}

function expectedAccountIdentity(index) {
  const ordinal = String(index + 1).padStart(3, '0')
  return {
    label: `testphone${ordinal}`,
    email: `qa.option2.${ordinal}@example.invalid`,
    phone: `8210000000${String(index + 1).padStart(2, '0')}`,
    department: index === ACCOUNT_COUNT - 1 ? '전기전자공학부' : '기계공학부',
  }
}

function authUserMatches(user, identity) {
  return user?.email === identity.email
    && String(user.phone ?? '').replace(/^\+/, '') === identity.phone
    && user.user_metadata?.qa_fixture === QA.projectId
    && user.user_metadata?.qa_label === identity.label
}

async function listFixtureUsers(admin) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error || !Array.isArray(data?.users)) throw new QaFailure('account_recovery_list')
  return data.users.filter(user => typeof user.email === 'string' && user.email.startsWith('qa.option2.'))
}

async function persistAccountProgress(accounts, state) {
  await replacePrivateJson(ACCOUNTS_PATH, {
    version: 1,
    state,
    projectId: QA.projectId,
    apiUrl: QA.apiUrl,
    updatedAt: new Date().toISOString(),
    accounts: [...accounts].sort((first, second) => first.label.localeCompare(second.label)),
  })
}

async function seedAccounts(admin) {
  const stored = await loadAccounts()
  if (stored?.state === 'ready') return { accounts: stored.accounts, created: false, recovered: false }
  const storedByLabel = new Map((stored?.accounts ?? []).map(account => [account.label, account]))
  const fixtureUsers = await listFixtureUsers(admin)
  const accounts = []
  let created = false
  let recovered = false
  for (let index = 0; index < ACCOUNT_COUNT; index += 1) {
    const identity = expectedAccountIdentity(index)
    const storedAccount = storedByLabel.get(identity.label)
    const matchingUsers = fixtureUsers.filter(user => authUserMatches(user, identity))
    check(matchingUsers.length <= 1, `account_duplicate_${identity.label}`)
    let account
    if (storedAccount) {
      check(matchingUsers[0]?.id === storedAccount.userId, `account_stored_identity_${identity.label}`)
      account = storedAccount
    } else if (matchingUsers.length === 1) {
      account = { ...identity, password: randomBytes(32).toString('base64url'), userId: matchingUsers[0].id }
      const { error } = await admin.auth.admin.updateUserById(account.userId, { password: account.password })
      if (error) throw new QaFailure(`account_recovery_${identity.label}`)
      recovered = true
    } else {
      account = { ...identity, password: randomBytes(32).toString('base64url') }
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        email_confirm: true,
        phone: account.phone,
        phone_confirm: true,
        password: account.password,
        user_metadata: { qa_fixture: QA.projectId, qa_label: account.label },
      })
      if (error || !isUuid(data?.user?.id)) throw new QaFailure(`account_create_${identity.label}`)
      account.userId = data.user.id
      created = true
    }
    const completion = await rpc(admin, 'complete_minimum_signup_with_friend_name', {
      p_user_id: account.userId,
      p_display_name: `검수계정${index + 1}`,
      p_friend_recognition_name: `검수친구${index + 1}`,
      p_birth_date: `200${index % 4}-0${(index % 8) + 1}-01`,
      p_school_scope: 'pnu_self_selected',
      p_department: identity.department,
      p_community_gender: index % 2 === 0 ? 'male' : 'female',
      p_height: 165 + index,
      p_body_type: 'average',
      p_hair_density: 'full',
      p_year: (index % 4) + 1,
    })
    check(completion?.minimum_signup_complete === true, `account_minimum_signup_${identity.label}`)
    accounts.push(account)
    await persistAccountProgress(accounts, 'seeding')
  }
  await persistAccountProgress(accounts, 'ready')
  return { accounts, created, recovered }
}

async function signInAccounts(status, accounts) {
  const clients = []
  for (const account of accounts) {
    const client = buildClient(QA.apiUrl, status.ANON_KEY)
    const { data, error } = await client.auth.signInWithPassword({ email: account.email, password: account.password })
    if (error || data.user?.id !== account.userId || !data.session?.access_token) {
      throw new QaFailure(`account_sign_in_${account.label}`)
    }
    clients.push(client)
  }
  return clients
}

async function establishFriendship(inviter, invitee) {
  const tokenHash = createHash('sha256').update(randomBytes(32)).digest('hex')
  const created = await rpc(inviter, 'create_my_friend_invite', {
    p_token_hash: tokenHash,
    p_idempotency_key: randomUUID(),
  })
  check(isUuid(created?.invite_id), 'friend_invite_create_shape')
  const preview = await rpc(invitee, 'preview_friend_invite', { p_token_hash: tokenHash })
  check(isUuid(preview?.invite_id), 'friend_invite_preview_shape')
  const decisionKey = randomUUID()
  const accepted = await rpc(invitee, 'accept_friend_invite', {
    p_token_hash: tokenHash,
    p_idempotency_key: decisionKey,
  })
  check(isUuid(accepted?.friend_user_id) && isUuid(accepted?.request_id), 'friend_invite_accept_shape')
  const replay = await rpc(invitee, 'accept_friend_invite', {
    p_token_hash: tokenHash,
    p_idempotency_key: decisionKey,
  })
  assert.deepEqual(replay, accepted, 'friend invite acceptance must be idempotent')
  return accepted.request_id
}

async function verifyUnauthenticatedDenials(anonymous) {
  await expectRpcDenied(anonymous, 'list_activity_rooms', {
    p_activity_key: 'team-gaming',
    p_gender_mode: 'all',
  })
  await expectRpcDenied(anonymous, 'get_my_home_meetups')
  await expectRpcDenied(anonymous, 'list_my_department_challenges')
  return { passed: true, checked: 3 }
}

async function verifyActivityRooms(clients) {
  const poolCountBefore = Number(qaSql("select count(*) from quantum_private.activity_room_pools where activity_key='team-gaming';"))
  const listBefore = await rpc(clients[0], 'list_activity_rooms', {
    p_activity_key: 'team-gaming',
    p_gender_mode: 'all',
  })
  check(listBefore?.room_count === 0 && Array.isArray(listBefore.rooms) && listBefore.rooms.length === 0, 'activity_list_not_empty_before_ensure')
  const poolCountAfterRead = Number(qaSql("select count(*) from quantum_private.activity_room_pools where activity_key='team-gaming';"))
  check(poolCountAfterRead === poolCountBefore, 'activity_list_had_side_effect')

  const ensured = await rpc(clients[0], 'ensure_activity_room_pool', {
    p_activity_key: 'team-gaming',
    p_gender_mode: 'all',
  })
  check(ensured?.room_count === 1 && ensured.capacity === 5, 'activity_ensure_shape')
  const firstRoomId = ensured.rooms?.[0]?.id
  check(isUuid(firstRoomId), 'activity_first_room_id')

  const firstJoin = await rpc(clients[0], 'join_activity_room', { p_room_id: firstRoomId })
  check(firstJoin?.member_count === 1 && firstJoin.reused === false, 'activity_first_join')
  const reusedJoin = await rpc(clients[0], 'join_activity_room', { p_room_id: firstRoomId })
  check(reusedJoin?.room_id === firstRoomId && reusedJoin.reused === true, 'activity_join_idempotency')

  const messageKey = randomUUID()
  const sent = await rpc(clients[0], 'send_activity_room_message', {
    p_room_id: firstRoomId,
    p_message: '늦게 합류해도 이전 대화를 확인할 수 있는 검수 메시지',
    p_idempotency_key: messageKey,
  })
  const resent = await rpc(clients[0], 'send_activity_room_message', {
    p_room_id: firstRoomId,
    p_message: '늦게 합류해도 이전 대화를 확인할 수 있는 검수 메시지',
    p_idempotency_key: messageKey,
  })
  check(isUuid(sent?.id) && resent?.id === sent.id && resent.reused === true, 'activity_message_idempotency')

  for (let index = 1; index <= 4; index += 1) {
    const joined = await rpc(clients[index], 'join_activity_room', { p_room_id: firstRoomId })
    check(joined?.member_count === index + 1, `activity_fill_${index}`)
  }
  const afterFull = await rpc(clients[0], 'list_activity_rooms', {
    p_activity_key: 'team-gaming',
    p_gender_mode: 'all',
  })
  check(afterFull?.room_count === 2, 'activity_next_room_missing')
  const secondRoom = afterFull.rooms.find(room => room.id !== firstRoomId)
  check(isUuid(secondRoom?.id) && secondRoom.member_count === 0, 'activity_second_room_shape')
  const secondJoin = await rpc(clients[5], 'join_activity_room', { p_room_id: secondRoom.id })
  check(secondJoin?.member_count === 1, 'activity_second_room_join')

  await expectRpcDenied(clients[6], 'get_activity_room', { p_room_id: firstRoomId }, ['activity_room_membership_required'])
  await expectRpcDenied(clients[6], 'send_activity_room_message', {
    p_room_id: firstRoomId,
    p_message: '비회원 메시지',
    p_idempotency_key: randomUUID(),
  }, ['activity_room_membership_required'])

  const leftFirst = await rpc(clients[3], 'leave_activity_room', { p_room_id: firstRoomId })
  const leftSecond = await rpc(clients[5], 'leave_activity_room', { p_room_id: secondRoom.id })
  check(leftFirst?.member_count === 4 && leftSecond?.member_count === 0, 'activity_leave_counts')
  const lateJoin = await rpc(clients[6], 'join_activity_room', { p_room_id: firstRoomId })
  check(lateJoin?.member_count === 5, 'activity_late_join')
  const lateDetail = await rpc(clients[6], 'get_activity_room', { p_room_id: firstRoomId })
  check(lateDetail?.messages?.some(message => message.id === sent.id), 'activity_history_missing_for_late_joiner')
  assertNoPublicIdentifiers(lateDetail, 'activity_detail')
  assertNoContactValues(lateDetail, 'activity_detail')
  const history = await rpc(clients[6], 'get_activity_room_messages', {
    p_room_id: firstRoomId,
    p_before_created_at: null,
    p_before_message_id: null,
  })
  check(history?.messages?.some(message => message.id === sent.id), 'activity_history_page_missing')
  assertNoPublicIdentifiers(history, 'activity_history')
  assertNoContactValues(history, 'activity_history')

  const persisted = qaSql(`select jsonb_build_object(
    'active_members',(select count(*) from quantum_private.activity_room_members where room_id='${firstRoomId}'::uuid and status='joined'),
    'messages',(select count(*) from quantum_private.activity_room_messages where room_id='${firstRoomId}'::uuid),
    'open_rooms',(select count(*) from quantum_private.activity_room_rooms room join quantum_private.activity_room_pools pool on pool.id=room.pool_id where pool.activity_key='team-gaming' and room.status in ('open','full'))
  );`)
  const counts = JSON.parse(persisted)
  check(counts.active_members === 5 && counts.messages === 1 && counts.open_rooms === 2, 'activity_persistence_counts')
  return {
    passed: true,
    capacity: 5,
    firstRoomMembers: counts.active_members,
    openRooms: counts.open_rooms,
    persistentMessages: counts.messages,
    lateJoinHistory: true,
    listReadSideEffectFree: true,
  }
}

function activityRoomSnapshot(lobby) {
  check(Array.isArray(lobby?.rooms) && lobby.rooms.length === 2, 'activity_followup_room_shape')
  return [...lobby.rooms]
    .sort((first, second) => first.room_number - second.room_number)
    .map(room => ({
      roomNumber: room.room_number,
      memberCount: room.member_count,
      capacity: room.capacity,
      status: room.status,
    }))
}

async function currentActivityMemberships(clients) {
  const memberships = []
  let canonicalLobby
  for (const [index, client] of clients.entries()) {
    const lobby = await rpc(client, 'list_activity_rooms', {
      p_activity_key: 'team-gaming',
      p_gender_mode: 'all',
    })
    canonicalLobby ??= lobby
    const joinedRoom = lobby.rooms?.find(room => room.joined)
    memberships.push({ clientIndex: index, roomId: joinedRoom?.id ?? null })
  }
  return { canonicalLobby, memberships }
}

async function verifyActivityFivePlusTwoFollowup(clients) {
  const before = await currentActivityMemberships(clients)
  const orderedRooms = [...before.canonicalLobby.rooms].sort((first, second) => first.room_number - second.room_number)
  const [firstRoom, secondRoom] = orderedRooms
  check(firstRoom.member_count === 5 && secondRoom.member_count === 0, 'activity_followup_expected_start')
  const free = before.memberships.filter(entry => entry.roomId === null)
  check(free.length === 3, 'activity_followup_free_accounts')

  for (const entry of free.slice(0, 2)) {
    await rpc(clients[entry.clientIndex], 'join_activity_room', { p_room_id: secondRoom.id })
  }
  const fivePlusTwoLobby = await rpc(clients[free[0].clientIndex], 'list_activity_rooms', {
    p_activity_key: 'team-gaming',
    p_gender_mode: 'all',
  })
  const fivePlusTwo = activityRoomSnapshot(fivePlusTwoLobby)
  check(fivePlusTwo[0].memberCount === 5 && fivePlusTwo[1].memberCount === 2, 'activity_followup_five_plus_two')
  check(fivePlusTwo[0].status === 'full' && fivePlusTwo[1].status === 'recruiting', 'activity_followup_rooms_coexist')

  const existingFirstRoomMember = before.memberships.find(entry => entry.roomId === firstRoom.id)
  check(existingFirstRoomMember, 'activity_followup_first_member')
  await rpc(clients[existingFirstRoomMember.clientIndex], 'leave_activity_room', { p_room_id: firstRoom.id })
  const fourPlusTwoLobby = await rpc(clients[free[0].clientIndex], 'list_activity_rooms', {
    p_activity_key: 'team-gaming',
    p_gender_mode: 'all',
  })
  const fourPlusTwo = activityRoomSnapshot(fourPlusTwoLobby)
  check(fourPlusTwo[0].memberCount === 4 && fourPlusTwo[1].memberCount === 2, 'activity_followup_four_plus_two')
  check(fourPlusTwo.every(room => room.status === 'recruiting'), 'activity_followup_both_recruiting')

  const newcomer = free[2]
  await rpc(clients[newcomer.clientIndex], 'join_activity_room', { p_room_id: firstRoom.id })
  const detail = await rpc(clients[newcomer.clientIndex], 'get_activity_room', { p_room_id: firstRoom.id })
  check(detail.messages?.some(message => message.message === '늦게 합류해도 이전 대화를 확인할 수 있는 검수 메시지'), 'activity_followup_previous_chat')
  assertNoPublicIdentifiers(detail, 'activity_followup_detail')
  assertNoContactValues(detail, 'activity_followup_detail')
  const finalLobby = await rpc(clients[newcomer.clientIndex], 'list_activity_rooms', {
    p_activity_key: 'team-gaming',
    p_gender_mode: 'all',
  })
  const afterNewcomer = activityRoomSnapshot(finalLobby)
  check(afterNewcomer[0].memberCount === 5 && afterNewcomer[1].memberCount === 2, 'activity_followup_final_counts')

  return {
    passed: true,
    before: activityRoomSnapshot(before.canonicalLobby),
    fullPlusRecruiting: fivePlusTwo,
    afterFirstRoomLeave: fourPlusTwo,
    afterNewcomerJoin: afterNewcomer,
    priorChatVisibleToNewcomer: true,
  }
}

function findChallenge(list, challengeId) {
  check(Array.isArray(list), 'department_list_shape')
  return list.find(challenge => challenge?.id === challengeId)
}

async function verifyDepartment(clients, accounts) {
  await establishFriendship(clients[0], clients[1])
  await establishFriendship(clients[0], clients[7])

  const createKey = randomUUID()
  const input = {
    p_category: 'gaming',
    p_title: '기계공학부 게임 팀원 모집',
    p_rules: '5인 팀으로 진행하고 세부 시간과 장소는 채팅에서 확인합니다.',
    p_team_capacity: 5,
    p_idempotency_key: createKey,
  }
  const created = await rpc(clients[0], 'create_department_challenge', input)
  const replayedCreate = await rpc(clients[0], 'create_department_challenge', input)
  check(isUuid(created?.id) && replayedCreate?.id === created.id, 'department_create_idempotency')
  assert.deepEqual(replayedCreate, created, 'department create replay must return the same projection')
  const captainTeam = created.teams?.find(team => team.is_captain)
  check(isUuid(captainTeam?.id) && captainTeam.accepted_count === 1 && captainTeam.roster?.length === 1, 'department_initial_roster')
  assertNoPublicIdentifiers(created, 'department_created')

  const state = await rpc(clients[0], 'get_my_department_challenge_invite_state', { p_challenge_id: created.id })
  check(state?.revision === 0, 'department_invite_state_revision')
  check(state.candidates?.length === 1, 'department_candidate_department_filter')
  const friendUserId = state.candidates[0]?.user_id
  check(isUuid(friendUserId), 'department_candidate_id')

  const inviteKey = randomUUID()
  const invite = await rpc(clients[0], 'invite_friend_to_department_challenge', {
    p_challenge_id: created.id,
    p_team_id: captainTeam.id,
    p_friend_user_id: friendUserId,
    p_expected_revision: state.revision,
    p_idempotency_key: inviteKey,
  })
  const inviteReplay = await rpc(clients[0], 'invite_friend_to_department_challenge', {
    p_challenge_id: created.id,
    p_team_id: captainTeam.id,
    p_friend_user_id: friendUserId,
    p_expected_revision: state.revision,
    p_idempotency_key: inviteKey,
  })
  check(isUuid(invite?.invite_id) && inviteReplay?.invite_id === invite.invite_id && inviteReplay.replayed === true, 'department_invite_idempotency')

  const incoming = await rpc(clients[1], 'get_my_department_challenge_invite_state', { p_challenge_id: created.id })
  check(incoming?.incoming?.some(entry => entry.invite_id === invite.invite_id), 'department_incoming_missing')
  const acceptKey = randomUUID()
  const accepted = await rpc(clients[1], 'accept_my_department_challenge_invite', {
    p_invite_id: invite.invite_id,
    p_expected_revision: invite.revision,
    p_idempotency_key: acceptKey,
  })
  const acceptedReplay = await rpc(clients[1], 'accept_my_department_challenge_invite', {
    p_invite_id: invite.invite_id,
    p_expected_revision: invite.revision,
    p_idempotency_key: acceptKey,
  })
  check(accepted?.status === 'accepted' && acceptedReplay?.replayed === true, 'department_accept_idempotency')

  const captainList = await rpc(clients[0], 'list_my_department_challenges', {}, { keepRows: true })
  const participantList = await rpc(clients[1], 'list_my_department_challenges', {}, { keepRows: true })
  const outsiderList = await rpc(clients[7], 'list_my_department_challenges', {}, { keepRows: true })
  const captainChallenge = findChallenge(captainList, created.id)
  const participantChallenge = findChallenge(participantList, created.id)
  const outsiderChallenge = findChallenge(outsiderList, created.id)
  check(captainChallenge && participantChallenge && outsiderChallenge, 'department_persisted_projection_missing')
  const captainProjectionTeam = captainChallenge.teams.find(team => team.id === captainTeam.id)
  const participantProjectionTeam = participantChallenge.teams.find(team => team.id === captainTeam.id)
  const outsiderProjectionTeam = outsiderChallenge.teams.find(team => team.id === captainTeam.id)
  check(captainProjectionTeam.accepted_count === 2 && captainProjectionTeam.roster.length === 2, 'department_captain_count')
  check(participantProjectionTeam.accepted_count === 2 && participantProjectionTeam.roster.length === 2, 'department_participant_count')
  check(outsiderProjectionTeam.accepted_count === 2 && outsiderProjectionTeam.roster.length === 0, 'department_redacted_count_contract')
  assertNoPublicIdentifiers(captainChallenge, 'department_captain_projection')
  assertNoPublicIdentifiers(participantChallenge, 'department_participant_projection')
  assertNoPublicIdentifiers(outsiderChallenge, 'department_outsider_projection')
  assertNoContactValues(captainChallenge, 'department_captain_projection')
  assertNoContactValues(participantChallenge, 'department_participant_projection')
  assertNoContactValues(outsiderChallenge, 'department_outsider_projection')

  await expectRpcDenied(clients[0], 'invite_friend_to_department_challenge', {
    p_challenge_id: created.id,
    p_team_id: captainTeam.id,
    p_friend_user_id: accounts[7].userId,
    p_expected_revision: accepted.revision,
    p_idempotency_key: randomUUID(),
  }, ['department_restricted'])

  const persistence = JSON.parse(qaSql(`select jsonb_build_object(
    'challenges',(select count(*) from public.department_challenges where id='${created.id}'::uuid),
    'accepted_roster',(select count(*) from public.department_challenge_roster where challenge_id='${created.id}'::uuid and status='accepted'),
    'accepted_invites',(select count(*) from public.department_challenge_friend_invites where challenge_id='${created.id}'::uuid and status='accepted'),
    'friendships',(select count(*) from public.friendships friendship
      where friendship.status='active' and exists (
        select 1 from (values
          ('qa.option2.001@example.invalid','qa.option2.002@example.invalid'),
          ('qa.option2.001@example.invalid','qa.option2.008@example.invalid')
        ) pair(first_email,second_email)
        join auth.users first_account on first_account.email=pair.first_email
        join auth.users second_account on second_account.email=pair.second_email
        where friendship.user_id=least(first_account.id,second_account.id)
          and friendship.friend_user_id=greatest(first_account.id,second_account.id)
      ))
  );`))
  check(persistence.challenges === 1 && persistence.accepted_roster === 2
    && persistence.accepted_invites === 1 && persistence.friendships === 2, 'department_persistence_counts')
  return {
    passed: true,
    challengeRows: persistence.challenges,
    acceptedRoster: persistence.accepted_roster,
    acceptedTeamInvites: persistence.accepted_invites,
    acceptedFriendships: persistence.friendships,
    captainVisibleRoster: captainProjectionTeam.roster.length,
    outsiderVisibleRoster: outsiderProjectionTeam.roster.length,
    outsiderVisibleCount: outsiderProjectionTeam.accepted_count,
    createIdempotent: true,
    inviteIdempotent: true,
    acceptIdempotent: true,
    crossDepartmentDenied: true,
  }
}

async function verifyHome(clients) {
  const now = Date.now()
  const scheduledAt = new Date(now + 2 * 60 * 60 * 1000).toISOString()
  const endsAt = new Date(now + 3 * 60 * 60 * 1000).toISOString()
  const scheduled = await rpc(clients[0], 'create_activity_meetup_v3', {
    p_category: 'gaming',
    p_title: '옵션2 홈 일정 검수 모임',
    p_description: '내 모임 읽기 모델의 일정 우선 정렬을 확인합니다.',
    p_place_name: '부산대학교 정문',
    p_scheduled_at: scheduledAt,
    p_capacity: 5,
    p_gender_mode: 'all',
    p_ends_at: endsAt,
    p_scope_type: 'school',
    p_activity_key: 'team-gaming',
    p_idempotency_key: randomUUID(),
  })
  check(isUuid(scheduled?.id), 'home_scheduled_create')
  const countsBefore = qaSql("select concat((select count(*) from quantum_private.activity_room_pools),'|',(select count(*) from quantum_private.activity_room_rooms));")
  const own = await rpc(clients[0], 'get_my_home_meetups')
  const countsAfter = qaSql("select concat((select count(*) from quantum_private.activity_room_pools),'|',(select count(*) from quantum_private.activity_room_rooms));")
  check(countsBefore === countsAfter, 'home_read_side_effect')
  check(Array.isArray(own?.items) && own.items.length >= 2, 'home_own_list_shape')
  check(own.items[0]?.kind === 'scheduled' && own.items[0]?.id === scheduled.id, 'home_scheduled_sort_order')
  check(own.items.some(item => item.kind === 'activity_room'), 'home_activity_room_missing')
  assertNoPublicIdentifiers(own, 'home_own')
  assertNoContactValues(own, 'home_own')

  const notMember = await rpc(clients[2], 'get_my_home_meetups')
  check(!notMember.items.some(item => item.id === scheduled.id), 'home_exposed_nonmembership')
  assertNoPublicIdentifiers(notMember, 'home_other')
  assertNoContactValues(notMember, 'home_other')
  return {
    passed: true,
    ownItems: own.items.length,
    scheduledFirst: true,
    activityRoomIncluded: true,
    outsiderScheduleHidden: true,
    readSideEffectFree: true,
    hasMore: own.has_more,
  }
}

async function main() {
  check(process.argv.length <= 3, 'unexpected_arguments')
  const mode = process.argv[2] ?? 'full'
  check(mode === 'full' || mode === 'activity-5-plus-2-followup', 'unexpected_mode')
  const status = readQaStatus()
  check(status.API_URL === QA.apiUrl, 'unexpected_api_url')
  const admin = buildClient(QA.apiUrl, status.SERVICE_ROLE_KEY)
  const anonymous = buildClient(QA.apiUrl, status.ANON_KEY)

  if (mode === 'activity-5-plus-2-followup') {
    const stored = await loadAccounts()
    check(stored?.state === 'ready' && stored.accounts.length === ACCOUNT_COUNT, 'followup_accounts_not_ready')
    const clients = await signInAccounts(status, stored.accounts)
    const followup = await verifyActivityFivePlusTwoFollowup(clients)
    const results = JSON.parse(await readFile(RESULTS_PATH, 'utf8'))
    check(results?.projectId === QA.projectId && results?.activityRooms?.passed === true, 'followup_results_target')
    results.activityRooms.parallelRecruitment = followup
    results.updatedAt = new Date().toISOString()
    await replacePrivateJson(RESULTS_PATH, results)
    console.log(JSON.stringify({ stage: 'activity_5_plus_2_complete', passed: true, resultsPath: RESULTS_PATH, privatePayloadExcluded: true }))
    return
  }

  const seeded = await seedAccounts(admin)
  console.log(JSON.stringify({
    stage: 'accounts_ready',
    count: seeded.accounts.length,
    created: seeded.created,
    credentialsPath: ACCOUNTS_PATH,
    schema: 'version,state,projectId,apiUrl,updatedAt,accounts[{label,email,phone,password,userId,department}]',
    secretsPrinted: false,
  }))
  const clients = await signInAccounts(status, seeded.accounts)

  const results = {
    schemaVersion: 1,
    projectId: QA.projectId,
    apiUrl: QA.apiUrl,
    executedAt: new Date().toISOString(),
    accountFixtures: { passed: true, count: seeded.accounts.length, credentialsExcluded: true },
    unauthenticated: await verifyUnauthenticatedDenials(anonymous),
    activityRooms: await verifyActivityRooms(clients),
    department: await verifyDepartment(clients, seeded.accounts),
    home: await verifyHome(clients),
    privatePayloadExcluded: true,
  }
  await writePrivateJson(RESULTS_PATH, results)
  console.log(JSON.stringify({ stage: 'complete', passed: true, resultsPath: RESULTS_PATH, privatePayloadExcluded: true }))
}

main().catch(async error => {
  const safeCode = error instanceof QaFailure ? error.code : 'unexpected_failure'
  const failure = {
    schemaVersion: 1,
    projectId: QA.projectId,
    apiUrl: QA.apiUrl,
    executedAt: new Date().toISOString(),
    passed: false,
    failureCode: safeCode,
    privatePayloadExcluded: true,
  }
  try { await writePrivateJson(RESULTS_PATH, failure) } catch {}
  console.error(JSON.stringify({ stage: 'failed', passed: false, failureCode: safeCode, privatePayloadExcluded: true }))
  process.exitCode = 1
})
