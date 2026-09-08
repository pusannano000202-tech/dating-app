-- Additive Day 2 group-prompt and Day 4 shared-phone runtime for the integrated
-- continuation model. Existing public RPC signatures remain stable; their old
-- implementations are retained under private-by-grant legacy names.

create table public.quantum_continuation_day2_prompt_states (
  occurrence_id uuid not null references public.quantum_continuation_occurrences(id) on delete restrict,
  round_no smallint not null check (round_no between 1 and 3),
  group_key text not null check (group_key ~ '^[0-9a-f]{32}$'),
  question_index smallint not null default 0 check (question_index between 0 and 5),
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (occurrence_id, round_no, group_key)
);

create table public.quantum_continuation_day4_shared_phone (
  occurrence_id uuid primary key references public.quantum_continuation_occurrences(id) on delete restrict,
  owner_user_id uuid,
  card_index smallint not null default 0 check (card_index between 0 and 10),
  lease_version bigint not null default 0 check (lease_version >= 0),
  card_version bigint not null default 0 check (card_version >= 0),
  claimed_at timestamptz,
  last_heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  released_at timestamptz,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  foreign key (occurrence_id, owner_user_id)
    references public.quantum_continuation_occurrence_members(occurrence_id, participant_user_id)
    on delete restrict,
  check (
    (owner_user_id is null and lease_expires_at is null)
    or (owner_user_id is not null and lease_expires_at is not null and released_at is null)
  )
);

create table public.quantum_continuation_content_runtime_commands (
  actor_user_id uuid not null references public.users(id) on delete restrict,
  idempotency_key uuid not null,
  occurrence_id uuid not null references public.quantum_continuation_occurrences(id) on delete restrict,
  action text not null check (pg_catalog.char_length(pg_catalog.btrim(action)) between 1 and 80),
  payload jsonb not null check (pg_catalog.jsonb_typeof(payload) = 'object'),
  prior_content_revision integer not null check (prior_content_revision >= 0),
  resulting_content_revision integer not null check (resulting_content_revision >= prior_content_revision),
  resulting_runtime_version bigint not null check (resulting_runtime_version >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (actor_user_id, idempotency_key)
);

create index quantum_continuation_runtime_commands_occurrence_created_idx
  on public.quantum_continuation_content_runtime_commands(occurrence_id, created_at desc);

alter table public.quantum_continuation_day2_prompt_states enable row level security;
alter table public.quantum_continuation_day4_shared_phone enable row level security;
alter table public.quantum_continuation_content_runtime_commands enable row level security;

revoke all on table public.quantum_continuation_day2_prompt_states
  from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_day4_shared_phone
  from public, anon, authenticated, service_role;
revoke all on table public.quantum_continuation_content_runtime_commands
  from public, anon, authenticated, service_role;

-- Preserve the card position of any local/previously deployed Day 4 occurrence.
-- No response content or device owner is inferred during this forward migration.
insert into public.quantum_continuation_day4_shared_phone(
  occurrence_id, owner_user_id, card_index, lease_version, card_version,
  lease_expires_at, released_at
)
select
  occurrence.id,
  null,
  case
    when occurrence.content_state ->> 'drawn_card_count' ~ '^[0-9]{1,9}$'
      then least((occurrence.content_state ->> 'drawn_card_count')::integer, 10)::smallint
    else 0
  end,
  0,
  case
    when occurrence.content_state ->> 'drawn_card_count' ~ '^[0-9]{1,9}$'
      then least((occurrence.content_state ->> 'drawn_card_count')::integer, 10)::bigint
    else 0
  end,
  null,
  null
from public.quantum_continuation_occurrences as occurrence
where occurrence.program_day = 4
on conflict (occurrence_id) do nothing;

create or replace function quantum_private.continuation_day2_runtime(
  p_occurrence_id uuid,
  p_actor_user_id uuid,
  p_now timestamptz
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_occurrence public.quantum_continuation_occurrences%rowtype;
  v_actor_alias text;
  v_men text[];
  v_women text[];
  v_member_count integer;
  v_male_count integer;
  v_female_count integer;
  v_scene text;
  v_round smallint;
  v_round_open timestamptz;
  v_round_close timestamptz;
  v_previous_scene text;
  v_previous_until timestamptz;
  v_groups jsonb := '[]'::jsonb;
  v_actor_group jsonb;
  v_group_key text;
  v_state public.quantum_continuation_day2_prompt_states%rowtype;
begin
  select occurrence.* into v_occurrence
  from public.quantum_continuation_occurrences as occurrence
  where occurrence.id = p_occurrence_id and occurrence.program_day = 2;
  if v_occurrence.id is null then return null; end if;

  select member.alias into v_actor_alias
  from public.quantum_continuation_occurrence_members as member
  where member.occurrence_id = p_occurrence_id
    and member.participant_user_id = p_actor_user_id
    and member.attendance_status in ('confirmed', 'present');

  select
    pg_catalog.array_agg(member.alias order by member.alias) filter (where profile.gender = 'male'),
    pg_catalog.array_agg(member.alias order by member.alias) filter (where profile.gender = 'female'),
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where profile.gender = 'male')::integer,
    pg_catalog.count(*) filter (where profile.gender = 'female')::integer
  into v_men, v_women, v_member_count, v_male_count, v_female_count
  from public.quantum_continuation_occurrence_members as member
  left join public.profiles as profile on profile.user_id = member.participant_user_id
  where member.occurrence_id = p_occurrence_id
    and member.attendance_status in ('confirmed', 'present');

  if p_now < v_occurrence.starts_at then
    v_scene := 'day2_waiting';
  elsif p_now < v_occurrence.starts_at + interval '15 minutes' then
    v_scene := 'day2_arrival';
  elsif p_now < v_occurrence.starts_at + interval '45 minutes' then
    v_scene := 'day2_rotation_round_1';
    v_round := 1;
    v_round_open := v_occurrence.starts_at + interval '15 minutes';
    v_round_close := v_occurrence.starts_at + interval '45 minutes';
  elsif p_now < v_occurrence.starts_at + interval '75 minutes' then
    v_scene := 'day2_rotation_round_2';
    v_round := 2;
    v_round_open := v_occurrence.starts_at + interval '45 minutes';
    v_round_close := v_occurrence.starts_at + interval '75 minutes';
    if p_now <= v_occurrence.starts_at + interval '55 minutes' then
      v_previous_scene := 'day2_rotation_round_1';
      v_previous_until := v_occurrence.starts_at + interval '55 minutes';
    end if;
  elsif p_now < v_occurrence.starts_at + interval '105 minutes' then
    v_scene := 'day2_rotation_round_3';
    v_round := 3;
    v_round_open := v_occurrence.starts_at + interval '75 minutes';
    v_round_close := v_occurrence.starts_at + interval '105 minutes';
    if p_now <= v_occurrence.starts_at + interval '85 minutes' then
      v_previous_scene := 'day2_rotation_round_2';
      v_previous_until := v_occurrence.starts_at + interval '85 minutes';
    end if;
  elsif p_now <= v_occurrence.ends_at + interval '6 hours' then
    v_scene := 'day2_wrap_and_end';
    if p_now <= v_occurrence.starts_at + interval '115 minutes' then
      v_previous_scene := 'day2_rotation_round_3';
      v_previous_until := v_occurrence.starts_at + interval '115 minutes';
    end if;
  else
    v_scene := 'day2_closed';
  end if;

  if not (
    v_actor_alias is not null
    and (
      (v_member_count = 6 and v_male_count = 3 and v_female_count = 3)
      or (v_member_count = 5 and (
        (v_male_count = 3 and v_female_count = 2)
        or (v_male_count = 2 and v_female_count = 3)
      ))
    )
    and v_member_count = v_male_count + v_female_count
  ) then
    return pg_catalog.jsonb_build_object(
      'ready', false,
      'roster_size', v_member_count,
      'scene', v_scene,
      'round', v_round,
      'can_finish', false
    );
  end if;

  if v_round is not null then
    if v_male_count = 3 and v_female_count = 2 then
      v_groups := case v_round
        when 1 then pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_array(v_men[1], v_women[1]),
          pg_catalog.jsonb_build_array(v_men[2], v_men[3], v_women[2])
        )
        when 2 then pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_array(v_men[1], v_women[2]),
          pg_catalog.jsonb_build_array(v_men[2], v_men[3], v_women[1])
        )
        else pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_array(v_men[2], v_women[1]),
          pg_catalog.jsonb_build_array(v_men[1], v_men[3], v_women[2])
        )
      end;
    elsif v_male_count = 2 and v_female_count = 3 then
      v_groups := case v_round
        when 1 then pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_array(v_men[1], v_women[1]),
          pg_catalog.jsonb_build_array(v_men[2], v_women[2], v_women[3])
        )
        when 2 then pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_array(v_men[2], v_women[1]),
          pg_catalog.jsonb_build_array(v_men[1], v_women[2], v_women[3])
        )
        else pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_array(v_men[1], v_women[2]),
          pg_catalog.jsonb_build_array(v_men[2], v_women[1], v_women[3])
        )
      end;
    else
      v_groups := case v_round
        when 1 then pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_array(v_men[1], v_women[1]),
          pg_catalog.jsonb_build_array(v_men[2], v_women[2]),
          pg_catalog.jsonb_build_array(v_men[3], v_women[3])
        )
        when 2 then pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_array(v_men[1], v_women[2]),
          pg_catalog.jsonb_build_array(v_men[2], v_women[3]),
          pg_catalog.jsonb_build_array(v_men[3], v_women[1])
        )
        else pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_array(v_men[1], v_women[3]),
          pg_catalog.jsonb_build_array(v_men[2], v_women[1]),
          pg_catalog.jsonb_build_array(v_men[3], v_women[2])
        )
      end;
    end if;

    select group_value into v_actor_group
    from pg_catalog.jsonb_array_elements(v_groups) as group_rows(group_value)
    where group_value ? v_actor_alias;

    select pg_catalog.md5(pg_catalog.string_agg(
      member.participant_user_id::text,
      pg_catalog.chr(31)
      order by member.participant_user_id::text
    )) into v_group_key
    from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id
      and member.alias in (
        select alias_value
        from pg_catalog.jsonb_array_elements_text(v_actor_group) as aliases(alias_value)
      );

    select prompt.* into v_state
    from public.quantum_continuation_day2_prompt_states as prompt
    where prompt.occurrence_id = p_occurrence_id
      and prompt.round_no = v_round
      and prompt.group_key = v_group_key;
  end if;

  return pg_catalog.jsonb_build_object(
    'ready', true,
    'roster_size', v_member_count,
    'mode', case when v_member_count = 5 then 'pair_and_trio' else 'three_pairs' end,
    'scene', v_scene,
    'round', v_round,
    'round_opened_at', v_round_open,
    'round_closes_at', v_round_close,
    'previous_scene', v_previous_scene,
    'previous_available_until', v_previous_until,
    'my_group', case when v_actor_group is null then null else pg_catalog.jsonb_build_object('aliases', v_actor_group) end,
    'question_index', case when v_round is null then null else coalesce(v_state.question_index, v_round - 1) end,
    'prompt_version', case when v_round is null then null else coalesce(v_state.version, 0) end,
    'can_advance_prompt', v_round is not null
      and p_now >= v_round_open + interval '5 minutes'
      and p_now < v_round_close
      and v_occurrence.status in ('confirmed', 'in_progress'),
    'can_finish', p_now >= v_occurrence.starts_at + interval '105 minutes'
      and p_now <= v_occurrence.ends_at + interval '6 hours'
      and v_occurrence.status in ('confirmed', 'in_progress'),
    'group_key', v_group_key
  );
end
$$;

revoke all on function quantum_private.continuation_day2_runtime(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;

create or replace function quantum_private.continuation_day4_runtime(
  p_occurrence_id uuid,
  p_actor_user_id uuid,
  p_now timestamptz
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_occurrence public.quantum_continuation_occurrences%rowtype;
  v_actor_eligible boolean := false;
  v_phone public.quantum_continuation_day4_shared_phone%rowtype;
  v_scene text;
  v_lease_active boolean := false;
  v_within_action_window boolean := false;
begin
  select occurrence.* into v_occurrence
  from public.quantum_continuation_occurrences as occurrence
  where occurrence.id = p_occurrence_id and occurrence.program_day = 4;
  if v_occurrence.id is null then return null; end if;

  select exists (
    select 1 from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id
      and member.participant_user_id = p_actor_user_id
      and member.attendance_status in ('confirmed', 'present')
  ) into v_actor_eligible;

  select phone.* into v_phone
  from public.quantum_continuation_day4_shared_phone as phone
  where phone.occurrence_id = p_occurrence_id;

  v_lease_active := v_phone.owner_user_id is not null
    and v_phone.released_at is null
    and v_phone.lease_expires_at > p_now;
  v_within_action_window := p_now >= v_occurrence.starts_at + interval '30 minutes'
    and p_now <= v_occurrence.ends_at + interval '6 hours'
    and v_occurrence.status in ('confirmed', 'in_progress');

  if p_now < v_occurrence.starts_at then
    v_scene := 'day4_waiting';
  elsif p_now < v_occurrence.starts_at + interval '30 minutes' then
    v_scene := 'day4_arrival_and_order';
  elsif p_now < v_occurrence.starts_at + interval '50 minutes' then
    v_scene := 'day4_same_answer_game';
  elsif p_now < v_occurrence.starts_at + interval '105 minutes' then
    v_scene := 'day4_free_conversation';
  elsif p_now < v_occurrence.ends_at then
    v_scene := 'day4_photo_and_end';
  elsif v_within_action_window and coalesce(v_phone.card_index, 0) < 10 then
    v_scene := 'day4_card_recovery';
  else
    v_scene := 'day4_closed';
  end if;

  return pg_catalog.jsonb_build_object(
    'ready', v_actor_eligible,
    'scene', v_scene,
    'card_index', coalesce(v_phone.card_index, 0),
    'card_version', coalesce(v_phone.card_version, 0),
    'lease_version', coalesce(v_phone.lease_version, 0),
    'lease_active', v_lease_active,
    'owner_is_me', v_lease_active and v_phone.owner_user_id = p_actor_user_id,
    'lease_expires_at', case when v_lease_active then v_phone.lease_expires_at else null end,
    'can_claim', v_actor_eligible and v_within_action_window
      and coalesce(v_phone.card_index, 0) < 10
      and (not v_lease_active or v_phone.owner_user_id = p_actor_user_id),
    'can_interact', v_actor_eligible and v_within_action_window,
    'recommended_window_ended', p_now >= v_occurrence.starts_at + interval '50 minutes'
      and coalesce(v_phone.card_index, 0) < 10,
    'completed', coalesce(v_phone.card_index, 0) = 10
  );
end
$$;

revoke all on function quantum_private.continuation_day4_runtime(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;

alter function public.get_my_continuation_occurrence_content(uuid)
  rename to get_my_continuation_occurrence_content_legacy_20260906114545;
alter function public.apply_my_continuation_content_action(uuid, text, jsonb, integer, uuid)
  rename to apply_my_continuation_content_action_legacy_20260906114545;

revoke all on function public.get_my_continuation_occurrence_content_legacy_20260906114545(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.apply_my_continuation_content_action_legacy_20260906114545(uuid, text, jsonb, integer, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_my_continuation_occurrence_content(p_occurrence_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_base jsonb;
  v_program_day integer;
  v_now timestamptz;
  v_runtime jsonb;
begin
  if v_actor is null then raise exception 'not_authenticated'; end if;
  v_base := public.get_my_continuation_occurrence_content_legacy_20260906114545(p_occurrence_id);
  v_program_day := (v_base ->> 'program_day')::integer;
  v_now := (v_base ->> 'server_now')::timestamptz;

  if v_program_day = 2 then
    v_runtime := quantum_private.continuation_day2_runtime(p_occurrence_id, v_actor, v_now) - 'group_key';
    v_runtime := v_runtime || pg_catalog.jsonb_build_object('kind', 'day2');
  elsif v_program_day = 4 then
    v_runtime := quantum_private.continuation_day4_runtime(p_occurrence_id, v_actor, v_now)
      || pg_catalog.jsonb_build_object('kind', 'day4');
  else
    v_runtime := null;
  end if;

  return v_base || pg_catalog.jsonb_build_object('runtime', v_runtime);
end
$$;

revoke all on function public.get_my_continuation_occurrence_content(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_continuation_occurrence_content(uuid)
  to authenticated;

create or replace function public.apply_my_continuation_content_action(
  p_occurrence_id uuid,
  p_action text,
  p_payload jsonb,
  p_expected_content_revision integer,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_action text;
  v_occurrence public.quantum_continuation_occurrences%rowtype;
  v_attendance_status text;
  v_existing_runtime public.quantum_continuation_content_runtime_commands%rowtype;
  v_existing_legacy public.quantum_continuation_content_commands%rowtype;
  v_runtime jsonb;
  v_state public.quantum_continuation_day2_prompt_states%rowtype;
  v_phone public.quantum_continuation_day4_shared_phone%rowtype;
  v_now timestamptz;
  v_round smallint;
  v_group_key text;
  v_expected_runtime_version bigint;
  v_expected_lease_version bigint;
  v_expected_card_version bigint;
  v_card_id smallint;
  v_resulting_content_revision integer;
  v_resulting_runtime_version bigint;
  v_lease_active boolean;
begin
  v_action := pg_catalog.btrim(p_action);
  if v_actor is null then raise exception 'not_authenticated'; end if;
  if p_occurrence_id is null or p_action is null
     or pg_catalog.char_length(v_action) not between 1 and 80
     or p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or pg_catalog.octet_length(p_payload::text) > 12000
     or p_expected_content_revision is null or p_expected_content_revision < 0
     or p_idempotency_key is null then
    raise exception 'invalid_content_action';
  end if;

  select occurrence.* into v_occurrence
  from public.quantum_continuation_occurrences as occurrence
  join public.quantum_continuation_occurrence_members as member
    on member.occurrence_id = occurrence.id
   and member.participant_user_id = v_actor
   and member.attendance_status <> 'cancelled'
  where occurrence.id = p_occurrence_id;
  if v_occurrence.id is null then raise exception 'continuation_occurrence_not_found'; end if;
  select member.attendance_status into v_attendance_status
  from public.quantum_continuation_occurrence_members as member
  where member.occurrence_id = p_occurrence_id
    and member.participant_user_id = v_actor;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'continuation-runtime-command:' || v_actor::text || ':' || p_idempotency_key::text,
    0
  ));

  select command.* into v_existing_runtime
  from public.quantum_continuation_content_runtime_commands as command
  where command.actor_user_id = v_actor
    and command.idempotency_key = p_idempotency_key;
  if v_existing_runtime.actor_user_id is not null then
    if v_existing_runtime.occurrence_id <> p_occurrence_id
       or v_existing_runtime.action <> v_action
       or v_existing_runtime.payload <> p_payload
       or v_existing_runtime.prior_content_revision <> p_expected_content_revision then
      raise exception 'idempotency_key_reused';
    end if;
    return public.get_my_continuation_occurrence_content(p_occurrence_id);
  end if;

  select command.* into v_existing_legacy
  from public.quantum_continuation_content_commands as command
  where command.actor_user_id = v_actor
    and command.idempotency_key = p_idempotency_key;
  if v_existing_legacy.id is not null then
    if v_existing_legacy.occurrence_id <> p_occurrence_id
       or v_existing_legacy.action <> v_action
       or v_existing_legacy.payload <> p_payload
       or v_existing_legacy.prior_revision <> p_expected_content_revision then
      raise exception 'idempotency_key_reused';
    end if;
    return public.get_my_continuation_occurrence_content(p_occurrence_id);
  end if;

  if v_occurrence.program_day = 2
     and v_action in ('start_round', 'advance_prompt', 'finish_round') then
    raise exception 'content_runtime_action_replaced_not_allowed';
  end if;
  if v_occurrence.program_day = 4 and v_action = 'draw_card' then
    raise exception 'content_runtime_action_replaced_not_allowed';
  end if;

  if v_action = 'advance_group_prompt' then
    if v_occurrence.program_day <> 2 then raise exception 'content_action_not_allowed_for_day'; end if;
    if p_payload - 'round' - 'expected_runtime_version' <> '{}'::jsonb
       or not (p_payload ?& array['round', 'expected_runtime_version'])
       or pg_catalog.jsonb_typeof(p_payload -> 'round') <> 'number'
       or pg_catalog.jsonb_typeof(p_payload -> 'expected_runtime_version') <> 'number'
       or p_payload ->> 'round' !~ '^[1-3]$'
       or p_payload ->> 'expected_runtime_version' !~ '^[0-9]{1,18}$' then
      raise exception 'invalid_content_payload';
    end if;
    if v_attendance_status not in ('confirmed', 'present') then raise exception 'content_action_locked'; end if;

    select occurrence.* into v_occurrence
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.id = p_occurrence_id
    for update;
    select member.attendance_status into v_attendance_status
    from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id
      and member.participant_user_id = v_actor
    for share;
    v_now := pg_catalog.clock_timestamp();
    if v_attendance_status not in ('confirmed', 'present') then raise exception 'content_action_locked'; end if;
    if v_occurrence.status not in ('confirmed', 'in_progress')
       or v_now < v_occurrence.starts_at - interval '15 minutes'
       or v_now > v_occurrence.ends_at + interval '6 hours' then
      raise exception 'content_action_time_closed';
    end if;
    if v_occurrence.content_revision <> p_expected_content_revision then
      raise exception 'stale_content_revision';
    end if;

    v_runtime := quantum_private.continuation_day2_runtime(p_occurrence_id, v_actor, v_now);
    v_round := (p_payload ->> 'round')::smallint;
    v_expected_runtime_version := (p_payload ->> 'expected_runtime_version')::bigint;
    if not coalesce((v_runtime ->> 'ready')::boolean, false)
       or not coalesce((v_runtime ->> 'can_advance_prompt')::boolean, false)
       or (v_runtime ->> 'round')::smallint <> v_round
       or v_runtime ->> 'group_key' is null then
      raise exception 'content_sequence_not_ready';
    end if;
    v_group_key := v_runtime ->> 'group_key';

    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'continuation-day2-prompt:' || p_occurrence_id::text || ':' || v_round::text || ':' || v_group_key,
      0
    ));
    insert into public.quantum_continuation_day2_prompt_states(
      occurrence_id, round_no, group_key, question_index, version
    ) values (
      p_occurrence_id, v_round, v_group_key, v_round - 1, 0
    ) on conflict (occurrence_id, round_no, group_key) do nothing;

    select prompt.* into v_state
    from public.quantum_continuation_day2_prompt_states as prompt
    where prompt.occurrence_id = p_occurrence_id
      and prompt.round_no = v_round
      and prompt.group_key = v_group_key
    for update;
    if v_state.version <> v_expected_runtime_version then raise exception 'stale_runtime_version'; end if;

    update public.quantum_continuation_day2_prompt_states as prompt
    set question_index = (prompt.question_index + 1) % 6,
        version = prompt.version + 1,
        updated_at = v_now
    where prompt.occurrence_id = p_occurrence_id
      and prompt.round_no = v_round
      and prompt.group_key = v_group_key
      and prompt.version = v_expected_runtime_version
    returning prompt.* into v_state;
    if not found then raise exception 'stale_runtime_version'; end if;

    insert into public.quantum_continuation_content_runtime_commands(
      actor_user_id, idempotency_key, occurrence_id, action, payload,
      prior_content_revision, resulting_content_revision, resulting_runtime_version
    ) values (
      v_actor, p_idempotency_key, p_occurrence_id, v_action, p_payload,
      p_expected_content_revision, p_expected_content_revision, v_state.version
    );
    return public.get_my_continuation_occurrence_content(p_occurrence_id);
  end if;

  if v_action in (
    'claim_shared_phone', 'heartbeat_shared_phone', 'release_shared_phone',
    'advance_shared_phone_card'
  ) then
    if v_occurrence.program_day <> 4 then raise exception 'content_action_not_allowed_for_day'; end if;
    if v_attendance_status not in ('confirmed', 'present') then raise exception 'content_action_locked'; end if;

    if v_action in ('claim_shared_phone', 'heartbeat_shared_phone', 'release_shared_phone') then
      if p_payload - 'expected_lease_version' <> '{}'::jsonb
         or not (p_payload ? 'expected_lease_version')
         or pg_catalog.jsonb_typeof(p_payload -> 'expected_lease_version') <> 'number'
         or p_payload ->> 'expected_lease_version' !~ '^[0-9]{1,18}$' then
        raise exception 'invalid_content_payload';
      end if;
    else
      if p_payload - 'expected_lease_version' - 'expected_card_version' - 'card_id' <> '{}'::jsonb
         or not (p_payload ?& array['expected_lease_version', 'expected_card_version', 'card_id'])
         or pg_catalog.jsonb_typeof(p_payload -> 'expected_lease_version') <> 'number'
         or pg_catalog.jsonb_typeof(p_payload -> 'expected_card_version') <> 'number'
         or pg_catalog.jsonb_typeof(p_payload -> 'card_id') <> 'number'
         or p_payload ->> 'expected_lease_version' !~ '^[0-9]{1,18}$'
         or p_payload ->> 'expected_card_version' !~ '^[0-9]{1,18}$'
         or p_payload ->> 'card_id' !~ '^(10|[1-9])$' then
        raise exception 'invalid_content_payload';
      end if;
    end if;

    v_expected_lease_version := (p_payload ->> 'expected_lease_version')::bigint;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'continuation-day4-phone:' || p_occurrence_id::text,
      0
    ));

    if v_action = 'advance_shared_phone_card' then
      select occurrence.* into v_occurrence
      from public.quantum_continuation_occurrences as occurrence
      where occurrence.id = p_occurrence_id
      for update;
    else
      select occurrence.* into v_occurrence
      from public.quantum_continuation_occurrences as occurrence
      where occurrence.id = p_occurrence_id;
    end if;
    select member.attendance_status into v_attendance_status
    from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id
      and member.participant_user_id = v_actor
    for share;
    v_now := pg_catalog.clock_timestamp();
    if v_attendance_status not in ('confirmed', 'present') then raise exception 'content_action_locked'; end if;
    if v_occurrence.status not in ('confirmed', 'in_progress')
       or v_now < v_occurrence.starts_at + interval '30 minutes'
       or v_now > v_occurrence.ends_at + interval '6 hours' then
      raise exception 'content_action_time_closed';
    end if;

    select phone.* into v_phone
    from public.quantum_continuation_day4_shared_phone as phone
    where phone.occurrence_id = p_occurrence_id
    for update;
    if coalesce(v_phone.lease_version, 0) <> v_expected_lease_version then
      raise exception 'stale_lease_version';
    end if;
    v_lease_active := v_phone.owner_user_id is not null
      and v_phone.released_at is null
      and v_phone.lease_expires_at > v_now;

    if v_action = 'claim_shared_phone' then
      if coalesce(v_phone.card_index, 0) >= 10 then raise exception 'content_sequence_not_ready'; end if;
      if v_lease_active and v_phone.owner_user_id <> v_actor then
        raise exception 'content_runtime_device_locked';
      end if;
      if v_phone.occurrence_id is null then
        insert into public.quantum_continuation_day4_shared_phone(
          occurrence_id, owner_user_id, card_index, lease_version, card_version,
          claimed_at, last_heartbeat_at, lease_expires_at, released_at, updated_at
        ) values (
          p_occurrence_id, v_actor, 0, 1, 0,
          v_now, v_now, v_now + interval '45 seconds', null, v_now
        ) returning * into v_phone;
      elsif v_lease_active and v_phone.owner_user_id = v_actor then
        update public.quantum_continuation_day4_shared_phone as phone
        set last_heartbeat_at = v_now,
            lease_expires_at = v_now + interval '45 seconds',
            updated_at = v_now
        where phone.occurrence_id = p_occurrence_id
        returning phone.* into v_phone;
      else
        update public.quantum_continuation_day4_shared_phone as phone
        set owner_user_id = v_actor,
            lease_version = phone.lease_version + 1,
            claimed_at = v_now,
            last_heartbeat_at = v_now,
            lease_expires_at = v_now + interval '45 seconds',
            released_at = null,
            updated_at = v_now
        where phone.occurrence_id = p_occurrence_id
        returning phone.* into v_phone;
      end if;
      v_resulting_runtime_version := v_phone.lease_version;
      v_resulting_content_revision := p_expected_content_revision;
    elsif not v_lease_active or v_phone.owner_user_id <> v_actor then
      raise exception 'content_runtime_device_locked';
    elsif v_action = 'heartbeat_shared_phone' then
      update public.quantum_continuation_day4_shared_phone as phone
      set last_heartbeat_at = v_now,
          lease_expires_at = v_now + interval '45 seconds',
          updated_at = v_now
      where phone.occurrence_id = p_occurrence_id
      returning phone.* into v_phone;
      v_resulting_runtime_version := v_phone.lease_version;
      v_resulting_content_revision := p_expected_content_revision;
    elsif v_action = 'release_shared_phone' then
      update public.quantum_continuation_day4_shared_phone as phone
      set owner_user_id = null,
          lease_version = phone.lease_version + 1,
          lease_expires_at = null,
          released_at = v_now,
          updated_at = v_now
      where phone.occurrence_id = p_occurrence_id
      returning phone.* into v_phone;
      v_resulting_runtime_version := v_phone.lease_version;
      v_resulting_content_revision := p_expected_content_revision;
    else
      v_expected_card_version := (p_payload ->> 'expected_card_version')::bigint;
      v_card_id := (p_payload ->> 'card_id')::smallint;
      if v_occurrence.content_revision <> p_expected_content_revision then
        raise exception 'stale_content_revision';
      end if;
      if v_phone.card_version <> v_expected_card_version then raise exception 'stale_card_version'; end if;
      if v_phone.card_index >= 10 or v_card_id <> v_phone.card_index + 1 then
        raise exception 'invalid_shared_phone_card';
      end if;

      update public.quantum_continuation_day4_shared_phone as phone
      set card_index = v_card_id,
          card_version = phone.card_version + 1,
          last_heartbeat_at = v_now,
          lease_expires_at = v_now + interval '45 seconds',
          updated_at = v_now
      where phone.occurrence_id = p_occurrence_id
        and phone.lease_version = v_expected_lease_version
        and phone.card_version = v_expected_card_version
      returning phone.* into v_phone;
      if not found then raise exception 'stale_card_version'; end if;

      update public.quantum_continuation_occurrences as occurrence
      set content_state = occurrence.content_state || pg_catalog.jsonb_build_object(
            'drawn_card_count', v_phone.card_index,
            'last_card_id', v_phone.card_index::text,
            'last_action', v_action,
            'last_payload', p_payload,
            'last_actor_alias', (
              select member.alias
              from public.quantum_continuation_occurrence_members as member
              where member.occurrence_id = p_occurrence_id
                and member.participant_user_id = v_actor
            ),
            'completed', false
          ),
          content_revision = occurrence.content_revision + 1,
          status = 'in_progress',
          revision = occurrence.revision + 1,
          updated_at = v_now
      where occurrence.id = p_occurrence_id
        and occurrence.content_revision = p_expected_content_revision;
      if not found then raise exception 'stale_content_revision'; end if;

      insert into public.quantum_continuation_content_commands(
        occurrence_id, actor_user_id, action, payload, prior_revision,
        resulting_revision, idempotency_key
      ) values (
        p_occurrence_id, v_actor, v_action, p_payload, p_expected_content_revision,
        p_expected_content_revision + 1, p_idempotency_key
      );
      v_resulting_runtime_version := v_phone.card_version;
      v_resulting_content_revision := p_expected_content_revision + 1;
    end if;

    insert into public.quantum_continuation_content_runtime_commands(
      actor_user_id, idempotency_key, occurrence_id, action, payload,
      prior_content_revision, resulting_content_revision, resulting_runtime_version
    ) values (
      v_actor, p_idempotency_key, p_occurrence_id, v_action, p_payload,
      p_expected_content_revision, v_resulting_content_revision, v_resulting_runtime_version
    );
    return public.get_my_continuation_occurrence_content(p_occurrence_id);
  end if;

  if v_occurrence.program_day = 2 and v_action = 'finish_occurrence' then
    if v_attendance_status not in ('confirmed', 'present') then raise exception 'content_action_locked'; end if;
    select occurrence.* into v_occurrence
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.id = p_occurrence_id
    for update;
    select member.attendance_status into v_attendance_status
    from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id
      and member.participant_user_id = v_actor
    for share;
    if v_attendance_status not in ('confirmed', 'present') then raise exception 'content_action_locked'; end if;
    v_runtime := quantum_private.continuation_day2_runtime(
      p_occurrence_id,
      v_actor,
      pg_catalog.clock_timestamp()
    );
    if not coalesce((v_runtime ->> 'ready')::boolean, false)
       or not coalesce((v_runtime ->> 'can_finish')::boolean, false) then
      raise exception 'content_sequence_not_ready';
    end if;
    update public.quantum_continuation_occurrences as occurrence
    set content_state = occurrence.content_state || pg_catalog.jsonb_build_object(
      'conversation_round', 3,
      'round_active', false,
      'round_duration_minutes', 30
    )
    where occurrence.id = p_occurrence_id;
    return public.apply_my_continuation_content_action_legacy_20260906114545(
      p_occurrence_id, v_action, p_payload, p_expected_content_revision, p_idempotency_key
    );
  end if;

  if v_occurrence.program_day = 4 and v_action = 'finish_occurrence' then
    if v_attendance_status not in ('confirmed', 'present') then raise exception 'content_action_locked'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'continuation-day4-phone:' || p_occurrence_id::text,
      0
    ));
    select occurrence.* into v_occurrence
    from public.quantum_continuation_occurrences as occurrence
    where occurrence.id = p_occurrence_id
    for update;
    select member.attendance_status into v_attendance_status
    from public.quantum_continuation_occurrence_members as member
    where member.occurrence_id = p_occurrence_id
      and member.participant_user_id = v_actor
    for share;
    if v_attendance_status not in ('confirmed', 'present') then raise exception 'content_action_locked'; end if;
    select phone.* into v_phone
    from public.quantum_continuation_day4_shared_phone as phone
    where phone.occurrence_id = p_occurrence_id
    for update;
    if v_phone.occurrence_id is null or v_phone.card_index <> 10 then
      raise exception 'content_sequence_not_ready';
    end if;
    return public.apply_my_continuation_content_action_legacy_20260906114545(
      p_occurrence_id, v_action, p_payload, p_expected_content_revision, p_idempotency_key
    );
  end if;

  if v_action in (
    'advance_group_prompt', 'claim_shared_phone', 'heartbeat_shared_phone',
    'release_shared_phone', 'advance_shared_phone_card'
  ) then
    raise exception 'content_action_not_allowed_for_day';
  end if;

  return public.apply_my_continuation_content_action_legacy_20260906114545(
    p_occurrence_id, v_action, p_payload, p_expected_content_revision, p_idempotency_key
  );
end
$$;

revoke all on function public.apply_my_continuation_content_action(uuid, text, jsonb, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_my_continuation_content_action(uuid, text, jsonb, integer, uuid)
  to authenticated;
