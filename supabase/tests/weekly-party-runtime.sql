\set ON_ERROR_STOP on

-- Run only after the reviewed weekly accepted-party migration is applied to
-- the parent-owned disposable local database. All synthetic fixtures and
-- assertion logs are rolled back.
begin;
set local client_min_messages to warning;

create temp table weekly_party_assertions(label text primary key) on commit drop;
grant select, insert on table weekly_party_assertions to authenticated, service_role;

create function pg_temp.party_assert(ok boolean, label text)
returns void
language plpgsql
as $$
begin
  if ok is distinct from true then raise exception 'assertion_failed:%', label; end if;
  insert into pg_temp.weekly_party_assertions values (label);
end
$$;

create function pg_temp.party_raises(statement text, expected_message text, label text)
returns void
language plpgsql
as $$
declare actual text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual = message_text;
    if position(expected_message in actual) = 0 then
      raise exception 'assertion_failed:%:actual=%', label, actual;
    end if;
    insert into pg_temp.weekly_party_assertions values (label);
    return;
  end;
  raise exception 'assertion_failed:%:expected_error_not_raised', label;
end
$$;

select pg_temp.party_assert(
  not has_table_privilege('anon', 'public.quantum_weekly_application_members', 'SELECT')
    and not has_table_privilege('authenticated', 'public.quantum_weekly_application_members', 'SELECT')
    and not has_table_privilege('service_role', 'public.quantum_weekly_application_members', 'SELECT'),
  'security.no_raw_member_reads'
);
select pg_temp.party_assert(
  not has_table_privilege('authenticated', 'public.quantum_weekly_party_commands', 'INSERT'),
  'security.no_raw_command_writes'
);
select pg_temp.party_assert(
  not has_function_privilege('anon', 'public.set_my_weekly_party_consent(uuid,text,integer,uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.set_my_weekly_party_consent(uuid,text,integer,uuid)', 'EXECUTE'),
  'security.consent_authenticated_only'
);
select pg_temp.party_assert(
  not has_function_privilege('authenticated', 'public.assign_weekly_party_for_service(uuid,uuid,uuid,integer,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.assign_weekly_party_for_service(uuid,uuid,uuid,integer,uuid)', 'EXECUTE'),
  'security.allocator_service_only'
);
select pg_temp.party_assert(
  not has_function_privilege('authenticated', 'public.apply_to_my_weekly_activity(text,date,uuid[],uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.cancel_my_weekly_activity_application(uuid,integer,uuid)', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.assign_weekly_application_for_service(uuid,uuid,uuid,integer,uuid)', 'EXECUTE'),
  'security.old_solo_bypasses_revoked'
);

insert into auth.users (
  id, aud, role, email, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('b5500000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'weekly-party-owner@example.invalid', '+821000000001', now(), '{}', '{}', now(), now()),
  ('b5500000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'weekly-party-member@example.invalid', '+821000000002', now(), '{}', '{}', now(), now()),
  ('b5500000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'weekly-party-assigned@example.invalid', '+821000000003', now(), '{}', '{}', now(), now()),
  ('b5500000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'weekly-party-room-person@example.invalid', '+821000000004', now(), '{}', '{}', now(), now()),
  ('b5500000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'weekly-party-overflow-owner@example.invalid', '+821000000005', now(), '{}', '{}', now(), now()),
  ('b5500000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'weekly-party-overflow-member@example.invalid', '+821000000006', now(), '{}', '{}', now(), now());

-- Users 1/2 and 5/6 exercise the real apply/consent/allocator path. User 4 is
-- an existing female solo seat used to prove occurrence capacity arithmetic.
insert into public.profiles (
  user_id, display_name, gender, age, school, department,
  worldcup_completed_at, is_profile_complete
)
values
  ('b5500000-0000-4000-8000-000000000001', '주간하나', 'male', 25, '부산대학교', '테스트학과', now(), true),
  ('b5500000-0000-4000-8000-000000000002', '주간둘', 'male', 25, '부산대학교', '테스트학과', now(), true),
  ('b5500000-0000-4000-8000-000000000004', '주간넷', 'female', 25, '부산대학교', '테스트학과', now(), true),
  ('b5500000-0000-4000-8000-000000000005', '주간다섯', 'male', 25, '부산대학교', '테스트학과', now(), true),
  ('b5500000-0000-4000-8000-000000000006', '주간여섯', 'male', 25, '부산대학교', '테스트학과', now(), true);

insert into quantum_private.community_member_profiles (
  user_id, birth_date, school_scope, department, community_gender,
  display_name, alias_claimed_at, phone_verified_at
)
values
  ('b5500000-0000-4000-8000-000000000001', '2001-01-01', 'pnu_self_selected', '테스트학과', 'male', '주간하나', now(), now()),
  ('b5500000-0000-4000-8000-000000000002', '2001-01-02', 'pnu_self_selected', '테스트학과', 'male', '주간둘', now(), now()),
  ('b5500000-0000-4000-8000-000000000005', '2001-01-05', 'pnu_self_selected', '테스트학과', 'male', '주간다섯', now(), now()),
  ('b5500000-0000-4000-8000-000000000006', '2001-01-06', 'pnu_self_selected', '테스트학과', 'male', '주간여섯', now(), now());

insert into public.photos (user_id, storage_path, public_url, sort_order)
values
  ('b5500000-0000-4000-8000-000000000001', 'r2/1.jpg', null, 0),
  ('b5500000-0000-4000-8000-000000000002', 'r2/2.jpg', null, 0),
  ('b5500000-0000-4000-8000-000000000005', 'r2/5.jpg', null, 0),
  ('b5500000-0000-4000-8000-000000000006', 'r2/6.jpg', null, 0);

insert into public.private_appearance_scores (
  user_id, photo_revision, analyzed_photo_revision, status, request_id,
  provider, model_version, prompt_version, anchor_version, score_raw,
  confidence_0_1, appearance_type, analyzed_at
)
values
  ('b5500000-0000-4000-8000-000000000001', 'b5500000-0000-4000-8000-000000000301', 'b5500000-0000-4000-8000-000000000301', 'ready', 'b5500000-0000-4000-8000-000000000311', 'openai', 'gpt-5.6-terra', 'appearance-anchor-v3', 'approved-v1', 50, 0.9, 'warm', now()),
  ('b5500000-0000-4000-8000-000000000002', 'b5500000-0000-4000-8000-000000000302', 'b5500000-0000-4000-8000-000000000302', 'ready', 'b5500000-0000-4000-8000-000000000312', 'openai', 'gpt-5.6-terra', 'appearance-anchor-v3', 'approved-v1', 50, 0.9, 'warm', now()),
  ('b5500000-0000-4000-8000-000000000005', 'b5500000-0000-4000-8000-000000000305', 'b5500000-0000-4000-8000-000000000305', 'ready', 'b5500000-0000-4000-8000-000000000315', 'openai', 'gpt-5.6-terra', 'appearance-anchor-v3', 'approved-v1', 50, 0.9, 'warm', now()),
  ('b5500000-0000-4000-8000-000000000006', 'b5500000-0000-4000-8000-000000000306', 'b5500000-0000-4000-8000-000000000306', 'ready', 'b5500000-0000-4000-8000-000000000316', 'openai', 'gpt-5.6-terra', 'appearance-anchor-v3', 'approved-v1', 50, 0.9, 'warm', now())
on conflict (user_id) do update
set photo_revision = excluded.photo_revision,
    analyzed_photo_revision = excluded.analyzed_photo_revision,
    status = excluded.status,
    lease_expires_at = null,
    request_id = excluded.request_id,
    provider = excluded.provider,
    model_version = excluded.model_version,
    prompt_version = excluded.prompt_version,
    anchor_version = excluded.anchor_version,
    score_raw = excluded.score_raw,
    score_override = null,
    confidence_0_1 = excluded.confidence_0_1,
    appearance_type = excluded.appearance_type,
    error_code = null,
    analyzed_at = excluded.analyzed_at,
    updated_at = now();

insert into public.groups (id, leader_user_id, name, size, gender, status)
values
  ('b5500000-0000-4000-8000-000000000010',
   'b5500000-0000-4000-8000-000000000001',
   'Synthetic weekly rollback party', 2, 'male', 'ready'),
  ('b5500000-0000-4000-8000-000000000011',
   'b5500000-0000-4000-8000-000000000005',
   'Synthetic weekly overflow party', 2, 'male', 'ready');
insert into public.group_members (group_id, user_id, role)
values
  ('b5500000-0000-4000-8000-000000000010', 'b5500000-0000-4000-8000-000000000001', 'leader'),
  ('b5500000-0000-4000-8000-000000000010', 'b5500000-0000-4000-8000-000000000002', 'member'),
  ('b5500000-0000-4000-8000-000000000011', 'b5500000-0000-4000-8000-000000000005', 'leader'),
  ('b5500000-0000-4000-8000-000000000011', 'b5500000-0000-4000-8000-000000000006', 'member');

insert into public.friend_requests (
  id, sender_user_id, receiver_user_id, token, status, expires_at, responded_at
)
values
  ('b5500000-0000-4000-8000-000000000020', 'b5500000-0000-4000-8000-000000000001', 'b5500000-0000-4000-8000-000000000002', 'b5500000000000000000000000000020', 'accepted', '2099-01-01', now()),
  ('b5500000-0000-4000-8000-000000000021', 'b5500000-0000-4000-8000-000000000005', 'b5500000-0000-4000-8000-000000000006', 'b5500000000000000000000000000021', 'accepted', '2099-01-01', now());
insert into public.friendships (
  user_id, friend_user_id, status, created_from_request_id
)
values
  ('b5500000-0000-4000-8000-000000000001', 'b5500000-0000-4000-8000-000000000002', 'active', 'b5500000-0000-4000-8000-000000000020'),
  ('b5500000-0000-4000-8000-000000000005', 'b5500000-0000-4000-8000-000000000006', 'active', 'b5500000-0000-4000-8000-000000000021');

insert into public.quantum_weekly_applications (
  id, user_id, activity_id, week_key, status, idempotency_key, request_hash,
  party_type, party_group_id, party_size, roster_snapshot_hash
)
values (
  'b5500000-0000-4000-8000-000000000100',
  'b5500000-0000-4000-8000-000000000001',
  'weekly-party-fixture', '2099-01-05', 'awaiting_consents',
  'b5500000-0000-4000-8000-000000000110',
  '11111111111111111111111111111111', 'friends',
  'b5500000-0000-4000-8000-000000000010', 2,
  '22222222222222222222222222222222'
);
insert into public.quantum_weekly_application_members (
  application_id, participant_user_id, week_key, role, consent_status,
  lifecycle_status, school_snapshot, gender_snapshot, roster_snapshot_hash,
  request_hash, consented_at
)
values
  ('b5500000-0000-4000-8000-000000000100', 'b5500000-0000-4000-8000-000000000001', '2099-01-05', 'owner', 'accepted', 'awaiting_consents', '부산대학교', 'male', '22222222222222222222222222222222', '11111111111111111111111111111111', now()),
  ('b5500000-0000-4000-8000-000000000100', 'b5500000-0000-4000-8000-000000000002', '2099-01-05', 'member', 'pending', 'awaiting_consents', '부산대학교', 'male', '22222222222222222222222222222222', '11111111111111111111111111111111', null);

-- The member is already reserved by the party. A concurrent solo application
-- may create its owner row, but its live member row must fail atomically.
insert into public.quantum_weekly_applications (
  id, user_id, activity_id, week_key, status, idempotency_key, request_hash,
  party_type, party_size, roster_snapshot_hash
)
values (
  'b5500000-0000-4000-8000-000000000101',
  'b5500000-0000-4000-8000-000000000002',
  'weekly-solo-collision', '2099-01-05', 'active',
  'b5500000-0000-4000-8000-000000000111',
  '33333333333333333333333333333333', 'solo', 1,
  '44444444444444444444444444444444'
);
select pg_temp.party_raises(
  $call$insert into public.quantum_weekly_application_members (
    application_id, participant_user_id, week_key, role, consent_status,
    lifecycle_status, school_snapshot, gender_snapshot, roster_snapshot_hash,
    request_hash, consented_at
  ) values (
    'b5500000-0000-4000-8000-000000000101',
    'b5500000-0000-4000-8000-000000000002', '2099-01-05', 'owner', 'accepted',
    'active', '부산대학교', 'male', '44444444444444444444444444444444',
    '33333333333333333333333333333333', now()
  )$call$,
  'quantum_weekly_member_one_live_application_idx',
  'integrity.no_cross_party_or_solo_live_membership'
);
delete from public.quantum_weekly_applications
where id = 'b5500000-0000-4000-8000-000000000101';

create temp table weekly_party_payloads(label text primary key, payload jsonb not null) on commit drop;
grant select, insert on table weekly_party_payloads to authenticated, service_role;
set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', 'b5500000-0000-4000-8000-000000000002', true);
insert into weekly_party_payloads
values (
  'member-withdraw',
  public.set_my_weekly_party_consent(
    'b5500000-0000-4000-8000-000000000100', 'withdraw', 0,
    'b5500000-0000-4000-8000-000000000120'
  )
);
select pg_temp.party_assert(
  (select payload->'application'->>'status' = 'cancelled'
     and payload->'application'->'party'->>'cancellation_kind' = 'party_member_withdrew'
   from weekly_party_payloads where label = 'member-withdraw'),
  'withdraw.member_sees_whole_bundle_cancelled'
);
select pg_temp.party_assert(
  (select not (payload->'application' ?| array['user_id', 'party_group_id', 'withdrawn_by'])
     and not (payload->'application'->'party' ?| array['members', 'school', 'gender', 'withdrawn_by'])
   from weekly_party_payloads where label = 'member-withdraw'),
  'privacy.discovery_omits_other_member_identity_school_gender_and_withdrawer'
);
select pg_temp.party_assert(
  public.set_my_weekly_party_consent(
    'b5500000-0000-4000-8000-000000000100', 'withdraw', 0,
    'b5500000-0000-4000-8000-000000000120'
  )->'application'->>'status' = 'cancelled',
  'idempotency.withdraw_replay_returns_cancelled_state'
);

select pg_catalog.set_config('request.jwt.claim.sub', 'b5500000-0000-4000-8000-000000000001', true);
insert into weekly_party_payloads
values ('owner-read', public.get_my_weekly_activity_discovery_v2('2099-01-05'));
select pg_temp.party_assert(
  (select payload->'application'->>'status' = 'cancelled'
   from weekly_party_payloads where label = 'owner-read'),
  'withdraw.owner_sees_same_cancelled_state'
);
reset role;

select pg_temp.party_assert(
  (select status = 'cancelled'
     and party_type = 'friends'
     and party_group_id = 'b5500000-0000-4000-8000-000000000010'
     and party_size = 2
     and cancellation_kind = 'party_member_withdrew'
   from public.quantum_weekly_applications
   where id = 'b5500000-0000-4000-8000-000000000100'),
  'withdraw.never_downgrades_remaining_members_to_solo'
);
select pg_temp.party_assert(
  (select count(*) = 2
     and bool_and(lifecycle_status = 'cancelled')
     and count(*) filter (where consent_status = 'withdrawn' and consented_at is null) = 1
   from public.quantum_weekly_application_members
   where application_id = 'b5500000-0000-4000-8000-000000000100'),
  'withdraw.all_member_lifecycle_rows_cancelled'
);
select pg_temp.party_assert(
  (select count(*) = 1
   from public.quantum_weekly_party_commands
   where application_id = 'b5500000-0000-4000-8000-000000000100'
     and action = 'withdraw'),
  'idempotency.withdraw_command_written_once'
);

-- Exercise the public RPC lifecycle rather than fabricating its application
-- rows: two accepted-friend parties apply to one future board-game window and
-- every non-owner explicitly consents before service allocation.
insert into public.quantum_weekly_activity_windows (
  id, activity_id, activity_kind, week_key, title, summary, starts_at, ends_at,
  application_closes_at, location_name, capacity, status
)
values (
  'b5500000-0000-4000-8000-000000000210', 'scheduled-board-game',
  'board_game', '2099-01-05', 'Synthetic actual allocator window', 'Rollback only',
  '2099-01-08 10:00:00+00', '2099-01-08 12:00:00+00',
  '2099-01-07 10:00:00+00', 'Synthetic allocator location', 5, 'recruiting'
);
insert into public.quantum_event_occurrences (
  id, event_id, event_mode, starts_at, ends_at, application_closes_at,
  location_name, male_capacity, female_capacity, required_total, status,
  room_number, room_code
)
values (
  'b5500000-0000-4000-8000-000000000211', 'scheduled-board-game', 'scheduled',
  '2099-01-08 10:00:00+00', '2099-01-08 12:00:00+00',
  '2099-01-07 10:00:00+00', 'Synthetic allocator location', 3, 2, 5, 'recruiting',
  1, 'R2T002'
);
insert into public.quantum_event_participations (
  user_id, event_id, event_mode, party_type, occurrence_id, status
)
values (
  'b5500000-0000-4000-8000-000000000004', 'scheduled-board-game', 'scheduled',
  'solo', 'b5500000-0000-4000-8000-000000000211', 'recruiting'
);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
select pg_catalog.set_config('request.jwt.claim.sub', 'b5500000-0000-4000-8000-000000000001', true);
insert into weekly_party_payloads values (
  'actual-apply-a',
  public.apply_to_my_weekly_activity_v2(
    'scheduled-board-game', '2099-01-05',
    array['b5500000-0000-4000-8000-000000000210']::uuid[],
    'b5500000-0000-4000-8000-000000000010',
    'b5500000-0000-4000-8000-000000000410'
  )
);
select pg_catalog.set_config('request.jwt.claim.sub', 'b5500000-0000-4000-8000-000000000005', true);
insert into weekly_party_payloads values (
  'actual-apply-b',
  public.apply_to_my_weekly_activity_v2(
    'scheduled-board-game', '2099-01-05',
    array['b5500000-0000-4000-8000-000000000210']::uuid[],
    'b5500000-0000-4000-8000-000000000011',
    'b5500000-0000-4000-8000-000000000411'
  )
);
select pg_catalog.set_config('request.jwt.claim.sub', 'b5500000-0000-4000-8000-000000000002', true);
insert into weekly_party_payloads values (
  'actual-consent-a',
  public.set_my_weekly_party_consent(
    ((select payload->'application'->>'id' from weekly_party_payloads where label = 'actual-apply-a'))::uuid,
    'accept', 0, 'b5500000-0000-4000-8000-000000000412'
  )
);
select pg_catalog.set_config('request.jwt.claim.sub', 'b5500000-0000-4000-8000-000000000006', true);
insert into weekly_party_payloads values (
  'actual-consent-b',
  public.set_my_weekly_party_consent(
    ((select payload->'application'->>'id' from weekly_party_payloads where label = 'actual-apply-b'))::uuid,
    'accept', 0, 'b5500000-0000-4000-8000-000000000413'
  )
);
reset role;

select pg_temp.party_assert(
  (select payload->'application'->>'status' = 'active'
     and payload->'application'->'party'->>'accepted_count' = '2'
   from weekly_party_payloads where label = 'actual-consent-a')
  and
  (select payload->'application'->>'status' = 'active'
     and payload->'application'->'party'->>'accepted_count' = '2'
   from weekly_party_payloads where label = 'actual-consent-b'),
  'allocator.actual_apply_and_all_member_consent_activate_bundles'
);

-- Allocation is intentionally after the application cutoff while the event is
-- still future. Both sources must carry the exact same cutoff snapshot.
update public.quantum_weekly_activity_windows
set application_closes_at = current_timestamp - interval '1 minute'
where id = 'b5500000-0000-4000-8000-000000000210';
update public.quantum_event_occurrences
set application_closes_at = current_timestamp - interval '1 minute'
where id = 'b5500000-0000-4000-8000-000000000211';

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
insert into weekly_party_payloads values (
  'actual-assign-a',
  public.assign_weekly_party_for_service(
    ((select payload->'application'->>'id' from weekly_party_payloads where label = 'actual-apply-a'))::uuid,
    'b5500000-0000-4000-8000-000000000210',
    'b5500000-0000-4000-8000-000000000211', 1,
    'b5500000-0000-4000-8000-000000000420'
  )
);
insert into weekly_party_payloads values (
  'actual-assign-a-replay',
  public.assign_weekly_party_for_service(
    ((select payload->'application'->>'id' from weekly_party_payloads where label = 'actual-apply-a'))::uuid,
    'b5500000-0000-4000-8000-000000000210',
    'b5500000-0000-4000-8000-000000000211', 1,
    'b5500000-0000-4000-8000-000000000420'
  )
);
reset role;

select pg_temp.party_assert(
  (select count(*) = 2
     and count(distinct participation.occurrence_id) = 1
     and bool_and(participation.occurrence_id = 'b5500000-0000-4000-8000-000000000211')
   from public.quantum_event_participations as participation
   where participation.user_id in (
     'b5500000-0000-4000-8000-000000000001',
     'b5500000-0000-4000-8000-000000000002'
   ))
  and
  (select application.status = 'assigned' and application.revision = 2
   from public.quantum_weekly_applications as application
   where application.id = ((select payload->'application'->>'id' from weekly_party_payloads where label = 'actual-apply-a'))::uuid)
  and
  (select count(*) = 2 and bool_and(member.lifecycle_status = 'assigned')
   from public.quantum_weekly_application_members as member
   where member.application_id = ((select payload->'application'->>'id' from weekly_party_payloads where label = 'actual-apply-a'))::uuid),
  'allocator.actual_apply_consent_assign_all_members_same_occurrence'
);
select pg_temp.party_assert(
  (select count(*) = 3
     and count(*) filter (where room_person.gender = 'male') = 2
     and count(*) filter (where room_person.gender = 'female') = 1
   from private.quantum_event_room_people('b5500000-0000-4000-8000-000000000211') as room_person),
  'allocator.actual_room_capacity_counts_existing_and_party_seats'
);
select pg_temp.party_assert(
  (select payload->>'replayed' = 'true'
   from weekly_party_payloads where label = 'actual-assign-a-replay')
  and
  (select count(*) = 2
   from public.quantum_event_participations as participation
   where participation.user_id in (
     'b5500000-0000-4000-8000-000000000001',
     'b5500000-0000-4000-8000-000000000002'
   )),
  'allocator.same_key_replays_without_duplicate_seats'
);

set local role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', true);
select pg_temp.party_raises(
  $call$select public.assign_weekly_party_for_service(
    ((select payload->'application'->>'id'
      from weekly_party_payloads where label = 'actual-apply-b'))::uuid,
    'b5500000-0000-4000-8000-000000000210',
    'b5500000-0000-4000-8000-000000000211', 1,
    'b5500000-0000-4000-8000-000000000421'
  )$call$,
  'occurrence_gender_capacity_full',
  'allocator.capacity_error_is_explicit'
);
reset role;
select pg_temp.party_assert(
  not exists (
    select 1 from public.quantum_event_participations as participation
    where participation.user_id in (
      'b5500000-0000-4000-8000-000000000005',
      'b5500000-0000-4000-8000-000000000006'
    )
  )
  and
  (select application.status = 'active' and application.revision = 1
   from public.quantum_weekly_applications as application
   where application.user_id = 'b5500000-0000-4000-8000-000000000005')
  and
  (select count(*) = 2 and bool_and(member.lifecycle_status = 'active')
   from public.quantum_weekly_application_members as member
   join public.quantum_weekly_applications as application on application.id = member.application_id
   where application.user_id = 'b5500000-0000-4000-8000-000000000005'
     and application.status = 'active'),
  'allocator.capacity_failure_inserts_zero_party_members'
);

insert into public.quantum_weekly_activity_windows (
  id, activity_id, activity_kind, week_key, title, summary, starts_at, ends_at,
  application_closes_at, location_name, capacity, status
)
values (
  'b5500000-0000-4000-8000-000000000200', 'weekly-assigned-fixture',
  'board_game', '2099-01-05', 'Synthetic assigned window', 'Rollback only',
  '2099-01-07 10:00:00+00', '2099-01-07 12:00:00+00',
  '2099-01-06 10:00:00+00', 'Synthetic location', 5, 'recruiting'
);
insert into public.quantum_event_occurrences (
  id, event_id, event_mode, starts_at, ends_at, application_closes_at,
  location_name, male_capacity, female_capacity, required_total, status,
  room_number, room_code
)
values (
  'b5500000-0000-4000-8000-000000000201', 'weekly-assigned-fixture', 'scheduled',
  '2099-01-07 10:00:00+00', '2099-01-07 12:00:00+00',
  '2099-01-06 10:00:00+00', 'Synthetic location', 3, 2, 5, 'recruiting',
  1, 'R2T001'
);
insert into public.quantum_weekly_applications (
  id, user_id, activity_id, week_key, status, assigned_window_id,
  assigned_occurrence_id, assignment_idempotency_key, idempotency_key,
  request_hash, party_type, party_size, roster_snapshot_hash
)
values (
  'b5500000-0000-4000-8000-000000000102',
  'b5500000-0000-4000-8000-000000000003', 'weekly-assigned-fixture',
  '2099-01-05', 'assigned', 'b5500000-0000-4000-8000-000000000200',
  'b5500000-0000-4000-8000-000000000201',
  'b5500000-0000-4000-8000-000000000130',
  'b5500000-0000-4000-8000-000000000131',
  '55555555555555555555555555555555', 'solo', 1,
  '66666666666666666666666666666666'
);
insert into public.quantum_weekly_application_members (
  application_id, participant_user_id, week_key, role, consent_status,
  lifecycle_status, school_snapshot, gender_snapshot, roster_snapshot_hash,
  request_hash, consented_at
)
values (
  'b5500000-0000-4000-8000-000000000102',
  'b5500000-0000-4000-8000-000000000003', '2099-01-05', 'owner', 'accepted',
  'assigned', '부산대학교', 'male', '66666666666666666666666666666666',
  '55555555555555555555555555555555', now()
);

set local role authenticated;
select pg_catalog.set_config('request.jwt.claim.sub', 'b5500000-0000-4000-8000-000000000003', true);
select pg_temp.party_raises(
  $call$select public.cancel_my_weekly_activity_application_v2(
    'b5500000-0000-4000-8000-000000000102', 0,
    'b5500000-0000-4000-8000-000000000132'
  )$call$,
  'assigned_application_cannot_cancel',
  'assigned.owner_cancel_rejected'
);
select pg_temp.party_raises(
  $call$select public.set_my_weekly_party_consent(
    'b5500000-0000-4000-8000-000000000102', 'withdraw', 0,
    'b5500000-0000-4000-8000-000000000133'
  )$call$,
  'assigned_application_cannot_cancel',
  'assigned.member_withdraw_rejected'
);
reset role;

select pg_temp.party_assert(
  not exists (
    select 1
    from public.quantum_weekly_applications as application
    left join public.quantum_weekly_application_members as member
      on member.application_id = application.id
     and member.participant_user_id = application.user_id
    where member.application_id is null
  ),
  'bootstrap.every_solo_and_party_application_has_owner_member'
);

select count(*) as passed_assertions from weekly_party_assertions;
rollback;
