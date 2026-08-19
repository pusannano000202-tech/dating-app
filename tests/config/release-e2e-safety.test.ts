import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const ROOT = process.cwd()
const TARGET_PROJECT_REF = 'jyfwcanjqwboyvicoafm'

function source(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), 'utf8')
}

function runSafetyProbe(expression: string): unknown {
  const moduleUrl = pathToFileURL(
    path.join(ROOT, 'scripts/qa/release-e2e-safety.mjs'),
  ).href
  const program = [
    `import * as safety from ${JSON.stringify(moduleUrl)};`,
    'try {',
    `  process.stdout.write(JSON.stringify({ ok: true, value: (${expression}) }));`,
    '} catch (error) {',
    "  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'unknown' }));",
    '}',
  ].join('\n')
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', program], {
    encoding: 'utf8',
  })
  return JSON.parse(output)
}

test('release E2E remote mutation is fail closed for the exact target project acknowledgement', () => {
  assert.deepEqual(runSafetyProbe(`safety.assertRemoteMutationAllowed({
    NEXT_PUBLIC_SUPABASE_URL: 'https://${TARGET_PROJECT_REF}.supabase.co',
  })`), { ok: false, error: 'remote_mutation_not_acknowledged' })
  assert.deepEqual(runSafetyProbe(`safety.assertRemoteMutationAllowed({
    QA_ALLOW_REMOTE_MUTATION: '${TARGET_PROJECT_REF}',
    NEXT_PUBLIC_SUPABASE_URL: 'https://another-project.supabase.co',
  })`), { ok: false, error: 'target_project_ref_mismatch' })
  assert.deepEqual(runSafetyProbe(`safety.assertRemoteMutationAllowed({
    QA_ALLOW_REMOTE_MUTATION: '${TARGET_PROJECT_REF}',
    NEXT_PUBLIC_SUPABASE_URL: 'https://${TARGET_PROJECT_REF}.supabase.co',
  })`), { ok: true, value: TARGET_PROJECT_REF })
})

test('release E2E local mutation requires a separate loopback-only acknowledgement', () => {
  assert.deepEqual(runSafetyProbe(`safety.assertQaMutationAllowed({
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  })`), { ok: false, error: 'local_mutation_not_acknowledged' })
  assert.deepEqual(runSafetyProbe(`safety.assertQaMutationAllowed({
    QA_ALLOW_LOCAL_MUTATION: 'local',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.com',
  })`), { ok: false, error: 'remote_mutation_not_acknowledged' })
  assert.deepEqual(runSafetyProbe(`safety.assertQaMutationAllowed({
    QA_ALLOW_LOCAL_MUTATION: 'local',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  })`), { ok: true, value: 'local' })
  assert.deepEqual(runSafetyProbe(`safety.assertQaMutationAllowed({
    QA_ALLOW_LOCAL_MUTATION: 'local',
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
  })`), { ok: true, value: 'local' })
})

test('release E2E manifests carry only a validated run id and cleanup discovers accounts by that tag', () => {
  const runId = 'qa-release-mem0ry-safe777'
  const probe = runSafetyProbe(`({
    runId: safety.validateRunId('${runId}'),
    manifest: safety.createReleaseE2eManifest({ runId: '${runId}', suite: 'matching-five' }),
  })`) as { ok: boolean; value: { runId: string; manifest: Record<string, unknown> } }
  const cleanup = source('scripts/qa/release-e2e-cleanup.mjs')
  const runtime = source('scripts/qa/release-e2e-runtime.mjs')

  assert.equal(probe.ok, true)
  assert.equal(probe.value.runId, runId)
  assert.deepEqual(Object.keys(probe.value.manifest).sort(), [
    'cleanup_strategy',
    'project_ref',
    'run_id',
    'schema_version',
    'suite',
  ])
  assert.equal(probe.value.manifest.project_ref, TARGET_PROJECT_REF)
  assert.deepEqual(runSafetyProbe("safety.validateRunId('bad value')"), {
    ok: false,
    error: 'invalid_run_id',
  })
  assert.match(cleanup, /cleanupUsersByRunId/)
  assert.match(runtime, /user_metadata\?\.qa_run_id/)
  assert.match(runtime, /quantum_event_room_card_snapshots', 'participant_user_id'/)
  assert.match(runtime, /auth\.admin\.listUsers/)
  assert.match(runtime, /auth\.admin\.deleteUser/)
  assert.match(runtime, /storage\.from\(['"]photos['"]\)\.remove/)
})

test('release E2E accounts use short unique display names', () => {
  const runtime = source('scripts/qa/release-e2e-runtime.mjs')

  assert.doesNotMatch(
    runtime,
    /display_name:\s*['"]Release QA['"]/,
  )
  assert.match(runtime, /const displayName =/)
  assert.match(runtime, /display_name:\s*displayName/)
})

test('release E2E progress output is redacted and the scenario scripts cover the release contracts', () => {
  const community = source('scripts/qa/release-e2e-community.mjs')
  const couple = source('scripts/qa/release-e2e-couple.mjs')
  const matching = source('scripts/run-quantum-event-lifecycle-e2e.mjs')
  const meetingEvidence = source('scripts/run-meeting-evidence-e2e.mjs')
  const appearance = source('scripts/qa/release-e2e-appearance.mjs')
  const depositSettlement = source('scripts/qa/release-e2e-deposit-settlement.mjs')
  const friendRequest = source('scripts/qa/release-e2e-friend-request.mjs')
  const eventRoom = source('scripts/qa/release-e2e-event-room.mjs')
  const safety = source('scripts/qa/release-e2e-safety.mjs')

  assert.deepEqual(runSafetyProbe("safety.formatProgressLine({ suite: 'community', runId: 'qa-release-mem0ry-safe777', check: 'reply_depth', status: 'pass' })"), {
    ok: true,
    value: 'release-e2e suite=community run_id=qa-release-mem0ry-safe777 check=reply_depth status=pass',
  })
  assert.doesNotMatch(safety, /console\.(?:log|error)\([^)]*(?:email|uuid|score|photo_url|storage_path)/i)
  assert.match(community, /create_community_post_comment/)
  assert.match(community, /reply_depth_exceeded/)
  assert.match(community, /toggle_community_comment_reaction/)
  assert.match(community, /delete_community_post_comment/)
  assert.match(couple, /create_quantum_couple_party/)
  assert.match(couple, /accept_quantum_couple_party/)
  assert.match(couple, /api\/friend-requests/)
  assert.match(couple, /accept_friend_request/)
  assert.match(couple, /participant_count/)
  assert.match(couple, /opponent_(?:display_name|photo_url)/i)
  assert.match(matching, /api\/profile\/basic/)
  assert.doesNotMatch(matching, /client\.from\(['"]profiles['"]\)\.upsert/)
  assert.match(meetingEvidence, /api\/profile\/basic/)
  assert.doesNotMatch(meetingEvidence, /client\.from\(['"]profiles['"]\)\.upsert/)
  assert.match(appearance, /api\/profile\/photos/)
  assert.match(appearance, /api\/score/)
  assert.match(appearance, /reused_existing_score/)
  assert.doesNotMatch(appearance, /console\.(?:log|error)\([^)]*(?:score|signed_url|storage_path)/i)
  assert.match(depositSettlement, /mock_pay_deposit_for_match/)
  assert.match(depositSettlement, /choose_deposit_carryover/)
  assert.match(depositSettlement, /apply_available_deposit_carryover/)
  assert.match(depositSettlement, /api\/matches\/\$\{sourceMatchId\}\/refund/)
  assert.match(depositSettlement, /provider[^]*mock/i)
  assert.match(depositSettlement, /QA_BASE_URL is required/)
  assert.doesNotMatch(depositSettlement, /QA_BASE_URL\s*\|\|\s*['"]https:\/\//)
  assert.match(depositSettlement, /cleanupFixture/)
  assert.match(friendRequest, /recipient_unavailable/)
  assert.match(friendRequest, /rate_limited/)
  assert.match(friendRequest, /receiver_user_id/)
  assert.match(eventRoom, /create_quantum_event_room_invite/)
  assert.match(eventRoom, /quantum_event_room_invite/)
  assert.match(eventRoom, /accept_quantum_event_room_invite/)
  assert.match(eventRoom, /decline_quantum_event_room_invite/)
  assert.match(eventRoom, /cancel_quantum_event_room_invite/)
  assert.match(eventRoom, /get_my_quantum_event_room_participants/)
  assert.match(eventRoom, /api\/profile\/quantum-preferences/)
  assert.match(eventRoom, /meeting_moment/)
  assert.match(eventRoom, /profile_preference/)
  assert.match(eventRoom, /second_room_overflow/)
  assert.match(eventRoom, /invite_expiry_simulated/)
  assert.match(eventRoom, /role_confirmation_required/)
  assert.match(eventRoom, /same_room_after_accept/)
  assert.match(eventRoom, /forbiddenParticipantKeys/)
  assert.match(eventRoom, /cleanupUsersByRunId/)
  assert.doesNotMatch(eventRoom, /console\.(?:log|error)\([^)]*(?:email|user_id|token|display_name)/i)
  assert.doesNotMatch(depositSettlement, /console\.(?:log|error)\([^)]*(?:payment_key|order_id|email|user_id)/i)
})
