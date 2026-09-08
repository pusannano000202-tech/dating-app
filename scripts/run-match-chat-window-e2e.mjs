import { randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'

import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'

const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

const phase = process.env.QA_PHASE
const fixtureFile = process.env.QA_FIXTURE_FILE
const baseUrl = (process.env.QA_BASE_URL || 'http://127.0.0.1:3015').replace(/\/$/, '')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!['setup', 'verify-closed', 'verify-open', 'cleanup'].includes(phase)) {
  throw new Error('QA_PHASE must be setup, verify-closed, verify-open, or cleanup')
}
if (!fixtureFile || !supabaseUrl || !publishableKey || !adminKey) {
  throw new Error('QA fixture environment is incomplete')
}

const admin = createClient(supabaseUrl, adminKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const publicClient = () => createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function setup() {
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`
  const password = `Qa-${randomUUID()}-9!`
  const users = []
  const genders = ['male', 'male', 'male', 'female', 'female', 'female']
  try {
    for (let index = 0; index < genders.length; index += 1) {
      const email = `quantum.chat.qa.${runId}.${index}@example.invalid`
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { qa_run_id: runId, qa_scope: 'match-chat-window' },
      })
      if (error || !data.user) throw new Error(error?.message || 'user missing')

      const client = publicClient()
      const { data: session, error: signInError } = await client.auth.signInWithPassword({ email, password })
      if (signInError || !session.session?.access_token) {
        throw new Error(signInError?.message || 'session missing')
      }
      const { error: profileError } = await client.from('profiles').upsert({
        user_id: data.user.id,
        gender: genders[index],
        age: 23 + (index % 3),
        school: '부산대학교',
        department: 'QA 검증학과',
        year: 4,
        display_name: `채팅QA-${index + 1}`,
        is_profile_complete: true,
      })
      if (profileError) throw new Error(profileError.message)
      users.push({ id: data.user.id, token: session.session.access_token, gender: genders[index] })
    }
  } catch (error) {
    for (const user of [...users].reverse()) await admin.auth.admin.deleteUser(user.id)
    throw error
  }

  const ids = {
    venue: randomUUID(),
    maleGroup: randomUUID(),
    femaleGroup: randomUUID(),
    match: randomUUID(),
    meeting: randomUUID(),
    batch: randomUUID(),
  }
  await writeFile(fixtureFile, JSON.stringify({ users, ids }), { encoding: 'utf8', mode: 0o600 })
  return { status: 'setup_complete', user_ids: users.map((user) => user.id), ids }
}

async function verifyClosed() {
  const fixture = await loadFixture()
  const read = await chatRequest(fixture, 0, 'GET')
  const write = await chatRequest(fixture, 0, 'POST', { message: '아직 열리면 안 됩니다' })
  if (read.status !== 409 || read.payload?.error !== 'chat_not_open') throw new Error('closed read gate failed')
  if (write.status !== 409 || write.payload?.error !== 'chat_not_open') throw new Error('closed write gate failed')

  const direct = publicClient()
  await direct.auth.setSession({ access_token: fixture.users[0].token, refresh_token: 'qa-not-used' })
  const { error } = await direct.from('match_chat_messages').select('id').eq('match_id', fixture.ids.match)
  if (!error) throw new Error('direct table bypass unexpectedly succeeded')
  return { status: 'closed_gate_passed', checks: ['read_rejected', 'write_rejected', 'direct_table_blocked'] }
}

async function verifyOpen() {
  const fixture = await loadFixture()
  const sent = await chatRequest(fixture, 0, 'POST', { message: '3번 출구에 도착했어요' })
  if (sent.status !== 200 || !sent.payload?.message?.id) throw new Error('open write failed')
  const received = await chatRequest(fixture, 3, 'GET')
  if (received.status !== 200 || !received.payload?.messages?.some((row) => row.id === sent.payload.message.id)) {
    throw new Error('participant read failed')
  }
  const outsider = await chatRequest(fixture, 5, 'GET')
  if (outsider.status !== 403 || outsider.payload?.error !== 'access_denied') {
    throw new Error('outsider gate failed')
  }
  return { status: 'open_gate_passed', checks: ['write_allowed', 'participant_read', 'outsider_blocked'] }
}

async function cleanup() {
  const fixture = await loadFixture()
  const failures = []
  for (const user of [...fixture.users].reverse()) {
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) failures.push(error.message)
  }
  await rm(fixtureFile, { force: true })
  if (failures.length) throw new Error(failures.join('; '))
  return { status: 'cleanup_complete', accounts: fixture.users.length }
}

async function loadFixture() {
  return JSON.parse(await readFile(fixtureFile, 'utf8'))
}

async function chatRequest(fixture, userIndex, method, body) {
  const response = await fetch(`${baseUrl}/api/matches/${fixture.ids.match}/chat`, {
    method,
    headers: {
      Authorization: `Bearer ${fixture.users[userIndex].token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: response.status, payload: await response.json().catch(() => null) }
}

const result = phase === 'setup'
  ? await setup()
  : phase === 'verify-closed'
    ? await verifyClosed()
    : phase === 'verify-open'
      ? await verifyOpen()
      : await cleanup()

console.log(JSON.stringify(result))
