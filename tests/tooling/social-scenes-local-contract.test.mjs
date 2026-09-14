import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SOCIAL_CONTRACT_TARGET as target,
  assertContractContainer,
  buildSocialContractSql,
  parseContractArguments,
  parseSocialContractReport,
  runSocialContractProbe,
} from '../../scripts/qa/verify-social-scenes-local-contract.mjs'

const metadata = () => ({ id: target.containerId, name: '/' + target.container, running: true,
  ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '56422' }] } })
const report = () => ({
  readOnly: true, completeCoverage: false, chatOwnIdentityChecked: true, chatOtherIdentityChecked: false,
  chatHistoryMembershipChecked: true, anonymousDenied: true, nonmemberFixturePresent: true, nonmemberDenied: true,
  refundListMatchesOwnedLedger: true, refundPositiveOwnershipFixturePresent: false,
  socialRoomsMetadataChecked: true, socialRoomEntryMembershipChecked: true,
  chatMessagesChecked: 2, refundRowsChecked: 0, socialRoomsChecked: 1,
})

test('requires an explicit approved DB and rejects target overrides', () => {
  for (const database of target.databases) assert.equal(parseContractArguments(['--database', database]), database)
  for (const args of [[], ['--database', 'other'], ['--database', 'postgres', '--host', 'remote'], ['--seed'],
    ['--database', "postgres';COMMIT;"]]) assert.throws(() => parseContractArguments(args), /invalid_arguments/)
  assert.throws(() => buildSocialContractSql('other'), /invalid_arguments/)
})

test('pins immutable container identity and local database port', () => {
  assert.doesNotThrow(() => assertContractContainer(metadata()))
  for (const changed of [{ id: 'wrong' }, { name: '/other' }, { running: false },
    { ports: { '5432/tcp': [{ HostPort: '5432' }] } }, { ports: {} }]) {
    assert.throws(() => assertContractContainer({ ...metadata(), ...changed }), /unexpected_local_container/)
  }
})

test('SQL uses only existing rows with read-only role-scoped RPCs and rollback', () => {
  const sql = buildSocialContractSql('postgres')
  assert.match(sql, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/)
  assert.match(sql, /SET LOCAL ROLE authenticated/)
  assert.match(sql, /SET LOCAL ROLE anon/)
  assert.match(sql, /request\.jwt\.claims/)
  assert.match(sql, /public\.social_chat_rooms\(jsonb_build_object/)
  assert.match(sql, /expected_refunds/)
  assert.match(sql, /refundPositiveOwnershipFixturePresent/)
  assert.match(sql, /own_visible_sender_required/)
  assert.match(sql, /'chatOtherIdentityChecked', other_message_count > 0/)
  assert.match(sql, /ROLLBACK;\s*$/)
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|COMMIT)\b/i)
  assert.doesNotMatch(sql, /SET LOCAL ROLE service_role|mark_social_chat_read|pg_sleep/i)
})

test('allowlists boolean and count output without hiding missing positive refund fixtures', () => {
  assert.deepEqual(parseSocialContractReport(JSON.stringify(report())), report())
  for (const changed of [{ ...report(), paymentKey: 'private' }, { ...report(), readOnly: false },
    { ...report(), completeCoverage: true },
    { ...report(), refundRowsChecked: -1 }, { ...report(), chatOwnIdentityChecked: 'true' }]) {
    assert.throws(() => parseSocialContractReport(JSON.stringify(changed)), /invalid_probe_report/)
  }
  assert.throws(() => parseSocialContractReport('private SQL output'), /invalid_probe_report/)
})

test('legacy nullable metadata is compared to its exact JSON projection, not rejected as missing data', () => {
  const sql = buildSocialContractSql('quantum_social_rehearsal_20260915')
  assert.match(sql, /jsonb_build_object\('activity_key', meetup\.activity_key, 'category', meetup\.category\)\s+INTO expected_metadata/)
  assert.doesNotMatch(sql, /activity_key IS NULL|category IS NULL/)
  // JSON containment requires both keys even when their expected values are null.
  assert.equal((sql.match(/\(item @> expected_metadata\) IS DISTINCT FROM true/g) ?? []).length, 2)
  assert.match(sql, /IF NOT FOUND THEN\s+RAISE EXCEPTION 'SOCIAL_CONTRACT:existing_room_metadata_missing'/)
})

test('absent eligible nonmembers are an explicit coverage gap, but eligible nonmember access remains a failure', () => {
  const partial = { ...report(), nonmemberFixturePresent: false, nonmemberDenied: false }
  assert.deepEqual(parseSocialContractReport(JSON.stringify(partial)), partial)
  assert.throws(() => parseSocialContractReport(JSON.stringify({ ...partial, nonmemberDenied: true })), /invalid_probe_report/)
  assert.throws(() => parseSocialContractReport(JSON.stringify({ ...report(), nonmemberDenied: false })), /invalid_probe_report/)
  const sql = buildSocialContractSql('postgres')
  assert.match(sql, /IF outsider IS NOT NULL THEN/)
  assert.doesNotMatch(sql, /SOCIAL_CONTRACT:live_nonmember_missing/)
  assert.match(sql, /IF NOT denied THEN RAISE EXCEPTION 'SOCIAL_CONTRACT:nonmember_chat_allowed'/)
  assert.match(sql, /IF NOT denied THEN RAISE EXCEPTION 'SOCIAL_CONTRACT:nonmember_room_allowed'/)
})

test('fake runner proves local context, clean host/container environments and safe stdout handling', () => {
  const calls = []
  const execFile = (binary, args, options) => {
    calls.push({ binary, args, options })
    if (calls.length === 1) return JSON.stringify('npipe:////./pipe/dockerDesktopLinuxEngine')
    if (calls.length === 2) return JSON.stringify(metadata())
    return JSON.stringify(report())
  }
  const result = runSocialContractProbe('quantum_social_rehearsal_20260915', {
    execFile, hostEnvironment: { PATH: 'safe-path', SystemRoot: 'safe-root',
      DOCKER_HOST: 'tcp://remote', PGHOST: 'remote', PGPASSWORD: 'private', TOSS_SECRET_KEY: 'private',
      NODE_OPTIONS: '--require private', SUPABASE_SERVICE_ROLE_KEY: 'private' },
  })
  assert.deepEqual(result, report())
  assert.equal(calls.length, 3)
  for (const call of calls) {
    assert.equal(call.binary, 'docker')
    assert.deepEqual(call.args.slice(0, 2), ['--context', 'desktop-linux'])
    assert.equal(call.options.env.PATH, 'safe-path')
    assert.equal(call.options.env.DOCKER_CONTEXT, 'desktop-linux')
    for (const forbidden of ['DOCKER_HOST', 'PGHOST', 'PGPASSWORD', 'TOSS_SECRET_KEY', 'NODE_OPTIONS', 'SUPABASE_SERVICE_ROLE_KEY']) {
      assert.equal(call.options.env[forbidden], undefined)
    }
    assert.equal(call.options.shell, false)
    assert.equal(call.options.windowsHide, true)
  }
  assert.deepEqual(calls[2].args.slice(2, 7), ['exec', '-i', target.containerId, 'env', '-i'])
  assert.ok(calls[2].args.includes('/var/run/postgresql'))
  assert.ok(calls[2].args.includes('PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=20000 -c lock_timeout=1000'))
  assert.match(calls[2].options.input, /current_database\(\) <> 'quantum_social_rehearsal_20260915'/)
})

test('remote context, replaced container and child errors stop without exposing original output', () => {
  let calls = 0
  assert.throws(() => runSocialContractProbe('postgres', { execFile: () => {
    calls += 1
    return JSON.stringify('tcp://remote:2376')
  } }), /local_target_validation_failed/)
  assert.equal(calls, 1)
  calls = 0
  assert.throws(() => runSocialContractProbe('postgres', { execFile: () => {
    calls += 1
    return JSON.stringify(calls === 1 ? 'npipe:////./pipe/dockerDesktopLinuxEngine' : { ...metadata(), id: 'replaced' })
  } }), /unexpected_local_container/)
  assert.equal(calls, 2)
  assert.throws(() => runSocialContractProbe('postgres', { execFile: () => {
    throw new Error('PRIVATE_USER_AND_PAYMENT_KEY')
  } }), error => error.message === 'local_target_validation_failed' && !error.stack.includes('PRIVATE_USER'))
})

test('only script-owned SQL failure labels are preserved, never PostgreSQL detail values', () => {
  function failingRunner(label) {
    let calls = 0
    return () => {
      calls += 1
      if (calls === 1) return JSON.stringify('npipe:////./pipe/dockerDesktopLinuxEngine')
      if (calls === 2) return JSON.stringify(metadata())
      throw Object.assign(new Error('PRIVATE_PAYMENT_KEY'), { stderr: `ERROR: SOCIAL_CONTRACT:${label}\nDETAIL: PRIVATE_USER` })
    }
  }
  assert.throws(() => runSocialContractProbe('postgres', { execFile: failingRunner('required_rpc_missing') }),
    error => error.message === 'required_rpc_missing' && !error.stack.includes('PRIVATE_USER'))
  assert.throws(() => runSocialContractProbe('postgres', { execFile: failingRunner('private_user_value') }),
    error => error.message === 'local_read_only_contract_failed')
})
