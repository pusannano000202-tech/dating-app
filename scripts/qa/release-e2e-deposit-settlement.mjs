import { randomUUID } from 'node:crypto'

import { createQaAccount, createRuntime, executeWithCleanup } from './release-e2e-runtime.mjs'
import { progress } from './release-e2e-safety.mjs'

const runtime = await createRuntime('deposit-settlement')
const baseUrl = process.env.QA_BASE_URL?.replace(/\/$/, '')
if (!baseUrl) {
  throw new Error('QA_BASE_URL is required for deposit settlement E2E')
}
const accounts = []
const fixture = {
  carryoverIds: [],
  refundRequestIds: [],
  depositIds: [],
  matchIds: [],
  groupIds: [],
}

function pass(check) {
  progress({ suite: runtime.suite, runId: runtime.runId, check, status: 'pass' })
}

function fail(code) {
  throw new Error(code)
}

async function createGroup(leader, member, gender, suffix) {
  const { data: group, error: groupError } = await runtime.admin
    .from('groups')
    .insert({
      leader_user_id: leader.id,
      name: `QA ${runtime.runId.slice(-8)} ${suffix}`,
      size: 2,
      gender,
      status: 'matched',
    })
    .select('id')
    .single()
  if (groupError || !group) fail('group_create_failed')
  fixture.groupIds.push(group.id)

  const { error: membersError } = await runtime.admin.from('group_members').insert([
    { group_id: group.id, user_id: leader.id, role: 'leader' },
    { group_id: group.id, user_id: member.id, role: 'member' },
  ])
  if (membersError) fail('group_members_create_failed')
  return group.id
}

async function createMatch(groupOne, groupTwo, status) {
  const [groupA, groupB] = [groupOne, groupTwo].sort()
  const { data: match, error } = await runtime.admin
    .from('matches')
    .insert({
      group_a_id: groupA,
      group_b_id: groupB,
      score: 50,
      score_breakdown: { source: 'release_qa', qa_run_id: runtime.runId },
      batch_id: randomUUID(),
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    })
    .select('id')
    .single()
  if (error || !match) fail('match_create_failed')
  fixture.matchIds.push(match.id)
  return match.id
}

async function mockPay(userId, groupId, matchId) {
  const { data, error } = await runtime.admin.rpc('mock_pay_deposit_for_match', {
    p_user_id: userId,
    p_group_id: groupId,
    p_match_id: matchId,
    p_amount: 10000,
  })
  const row = Array.isArray(data) ? data[0] : data
  if (error || !row?.deposit_id || row.status !== 'paid') fail('mock_deposit_failed')
  fixture.depositIds.push(row.deposit_id)
  return row.deposit_id
}

async function chooseCarryover(user, matchId) {
  const { data, error } = await user.client.rpc('choose_deposit_carryover', {
    p_match_id: matchId,
  })
  const row = Array.isArray(data) ? data[0] : data
  if (error || !row?.carryover_id || row.carryover_status !== 'available') {
    fail('carryover_choice_failed')
  }
  fixture.carryoverIds.push(row.carryover_id)
  return row
}

async function requestMockRefund(user, sourceMatchId) {
  const response = await fetch(`${baseUrl}/api/matches/${sourceMatchId}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${user.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refund_amount: 10000 }),
  })
  const payload = await response.json().catch(() => null)
  if (
    response.status !== 200
    || payload?.result?.request_status !== 'processed'
    || payload?.result?.settlement_provider !== 'mock'
    || payload?.result?.settled_refund_amount !== 10000
  ) {
    const safeReason = [
      'refund_finalize_failed',
      'refund_prepare_failed',
      'refund_settlement_pending',
      'deposit_match_mismatch',
      'payment_key_missing',
      'pending_provider_configuration',
      'provider_settlement_requires_reconciliation',
    ].find((code) => payload?.error === code || payload?.reason === code) ?? 'unexpected'
    fail(`mock_refund_${response.status}_${safeReason}`)
  }
  fixture.refundRequestIds.push(payload.result.refund_request_id)
}

async function cleanupFixture() {
  const { error } = await runtime.admin.rpc('cleanup_deposit_settlement_qa_fixture', {
    p_run_id: runtime.runId,
  })
  if (error) fail('fixture_cleanup_failed')
}

await executeWithCleanup(runtime, async () => {
  let scenarioError = null
  try {
    accounts.push(
      await createQaAccount(runtime, 'carry', 'male'),
      await createQaAccount(runtime, 'refund', 'male'),
      await createQaAccount(runtime, 'peer-a', 'female'),
      await createQaAccount(runtime, 'peer-b', 'female'),
    )

    const sourceMale = await createGroup(accounts[0], accounts[1], 'male', 'source-male')
    const sourceFemale = await createGroup(accounts[2], accounts[3], 'female', 'source-female')
    const sourceMatchId = await createMatch(sourceMale, sourceFemale, 'pending')

    await mockPay(accounts[0].id, sourceMale, sourceMatchId)
    await mockPay(accounts[1].id, sourceMale, sourceMatchId)
    pass('mock_deposits_paid')

    const { error: completeMatchError } = await runtime.admin
      .from('matches')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', sourceMatchId)
    if (completeMatchError) fail('source_match_complete_failed')

    const firstCarryover = await chooseCarryover(accounts[0], sourceMatchId)
    const replayedCarryover = await chooseCarryover(accounts[0], sourceMatchId)
    if (replayedCarryover.carryover_id !== firstCarryover.carryover_id) {
      fail('carryover_not_idempotent')
    }
    pass('carryover_choice_reused')

    await requestMockRefund(accounts[1], sourceMatchId)
    const { data: refundedDeposit, error: refundedError } = await runtime.admin
      .from('deposits')
      .select('status,refunded_amount,retained_amount')
      .eq('id', fixture.depositIds[1])
      .single()
    if (
      refundedError
      || refundedDeposit?.status !== 'refunded'
      || refundedDeposit?.refunded_amount !== 10000
      || refundedDeposit?.retained_amount !== 0
    ) fail('mock_refund_state_invalid')
    pass('mock_full_refund_processed')

    const { error: closeGroupsError } = await runtime.admin
      .from('groups')
      .update({ status: 'completed' })
      .in('id', [sourceMale, sourceFemale])
    if (closeGroupsError) fail('source_groups_close_failed')

    const targetMale = await createGroup(accounts[0], accounts[1], 'male', 'target-male')
    const targetFemale = await createGroup(accounts[2], accounts[3], 'female', 'target-female')
    const targetMatchId = await createMatch(targetMale, targetFemale, 'pending')

    const { data: applied, error: applyError } = await runtime.admin
      .rpc('apply_available_deposit_carryover', {
        p_match_id: targetMatchId,
        p_group_id: targetMale,
        p_user_id: accounts[0].id,
      })
    const appliedRow = Array.isArray(applied) ? applied[0] : applied
    if (applyError || appliedRow?.match_id !== targetMatchId || appliedRow?.status !== 'held') {
      fail('carryover_apply_failed')
    }

    const { data: carryover, error: carryoverError } = await runtime.admin
      .from('deposit_carryovers')
      .select('status,target_match_id,target_group_id')
      .eq('id', firstCarryover.carryover_id)
      .single()
    if (
      carryoverError
      || carryover?.status !== 'applied'
      || carryover?.target_match_id !== targetMatchId
      || carryover?.target_group_id !== targetMale
    ) fail('carryover_state_invalid')
    pass('carryover_applied_to_next_match')

    const { data: replay, error: replayError } = await runtime.admin
      .rpc('apply_available_deposit_carryover', {
        p_match_id: targetMatchId,
        p_group_id: targetMale,
        p_user_id: accounts[0].id,
      })
    if (replayError || (Array.isArray(replay) ? replay.length : replay ? 1 : 0) !== 0) {
      fail('carryover_replay_not_empty')
    }
    const { count, error: depositCountError } = await runtime.admin
      .from('deposits')
      .select('id', { count: 'exact', head: true })
      .eq('match_id', targetMatchId)
      .eq('user_id', accounts[0].id)
    if (depositCountError || count !== 1) fail('carryover_duplicate_deposit')
    pass('carryover_apply_idempotent')
  } catch (error) {
    scenarioError = error
  }

  await cleanupFixture()
  pass('fixture_cleanup')
  if (scenarioError) throw scenarioError
})
