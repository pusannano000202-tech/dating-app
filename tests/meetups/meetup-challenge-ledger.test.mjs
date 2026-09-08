import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

// Embedded PostgreSQL compatibility fixture. This executes the real G7/G8
// draft and RPC branches, but is not live Supabase/RLS or multi-connection proof.
async function setup() {
  const db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema quantum_private;

    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    create table auth.users (
      id uuid primary key,
      deleted_at timestamptz,
      banned_until timestamptz
    );
    create table public.users (
      id uuid primary key references auth.users(id)
    );
    create table public.friendships (
      user_id uuid not null references public.users(id),
      friend_user_id uuid not null references public.users(id),
      status text not null,
      primary key (user_id, friend_user_id)
    );
    create table quantum_private.community_member_profiles (
      user_id uuid primary key references public.users(id),
      school_scope text,
      department text,
      community_gender text,
      display_name text
    );

    create table public.activity_meetups (
      id uuid primary key default gen_random_uuid(),
      host_user_id uuid not null references public.users(id),
      school text not null,
      category text not null check (category in (
        'baseball', 'soccer', 'basketball', 'badminton', 'tennis',
        'running', 'board_game', 'gaming', 'hiking', 'walking',
        'dining', 'study', 'other'
      )),
      title text not null check (char_length(title) between 4 and 60),
      description text not null default '' check (char_length(description) <= 500),
      place_name text not null check (char_length(place_name) between 2 and 80),
      scheduled_at timestamptz not null,
      capacity smallint not null check (capacity between 2 and 20),
      status text not null default 'open' check (status in ('open', 'full', 'completed', 'cancelled')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      gender_mode text not null default 'all' check (gender_mode in ('all', 'male_only', 'female_only'))
    );
    create table public.activity_meetup_members (
      meetup_id uuid not null references public.activity_meetups(id),
      user_id uuid not null references public.users(id),
      role text not null check (role in ('host', 'member')),
      status text not null default 'joined' check (status in ('joined', 'left')),
      joined_at timestamptz not null default now(),
      left_at timestamptz,
      primary key (meetup_id, user_id)
    );

    create function quantum_private.get_community_identity(p_user_id uuid)
    returns table (school text, display_name text)
    language sql stable security definer set search_path = '' as $$
      select '부산대학교'::text, profile.display_name
      from quantum_private.community_member_profiles as profile
      where profile.user_id = p_user_id
    $$;

    create function quantum_private.get_member_department_identity(p_user_id uuid)
    returns table (school_scope_key text, department_key text)
    language sql stable security definer set search_path = '' as $$
      select
        lower(regexp_replace(btrim(profile.school_scope), '[[:space:]]+', '', 'g')),
        lower(regexp_replace(btrim(profile.department), '[[:space:]]+', '', 'g'))
      from quantum_private.community_member_profiles as profile
      where profile.user_id = p_user_id
        and profile.school_scope = 'pnu_self_selected'
        and char_length(btrim(profile.department)) between 1 and 120
    $$;

    create function quantum_private.meetup_gender_eligibility(p_user_id uuid, p_mode text)
    returns text language sql stable security definer set search_path = '' as $$
      select case
        when p_mode = 'all' then 'eligible'
        when profile.community_gender is null or profile.community_gender not in ('male', 'female') then 'gender_required'
        when (p_mode = 'male_only' and profile.community_gender = 'male')
          or (p_mode = 'female_only' and profile.community_gender = 'female') then 'eligible'
        else 'gender_restricted'
      end
      from (select 1) as singleton
      left join quantum_private.community_member_profiles as profile on profile.user_id = p_user_id
    $$;

    create function public.create_activity_meetup_v2(
      p_category text,
      p_title text,
      p_description text,
      p_place_name text,
      p_scheduled_at timestamptz,
      p_capacity integer,
      p_gender_mode text
    ) returns jsonb language plpgsql security definer set search_path = '' as $$
    declare
      v_actor uuid := auth.uid();
      v_school text;
      v_meetup public.activity_meetups%rowtype;
    begin
      if v_actor is null then raise exception 'authentication_required'; end if;
      select identity.school into v_school
      from quantum_private.get_community_identity(v_actor) as identity;
      if v_school is null then raise exception 'profile_required'; end if;
      if p_category is null or p_category not in (
        'baseball', 'soccer', 'basketball', 'badminton', 'tennis',
        'running', 'board_game', 'gaming', 'hiking', 'walking',
        'dining', 'study', 'other'
      ) then raise exception 'invalid_category'; end if;
      if char_length(btrim(coalesce(p_title, ''))) not between 4 and 60
        or char_length(btrim(coalesce(p_description, ''))) > 500
        or char_length(btrim(coalesce(p_place_name, ''))) not between 2 and 80
        or p_capacity is null or p_capacity not between 2 and 20
        or p_scheduled_at is null or p_scheduled_at < now() + interval '30 minutes'
        or p_gender_mode not in ('all', 'male_only', 'female_only') then
        raise exception 'invalid_meetup_input';
      end if;
      if quantum_private.meetup_gender_eligibility(v_actor, p_gender_mode) <> 'eligible' then
        raise exception 'meetup_gender_restricted';
      end if;
      insert into public.activity_meetups (
        host_user_id, school, category, title, description, place_name,
        scheduled_at, capacity, gender_mode
      ) values (
        v_actor, v_school, p_category, btrim(p_title), btrim(coalesce(p_description, '')),
        btrim(p_place_name), p_scheduled_at, p_capacity, p_gender_mode
      ) returning * into v_meetup;
      insert into public.activity_meetup_members (meetup_id, user_id, role)
      values (v_meetup.id, v_actor, 'host');
      return jsonb_build_object(
        'id', v_meetup.id, 'status', v_meetup.status, 'joined', true,
        'is_host', true, 'gender_mode', v_meetup.gender_mode
      );
    end
    $$;
  `)

  const draft = await readFile(
    new URL('../../docs/implementation/community-voice/g7-g8-schema.sql', import.meta.url),
    'utf8',
  )
  await db.exec(draft)

  const users = {
    mechanicalCaptain: randomUUID(),
    mechanicalMember: randomUUID(),
    computerCaptain: randomUUID(),
    mechanicalReserve: randomUUID(),
    otherSchool: randomUUID(),
  }
  const profiles = [
    [users.mechanicalCaptain, 'pnu_self_selected', '기계 공학과', 'female', '기계 주장'],
    [users.mechanicalMember, 'pnu_self_selected', '기계공학과', 'male', '기계 참가자'],
    [users.computerCaptain, 'pnu_self_selected', '컴퓨터 공학과', 'male', '컴퓨터 주장'],
    [users.mechanicalReserve, 'pnu_self_selected', '기계 공학과', 'male', '기계 후보'],
    [users.otherSchool, 'other_school', '기계 공학과', 'female', '타교 참가자'],
  ]
  for (const [id, schoolScope, department, gender, displayName] of profiles) {
    await db.query('insert into auth.users(id) values ($1)', [id])
    await db.query('insert into public.users(id) values ($1)', [id])
    await db.query(
      `insert into quantum_private.community_member_profiles
        (user_id, school_scope, department, community_gender, display_name)
       values ($1, $2, $3, $4, $5)`,
      [id, schoolScope, department, gender, displayName],
    )
  }

  async function as(user) {
    await db.query(
      `select set_config('request.jwt.claim.sub', $1, false),
              set_config('request.jwt.claim.role', 'authenticated', false)`,
      [user],
    )
  }

  async function value(sql, params = []) {
    return (await db.query(sql, params)).rows[0].value
  }

  return {db, users, as, value}
}

test('G7 meetup ledger executes create/detail/join and keeps personal guide state separate from shared revision', async () => {
  const fixture = await setup()
  try {
    const {as, value, users, db} = fixture
    const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
    const endsAt = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
    const createKey = randomUUID()

    await as(users.mechanicalCaptain)
    const createArgs = [
      'board_game', '학과 보드게임 모임', '처음 온 사람도 함께해요', '학생회관 라운지',
      startsAt, 4, 'all', endsAt, 'department', 'board-game-round', createKey,
    ]
    const created = await value(
      `select public.create_activity_meetup_v3(
        $1,$2,$3,$4,$5::timestamptz,$6,$7,$8::timestamptz,$9,$10,$11::uuid
      ) as value`,
      createArgs,
    )
    assert.equal(created.revision, 0)
    assert.equal(created.scope_type, 'department')
    assert.deepEqual(
      await value(
        `select public.create_activity_meetup_v3(
          $1,$2,$3,$4,$5::timestamptz,$6,$7,$8::timestamptz,$9,$10,$11::uuid
        ) as value`,
        createArgs,
      ),
      created,
    )

    const hostDetail = await value(
      'select public.get_my_activity_meetup_detail($1::uuid) as value',
      [created.id],
    )
    assert.equal(hostDetail.joined, true)
    assert.equal(hostDetail.member_count, 1)

    await as(users.mechanicalMember)
    const joined = await value('select public.join_activity_meetup($1::uuid) as value', [created.id])
    assert.equal(joined.revision, 1)
    assert.equal(joined.member_count, 2)

    await as(users.computerCaptain)
    await assert.rejects(
      () => value('select public.join_activity_meetup($1::uuid) as value', [created.id]),
      /meetup_not_found/,
    )

    await as(users.mechanicalMember)
    const guideBefore = await value(
      'select public.get_my_activity_meetup_guide($1::uuid) as value',
      [created.id],
    )
    assert.equal(guideBefore.shared_step, null)
    assert.equal(guideBefore.personal_revision, 0)
    assert.equal(guideBefore.meetup_revision, 1)

    const ackKey = randomUUID()
    const acknowledged = await value(
      'select public.acknowledge_my_activity_meetup_guide($1::uuid,$2,$3,$4::uuid) as value',
      [created.id, 'prepare', 0, ackKey],
    )
    assert.equal(acknowledged.personal_revision, 1)
    assert.equal(acknowledged.reused, false)
    assert.equal(
      (await value(
        'select public.get_my_activity_meetup_detail($1::uuid) as value',
        [created.id],
      )).revision,
      1,
      'personal acknowledgement must not advance the shared meetup revision',
    )

    await as(users.mechanicalCaptain)
    const advanced = await value(
      'select public.advance_my_activity_meetup_shared_guide($1::uuid,$2,$3,$4::uuid) as value',
      [created.id, 'gather', 1, randomUUID()],
    )
    assert.equal(advanced.shared_step, 'gather')
    assert.equal(advanced.revision, 2)

    await as(users.mechanicalMember)
    const guideAfter = await value(
      'select public.get_my_activity_meetup_guide($1::uuid) as value',
      [created.id],
    )
    assert.equal(guideAfter.shared_step, 'gather')
    assert.equal(guideAfter.personal_acknowledged_step, 'prepare')
    assert.equal(guideAfter.personal_revision, 1)
    assert.equal(guideAfter.meetup_revision, 2)

    await as(users.mechanicalCaptain)
    const cancelled = await value(
      'select public.cancel_my_activity_meetup($1::uuid,$2,$3,$4::uuid) as value',
      [created.id, '우천으로 취소', 2, randomUUID()],
    )
    assert.equal(cancelled.status, 'cancelled')
    assert.equal(cancelled.revision, 3)

    await as(users.mechanicalMember)
    const cancelledGuide = await value(
      'select public.get_my_activity_meetup_guide($1::uuid) as value',
      [created.id],
    )
    assert.equal(cancelledGuide.lifecycle_status, 'cancelled')
    await assert.rejects(
      () => value(
        'select public.acknowledge_my_activity_meetup_guide($1::uuid,$2,$3,$4::uuid) as value',
        [created.id, 'gather', 1, randomUUID()],
      ),
      /meetup_closed/,
    )

    const counts = await db.query(
      `select
        (select count(*)::integer from public.activity_meetups) as meetups,
        (select count(*)::integer from public.activity_meetup_events) as events,
        (select count(*)::integer from public.activity_meetup_guide_progress) as personal_progress`,
    )
    assert.deepEqual(counts.rows[0], {meetups: 1, events: 4, personal_progress: 1})
  } finally {
    await fixture.db.close()
  }
})

test('G8 challenge ledger requires opponent and roster acceptance, exact bilateral schedule, and two mirrored results', async () => {
  const fixture = await setup()
  try {
    const {as, value, users, db} = fixture

    await as(users.mechanicalCaptain)
    const created = await value(
      'select public.create_department_challenge($1,$2,$3,$4,$5::uuid) as value',
      ['soccer', '학과 축구 친선전', '안전하게 경기하고 결과는 양쪽 주장이 확인해요.', 4, randomUUID()],
    )
    assert.equal(created.status, 'recruiting')
    assert.equal(created.revision, 0)
    const challenger = created.teams.find((team) => team.side === 'challenger')
    assert.ok(challenger?.id)

    await as(users.computerCaptain)
    const acceptedOpponent = await value(
      'select public.accept_department_challenge_opponent($1::uuid,$2,$3::uuid) as value',
      [created.id, 0, randomUUID()],
    )
    assert.equal(acceptedOpponent.status, 'opponent_pending')
    assert.equal(acceptedOpponent.revision, 1)
    const opponent = acceptedOpponent.teams.find((team) => team.side === 'opponent')
    assert.ok(opponent?.id)

    await as(users.mechanicalReserve)
    const requested = await value(
      'select public.request_department_challenge_roster($1::uuid,$2::uuid,$3,$4::uuid) as value',
      [created.id, challenger.id, 1, randomUUID()],
    )
    assert.equal(requested.status, 'requested')
    assert.equal(requested.revision, 2)

    await as(users.mechanicalCaptain)
    await db.query(
      'update quantum_private.community_member_profiles set department = $1 where user_id = $2',
      ['전자공학과', users.mechanicalCaptain],
    )
    await assert.rejects(
      () => value(
        'select public.accept_department_challenge_roster_request($1::uuid,$2::uuid,$3,$4::uuid) as value',
        [created.id, requested.roster_id, 2, randomUUID()],
      ),
      /department_identity_changed/,
    )
    await db.query(
      'update quantum_private.community_member_profiles set department = $1 where user_id = $2',
      ['기계 공학과', users.mechanicalCaptain],
    )
    const acceptedRoster = await value(
      'select public.accept_department_challenge_roster_request($1::uuid,$2::uuid,$3,$4::uuid) as value',
      [created.id, requested.roster_id, 2, randomUUID()],
    )
    assert.equal(acceptedRoster.status, 'accepted')
    assert.equal(acceptedRoster.revision, 3)

    const scheduledAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
    const endsAt = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
    const scheduleArgs = [created.id, scheduledAt, endsAt, '대운동장']
    await db.query(
      'update quantum_private.community_member_profiles set department = $1 where user_id = $2',
      ['전자공학과', users.mechanicalCaptain],
    )
    await assert.rejects(
      () => value(
        `select public.confirm_my_department_challenge_schedule(
          $1::uuid,$2::timestamptz,$3::timestamptz,$4,$5,$6::uuid
        ) as value`,
        [...scheduleArgs, 3, randomUUID()],
      ),
      /department_identity_changed/,
    )
    await db.query(
      'update quantum_private.community_member_profiles set department = $1 where user_id = $2',
      ['기계 공학과', users.mechanicalCaptain],
    )
    const firstSchedule = await value(
      `select public.confirm_my_department_challenge_schedule(
        $1::uuid,$2::timestamptz,$3::timestamptz,$4,$5,$6::uuid
      ) as value`,
      [...scheduleArgs, 3, randomUUID()],
    )
    assert.equal(firstSchedule.published, false)
    assert.equal(firstSchedule.revision, 4)

    await as(users.computerCaptain)
    const secondSchedule = await value(
      `select public.confirm_my_department_challenge_schedule(
        $1::uuid,$2::timestamptz,$3::timestamptz,$4,$5,$6::uuid
      ) as value`,
      [...scheduleArgs, 4, randomUUID()],
    )
    assert.equal(secondSchedule.published, true)
    assert.equal(secondSchedule.status, 'scheduled')
    assert.equal(secondSchedule.revision, 5)

    // Advance only the fixture clock state; the production RPC correctly rejects
    // result submission before ends_at.
    await db.query(
      `update public.department_challenges
       set scheduled_at = clock_timestamp() - interval '2 hours',
           ends_at = clock_timestamp() - interval '1 hour'
       where id = $1`,
      [created.id],
    )

    await as(users.mechanicalCaptain)
    const firstResult = await value(
      'select public.confirm_my_department_challenge_result($1::uuid,$2,$3,$4,$5::uuid) as value',
      [created.id, 3, 1, 5, randomUUID()],
    )
    assert.equal(firstResult.published, false)
    assert.equal(firstResult.status, 'result_pending')
    assert.equal(firstResult.result, null)
    assert.equal(firstResult.revision, 6)

    await as(users.computerCaptain)
    const secondResult = await value(
      'select public.confirm_my_department_challenge_result($1::uuid,$2,$3,$4,$5::uuid) as value',
      [created.id, 1, 3, 6, randomUUID()],
    )
    assert.equal(secondResult.published, true)
    assert.equal(secondResult.status, 'completed')
    assert.deepEqual(secondResult.result, {first_score: 3, second_score: 1})
    assert.equal(secondResult.revision, 7)

    const final = await value(
      'select public.get_my_department_challenge($1::uuid) as value',
      [created.id],
    )
    assert.equal(final.status, 'completed')
    assert.deepEqual(final.result, {first_score: 3, second_score: 1})
    assert.equal(final.teams.length, 2)

    const persisted = await db.query(
      `select status, first_score, second_score,
        (select count(*)::integer from public.department_challenge_result_confirmations where challenge_id = $1) as confirmations
       from public.department_challenges where id = $1`,
      [created.id],
    )
    assert.deepEqual(persisted.rows[0], {
      status: 'completed', first_score: 3, second_score: 1, confirmations: 2,
    })

    await as(users.mechanicalCaptain)
    const cancellable = await value(
      'select public.create_department_challenge($1,$2,$3,$4,$5::uuid) as value',
      ['gaming', '학과 게임 친선전', '팀이 모두 동의한 뒤 시작해요.', 3, randomUUID()],
    )
    const cancelled = await value(
      'select public.cancel_my_department_challenge($1::uuid,$2,$3,$4::uuid) as value',
      [cancellable.id, '일정 재조정', 0, randomUUID()],
    )
    assert.equal(cancelled.status, 'cancelled')
    assert.equal(cancelled.revision, 1)
  } finally {
    await fixture.db.close()
  }
})

test('G7/G8 direct tables stay closed and only authenticated RPCs are callable', async () => {
  const fixture = await setup()
  try {
    const privileges = await fixture.db.query(`
      select
        has_table_privilege('authenticated', 'public.activity_meetup_events', 'SELECT') as meetup_table_exposed,
        has_table_privilege('service_role', 'public.department_challenges', 'SELECT') as challenge_table_exposed,
        has_function_privilege(
          'authenticated',
          'public.create_activity_meetup_v3(text,text,text,text,timestamptz,integer,text,timestamptz,text,text,uuid)',
          'EXECUTE'
        ) as authenticated_rpc,
        has_function_privilege(
          'anon',
          'public.create_department_challenge(text,text,text,integer,uuid)',
          'EXECUTE'
        ) as anon_rpc
    `)
    assert.deepEqual(privileges.rows[0], {
      meetup_table_exposed: false,
      challenge_table_exposed: false,
      authenticated_rpc: true,
      anon_rpc: false,
    })
  } finally {
    await fixture.db.close()
  }
})
