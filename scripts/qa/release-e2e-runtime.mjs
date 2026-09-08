import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import nextEnv from '@next/env'
import { createClient } from '@supabase/supabase-js'

import {
  assertQaMutationAllowed,
  createReleaseE2eManifest,
  createRunId,
  progress,
  validateRunId,
} from './release-e2e-safety.mjs'

const { loadEnvConfig } = nextEnv
const RUNS_DIRECTORY = join(process.cwd(), 'scripts', 'qa', '.runs')

function option(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function failureCode(error) {
  return error instanceof Error && /^[a-z][a-z0-9_]+$/.test(error.message)
    ? error.message
    : 'unexpected_failure'
}

export async function createRuntime(suite, requestedRunId) {
  loadEnvConfig(process.cwd())
  assertQaMutationAllowed(process.env)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const adminKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !publicKey || !adminKey) throw new Error('qa_environment_incomplete')
  const runId = validateRunId(requestedRunId || option('--run-id') || createRunId())
  const manifest = createReleaseE2eManifest({ runId, suite })
  const manifestPath = join(RUNS_DIRECTORY, `${runId}.json`)
  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, { encoding: 'utf8', mode: 0o600 })
  const admin = createClient(url, adminKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const publicClient = () => createClient(url, publicKey, { auth: { autoRefreshToken: false, persistSession: false } })
  return { admin, publicClient, runId, manifestPath, suite }
}

export async function createQaAccount(runtime, label, gender) {
  const password = `Qa-${createRunId()}-9!`
  const email = `quantum.release.${runtime.runId}.${label}@example.invalid`
  const { data, error } = await runtime.admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { qa_run_id: runtime.runId, qa_suite: runtime.suite },
  })
  if (error || !data.user) throw new Error('account_create_failed')
  const client = runtime.publicClient()
  const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError || !signedIn.session?.access_token) throw new Error('account_sign_in_failed')
  const displayName = `QA${data.user.id.replaceAll('-', '').slice(0, 12)}`
  const { error: profileError } = await runtime.admin.from('profiles').upsert({
    user_id: data.user.id, gender, age: 23, school: 'Pusan National University',
    department: 'Release QA', year: 4, display_name: displayName, is_profile_complete: true,
  })
  if (profileError) throw new Error('profile_create_failed')
  return { id: data.user.id, token: signedIn.session.access_token, client, displayName }
}

export async function cleanupUsersByRunId(admin, runId) {
  validateRunId(runId)
  const users = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error('cleanup_discovery_failed')
    for (const user of data.users || []) {
      if (user.user_metadata?.qa_run_id === runId) users.push(user.id)
    }
    if (!data.users || data.users.length < 200) break
  }
  if (users.length) {
    await cleanupQuantumEventRoomsForUsers(admin, users)
    const ids = users.join(',')
    const { data: photos, error: photoReadError } = await admin
      .from('photos').select('storage_path').in('user_id', users)
    if (photoReadError) throw new Error('cleanup_photo_discovery_failed')
    const photoPaths = (photos || []).map((photo) => photo.storage_path).filter(Boolean)
    if (photoPaths.length) {
      const { error: photoStorageError } = await admin.storage.from('photos').remove(photoPaths)
      if (photoStorageError) throw new Error('cleanup_photo_storage_failed')
    }
    const { data: parties, error: partyReadError } = await admin
      .from('quantum_couple_parties').select('id').or(`leader_user_id.in.(${ids}),partner_user_id.in.(${ids})`)
    if (partyReadError) throw new Error('cleanup_party_discovery_failed')
    const partyIds = (parties || []).map((party) => party.id)
    if (partyIds.length) {
      const partyFilter = partyIds.join(',')
      const { error: matchError } = await admin.from('quantum_couple_matches')
        .delete().or(`pair_a_id.in.(${partyFilter}),pair_b_id.in.(${partyFilter})`)
      if (matchError) throw new Error('cleanup_couple_match_failed')
      const { error: partyDeleteError } = await admin.from('quantum_couple_parties').delete().in('id', partyIds)
      if (partyDeleteError) throw new Error('cleanup_couple_party_failed')
    }
  }
  for (const userId of users) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) throw new Error('cleanup_account_delete_failed')
  }
  return users.length
}

async function cleanupQuantumEventRoomsForUsers(admin, userIds) {
  const ownedUsers = new Set(userIds)
  const occurrenceIds = new Set()
  const discover = async (table, column) => {
    const { data, error } = await admin.from(table).select('occurrence_id').in(column, userIds)
    if (error) throw new Error('cleanup_event_room_discovery_failed')
    for (const row of data || []) {
      if (row.occurrence_id) occurrenceIds.add(row.occurrence_id)
    }
  }

  await discover('quantum_event_participations', 'user_id')
  await discover('quantum_event_room_invites', 'inviter_user_id')
  await discover('quantum_event_room_invites', 'invited_user_id')
  await discover('quantum_event_room_card_snapshots', 'participant_user_id')

  for (const occurrenceId of occurrenceIds) {
    const [{ data: participations, error: participationError },
      { data: members, error: memberError },
      { data: invites, error: inviteError },
      { data: occurrence, error: occurrenceError }] = await Promise.all([
      admin.from('quantum_event_participations').select('user_id').eq('occurrence_id', occurrenceId),
      admin.from('quantum_event_match_members').select('user_id').eq('occurrence_id', occurrenceId),
      admin.from('quantum_event_room_invites').select('inviter_user_id, invited_user_id').eq('occurrence_id', occurrenceId),
      admin.from('quantum_event_occurrences')
        .select('match_id, male_group_id, female_group_id')
        .eq('id', occurrenceId)
        .maybeSingle(),
    ])
    if (participationError || memberError || inviteError || occurrenceError) {
      throw new Error('cleanup_event_room_boundary_read_failed')
    }

    const referencedUsers = new Set([
      ...(participations || []).map((row) => row.user_id),
      ...(members || []).map((row) => row.user_id),
      ...(invites || []).flatMap((row) => [row.inviter_user_id, row.invited_user_id]),
    ].filter(Boolean))
    if ([...referencedUsers].some((userId) => !ownedUsers.has(userId))) {
      throw new Error('cleanup_event_room_not_isolated')
    }

    const groupIds = [occurrence?.male_group_id, occurrence?.female_group_id].filter(Boolean)
    if (groupIds.length) {
      const { data: groupMembers, error: groupMemberError } = await admin
        .from('group_members').select('user_id').in('group_id', groupIds)
      if (groupMemberError) throw new Error('cleanup_event_group_boundary_read_failed')
      if ((groupMembers || []).some((row) => !ownedUsers.has(row.user_id))) {
        throw new Error('cleanup_event_group_not_isolated')
      }
    }

    for (const table of [
      'quantum_event_room_invites',
      'quantum_event_participations',
      'match_meetings',
      'quantum_event_match_members',
    ]) {
      const column = table === 'match_meetings' ? 'event_occurrence_id' : 'occurrence_id'
      const { error } = await admin.from(table).delete().eq(column, occurrenceId)
      if (error) throw new Error(`cleanup_event_room_rows_${table}_failed`)
    }

    const { error: detachError } = await admin.from('quantum_event_occurrences').update({
      match_id: null,
      male_group_id: null,
      female_group_id: null,
    }).eq('id', occurrenceId)
    if (detachError) throw new Error('cleanup_event_room_detach_failed')

    if (occurrence?.match_id) {
      const { error } = await admin.from('matches').delete().eq('id', occurrence.match_id)
      if (error) throw new Error('cleanup_event_match_failed')
    }
    if (groupIds.length) {
      const { error } = await admin.from('groups').delete().in('id', groupIds)
      if (error) throw new Error('cleanup_event_groups_failed')
    }
    const { error: occurrenceDeleteError } = await admin
      .from('quantum_event_occurrences').delete().eq('id', occurrenceId)
    if (occurrenceDeleteError) throw new Error('cleanup_event_occurrence_failed')
  }
}

export async function readManifest(path) {
  let manifest
  try { manifest = JSON.parse(await readFile(path, 'utf8')) } catch { throw new Error('invalid_manifest') }
  if (manifest?.project_ref !== 'jyfwcanjqwboyvicoafm') throw new Error('manifest_project_ref_mismatch')
  validateRunId(manifest?.run_id)
  return manifest
}

export async function executeWithCleanup(runtime, run) {
  let failed = false
  try {
    await run()
    progress({ suite: runtime.suite, runId: runtime.runId, check: 'scenario', status: 'pass' })
  } catch (error) {
    failed = true
    progress({ suite: runtime.suite, runId: runtime.runId, check: failureCode(error), status: 'fail' })
  }
  try {
    await cleanupUsersByRunId(runtime.admin, runtime.runId)
    progress({ suite: runtime.suite, runId: runtime.runId, check: 'run_id_cleanup', status: 'cleanup' })
  } catch (error) {
    failed = true
    progress({ suite: runtime.suite, runId: runtime.runId, check: failureCode(error), status: 'fail' })
  }
  if (failed) process.exitCode = 1
}
