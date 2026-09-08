import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

import { QA, qaSql, readQaStatus } from './option2-local-environment.mjs'

if (process.argv.length !== 2) throw new Error('no_arguments_allowed')

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TOKEN_PATH_PATTERN = /^\/friend-invites\/([0-9a-f]{64})$/
const runTag = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
const resultPath = join(
  QA.workspaceRoot,
  'artifacts/option2-live-20260908',
  `social-http-results-${runTag}.json`,
)
let currentPhase = 'bootstrap'

class QaHttpFailure extends Error {
  constructor(code) {
    super(code)
    this.name = 'QaHttpFailure'
    this.code = code
  }
}

function check(condition, code) {
  if (!condition) throw new QaHttpFailure(code)
}

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function safeErrorCode(error) {
  return error instanceof QaHttpFailure ? error.code : 'unexpected_failure'
}

function createCookieSessionClient(apiUrl, publicKey) {
  const cookies = new Map()
  const supabase = createServerClient(apiUrl, publicKey, {
    cookies: {
      getAll() {
        return [...cookies].map(([name, value]) => ({ name, value }))
      },
      setAll(values) {
        for (const { name, value } of values) {
          if (value) cookies.set(name, value)
          else cookies.delete(name)
        }
      },
    },
  })
  return { supabase, cookies }
}

function cookieHeader(cookies) {
  check(cookies instanceof Map && cookies.size > 0, 'cookie_session_missing')
  return [...cookies].map(([name, value]) => {
    check(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name), 'cookie_name_invalid')
    check(typeof value === 'string' && !/[\u0000-\u001f\u007f;]/.test(value), 'cookie_value_invalid')
    return `${name}=${value}`
  }).join('; ')
}

async function writeResult(value) {
  await mkdir(dirname(resultPath), { recursive: true })
  await writeFile(resultPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
}

async function createFixtureAccount(admin, actor, index) {
  const phone = `8210${String(randomInt(0, 100_000_000)).padStart(8, '0')}`
  const account = {
    actor,
    email: `qa.http.${runTag}.${actor}@example.invalid`,
    password: randomBytes(32).toString('base64url'),
    phone,
    displayName: actor === 'captain' ? 'HTTP검수주장' : 'HTTP검수친구',
    friendName: actor === 'captain' ? '검수주장' : '검수친구',
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: account.email,
    email_confirm: true,
    phone: account.phone,
    phone_confirm: true,
    password: account.password,
    user_metadata: { qa_fixture: QA.projectId, qa_label: `qa.http.${actor}` },
  })
  check(!error && isUuid(data?.user?.id), `fixture_create_${actor}`)
  account.userId = data.user.id

  const { error: signupError } = await admin.rpc('complete_minimum_signup_with_friend_name', {
    p_user_id: account.userId,
    p_display_name: account.displayName,
    p_friend_recognition_name: account.friendName,
    p_birth_date: `200${index + 1}-01-01`,
    p_school_scope: 'pnu_self_selected',
    p_department: '기계공학부',
    p_community_gender: index === 0 ? 'male' : 'female',
    p_height: 170 + index,
    p_body_type: 'average',
    p_hair_density: 'full',
    p_year: index + 1,
  })
  check(!signupError, `fixture_signup_${actor}`)
  return account
}

async function signIn(status, account) {
  const local = createCookieSessionClient(QA.apiUrl, status.ANON_KEY)
  const { data, error } = await local.supabase.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  })
  check(!error && data.user?.id === account.userId && Boolean(data.session?.access_token), `sign_in_${account.actor}`)
  return { cookie: cookieHeader(local.cookies) }
}

async function httpJson(label, path, { method = 'GET', session, body } = {}) {
  const headers = { Accept: 'application/json' }
  if (session) headers.Cookie = session.cookie
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    headers.Origin = QA.appOrigin
  }
  let response
  try {
    response = await fetch(new URL(path, QA.appOrigin), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    })
  } catch {
    throw new QaHttpFailure(`${label}_transport`)
  }
  const responseText = await response.text()
  let responseBody
  try {
    responseBody = JSON.parse(responseText)
  } catch {
    throw new QaHttpFailure(`${label}_non_json`)
  }
  return { status: response.status, body: responseBody }
}

function challengeFor(body, challengeId, label) {
  check(Array.isArray(body?.challenges), `${label}_list_shape`)
  const challenge = body.challenges.find((row) => row?.id === challengeId)
  check(challenge, `${label}_challenge_missing`)
  return challenge
}

function acceptedTeam(challenge, teamId, label) {
  check(challenge?.team_capacity === 5 && Array.isArray(challenge.teams), `${label}_challenge_shape`)
  const team = challenge.teams.find((row) => row?.id === teamId)
  check(team?.accepted_count === 2, `${label}_accepted_count`)
  return team
}

async function main() {
  const status = readQaStatus()
  const admin = createClient(QA.apiUrl, status.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  })

  currentPhase = 'unauthenticated_denial'
  const unauthenticated = await httpJson('unauthenticated_friend_list', '/api/friend-invites')
  check(unauthenticated.status === 401 && unauthenticated.body?.error === 'unauthenticated', 'unauthenticated_friend_list_shape')

  currentPhase = 'fixture_accounts'
  const captain = await createFixtureAccount(admin, 'captain', 0)
  const recipient = await createFixtureAccount(admin, 'recipient', 1)
  const captainSession = await signIn(status, captain)
  const recipientSession = await signIn(status, recipient)

  currentPhase = 'friend_invite_create'
  const friendCreate = await httpJson('friend_invite_create', '/api/friend-invites', {
    method: 'POST',
    session: captainSession,
    body: { idempotency_key: randomUUID() },
  })
  check(friendCreate.status === 201 && isUuid(friendCreate.body?.invite_id), 'friend_invite_create_shape')
  check(Number.isFinite(Date.parse(friendCreate.body?.expires_at)), 'friend_invite_expiry_shape')
  const tokenMatch = typeof friendCreate.body?.invite_url === 'string'
    ? friendCreate.body.invite_url.match(TOKEN_PATH_PATTERN)
    : null
  check(tokenMatch, 'friend_invite_url_shape')
  const rawToken = tokenMatch[1]

  currentPhase = 'friend_invite_preview'
  const friendPreview = await httpJson('friend_invite_preview', `/api/friend-invites/${rawToken}`, {
    session: recipientSession,
  })
  check(friendPreview.status === 200, 'friend_invite_preview_status')
  check(friendPreview.body?.invite?.invite_id === friendCreate.body.invite_id, 'friend_invite_preview_identity')
  check(friendPreview.body.invite.inviter_display_name === captain.friendName, 'friend_invite_preview_display_name')
  check(friendPreview.body.invite.status === 'pending', 'friend_invite_preview_state')

  currentPhase = 'friend_invite_accept'
  const friendAccept = await httpJson('friend_invite_accept', `/api/friend-invites/${rawToken}/accept`, {
    method: 'POST',
    session: recipientSession,
    body: { idempotency_key: randomUUID() },
  })
  check(friendAccept.status === 200, 'friend_invite_accept_status')
  check(friendAccept.body?.friend_user_id === captain.userId && friendAccept.body?.status === 'accepted', 'friend_invite_accept_shape')

  currentPhase = 'department_create'
  const departmentCreate = await httpJson('department_create', '/api/community/department/challenges', {
    method: 'POST',
    session: captainSession,
    body: {
      category: 'gaming',
      title: 'HTTP 기계공학부 게임 팀원 모집',
      rules: '5인 팀으로 진행하며 세부 일정은 참가자끼리 확인합니다.',
      team_capacity: 5,
      idempotency_key: randomUUID(),
    },
  })
  const challenge = departmentCreate.body?.challenge
  check(departmentCreate.status === 201 && isUuid(challenge?.id), 'department_create_shape')
  check(challenge.category === 'gaming' && challenge.team_capacity === 5 && challenge.revision === 0, 'department_create_contract')
  const captainTeam = Array.isArray(challenge.teams)
    ? challenge.teams.find((team) => team?.is_captain === true)
    : null
  check(isUuid(captainTeam?.id) && captainTeam.accepted_count === 1, 'department_captain_team_shape')

  currentPhase = 'department_invite_state'
  const inviteState = await httpJson(
    'department_invite_state',
    `/api/community/department/challenges/${challenge.id}/invites`,
    { session: captainSession },
  )
  check(inviteState.status === 200 && inviteState.body?.invite_state?.revision === 0, 'department_invite_state_shape')
  check(inviteState.body.invite_state.candidates?.some((row) => row?.user_id === recipient.userId), 'department_candidate_missing')

  currentPhase = 'department_invite_create'
  const departmentInvite = await httpJson(
    'department_invite_create',
    `/api/community/department/challenges/${challenge.id}/invites`,
    {
      method: 'POST',
      session: captainSession,
      body: {
        team_id: captainTeam.id,
        friend_user_id: recipient.userId,
        expected_revision: inviteState.body.invite_state.revision,
        idempotency_key: randomUUID(),
      },
    },
  )
  check(departmentInvite.status === 201 && isUuid(departmentInvite.body?.invite?.invite_id), 'department_invite_create_shape')
  check(departmentInvite.body.invite.status === 'pending' && departmentInvite.body.invite.revision === 1, 'department_invite_create_state')

  currentPhase = 'department_invite_accept'
  const recipientState = await httpJson(
    'department_recipient_state',
    `/api/community/department/challenges/${challenge.id}/invites`,
    { session: recipientSession },
  )
  const incoming = recipientState.body?.invite_state?.incoming?.find(
    (row) => row?.invite_id === departmentInvite.body.invite.invite_id,
  )
  check(recipientState.status === 200 && incoming?.status === 'pending', 'department_recipient_state_shape')
  check(recipientState.body.invite_state.revision === 1, 'department_recipient_revision')
  const departmentAccept = await httpJson(
    'department_invite_accept',
    `/api/community/department/challenges/${challenge.id}/invites/${incoming.invite_id}/accept`,
    {
      method: 'POST',
      session: recipientSession,
      body: {
        expected_revision: recipientState.body.invite_state.revision,
        idempotency_key: randomUUID(),
      },
    },
  )
  check(departmentAccept.status === 200, 'department_invite_accept_status')
  check(departmentAccept.body?.invite?.status === 'accepted' && departmentAccept.body.invite.revision === 2, 'department_invite_accept_shape')

  currentPhase = 'department_get_state_2_of_5'
  const captainList = await httpJson('department_captain_list', '/api/community/department/challenges', {
    session: captainSession,
  })
  const recipientList = await httpJson('department_recipient_list', '/api/community/department/challenges', {
    session: recipientSession,
  })
  check(captainList.status === 200 && recipientList.status === 200, 'department_list_status')
  acceptedTeam(challengeFor(captainList.body, challenge.id, 'captain'), captainTeam.id, 'captain')
  acceptedTeam(challengeFor(recipientList.body, challenge.id, 'recipient'), captainTeam.id, 'recipient')

  currentPhase = 'scoped_persistence'
  const lowerId = captain.userId < recipient.userId ? captain.userId : recipient.userId
  const higherId = captain.userId < recipient.userId ? recipient.userId : captain.userId
  const persistence = JSON.parse(qaSql(`select jsonb_build_object(
    'friendships',(select count(*) from public.friendships where user_id='${lowerId}'::uuid and friend_user_id='${higherId}'::uuid and status='active'),
    'challenge_rows',(select count(*) from public.department_challenges where id='${challenge.id}'::uuid),
    'accepted_roster',(select count(*) from public.department_challenge_roster where challenge_id='${challenge.id}'::uuid and status='accepted'),
    'accepted_team_invites',(select count(*) from public.department_challenge_friend_invites where challenge_id='${challenge.id}'::uuid and status='accepted')
  );`))
  check(
    persistence.friendships === 1
      && persistence.challenge_rows === 1
      && persistence.accepted_roster === 2
      && persistence.accepted_team_invites === 1,
    'scoped_persistence_counts',
  )

  currentPhase = 'artifact'
  const result = {
    passed: true,
    target: { projectId: QA.projectId, appOrigin: QA.appOrigin, apiUrl: QA.apiUrl },
    fixture: { accountCount: 2, namespace: 'qa.http.*', existingQaAccountsMutated: false },
    httpAssertions: {
      unauthenticatedFriendList: { status: 401, error: 'unauthenticated' },
      friendInviteCreate: { status: 201, inviteIdUuid: true, tokenReturnedButRedacted: true },
      friendInvitePreview: { status: 200, inviterRecognitionNameMatched: true, state: 'pending' },
      friendInviteAccept: { status: 200, state: 'accepted' },
      departmentCreate: { status: 201, category: 'gaming', teamCapacity: 5, acceptedCount: 1 },
      departmentInviteCreate: { status: 201, state: 'pending', revision: 1 },
      departmentInviteAccept: { status: 200, state: 'accepted', revision: 2 },
      departmentGetState: { captainAcceptedCount: 2, recipientAcceptedCount: 2, teamCapacity: 5 },
    },
    persistence,
    security: {
      cookieSessionViaSupabaseSsr: true,
      authBypass: false,
      serviceRoleUsedForFixtureOnly: true,
      credentialsLogged: false,
      tokensLogged: false,
      identifiersPersistedInArtifact: false,
    },
    completedAt: new Date().toISOString(),
  }
  await writeResult(result)
  console.log(JSON.stringify({ passed: true, artifact: resultPath, httpHappyPath: true, secretsLogged: false }))
}

try {
  await main()
} catch (error) {
  const code = safeErrorCode(error)
  try {
    await writeResult({
      passed: false,
      phase: currentPhase,
      error: code,
      security: { credentialsLogged: false, tokensLogged: false, identifiersPersistedInArtifact: false },
      completedAt: new Date().toISOString(),
    })
  } catch {
    // The console result stays sanitized even if the artifact cannot be written.
  }
  console.error(JSON.stringify({ passed: false, phase: currentPhase, error: code, secretsLogged: false }))
  process.exitCode = 1
}
