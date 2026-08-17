import { readFile } from 'node:fs/promises'

import { createQaAccount, createRuntime, executeWithCleanup } from './release-e2e-runtime.mjs'

const photoPath = process.env.QA_APPEARANCE_PHOTO_PATH
if (!photoPath) throw new Error('qa_photo_path_missing')

const runtime = await createRuntime('appearance')
await executeWithCleanup(runtime, async () => {
  const account = await createQaAccount(runtime, 'appearance-a', 'male')
  const baseUrl = process.env.QA_BASE_URL?.replace(/\/$/, '')
  if (!baseUrl) throw new Error('qa_base_url_missing')

  const photoBytes = await readFile(photoPath)
  const form = new FormData()
  form.append('photos', new Blob([photoBytes], { type: 'image/jpeg' }), 'appearance-check.jpg')
  const upload = await fetch(`${baseUrl}/api/profile/photos`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${account.token}` },
    body: form,
  })
  if (upload.status !== 200) throw new Error('appearance_photo_upload_failed')

  const first = await requestScore(baseUrl, account.token)
  if (first.status !== 200 || first.payload?.self_appearance_score_persisted !== true) {
    throw new Error(`appearance_first_${safeCode(first.payload)}`)
  }

  const { data: state, error: stateError } = await runtime.admin
    .from('private_appearance_scores')
    .select('status,score_raw,score_normalized,appearance_type,model_version,prompt_version,anchor_version,attempt_count')
    .eq('user_id', account.id)
    .maybeSingle()
  if (
    stateError || state?.status !== 'ready'
    || typeof state.score_raw !== 'number'
    || typeof state.score_normalized !== 'number'
    || !state.appearance_type || !state.model_version || !state.prompt_version || !state.anchor_version
  ) {
    throw new Error('appearance_private_score_not_ready')
  }
  const firstAttemptCount = state.attempt_count

  const second = await requestScore(baseUrl, account.token)
  if (second.status !== 200 || second.payload?.reused_existing_score !== true) {
    throw new Error(`appearance_reuse_${safeCode(second.payload)}`)
  }
  const { data: reusedState, error: reuseError } = await runtime.admin
    .from('private_appearance_scores')
    .select('status,attempt_count')
    .eq('user_id', account.id)
    .maybeSingle()
  if (reuseError || reusedState?.status !== 'ready' || reusedState.attempt_count !== firstAttemptCount) {
    throw new Error('appearance_reuse_mutated_state')
  }

  const remove = await fetch(`${baseUrl}/api/profile/photos`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ all: true }),
  })
  if (remove.status !== 204) throw new Error('appearance_photo_cleanup_failed')
})

async function requestScore(baseUrl, token) {
  const response = await fetch(`${baseUrl}/api/score`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ trigger: 'match_search' }),
  })
  return { status: response.status, payload: await response.json().catch(() => null) }
}

function safeCode(payload) {
  const value = payload?.code || payload?.error
  return typeof value === 'string' && /^[a-z0-9_]+$/i.test(value) ? value : 'unexpected_response'
}
