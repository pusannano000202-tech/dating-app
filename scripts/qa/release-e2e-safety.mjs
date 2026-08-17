import { randomBytes } from 'node:crypto'

export const TARGET_PROJECT_REF = 'jyfwcanjqwboyvicoafm'

export function assertRemoteMutationAllowed(env) {
  if (env.QA_ALLOW_REMOTE_MUTATION !== TARGET_PROJECT_REF) {
    throw new Error('remote_mutation_not_acknowledged')
  }
  let hostname = ''
  try { hostname = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname } catch {}
  if (hostname !== `${TARGET_PROJECT_REF}.supabase.co`) {
    throw new Error('target_project_ref_mismatch')
  }
  return TARGET_PROJECT_REF
}

export function validateRunId(runId) {
  const isCurrent = /^qa-release-[a-z0-9]+-[a-z0-9_-]{6,32}$/.test(runId)
  const isLegacyMatching = /^[1-9][0-9]{12,14}-[a-f0-9]{8}$/.test(runId)
  if (typeof runId !== 'string' || (!isCurrent && !isLegacyMatching)) {
    throw new Error('invalid_run_id')
  }
  return runId
}

export function createRunId() {
  return `qa-release-${Date.now().toString(36)}-${randomBytes(8).toString('hex')}`
}

export function createReleaseE2eManifest({ runId, suite }) {
  validateRunId(runId)
  if (!['community', 'couple', 'matching-five', 'appearance', 'deposit-settlement', 'friend-request', 'event-room'].includes(suite)) throw new Error('invalid_suite')
  return {
    schema_version: 1,
    project_ref: TARGET_PROJECT_REF,
    run_id: runId,
    suite,
    cleanup_strategy: 'auth_user_metadata_qa_run_id',
  }
}

export function formatProgressLine({ suite, runId, check, status }) {
  validateRunId(runId)
  if (!/^[a-z][a-z0-9_-]{1,48}$/.test(suite)) throw new Error('invalid_suite')
  if (!/^[a-z][a-z0-9_-]{1,48}$/.test(check)) throw new Error('invalid_check')
  if (!['pass', 'fail', 'cleanup'].includes(status)) throw new Error('invalid_status')
  return `release-e2e suite=${suite} run_id=${runId} check=${check} status=${status}`
}

export function progress(input) {
  console.log(formatProgressLine(input))
}
