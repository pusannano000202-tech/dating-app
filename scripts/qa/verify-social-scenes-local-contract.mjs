import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertLocalDockerContextEndpoint,
  buildLocalDockerEnvironment,
} from './community-voice-local-runtime.mjs'

// Deliberately no write/seed mode. These are existing rows, not test-owned rows.
export const SOCIAL_CONTRACT_TARGET = Object.freeze({
  context: 'desktop-linux',
  container: 'supabase_db_quantum-integrated-campus-20260905',
  containerId: '2ed364d36eafde0ebbd68e4504a365e384d6843769d51f862f3f4f3f56d066cc',
  port: '56422',
  databases: Object.freeze(['postgres', 'quantum_social_rehearsal_20260915']),
  meetupId: '9064ca31-669f-4e7f-9da2-58d0ef839695',
})

const CHECK_KEYS = Object.freeze([
  'readOnly', 'completeCoverage', 'chatOwnIdentityChecked', 'chatOtherIdentityChecked',
  'chatHistoryMembershipChecked', 'anonymousDenied', 'nonmemberFixturePresent', 'nonmemberDenied',
  'refundListMatchesOwnedLedger', 'refundPositiveOwnershipFixturePresent',
  'socialRoomsMetadataChecked', 'socialRoomEntryMembershipChecked',
])
const COUNT_KEYS = Object.freeze(['chatMessagesChecked', 'refundRowsChecked', 'socialRoomsChecked'])

export function parseContractArguments(args) {
  if (args.length !== 2 || args[0] !== '--database'
      || !SOCIAL_CONTRACT_TARGET.databases.includes(args[1])) {
    throw new Error('invalid_arguments')
  }
  return args[1]
}

export function assertContractContainer(metadata) {
  const bindings = metadata?.ports?.['5432/tcp']
  if (metadata?.id !== SOCIAL_CONTRACT_TARGET.containerId
      || metadata.name !== '/' + SOCIAL_CONTRACT_TARGET.container
      || metadata.running !== true || !Array.isArray(bindings) || !bindings.length
      || !bindings.every(binding => binding.HostPort === SOCIAL_CONTRACT_TARGET.port)) {
    throw new Error('unexpected_local_container')
  }
}

export function buildSocialContractSql(database) {
  parseContractArguments(['--database', database])
  return `
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '1s';
SET LOCAL client_min_messages = warning;
DO $social_contract$
DECLARE
  target_room constant uuid := '${SOCIAL_CONTRACT_TARGET.meetupId}';
  actor uuid; outsider uuid; candidate record; item jsonb;
  expected_messages jsonb; expected_refunds jsonb; actual_refunds jsonb;
  chat jsonb; refunds jsonb; rooms jsonb; exact_room jsonb; other_rooms jsonb;
  expected_metadata jsonb; denied boolean;
  own_message_count integer; other_message_count integer; foreign_refund_count integer;
  refund_count integer; message_count integer; listed_count integer;
BEGIN
  IF current_database() <> '${database}' OR current_user <> 'postgres'
     OR current_setting('transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION 'SOCIAL_CONTRACT:unexpected_database_session';
  END IF;
  IF to_regprocedure('public.get_my_activity_meetup_chat(uuid)') IS NULL
     OR to_regprocedure('public.list_my_meetup_admission_refunds()') IS NULL
     OR to_regprocedure('public.social_chat_rooms(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'SOCIAL_CONTRACT:required_rpc_missing';
  END IF;

  -- Select identities inside PostgreSQL. No IDs, text, keys or ledger rows leave it.
  -- Legacy custom meetups legitimately have a NULL catalog key. Compare the
  -- exact nullable projection instead of imposing a new data requirement.
  SELECT jsonb_build_object('activity_key', meetup.activity_key, 'category', meetup.category)
    INTO expected_metadata
  FROM public.activity_meetups meetup WHERE meetup.id = target_room;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOCIAL_CONTRACT:existing_room_metadata_missing';
  END IF;
  SELECT message.sender_user_id INTO actor
  FROM public.activity_meetup_messages message
  JOIN public.activity_meetup_members member
    ON member.meetup_id = message.meetup_id AND member.user_id = message.sender_user_id
  WHERE message.meetup_id = target_room AND member.status = 'joined'
    AND quantum_private.activity_meetup_scope_eligible(target_room, member.user_id)
  ORDER BY message.created_at, message.id LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'SOCIAL_CONTRACT:joined_sender_missing'; END IF;
  PERFORM quantum_private.assert_activity_room_access(actor);

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', message.id, 'is_me', message.sender_user_id = actor)), '[]'),
    count(*) FILTER (WHERE message.sender_user_id = actor),
    count(*) FILTER (WHERE message.sender_user_id <> actor)
  INTO expected_messages, own_message_count, other_message_count
  FROM public.activity_meetup_messages message
  WHERE message.meetup_id = target_room AND NOT EXISTS (
    SELECT 1 FROM public.friendships friendship WHERE friendship.status = 'blocked'
      AND ((friendship.user_id = actor AND friendship.friend_user_id = message.sender_user_id)
        OR (friendship.friend_user_id = actor AND friendship.user_id = message.sender_user_id))
  );
  IF own_message_count = 0 THEN
    RAISE EXCEPTION 'SOCIAL_CONTRACT:own_visible_sender_required';
  END IF;
  IF jsonb_array_length(expected_messages) > 5000 THEN
    RAISE EXCEPTION 'SOCIAL_CONTRACT:existing_history_exceeds_probe_limit';
  END IF;
  SELECT coalesce(jsonb_agg(deposit.id::text ORDER BY deposit.id::text), '[]')
    INTO expected_refunds FROM quantum_private.activity_meetup_admission_deposits deposit
    WHERE deposit.user_id = actor;
  SELECT count(*) INTO foreign_refund_count FROM quantum_private.activity_meetup_admission_deposits
    WHERE user_id IS NOT NULL AND user_id <> actor;

  -- Require a real, live nonmember rather than an invented nonexistent account.
  FOR candidate IN
    SELECT account.id FROM public.users account JOIN auth.users identity ON identity.id = account.id
    WHERE account.id <> actor AND NOT EXISTS (
      SELECT 1 FROM public.activity_meetup_members member
      WHERE member.meetup_id = target_room AND member.user_id = account.id AND member.status = 'joined'
    ) ORDER BY account.id LIMIT 50
  LOOP
    BEGIN
      PERFORM quantum_private.assert_activity_room_access(candidate.id);
      outsider := candidate.id;
      EXIT;
    EXCEPTION WHEN raise_exception OR insufficient_privilege THEN
      CONTINUE;
    END;
  END LOOP;
  -- Missing eligible nonmembers is an evidence gap, not an application failure.
  -- Do not modify the existing accounts to manufacture positive coverage.

  PERFORM set_config('request.jwt.claim.sub', actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  chat := public.get_my_activity_meetup_chat(target_room);
  refunds := public.list_my_meetup_admission_refunds();
  -- This is the existing public signature; list_my_social_chat_rooms does not exist.
  rooms := public.social_chat_rooms(jsonb_build_object('kind', null, 'id', null, 'cursor', null));
  exact_room := public.social_chat_rooms(jsonb_build_object('kind', 'meetup', 'id', target_room, 'cursor', null));
  RESET ROLE;

  IF jsonb_typeof(chat->'messages') IS DISTINCT FROM 'array'
     OR chat->>'phase' IS NULL OR chat->>'phase' NOT IN ('send', 'read_only') THEN
    RAISE EXCEPTION 'SOCIAL_CONTRACT:chat_shape_mismatch';
  END IF;
  message_count := jsonb_array_length(chat->'messages');
  IF message_count <> jsonb_array_length(expected_messages)
     OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(chat->'messages')) <> message_count THEN
    RAISE EXCEPTION 'SOCIAL_CONTRACT:chat_history_mismatch';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(chat->'messages') LOOP
    IF jsonb_typeof(item->'is_me') IS DISTINCT FROM 'boolean'
       OR item ?| ARRAY['sender_user_id','user_id','email','phone']
       OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(expected_messages) expected
         WHERE expected->>'id' = item->>'id' AND expected->'is_me' = item->'is_me') THEN
      RAISE EXCEPTION 'SOCIAL_CONTRACT:chat_identity_mismatch';
    END IF;
  END LOOP;

  IF jsonb_typeof(refunds) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'SOCIAL_CONTRACT:refund_shape_mismatch';
  END IF;
  SELECT coalesce(jsonb_agg(value->>'depositId' ORDER BY value->>'depositId'), '[]')
    INTO actual_refunds FROM jsonb_array_elements(refunds);
  IF actual_refunds IS DISTINCT FROM expected_refunds THEN
    RAISE EXCEPTION 'SOCIAL_CONTRACT:refund_owner_mismatch';
  END IF;
  refund_count := jsonb_array_length(refunds);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(refunds) value
    WHERE value ?| ARRAY['ownerId','paymentKey','receipt_ref','email','phone']) THEN
    RAISE EXCEPTION 'SOCIAL_CONTRACT:refund_private_fields_exposed';
  END IF;

  IF rooms->>'owner_id' IS DISTINCT FROM actor::text
     OR exact_room->>'owner_id' IS DISTINCT FROM actor::text
     OR jsonb_typeof(rooms->'rooms') IS DISTINCT FROM 'array'
     OR jsonb_typeof(exact_room->'rooms') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'SOCIAL_CONTRACT:social_room_shape_mismatch';
  END IF;
  listed_count := jsonb_array_length(rooms->'rooms');
  -- First-page coverage is explicit; do not claim unvisited cursor pages were checked.
  IF rooms->'has_more' IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'SOCIAL_CONTRACT:social_room_pagination_requires_separate_review';
  END IF;
  IF jsonb_array_length(exact_room->'rooms') <> 1
     OR (SELECT count(*) FROM jsonb_array_elements(rooms->'rooms') value
       WHERE value->>'kind' = 'meetup' AND value->>'id' = target_room::text) <> 1 THEN
    RAISE EXCEPTION 'SOCIAL_CONTRACT:joined_room_missing_from_list';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(rooms->'rooms') LOOP
    IF quantum_private.social_chat_room_authorized_base(item->>'kind', (item->>'id')::uuid, actor) IS NULL THEN
      RAISE EXCEPTION 'SOCIAL_CONTRACT:social_room_membership_mismatch';
    END IF;
    IF item->>'kind' = 'meetup' AND item->>'id' = target_room::text
       AND (item @> expected_metadata) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'SOCIAL_CONTRACT:social_room_metadata_mismatch';
    END IF;
  END LOOP;
  item := exact_room->'rooms'->0;
  IF item->>'kind' IS DISTINCT FROM 'meetup' OR item->>'id' IS DISTINCT FROM target_room::text
     OR (item @> expected_metadata) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'SOCIAL_CONTRACT:social_room_metadata_mismatch';
  END IF;

  IF outsider IS NOT NULL THEN
  PERFORM set_config('request.jwt.claim.sub', outsider::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  denied := false;
  BEGIN
    PERFORM public.get_my_activity_meetup_chat(target_room);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'meetup_not_found' THEN RAISE; END IF;
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'SOCIAL_CONTRACT:nonmember_chat_allowed'; END IF;
  denied := false;
  BEGIN
    PERFORM public.social_chat_rooms(jsonb_build_object('kind', 'meetup', 'id', target_room, 'cursor', null));
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'chat_membership_required' THEN RAISE; END IF;
    denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'SOCIAL_CONTRACT:nonmember_room_allowed'; END IF;
  other_rooms := public.social_chat_rooms(jsonb_build_object('kind', null, 'id', null, 'cursor', null));
  IF other_rooms->>'owner_id' IS DISTINCT FROM outsider::text
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(other_rooms->'rooms') value
       WHERE value->>'kind' = 'meetup' AND value->>'id' = target_room::text) THEN
    RAISE EXCEPTION 'SOCIAL_CONTRACT:nonmember_room_list_exposed';
  END IF;
  RESET ROLE;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  FOR candidate IN SELECT command FROM (VALUES
    ('SELECT public.get_my_activity_meetup_chat($1)'),
    ('SELECT public.list_my_meetup_admission_refunds()'),
    ('SELECT public.social_chat_rooms(jsonb_build_object(''kind'', null, ''id'', null, ''cursor'', null))')
  ) commands(command) LOOP
    denied := false;
    BEGIN
      EXECUTE candidate.command USING target_room;
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
      WHEN raise_exception THEN
        IF SQLERRM <> 'not_authenticated' THEN RAISE; END IF;
        denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'SOCIAL_CONTRACT:anonymous_rpc_allowed'; END IF;
  END LOOP;
  RESET ROLE;
  IF current_setting('transaction_read_only') <> 'on' THEN
    RAISE EXCEPTION 'SOCIAL_CONTRACT:read_only_boundary_lost';
  END IF;
  PERFORM set_config('qa.social_contract.result', jsonb_build_object(
    'readOnly', true,
    'completeCoverage', other_message_count > 0 AND refund_count > 0 AND foreign_refund_count > 0 AND outsider IS NOT NULL,
    'chatOwnIdentityChecked', true, 'chatOtherIdentityChecked', other_message_count > 0,
    'chatHistoryMembershipChecked', true, 'anonymousDenied', true,
    'nonmemberFixturePresent', outsider IS NOT NULL, 'nonmemberDenied', outsider IS NOT NULL,
    'refundListMatchesOwnedLedger', true,
    'refundPositiveOwnershipFixturePresent', refund_count > 0 AND foreign_refund_count > 0,
    'socialRoomsMetadataChecked', true, 'socialRoomEntryMembershipChecked', true,
    'chatMessagesChecked', message_count, 'refundRowsChecked', refund_count, 'socialRoomsChecked', listed_count
  )::text, true);
END
$social_contract$;
SELECT current_setting('qa.social_contract.result');
ROLLBACK;
`
}

export function parseSocialContractReport(output) {
  let report
  try { report = JSON.parse(output.trim()) } catch { throw new Error('invalid_probe_report') }
  if (!report || Array.isArray(report) || typeof report !== 'object'
      || Object.keys(report).length !== CHECK_KEYS.length + COUNT_KEYS.length
      || CHECK_KEYS.some(key => typeof report[key] !== 'boolean')
      || COUNT_KEYS.some(key => !Number.isSafeInteger(report[key]) || report[key] < 0)
      || CHECK_KEYS.filter(key => !['completeCoverage', 'chatOtherIdentityChecked', 'refundPositiveOwnershipFixturePresent',
        'nonmemberFixturePresent', 'nonmemberDenied'].includes(key))
        .some(key => !report[key])
      || report.nonmemberDenied !== report.nonmemberFixturePresent
      || report.completeCoverage !== (report.chatOtherIdentityChecked && report.refundPositiveOwnershipFixturePresent && report.nonmemberDenied)) {
    throw new Error('invalid_probe_report')
  }
  // Rebuild an allowlisted object; never forward arbitrary SQL stdout.
  return Object.fromEntries([...CHECK_KEYS, ...COUNT_KEYS].map(key => [key, report[key]]))
}

// Only literal check labels defined in our own SQL may survive a PostgreSQL error.
const SQL_FAILURE_CODES = new Set(
  [...buildSocialContractSql('postgres').matchAll(/SOCIAL_CONTRACT:([a-z][a-z0-9_]+)/g)].map(match => match[1]),
)
const SAFE_FAILURE_CODES = new Set([...SQL_FAILURE_CODES,
  'invalid_arguments', 'unexpected_local_container', 'invalid_probe_report',
  'local_target_validation_failed', 'local_read_only_contract_failed',
])

export function runSocialContractProbe(database, { execFile = execFileSync, hostEnvironment = process.env } = {}) {
  parseContractArguments(['--database', database])
  const options = {
    encoding: 'utf8', windowsHide: true, shell: false, timeout: 30_000,
    maxBuffer: 256 * 1024, env: buildLocalDockerEnvironment(hostEnvironment),
    stdio: ['pipe', 'pipe', 'pipe'],
  }
  function docker(args, input, errorCode) {
    try {
      return execFile('docker', ['--context', SOCIAL_CONTRACT_TARGET.context, ...args], { ...options, input })
    } catch (error) {
      // Child stderr may contain SQL context, rows, or connection details. Do not log it.
      const code = String(error?.stderr ?? '').match(/SOCIAL_CONTRACT:([a-z][a-z0-9_]+)/)?.[1]
      if (SQL_FAILURE_CODES.has(code)) throw new Error(code)
      throw new Error(errorCode)
    }
  }
  let endpoint, metadata
  try {
    endpoint = JSON.parse(docker(['context', 'inspect', SOCIAL_CONTRACT_TARGET.context,
      '--format', '{{json .Endpoints.docker.Host}}'], undefined, 'local_context_unavailable'))
    assertLocalDockerContextEndpoint(endpoint)
    metadata = JSON.parse(docker(['inspect', SOCIAL_CONTRACT_TARGET.container, '--format',
      '{"id":{{json .Id}},"name":{{json .Name}},"running":{{json .State.Running}},"ports":{{json .NetworkSettings.Ports}}}'],
    undefined, 'local_container_unavailable'))
  } catch { throw new Error('local_target_validation_failed') }
  assertContractContainer(metadata)
  const output = docker([
    'exec', '-i', SOCIAL_CONTRACT_TARGET.containerId,
    'env', '-i', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    'PGAPPNAME=quantum-social-readonly-contract',
    'PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=20000 -c lock_timeout=1000',
    'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=terse',
    '-h', '/var/run/postgresql', '-U', 'postgres', '-d', database,
  ], buildSocialContractSql(database), 'local_read_only_contract_failed')
  return parseSocialContractReport(output)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const database = parseContractArguments(process.argv.slice(2))
    console.log(JSON.stringify(runSocialContractProbe(database), null, 2))
  } catch (error) {
    // Keep even failure output limited to named booleans; SQL/user data stays private.
    const code = SAFE_FAILURE_CODES.has(error?.message) ? error.message : 'local_read_only_contract_failed'
    console.error(JSON.stringify({ readOnlyContractVerified: false, [code]: false }))
    process.exitCode = 1
  }
}
