import { createQaAccount, createRuntime, executeWithCleanup } from './release-e2e-runtime.mjs'

const baseUrl = process.env.QA_BASE_URL?.replace(/\/$/, '')
if (!baseUrl) throw new Error('qa_base_url_missing')

async function createRequest(account, receiverNickname) {
  const response = await fetch(`${baseUrl}/api/friend-requests`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      receiver_nickname: receiverNickname,
      message: 'Release QA friend request',
    }),
  })
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  }
}

const runtime = await createRuntime('friend-request')
await executeWithCleanup(runtime, async () => {
  const sender = await createQaAccount(runtime, 'friend-a', 'female')
  const receiver = await createQaAccount(runtime, 'friend-b', 'male')

  const created = await createRequest(sender, receiver.displayName)
  if (created.status !== 201 || !created.body?.request?.id || created.body?.duplicate !== false) {
    throw new Error('friend_request_create_failed')
  }
  const serializedCreated = JSON.stringify(created.body)
  if (serializedCreated.includes(receiver.id) || serializedCreated.includes('receiver_user_id')) {
    throw new Error('friend_request_identity_exposed')
  }

  const duplicate = await createRequest(sender, receiver.displayName)
  if (duplicate.status !== 200
    || duplicate.body?.duplicate !== true
    || duplicate.body?.request?.id !== created.body.request.id) {
    throw new Error('friend_request_not_idempotent')
  }

  const reverse = await createRequest(receiver, sender.displayName)
  if (reverse.status !== 200
    || reverse.body?.duplicate !== true
    || reverse.body?.request?.id !== created.body.request.id) {
    throw new Error('friend_request_reverse_not_idempotent')
  }

  for (const nickname of [sender.displayName, ...Array.from({ length: 9 }, (_, index) => `Missing${index}`)]) {
    const unavailable = await createRequest(sender, nickname)
    if (unavailable.status !== 404 || unavailable.body?.error !== 'recipient_unavailable') {
      throw new Error('friend_request_unavailable_leaked')
    }
  }

  const limited = await createRequest(sender, 'MissingRateLimit')
  if (limited.status !== 429 || limited.body?.error !== 'rate_limited') {
    throw new Error('friend_request_rate_limit_failed')
  }
})
