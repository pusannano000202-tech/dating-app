import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

const PARTICIPANT_COUNT = 5
const ACCOUNT_SPECS = [
  ['A', 'male'],
  ['B', 'male'],
  ['C', 'male'],
  ['D', 'female'],
  ['E', 'female'],
  ['OUTSIDER', 'female'],
]
const QA_PHASE = process.env.QA_PHASE || ''
const runId = process.env.QA_RUN_ID || ''
const password = process.env.QA_ACCOUNT_PASSWORD || ''
let activeMatchId = process.env.QA_MATCH_ID || ''
const baseUrl = (process.env.QA_BASE_URL || 'http://127.0.0.1:3015').replace(/\/$/, '')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !publishableKey || !adminKey) {
  throw new Error('Supabase QA environment is incomplete')
}
if (!['setup', 'verify', 'cleanup', 'full'].includes(QA_PHASE)) {
  throw new Error('QA_PHASE must be setup, verify, cleanup, or full')
}
if (!/^[a-zA-Z0-9_-]{8,80}$/.test(runId)) {
  throw new Error('QA_RUN_ID is missing or invalid')
}
if (password.length < 16) {
  throw new Error('QA_ACCOUNT_PASSWORD must be at least 16 characters')
}
if (QA_PHASE === 'verify' && !isUuid(activeMatchId)) {
  throw new Error('QA_MATCH_ID must be a UUID during verification')
}

const admin = createClient(supabaseUrl, adminKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const publicClient = () => createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const checks = []

function emailFor(label) {
  return `quantum.evidence.${runId}.${label.toLowerCase()}@example.invalid`
}

function pass(name, detail = 'ok') {
  checks.push({ name, status: 'pass', detail })
}

function fail(name, detail) {
  checks.push({ name, status: 'fail', detail })
  throw new Error(`${name}: ${detail}`)
}

async function createQaUser(label, gender) {
  const email = emailFor(label)
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { qa_run_id: runId, qa_purpose: 'meeting_evidence' },
  })
  if (error || !data.user) fail(`auth_${label}`, error?.message || 'user missing')

  const client = publicClient()
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  })
  if (signInError || !signedIn.session?.access_token) {
    fail(`signin_${label}`, signInError?.message || 'session missing')
  }

  const profileResponse = await fetch(`${baseUrl}/api/profile/basic`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${signedIn.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      gender,
      age: gender === 'male' ? 24 : 23,
      school: 'Pusan National University',
      department: 'QA Validation',
      year: 4,
      display_name: `QA-${label}-${runId.slice(-4)}`,
      phone: '',
      height: gender === 'male' ? 175 : 163,
      body_type: 'average',
      hair_density: gender === 'male' ? 'full' : null,
    }),
  })
  const profilePayload = await profileResponse.json().catch(() => null)
  if (profileResponse.status !== 200) {
    fail(`profile_${label}`, `${profileResponse.status}:${profilePayload?.error || 'unexpected'}`)
  }

  return { id: data.user.id, label, gender }
}

async function signInQaUser(label, gender) {
  const client = publicClient()
  const { data, error } = await client.auth.signInWithPassword({
    email: emailFor(label),
    password,
  })
  if (error || !data.user || !data.session?.access_token) {
    fail(`signin_${label}`, error?.message || 'session missing')
  }
  return { id: data.user.id, label, gender, token: data.session.access_token }
}

async function api(path, { token, expected = [200] } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const payload = await response.json().catch(() => null)
  if (!expected.includes(response.status)) {
    fail(`GET ${path}`, `${response.status}:${payload?.error || 'unexpected'}`)
  }
  return { status: response.status, payload }
}

async function uploadEvidence(user, bytes, targetMatchId = activeMatchId) {
  const form = new FormData()
  form.append('photo', new Blob([bytes], { type: 'image/webp' }), 'meeting-proof.webp')
  const response = await fetch(`${baseUrl}/api/matches/${targetMatchId}/evidence-photo`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${user.token}` },
    body: form,
  })
  const payload = await response.json().catch(() => null)
  return { status: response.status, payload }
}

async function setupAccounts() {
  const created = []
  try {
    for (const [label, gender] of ACCOUNT_SPECS) {
      created.push(await createQaUser(label, gender))
    }
  } catch (error) {
    for (const user of [...created].reverse()) {
      await admin.auth.admin.deleteUser(user.id)
    }
    throw error
  }

  pass('qa_accounts', `${PARTICIPANT_COUNT} participants + 1 security outsider`)
  return {
    status: 'setup_complete',
    run_id: runId,
    participant_count: PARTICIPANT_COUNT,
    accounts: created,
    checks,
  }
}

async function verifyEvidence(targetMatchId = activeMatchId) {
  const signedIn = []
  for (const [label, gender] of ACCOUNT_SPECS) {
    signedIn.push(await signInQaUser(label, gender))
  }
  const participants = signedIn.slice(0, PARTICIPANT_COUNT)
  const outsider = signedIn[PARTICIPANT_COUNT]
  const evidenceBytes = await readFile(join(
    process.cwd(),
    'public',
    'images',
    'match',
    'quantum-tonight-five.webp',
  ))

  let evidenceId = null
  let storagePath = null
  let verificationError = null
  try {
    const uploaded = await uploadEvidence(participants[0], evidenceBytes, targetMatchId)
    if (uploaded.status !== 201 || uploaded.payload?.reused_existing !== false) {
      fail('evidence_upload', `${uploaded.status}:${uploaded.payload?.error || 'invalid response'}`)
    }
    pass('evidence_upload')

    const replayed = await uploadEvidence(participants[0], evidenceBytes, targetMatchId)
    if (replayed.status !== 200 || replayed.payload?.reused_existing !== true) {
      fail('evidence_idempotency', `${replayed.status}:${replayed.payload?.error || 'not reused'}`)
    }
    pass('evidence_idempotency')

    const { data: storedEvidence, error: evidenceError } = await admin
      .from('meeting_photo_evidence')
      .select('id, storage_path, match_id, uploader_user_id, status')
      .eq('match_id', targetMatchId)
      .single()
    if (evidenceError || !storedEvidence || storedEvidence.status !== 'submitted') {
      fail('evidence_private_row', evidenceError?.message || 'private evidence row missing')
    }
    evidenceId = storedEvidence.id
    storagePath = storedEvidence.storage_path
    pass('evidence_private_row')

    for (const participant of participants) {
      const album = await api(`/api/matches/${targetMatchId}/album`, { token: participant.token })
      if (!album.payload?.photos?.some((photo) => photo.id === evidenceId)) {
        fail('participant_album', `${participant.label} could not see the shared evidence photo`)
      }
    }
    pass('five_participant_album', `${PARTICIPANT_COUNT}/${PARTICIPANT_COUNT}`)

    const outsiderAlbum = await api(`/api/matches/${targetMatchId}/album`, {
      token: outsider.token,
      expected: [403],
    })
    if (outsiderAlbum.payload?.error !== 'not_match_participant') {
      fail('not_match_participant', outsiderAlbum.payload?.error || 'wrong outsider response')
    }
    pass('not_match_participant')
  } catch (error) {
    verificationError = error
  } finally {
    if (!storagePath) {
      const { data } = await admin
        .from('meeting_photo_evidence')
        .select('storage_path')
        .eq('match_id', targetMatchId)
        .maybeSingle()
      storagePath = data?.storage_path || null
    }
    if (storagePath) {
      await admin.storage.from('meeting-evidence').remove([storagePath])
    }
    await admin.from('meeting_photo_evidence').delete().eq('match_id', targetMatchId)
  }

  const { count: remainingEvidence, error: remainingError } = await admin
    .from('meeting_photo_evidence')
    .select('id', { count: 'exact', head: true })
    .eq('match_id', targetMatchId)
  const evidenceCleanupComplete = !remainingError && remainingEvidence === 0
  if (verificationError) throw verificationError
  if (!evidenceCleanupComplete) fail('evidence_cleanup', remainingError?.message || 'row remained')
  pass('evidence_cleanup')

  return {
    status: 'verification_complete',
    run_id: runId,
    match_id: targetMatchId,
    participant_count: PARTICIPANT_COUNT,
    evidence_id: evidenceId,
    checks,
    cleanup_complete: true,
  }
}

function futureQaNow() {
  let hash = 0
  for (const character of runId) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0
  const daysAhead = 365 + (hash % 365)
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString()
}

async function createFullEventFixture(accounts) {
  const participantAccounts = accounts.slice(0, PARTICIPANT_COUNT)
  const { data: occurrenceId, error: occurrenceError } = await admin.rpc(
    'get_or_create_quantum_event_occurrence',
    {
      p_event_id: 'tonight-onsenjjang-run',
      p_event_mode: 'tonight',
      p_now: futureQaNow(),
    },
  )
  if (occurrenceError || !isUuid(occurrenceId)) {
    fail('event_occurrence', occurrenceError?.message || 'occurrence missing')
  }

  for (const account of participantAccounts) {
    const { error } = await admin.from('quantum_event_participations').upsert({
      user_id: account.id,
      event_id: 'tonight-onsenjjang-run',
      event_mode: 'tonight',
      party_type: 'solo',
      group_id: null,
      occurrence_id: occurrenceId,
      status: 'recruiting',
      match_id: null,
      cancel_reason: null,
      completed_at: null,
    })
    if (error) fail(`event_join_${account.label}`, error.message)
  }

  const { data: occurrence, error: finalizedError } = await admin
    .from('quantum_event_occurrences')
    .select('id, status, match_id, male_group_id, female_group_id, starts_at')
    .eq('id', occurrenceId)
    .single()
  if (finalizedError || occurrence?.status !== 'confirmed' || !isUuid(occurrence.match_id)) {
    fail('event_auto_finalization', finalizedError?.message || 'match was not finalized')
  }

  const { data: meeting, error: meetingError } = await admin
    .from('match_meetings')
    .select('id, match_id, event_occurrence_id, scheduled_start, status')
    .eq('event_occurrence_id', occurrenceId)
    .single()
  if (meetingError || meeting?.match_id !== occurrence.match_id || meeting.status !== 'scheduled') {
    fail('event_meeting', meetingError?.message || 'event meeting missing')
  }

  const { count: memberCount, error: memberError } = await admin
    .from('quantum_event_match_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('match_id', occurrence.match_id)
  if (memberError || memberCount !== PARTICIPANT_COUNT) {
    fail('event_private_members', memberError?.message || `${memberCount}/${PARTICIPANT_COUNT}`)
  }

  const { data: replayedMatchId, error: replayError } = await admin.rpc(
    'finalize_quantum_event_occurrence',
    { p_occurrence_id: occurrenceId },
  )
  if (replayError || replayedMatchId !== occurrence.match_id) {
    fail('event_finalization_idempotency', replayError?.message || 'match id changed')
  }

  const signedInFirst = await signInQaUser(ACCOUNT_SPECS[0][0], ACCOUNT_SPECS[0][1])
  const firstClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${signedInFirst.token}` } },
  })
  const { data: chatWindow, error: chatError } = await firstClient.rpc(
    'get_my_match_chat_window',
    { p_match_id: occurrence.match_id },
  )
  const expectedOpen = new Date(new Date(occurrence.starts_at).getTime() - 20 * 60 * 1000).getTime()
  const actualOpen = new Date(chatWindow?.opens_at || 0).getTime()
  if (chatError || actualOpen !== expectedOpen || chatWindow?.is_open !== false) {
    fail('event_chat_window', chatError?.message || 'chat window is not exactly 20 minutes before')
  }

  pass('event_auto_finalization', '5 participants -> 1 confirmed match')
  pass('event_meeting', 'one scheduled meeting')
  pass('event_private_members', `${memberCount}/${PARTICIPANT_COUNT}`)
  pass('event_finalization_idempotency')
  pass('event_chat_window', 'opens exactly 20 minutes before')

  const evidenceStart = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const evidenceEnd = new Date(Date.now() + 90 * 60 * 1000).toISOString()
  const { error: evidenceWindowError } = await admin
    .from('match_meetings')
    .update({ scheduled_start: evidenceStart, scheduled_end: evidenceEnd })
    .eq('id', meeting.id)
  if (evidenceWindowError) fail('qa_evidence_window', evidenceWindowError.message)
  pass('qa_evidence_window', 'isolated fixture only')

  return {
    occurrenceId,
    matchId: occurrence.match_id,
    groupIds: [occurrence.male_group_id, occurrence.female_group_id],
    meetingId: meeting.id,
  }
}

async function cleanupFullFixture(fixture, accounts) {
  const failures = []
  const record = (name, error) => {
    if (error) failures.push({ step: name, error: error.message })
  }

  if (fixture?.occurrenceId) {
    const { data: cleaned, error } = await admin.rpc(
      'cleanup_quantum_event_qa_fixture',
      { p_occurrence_id: fixture.occurrenceId },
    )
    record('event_fixture', error)
    if (!error && cleaned !== true) {
      failures.push({ step: 'event_fixture', error: 'fixture was not removed' })
    }
  }

  for (const account of [...accounts].reverse()) {
    const { error } = await admin.auth.admin.deleteUser(account.id)
    record(`auth_${account.label}`, error)
  }

  const userIds = accounts.map((account) => account.id)
  const { count: remainingUsers, error: usersError } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .in('id', userIds)
  record('remaining_users', usersError)

  const { count: remainingOccurrence, error: occurrenceError } = fixture?.occurrenceId
    ? await admin
      .from('quantum_event_occurrences')
      .select('id', { count: 'exact', head: true })
      .eq('id', fixture.occurrenceId)
    : { count: 0, error: null }
  record('remaining_occurrence', occurrenceError)

  const cleanupComplete = failures.length === 0
    && remainingUsers === 0
    && remainingOccurrence === 0
  if (cleanupComplete) pass('cleanup_complete', `${accounts.length}/${accounts.length}`)

  return { cleanupComplete, failures, remainingUsers, remainingOccurrence }
}

async function runFullFlow() {
  let accounts = []
  let fixture = null
  let flowError = null
  let evidenceResult = null

  try {
    const setup = await setupAccounts()
    accounts = setup.accounts
    fixture = await createFullEventFixture(accounts)
    activeMatchId = fixture.matchId
    evidenceResult = await verifyEvidence(fixture.matchId)
  } catch (error) {
    flowError = error
  }

  const cleanup = await cleanupFullFixture(fixture, accounts)
  if (flowError) throw flowError
  if (!cleanup.cleanupComplete) {
    fail('cleanup_complete', JSON.stringify(cleanup.failures))
  }

  return {
    status: 'full_verification_complete',
    run_id: runId,
    participant_count: PARTICIPANT_COUNT,
    occurrence_id: fixture.occurrenceId,
    match_id: fixture.matchId,
    evidence_id: evidenceResult.evidence_id,
    cleanup_complete: true,
    checks,
  }
}

async function cleanupAccounts() {
  const userIds = (process.env.QA_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(isUuid)
  if (userIds.length !== ACCOUNT_SPECS.length) {
    throw new Error(`QA_USER_IDS must contain ${ACCOUNT_SPECS.length} UUIDs`)
  }

  const failures = []
  for (const userId of [...userIds].reverse()) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) failures.push({ user_id: userId, error: error.message })
  }

  const { count: remainingUsers, error: countError } = await admin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .in('id', userIds)
  const cleanupComplete = failures.length === 0 && !countError && remainingUsers === 0
  if (cleanupComplete) pass('cleanup_complete', `${userIds.length}/${userIds.length}`)

  return {
    status: cleanupComplete ? 'cleanup_complete' : 'cleanup_failed',
    run_id: runId,
    cleanup_complete: cleanupComplete,
    remaining_users: remainingUsers,
    failures,
    checks,
  }
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

let result
try {
  if (QA_PHASE === 'setup') result = await setupAccounts()
  if (QA_PHASE === 'verify') result = await verifyEvidence()
  if (QA_PHASE === 'cleanup') result = await cleanupAccounts()
  if (QA_PHASE === 'full') result = await runFullFlow()
  console.log(JSON.stringify(result, null, 2))
  if (result?.cleanup_complete === false) process.exitCode = 1
} catch (error) {
  console.log(JSON.stringify({
    status: 'failed',
    phase: QA_PHASE,
    run_id: runId,
    checks,
    cleanup_complete: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
}
