import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

// Embedded PostgreSQL compatibility fixture. This executes the real G7/G8
// draft and RPC branches, but is not live Supabase/RLS or multi-connection proof.
export async function setup() {
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
