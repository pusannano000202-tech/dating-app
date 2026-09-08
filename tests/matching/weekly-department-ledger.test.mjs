import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

// Embedded PostgreSQL with explicit legacy/auth fixtures. This executes the
// G3/G4 draft and its PL/pgSQL branches, but is not live Supabase/RLS or
// multi-connection race proof.
async function setup() {
  const db = new PGlite()
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema quantum_private;
    create schema private;

    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
    $$;

    create table public.users (id uuid primary key);
    create table public.fixture_super_admins (user_id uuid primary key references public.users(id));
    create function public.is_super_admin(p_user_id uuid)
    returns boolean language sql stable security definer set search_path = '' as $$
      select exists (select 1 from public.fixture_super_admins where user_id = p_user_id)
    $$;
    create function quantum_private.require_recent_super_admin_auth(p_user_id uuid)
    returns void language plpgsql stable security definer set search_path = '' as $$
    begin
      if not public.is_super_admin(p_user_id) then raise exception 'recent_super_admin_auth_required'; end if;
    end
    $$;

    create table quantum_private.community_member_profiles (
      user_id uuid primary key references public.users(id),
      school_scope text,
      department text,
      community_gender text,
      display_name text
    );
    create function quantum_private.resolve_profile_readiness(p_user_id uuid)
    returns table (minimum_signup_complete boolean)
    language sql stable security definer set search_path = '' as $$
      select exists (
        select 1 from quantum_private.community_member_profiles
        where user_id = p_user_id and school_scope is not null and department is not null
      )
    $$;

    create table public.tonight_rounds (
      id uuid primary key,
      market_code text not null
    );
    create table public.tonight_market_memberships (
      market_code text not null,
      user_id uuid not null references public.users(id),
      revoked_at timestamptz,
      primary key (market_code, user_id)
    );
    create table public.tonight_applications (
      id uuid primary key,
      round_id uuid not null references public.tonight_rounds(id),
      user_id uuid not null references public.users(id),
      bundle_id uuid not null,
      status text not null
    );
    create table quantum_private.tonight_applicant_features (
      application_id uuid primary key references public.tonight_applications(id),
      user_id uuid not null references public.users(id)
    );

    create function public.service_get_tonight_allocator_input(p_round_id uuid)
    returns jsonb language sql stable security definer set search_path = '' as $$
      select jsonb_build_object(
        'round_id', p_round_id,
        'applications', coalesce(jsonb_agg(jsonb_build_object(
          'application_id', application_row.id,
          'bundle_id', application_row.bundle_id
        ) order by application_row.id), '[]'::jsonb)
      )
      from public.tonight_applications as application_row
      where application_row.round_id = p_round_id
        and application_row.status in ('submitted', 'waitlisted')
    $$;
    create table public.fixture_tonight_publish_calls (
      actor_kind text not null,
      round_id uuid not null,
      assignments jsonb not null
    );
    create function public.service_publish_tonight_allocation(
      p_round_id uuid, p_expected_revision integer,
      p_team_assignments jsonb, p_idempotency_key text
    ) returns jsonb language plpgsql security definer set search_path = '' as $$
    begin
      insert into public.fixture_tonight_publish_calls values ('service', p_round_id, p_team_assignments);
      return jsonb_build_object('published', true, 'expected_revision', p_expected_revision, 'key', p_idempotency_key);
    end
    $$;
    create function public.super_admin_publish_tonight_allocation(
      p_round_id uuid, p_expected_revision integer,
      p_team_assignments jsonb, p_idempotency_key text
    ) returns jsonb language plpgsql security definer set search_path = '' as $$
    begin
      insert into public.fixture_tonight_publish_calls values ('super_admin', p_round_id, p_team_assignments);
      return jsonb_build_object('published', true, 'expected_revision', p_expected_revision, 'key', p_idempotency_key);
    end
    $$;

    create table public.quantum_weekly_activity_windows (
      id uuid primary key,
      week_key date not null,
      activity_id uuid not null,
      starts_at timestamptz not null,
      ends_at timestamptz not null,
      application_closes_at timestamptz not null,
      location_name text not null,
      capacity integer not null,
      status text not null,
      revision integer not null default 0,
      updated_at timestamptz not null default current_timestamp
    );
    create table public.quantum_weekly_applications (
      id uuid primary key,
      user_id uuid not null references public.users(id),
      activity_id uuid not null,
      week_key date not null,
      status text not null,
      party_type text not null default 'solo',
      party_size integer not null,
      revision integer not null default 0,
      assigned_window_id uuid,
      assigned_occurrence_id uuid,
      assignment_idempotency_key uuid
    );
    create table public.quantum_weekly_application_candidates (
      application_id uuid not null references public.quantum_weekly_applications(id),
      window_id uuid not null references public.quantum_weekly_activity_windows(id),
      primary key (application_id, window_id)
    );
    create table public.quantum_weekly_application_members (
      application_id uuid not null references public.quantum_weekly_applications(id),
      participant_user_id uuid not null references public.users(id),
      gender_snapshot text not null,
      school_snapshot text not null default '부산대학교',
      consent_status text not null,
      lifecycle_status text not null,
      revision integer not null default 0,
      updated_at timestamptz not null default current_timestamp,
      primary key (application_id, participant_user_id)
    );
    create table public.quantum_event_occurrences (
      id uuid primary key,
      event_id uuid not null,
      event_mode text not null,
      starts_at timestamptz not null,
      ends_at timestamptz not null,
      application_closes_at timestamptz not null,
      location_name text not null,
      male_capacity integer not null,
      female_capacity integer not null,
      required_total integer not null,
      status text not null,
      room_number integer not null,
      room_code text not null,
      roster_revision integer not null default 0,
      updated_at timestamptz not null default current_timestamp
    );
    create table public.quantum_event_participations (
      user_id uuid primary key references public.users(id),
      event_id uuid not null,
      event_mode text not null,
      party_type text not null,
      group_id uuid,
      occurrence_id uuid not null references public.quantum_event_occurrences(id),
      status text not null
    );

    create function public.get_my_weekly_activity_discovery_v2(p_week_key date)
    returns jsonb language sql stable security definer set search_path = '' as $$
      select jsonb_build_object(
        'week_key', p_week_key,
        'windows', coalesce(jsonb_agg(jsonb_build_object(
          'id', activity_window.id,
          'assigned_count', (
            select count(*) from public.quantum_weekly_application_members as member
            join public.quantum_weekly_applications as application_row
              on application_row.id = member.application_id
            where application_row.assigned_window_id = activity_window.id
              and application_row.status = 'assigned'
              and member.lifecycle_status = 'assigned'
          )
        ) order by activity_window.id), '[]'::jsonb)
      )
      from public.quantum_weekly_activity_windows as activity_window
      where activity_window.week_key = p_week_key
    $$;

    create function private.quantum_event_room_people(p_occurrence_id uuid)
    returns table (participant_user_id uuid, gender text, school text)
    language sql stable set search_path = '' as $$
      select participation.user_id, profile.community_gender, '부산대학교'::text
      from public.quantum_event_participations as participation
      join quantum_private.community_member_profiles as profile
        on profile.user_id = participation.user_id
      where participation.occurrence_id = p_occurrence_id
        and participation.status in ('recruiting', 'confirmed')
    $$;

    create function public.assign_weekly_party_for_service(
      p_application_id uuid,
      p_window_id uuid,
      p_occurrence_id uuid,
      p_expected_revision integer,
      p_idempotency_key uuid
    ) returns jsonb language plpgsql security definer set search_path = '' as $$
    declare
      v_application public.quantum_weekly_applications%rowtype;
      v_window public.quantum_weekly_activity_windows%rowtype;
      v_injected_application_id uuid;
    begin
      if (select auth.role()) is distinct from 'service_role' then raise exception 'service_role_required'; end if;
      select application_row.* into v_application
      from public.quantum_weekly_applications as application_row
      where application_row.id = p_application_id for update;
      select activity_window.* into v_window
      from public.quantum_weekly_activity_windows as activity_window
      where activity_window.id = p_window_id for update;
      if v_application.id is null or v_window.id is null
         or v_application.status <> 'active' or v_application.revision <> p_expected_revision
         or not exists (
           select 1 from public.quantum_weekly_application_candidates
           where application_id = p_application_id and window_id = p_window_id
         ) then raise exception 'stale_assignment'; end if;

      v_injected_application_id := nullif(current_setting('test.inject_weekly_conflict_application', true), '')::uuid;
      if v_injected_application_id is not null then
        update public.quantum_weekly_applications
        set status = 'assigned', assigned_window_id = p_window_id,
            assigned_occurrence_id = p_occurrence_id, revision = revision + 1
        where id = v_injected_application_id and status = 'active';
        update public.quantum_weekly_application_members
        set lifecycle_status = 'assigned', revision = revision + 1
        where application_id = v_injected_application_id;
        insert into public.quantum_event_participations (
          user_id, event_id, event_mode, party_type, group_id, occurrence_id, status
        ) select member.participant_user_id, v_window.activity_id, 'scheduled', injected.party_type,
                 null, p_occurrence_id, 'recruiting'
          from public.quantum_weekly_application_members as member
          join public.quantum_weekly_applications as injected
            on injected.id = member.application_id
          where member.application_id = v_injected_application_id
        on conflict (user_id) do update set occurrence_id = excluded.occurrence_id, status = excluded.status;
      end if;

      insert into public.quantum_event_participations (
        user_id, event_id, event_mode, party_type, group_id, occurrence_id, status
      ) select member.participant_user_id, v_window.activity_id, 'scheduled', v_application.party_type,
               null, p_occurrence_id, 'recruiting'
        from public.quantum_weekly_application_members as member
        where member.application_id = p_application_id
          and member.consent_status = 'accepted' and member.lifecycle_status = 'active'
      on conflict (user_id) do update set occurrence_id = excluded.occurrence_id, status = excluded.status;
      update public.quantum_weekly_applications
      set status = 'assigned', assigned_window_id = p_window_id,
          assigned_occurrence_id = p_occurrence_id,
          assignment_idempotency_key = p_idempotency_key,
          revision = revision + 1
      where id = p_application_id and revision = p_expected_revision;
      update public.quantum_weekly_application_members
      set lifecycle_status = 'assigned', revision = revision + 1
      where application_id = p_application_id;
      return jsonb_build_object(
        'application_id', p_application_id,
        'assigned_occurrence_id', p_occurrence_id,
        'party_size', v_application.party_size,
        'replayed', false
      );
    end
    $$;
  `)

  const users = {
    superAdmin: randomUUID(),
    operator: randomUUID(),
    viewer: randomUUID(),
    outsider: randomUUID(),
    mechMaleOne: randomUUID(),
    mechMaleTwo: randomUUID(),
    mechFemale: randomUUID(),
    computerMale: randomUUID(),
    chemistryFemale: randomUUID(),
    businessFemale: randomUUID(),
    industryOther: randomUUID(),
    industryPreferNot: randomUUID(),
    artsUnspecified: randomUUID(),
    civilMale: randomUUID(),
  }
  const profiles = [
    [users.superAdmin, 'pnu_self_selected', '관리 학과', 'male'],
    [users.operator, 'pnu_self_selected', '운영 학과', 'female'],
    [users.viewer, 'pnu_self_selected', '열람 학과', 'female'],
    [users.outsider, 'pnu_self_selected', '외부 학과', 'male'],
    [users.mechMaleOne, 'pnu_self_selected', ' 기계 공학과 ', 'male'],
    [users.mechMaleTwo, 'pnu_self_selected', '기계공학과', 'male'],
    [users.mechFemale, 'pnu_self_selected', '기계 공학과', 'female'],
    [users.computerMale, 'pnu_self_selected', '컴퓨터 공학과', 'male'],
    [users.chemistryFemale, 'pnu_self_selected', '화학과', 'female'],
    [users.businessFemale, 'pnu_self_selected', '경영학과', 'female'],
    [users.industryOther, 'pnu_self_selected', '산업공학과', 'other'],
    [users.industryPreferNot, 'pnu_self_selected', '산업 공학과', 'prefer_not_to_say'],
    [users.artsUnspecified, 'pnu_self_selected', '예술학과', null],
    [users.civilMale, 'pnu_self_selected', '토목공학과', 'male'],
  ]
  for (const [id, schoolScope, department, gender] of profiles) {
    await db.query('insert into public.users(id) values ($1)', [id])
    await db.query(
      `insert into quantum_private.community_member_profiles
        (user_id, school_scope, department, community_gender, display_name)
       values ($1,$2,$3,$4,$5)`,
      [id, schoolScope, department, gender, `별칭-${id.slice(0, 4)}`],
    )
  }
  await db.query('insert into public.fixture_super_admins(user_id) values ($1)', [users.superAdmin])

  const tonight = {
    roundId: randomUUID(),
    applications: [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()],
    bundles: [randomUUID(), randomUUID(), randomUUID(), randomUUID()],
  }
  await db.query('insert into public.tonight_rounds(id,market_code) values ($1,$2)', [tonight.roundId, 'PNU'])
  await db.query(
    'insert into public.tonight_market_memberships(market_code,user_id) values ($1,$2)',
    ['PNU', users.viewer],
  )
  const tonightRows = [
    [tonight.applications[0], users.mechMaleOne, tonight.bundles[0], 'submitted'],
    [tonight.applications[1], users.mechFemale, tonight.bundles[1], 'waitlisted'],
    [tonight.applications[2], users.industryOther, tonight.bundles[2], 'submitted'],
    [tonight.applications[3], users.industryPreferNot, tonight.bundles[2], 'submitted'],
    [tonight.applications[4], users.artsUnspecified, tonight.bundles[3], 'allocated'],
  ]
  for (const [applicationId, userId, bundleId, status] of tonightRows) {
    await db.query(
      'insert into public.tonight_applications(id,round_id,user_id,bundle_id,status) values ($1,$2,$3,$4,$5)',
      [applicationId, tonight.roundId, userId, bundleId, status],
    )
    await db.query(
      'insert into quantum_private.tonight_applicant_features(application_id,user_id) values ($1,$2)',
      [applicationId, userId],
    )
  }

  const weekly = {
    weekKey: '2026-09-07',
    windowId: randomUUID(),
    activityId: randomUUID(),
    applications: {
      companion: randomUUID(),
      computer: randomUUID(),
      chemistry: randomUUID(),
      business: randomUUID(),
      sameDepartmentSolo: randomUUID(),
      partial: randomUUID(),
    },
  }
  await db.query(
    `insert into public.quantum_weekly_activity_windows (
      id,week_key,activity_id,starts_at,ends_at,application_closes_at,
      location_name,capacity,status,revision
    ) values ($1,$2,$3,current_timestamp + interval '3 hours',
      current_timestamp + interval '5 hours',current_timestamp - interval '1 hour',
      '학생회관',5,'recruiting',0)`,
    [weekly.windowId, weekly.weekKey, weekly.activityId],
  )
  const weeklyApplications = [
    [weekly.applications.companion, users.mechMaleOne, 'friends', 2],
    [weekly.applications.computer, users.computerMale, 'solo', 1],
    [weekly.applications.chemistry, users.chemistryFemale, 'solo', 1],
    [weekly.applications.business, users.businessFemale, 'solo', 1],
    [weekly.applications.sameDepartmentSolo, users.mechFemale, 'solo', 1],
    [weekly.applications.partial, users.industryOther, 'friends', 2],
  ]
  for (const [applicationId, ownerId, partyType, partySize] of weeklyApplications) {
    await db.query(
      `insert into public.quantum_weekly_applications
        (id,user_id,activity_id,week_key,status,party_type,party_size,revision)
       values ($1,$2,$3,$4,'active',$5,$6,0)`,
      [applicationId, ownerId, weekly.activityId, weekly.weekKey, partyType, partySize],
    )
    await db.query(
      'insert into public.quantum_weekly_application_candidates(application_id,window_id) values ($1,$2)',
      [applicationId, weekly.windowId],
    )
  }
  const weeklyMembers = [
    [weekly.applications.companion, users.mechMaleOne, 'male', 'accepted', 'active'],
    [weekly.applications.companion, users.mechMaleTwo, 'male', 'accepted', 'active'],
    [weekly.applications.computer, users.computerMale, 'male', 'accepted', 'active'],
    [weekly.applications.chemistry, users.chemistryFemale, 'female', 'accepted', 'active'],
    [weekly.applications.business, users.businessFemale, 'female', 'accepted', 'active'],
    [weekly.applications.sameDepartmentSolo, users.mechFemale, 'female', 'accepted', 'active'],
    [weekly.applications.partial, users.industryOther, 'male', 'accepted', 'active'],
    [weekly.applications.partial, users.civilMale, 'male', 'pending', 'awaiting_consents'],
  ]
  for (const [applicationId, userId, gender, consent, lifecycle] of weeklyMembers) {
    await db.query(
      `insert into public.quantum_weekly_application_members
        (application_id,participant_user_id,gender_snapshot,consent_status,lifecycle_status)
       values ($1,$2,$3,$4,$5)`,
      [applicationId, userId, gender, consent, lifecycle],
    )
  }

  const draft = await readFile(
    new URL('../../docs/implementation/community-voice/g3-g4-schema.sql', import.meta.url),
    'utf8',
  )
  await db.exec(draft)

  async function as(user) {
    await db.query(
      `select set_config('request.jwt.claim.sub',$1,false),
              set_config('request.jwt.claim.role','authenticated',false),
              set_config('test.inject_weekly_conflict_application','',false)`,
      [user],
    )
  }
  async function asService() {
    await db.query(
      `select set_config('request.jwt.claim.sub','',false),
              set_config('request.jwt.claim.role','service_role',false),
              set_config('test.inject_weekly_conflict_application','',false)`,
    )
  }
  async function value(sql, params = []) {
    return (await db.query(sql, params)).rows[0].value
  }
  return {db, users, tonight, weekly, as, asService, value}
}

test('G3/G4 schema captures immutable canonical snapshots and closes direct ACLs', async () => {
  const fixture = await setup()
  try {
    const {db, weekly, tonight, users} = fixture
    const snapshots = await db.query(
      `select
        (select department_key from quantum_private.tonight_applicant_features where application_id = $1) as tonight_department,
        (select department_key from public.quantum_weekly_application_members where application_id = $2 and participant_user_id = $3) as weekly_department`,
      [tonight.applications[0], weekly.applications.companion, users.mechMaleOne],
    )
    assert.deepEqual(snapshots.rows[0], {
      tonight_department: '기계공학과',
      weekly_department: '기계공학과',
    })
    await assert.rejects(
      () => db.query(
        'update public.quantum_weekly_application_members set department_key = $1 where application_id = $2 and participant_user_id = $3',
        ['우회학과', weekly.applications.companion, users.mechMaleOne],
      ),
      /department_snapshot_immutable/,
    )

    const acl = await db.query(`
      select
        has_table_privilege('authenticated','quantum_private.weekly_allocation_proposals','SELECT') as auth_table,
        has_table_privilege('service_role','quantum_private.weekly_allocation_proposals','SELECT') as service_table,
        has_function_privilege('authenticated','public.get_my_tonight_participation_summary(uuid)','EXECUTE') as auth_summary,
        has_function_privilege('anon','public.get_my_tonight_participation_summary(uuid)','EXECUTE') as anon_summary,
        has_function_privilege('service_role','public.service_get_weekly_allocator_input(uuid)','EXECUTE') as service_allocator,
        has_function_privilege('authenticated','public.service_get_weekly_allocator_input(uuid)','EXECUTE') as auth_allocator
    `)
    assert.deepEqual(acl.rows[0], {
      auth_table: false,
      service_table: false,
      auth_summary: true,
      anon_summary: false,
      service_allocator: true,
      auth_allocator: false,
    })
  } finally {
    await fixture.db.close()
  }
})

test('Tonight permits one accepted companion bundle, rejects same-department random units, and exposes exact gender totals', async () => {
  const fixture = await setup()
  try {
    const {as, asService, value, tonight, users, db} = fixture
    await asService()
    const allocator = await value(
      'select public.service_get_tonight_allocator_input($1::uuid) as value',
      [tonight.roundId],
    )
    assert.equal(allocator.applications.length, 4)
    assert.equal(allocator.applications[0].school_scope_key, 'pnu_self_selected')
    assert.ok(allocator.applications.every((application) => application.department_key))

    const conflict = [{application_ids: [tonight.applications[0], tonight.applications[1]]}]
    await assert.rejects(
      () => value(
        'select public.service_publish_tonight_allocation($1::uuid,$2,$3::jsonb,$4) as value',
        [tonight.roundId, 0, JSON.stringify(conflict), 'same-department-random'],
      ),
      /same_department_random_unit/,
    )
    const acceptedCompanion = [{application_ids: [tonight.applications[2], tonight.applications[3]]}]
    const published = await value(
      'select public.service_publish_tonight_allocation($1::uuid,$2,$3::jsonb,$4) as value',
      [tonight.roundId, 0, JSON.stringify(acceptedCompanion), 'accepted-companion'],
    )
    assert.equal(published.published, true)

    await as(users.viewer)
    const summary = await value(
      'select public.get_my_tonight_participation_summary($1::uuid) as value',
      [tonight.roundId],
    )
    assert.equal(summary.totalPeople, 5)
    assert.deepEqual(summary.genderBreakdown, {
      malePeople: 1,
      femalePeople: 1,
      otherOrUnspecifiedPeople: 3,
    })
    assert.equal(summary.disclosureBasis, 'all_valid_participants')

    await as(users.outsider)
    await assert.rejects(
      () => value(
        'select public.get_my_tonight_participation_summary($1::uuid) as value',
        [tonight.roundId],
      ),
      /tonight_market_membership_required/,
    )
    assert.equal((await db.query('select count(*)::integer as count from public.fixture_tonight_publish_calls')).rows[0].count, 1)
  } finally {
    await fixture.db.close()
  }
})

test('weekly discovery counts only complete accepted parties', async () => {
  const fixture = await setup()
  try {
    const {as, value, weekly, users} = fixture
    await as(users.viewer)
    const discovery = await value(
      'select public.get_my_weekly_activity_discovery_v2($1::date) as value',
      [weekly.weekKey],
    )
    assert.equal(discovery.windows.length, 1)
    assert.equal(discovery.windows[0].assigned_count, 0)
    assert.equal(
      discovery.windows[0].applicant_count,
      6,
      'five assignable people plus one complete same-department solo; partial party contributes zero',
    )
  } finally {
    await fixture.db.close()
  }
})

test('weekly proposal review and execute commit one complete 3M2F room with scoped authorization', async () => {
  const fixture = await setup()
  try {
    const {as, asService, value, weekly, users, db} = fixture
    const plan = [{
      applications: [
        weekly.applications.companion,
        weekly.applications.computer,
        weekly.applications.chemistry,
        weekly.applications.business,
      ].map((applicationId) => ({
        application_id: applicationId,
        expected_revision: 0,
        assignment_idempotency_key: randomUUID(),
      })),
    }]

    await asService()
    const allocator = await value(
      'select public.service_get_weekly_allocator_input($1::uuid) as value',
      [weekly.windowId],
    )
    assert.equal(allocator.applications.length, 5)
    assert.equal(
      allocator.applications.find((application) => application.application_id === weekly.applications.companion).members.length,
      2,
    )
    assert.equal(
      allocator.applications.some((application) => application.application_id === weekly.applications.partial),
      false,
    )
    const proposal = await value(
      `select public.service_create_weekly_allocation_proposal(
        $1::uuid,$2,$3,$4::jsonb,$5,$6::uuid
      ) as value`,
      [weekly.windowId, 0, 'pnu_self_selected', JSON.stringify(plan), 'a'.repeat(64), randomUUID()],
    )
    assert.equal(proposal.status, 'proposed')
    assert.equal(proposal.revision, 0)

    await as(users.viewer)
    await assert.rejects(
      () => value(
        'select public.operator_get_weekly_allocation_proposal($1::uuid) as value',
        [proposal.proposal_id],
      ),
      /weekly_allocation_scope_required/,
    )

    await as(users.superAdmin)
    for (const capability of ['weekly_allocation:review', 'weekly_allocation:execute']) {
      const grant = await value(
        `select public.super_admin_set_weekly_allocation_operator_grant(
          $1::uuid,$2,$3,$4,$5,$6::uuid
        ) as value`,
        [users.operator, 'pnu_self_selected', capability, true, 0, randomUUID()],
      )
      assert.equal(grant.enabled, true)
      assert.equal(grant.revision, 1)
    }

    await as(users.operator)
    const detail = await value(
      'select public.operator_get_weekly_allocation_proposal($1::uuid) as value',
      [proposal.proposal_id],
    )
    assert.equal(detail.people_count, 5)
    assert.equal(detail.room_count, 1)
    const reviewed = await value(
      'select public.operator_review_weekly_allocation($1::uuid,$2,$3,$4::uuid) as value',
      [proposal.proposal_id, 'review', 0, randomUUID()],
    )
    assert.equal(reviewed.status, 'in_review')
    assert.equal(reviewed.revision, 1)
    const executeKey = randomUUID()
    const executing = await value(
      'select public.operator_request_weekly_allocation_execute($1::uuid,$2,$3::uuid) as value',
      [proposal.proposal_id, 1, executeKey],
    )
    assert.equal(executing.status, 'executing')
    assert.equal(executing.revision, 2)

    await asService()
    const completed = await value(
      'select public.service_execute_weekly_allocation_batch($1::uuid,$2,$3::uuid) as value',
      [proposal.proposal_id, 2, executeKey],
    )
    assert.equal(completed.replayed, false)
    assert.equal(completed.rooms.length, 1)
    assert.equal(completed.rooms[0].people_count, 5)
    const replay = await value(
      'select public.service_execute_weekly_allocation_batch($1::uuid,$2,$3::uuid) as value',
      [proposal.proposal_id, 2, executeKey],
    )
    assert.equal(replay.replayed, true)

    const persisted = await db.query(
      `select
        (select status from public.quantum_weekly_activity_windows where id = $1) as window_status,
        (select status from quantum_private.weekly_allocation_proposals where id = $2) as proposal_status,
        (select count(*)::integer from public.quantum_weekly_applications where assigned_occurrence_id = $3 and status = 'assigned') as assigned_applications,
        (select count(*)::integer from public.quantum_event_participations where occurrence_id = $3) as assigned_people`,
      [weekly.windowId, proposal.proposal_id, completed.rooms[0].occurrence_id],
    )
    assert.deepEqual(persisted.rows[0], {
      window_status: 'assigned',
      proposal_status: 'completed',
      assigned_applications: 4,
      assigned_people: 5,
    })
  } finally {
    await fixture.db.close()
  }
})

test('weekly assignment validates department compatibility against the final locked writer state', async () => {
  const fixture = await setup()
  try {
    const {asService, value, weekly, db} = fixture
    const occurrenceId = randomUUID()
    await db.query(
      `insert into public.quantum_event_occurrences (
        id,event_id,event_mode,starts_at,ends_at,application_closes_at,
        location_name,male_capacity,female_capacity,required_total,status,room_number,room_code
      ) select $1,activity_id,'scheduled',starts_at,ends_at,application_closes_at,
               location_name,3,2,5,'recruiting',1,'RACE01'
        from public.quantum_weekly_activity_windows where id = $2`,
      [occurrenceId, weekly.windowId],
    )
    await asService()
    await db.query(
      "select set_config('test.inject_weekly_conflict_application',$1,false)",
      [weekly.applications.companion],
    )
    await assert.rejects(
      () => value(
        `select public.assign_weekly_party_for_service(
          $1::uuid,$2::uuid,$3::uuid,$4,$5::uuid
        ) as value`,
        [weekly.applications.sameDepartmentSolo, weekly.windowId, occurrenceId, 0, randomUUID()],
      ),
      /same_department_random_unit/,
    )
    const persisted = await db.query(
      `select
        (select count(*)::integer from public.quantum_weekly_applications where assigned_occurrence_id = $1) as applications,
        (select count(*)::integer from public.quantum_event_participations where occurrence_id = $1) as people`,
      [occurrenceId],
    )
    assert.deepEqual(persisted.rows[0], {applications: 0, people: 0})
  } finally {
    await fixture.db.close()
  }
})
