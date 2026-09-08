import { randomUUID } from 'node:crypto'

import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

const baseUrl = (process.env.QA_BASE_URL || 'http://127.0.0.1:3015').replace(/\/$/, '')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !publishableKey || !adminKey) {
  throw new Error('Supabase QA environment is incomplete')
}

const admin = createClient(supabaseUrl, adminKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const publicClient = () => createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`
const password = `Qa-${randomUUID()}-9!`
const eventId = process.env.QA_EVENT_ID || 'tonight-board-game'
const createdUserIds = []
const checks = []
const preexistingOccurrenceIds = new Set()
let testedOccurrenceId = null

function pass(name, detail = 'ok') {
  checks.push({ name, status: 'pass', detail })
}

function fail(name, detail) {
  checks.push({ name, status: 'fail', detail })
  throw new Error(`${name}: ${detail}`)
}

async function createQaUser(index, gender) {
  const email = `quantum.event.qa.${runId}.${index}@example.invalid`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { qa_run_id: runId, qa_scope: 'event-lifecycle' },
  })
  if (error || !data.user) fail('account_create', error?.message || 'user missing')
  createdUserIds.push(data.user.id)

  const client = publicClient()
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  })
  if (signInError || !signedIn.session?.access_token) {
    fail('account_sign_in', signInError?.message || 'session missing')
  }

  const profileResponse = await fetch(`${baseUrl}/api/profile/basic`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${signedIn.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
    gender,
    age: 23 + (index % 3),
    school: '부산대학교',
    department: 'QA 검증학과',
    year: 4,
    display_name: `QA-${index + 1}`,
    phone: '',
    height: gender === 'male' ? 175 : 163,
    body_type: 'average',
    hair_density: gender === 'male' ? 'full' : null,
    }),
  })
  const profilePayload = await profileResponse.json().catch(() => null)
  if (profileResponse.status !== 200) {
    fail('profile_create', `${profileResponse.status}:${profilePayload?.error || 'unexpected'}`)
  }

  return { token: signedIn.session.access_token }
}

async function api(path, { token, method = 'GET', body, expected = [200] } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  if (!expected.includes(response.status)) {
    fail(`${method} ${path}`, `${response.status}:${payload?.error || payload?.code || 'unexpected'}`)
  }
  return payload
}

function assertLifecycle(payload) {
  if (!payload || typeof payload !== 'object' || !payload.occurrence_id) {
    fail('lifecycle_response', 'occurrence missing')
  }
  const startsAt = Date.parse(payload.starts_at)
  const chatOpensAt = Date.parse(payload.chat_opens_at)
  const serverNow = Date.parse(payload.server_now)
  if (![startsAt, chatOpensAt, serverNow].every(Number.isFinite)) {
    fail('lifecycle_response', 'server timestamps missing')
  }
  if (startsAt - chatOpensAt !== 20 * 60 * 1000) {
    fail('chat_schedule', 'chat window is not exactly twenty minutes')
  }
  if (startsAt - serverNow < 2 * 60 * 60 * 1000 - 5000) {
    fail('occurrence_schedule', 'tonight occurrence is less than two hours ahead')
  }
}

async function run() {
  const { data: preexisting, error: preexistingError } = await admin
    .from('quantum_event_occurrences')
    .select('id')
    .eq('event_id', eventId)
    .gte('starts_at', new Date().toISOString())
  if (preexistingError) fail('occurrence_baseline', preexistingError.message)
  for (const row of preexisting || []) preexistingOccurrenceIds.add(row.id)

  const { data: occurrenceId, error: occurrenceError } = await admin.rpc(
    'get_or_create_quantum_event_occurrence',
    {
      p_event_id: eventId,
      p_event_mode: 'tonight',
      p_now: new Date().toISOString(),
    },
  )
  if (occurrenceError || !occurrenceId) {
    fail('occurrence_create', occurrenceError?.message || 'occurrence missing')
  }
  testedOccurrenceId = occurrenceId

  const { data: occurrence, error: capacityError } = await admin
    .from('quantum_event_occurrences')
    .select('male_capacity,female_capacity,required_total')
    .eq('id', occurrenceId)
    .single()
  if (capacityError || !occurrence) {
    fail('occurrence_capacity', capacityError?.message || 'capacity missing')
  }

  const maleCapacity = Number(occurrence.male_capacity)
  const femaleCapacity = Number(occurrence.female_capacity)
  const requiredTotal = Number(occurrence.required_total)
  if (maleCapacity + femaleCapacity !== requiredTotal || requiredTotal !== 5) {
    fail('occurrence_capacity', `${maleCapacity}:${femaleCapacity}:${requiredTotal}`)
  }

  const { count: baselineCount, error: baselineCountError } = await admin
    .from('quantum_event_participations')
    .select('user_id', { count: 'exact', head: true })
    .eq('occurrence_id', occurrenceId)
    .in('status', ['recruiting', 'confirmed'])
  if (baselineCountError || baselineCount !== 0) {
    fail('occurrence_isolation', baselineCountError?.message || `active rows:${baselineCount}`)
  }

  const genders = [
    ...Array(maleCapacity).fill('male'),
    ...Array(femaleCapacity).fill('female'),
    'male',
  ]
  const users = []
  for (let index = 0; index < genders.length; index += 1) {
    users.push(await createQaUser(index, genders[index]))
  }
  pass('accounts_created', '6 (5 participants + 1 rejected-capacity probe)')

  const lifecycles = []
  for (const [index, user] of users.slice(0, requiredTotal).entries()) {
    const response = await api('/api/match/event-participation', {
      token: user.token,
      method: 'POST',
      body: { event_id: eventId, party_type: 'solo' },
    })
    const lifecycle = response?.participation
    assertLifecycle(lifecycle)
    testedOccurrenceId = lifecycle.occurrence_id
    lifecycles.push(lifecycle)

    if (index === 0) {
      await api('/api/match/event-participation', {
        token: user.token,
        method: 'POST',
        body: { event_id: eventId, party_type: 'solo' },
      })
      const { count: duplicateCount, error: duplicateError } = await admin
        .from('quantum_event_participations')
        .select('user_id', { count: 'exact', head: true })
        .eq('user_id', createdUserIds[0])
      if (duplicateError || duplicateCount !== 1) {
        fail('idempotent_application', duplicateError?.message || `rows:${duplicateCount}`)
      }
      pass('idempotent_application', '1 row')
    }
  }

  const occurrenceIds = new Set(lifecycles.map((item) => item.occurrence_id))
  if (occurrenceIds.size !== 1) fail('same_occurrence', `occurrences:${occurrenceIds.size}`)
  const finalCounts = lifecycles.at(-1)?.participant_counts
  if (
    !finalCounts
    || finalCounts.male !== maleCapacity
    || finalCounts.female !== femaleCapacity
    || finalCounts.total !== requiredTotal
  ) {
    fail('participant_counts', `${maleCapacity}:${femaleCapacity} applicants were not reflected`)
  }
  pass(
    'five_applicants_same_occurrence',
    `male=${maleCapacity},female=${femaleCapacity},total=${requiredTotal}`,
  )
  pass('chat_opens_exactly_twenty_minutes_before')

  await api('/api/match/event-participation', {
    token: users[maleCapacity].token,
    method: 'DELETE',
  })
  const { data: cancelledRow, error: cancelledError } = await admin
    .from('quantum_event_participations')
    .select('status,cancel_reason')
    .eq('user_id', createdUserIds[maleCapacity])
    .maybeSingle()
  if (
    cancelledError
    || cancelledRow?.status !== 'cancelled'
    || cancelledRow?.cancel_reason !== 'user_cancelled'
  ) {
    fail('application_cancel', cancelledError?.message || 'cancel audit row missing')
  }
  pass('application_cancel', 'audit row preserved')

  const rejected = await api('/api/match/event-participation', {
    token: users[requiredTotal].token,
    method: 'POST',
    body: { event_id: eventId, party_type: 'solo' },
    expected: [409],
  })
  if (rejected?.error !== 'gender_capacity_full') {
    fail('gender_capacity_lock', rejected?.error || 'unexpected response')
  }
  pass('gender_capacity_lock', 'extra male rejected after female cancellation')
}

async function cleanup() {
  const failures = []
  for (const userId of [...createdUserIds].reverse()) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) failures.push(error.message)
  }

  if (testedOccurrenceId && !preexistingOccurrenceIds.has(testedOccurrenceId)) {
    const { count, error: countError } = await admin
      .from('quantum_event_participations')
      .select('user_id', { count: 'exact', head: true })
      .eq('occurrence_id', testedOccurrenceId)
    if (countError) failures.push(countError.message)
    if (!countError && count === 0) {
      const { error } = await admin
        .from('quantum_event_occurrences')
        .delete()
        .eq('id', testedOccurrenceId)
      if (error) failures.push(error.message)
    }
  }
  return failures
}

let runError = null
let cleanupFailures = []
try {
  await run()
} catch (error) {
  runError = error
} finally {
  cleanupFailures = await cleanup()
}

const cleanupIds = createdUserIds.length ? createdUserIds : [randomUUID()]
const [participationCheck, profileCheck, publicUserCheck, authChecks] = await Promise.all([
  admin.from('quantum_event_participations').select('user_id', { count: 'exact', head: true }).in('user_id', cleanupIds),
  admin.from('profiles').select('user_id', { count: 'exact', head: true }).in('user_id', cleanupIds),
  admin.from('users').select('id', { count: 'exact', head: true }).in('id', cleanupIds),
  Promise.all(createdUserIds.map((userId) => admin.auth.admin.getUserById(userId))),
])
const cleanupComplete = cleanupFailures.length === 0
  && !participationCheck.error && participationCheck.count === 0
  && !profileCheck.error && profileCheck.count === 0
  && !publicUserCheck.error && publicUserCheck.count === 0
  && authChecks.every(({ data, error }) => Boolean(error) || !data.user)
if (cleanupComplete) pass('cleanup_complete', `${createdUserIds.length}/${createdUserIds.length}`)

console.log(JSON.stringify({
  status: runError ? 'failed' : 'passed',
  checks,
  cleanup_complete: cleanupComplete,
  error: runError instanceof Error
    ? runError.message
    : cleanupFailures[0] || null,
}, null, 2))

if (runError || !cleanupComplete) process.exit(1)
