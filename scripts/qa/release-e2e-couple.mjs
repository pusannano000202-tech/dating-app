import { createQaAccount, createRuntime, executeWithCleanup } from './release-e2e-runtime.mjs'

async function rpc(account, fn, args = {}) {
  const { data, error } = await account.client.rpc(fn, args)
  if (error) throw new Error('couple_rpc_failed')
  return data
}

async function activateFriendship(left, right) {
  const baseUrl = process.env.QA_BASE_URL?.replace(/\/$/, '')
  if (!baseUrl) throw new Error('qa_base_url_missing')
  const response = await fetch(`${baseUrl}/api/friend-requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${left.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ receiver_user_id: right.id, message: 'release-check' }),
  })
  const payload = await response.json().catch(() => null)
  if (response.status !== 201 || !payload?.request?.id) throw new Error('friendship_request_failed')
  const accepted = await rpc(right, 'accept_friend_request', { p_request_id: payload.request.id })
  if (!Array.isArray(accepted) || accepted.length !== 1) throw new Error('friendship_accept_failed')
}

const runtime = await createRuntime('couple')
await executeWithCleanup(runtime, async () => {
  const [a, b, c, d] = await Promise.all([
    createQaAccount(runtime, 'couple-a', 'female'), createQaAccount(runtime, 'couple-b', 'male'),
    createQaAccount(runtime, 'couple-c', 'female'), createQaAccount(runtime, 'couple-d', 'male'),
  ])
  await activateFriendship(a, b)
  await activateFriendship(c, d)
  const first = await rpc(a, 'create_quantum_couple_party', { p_partner_user_id: b.id })
  if (first?.status !== 'pending_partner' || !first?.party_id) throw new Error('first_party_create_failed')
  const firstAccepted = await rpc(b, 'accept_quantum_couple_party', { p_party_id: first.party_id })
  if (firstAccepted?.status !== 'ready') throw new Error('first_party_accept_failed')
  const second = await rpc(c, 'create_quantum_couple_party', { p_partner_user_id: d.id })
  const matched = await rpc(d, 'accept_quantum_couple_party', { p_party_id: second.party_id })
  if (matched?.status !== 'matched' || matched?.participant_count !== 4) throw new Error('couple_four_person_match_failed')
  const partyState = await rpc(a, 'get_my_quantum_couple_party')
  const forbiddenOpponentFields = ['opponent_display_name', 'opponent_photo_url']
  if (forbiddenOpponentFields.some((field) => Object.hasOwn(partyState || {}, field))) {
    throw new Error('opponent_profile_exposed')
  }
  const { data: profiles, error } = await runtime.admin.from('profiles').select('school').in('user_id', [a.id, b.id, c.id, d.id])
  if (error || !profiles || new Set(profiles.map((profile) => profile.school)).size !== 1) {
    throw new Error('same_school_contract_failed')
  }
})
