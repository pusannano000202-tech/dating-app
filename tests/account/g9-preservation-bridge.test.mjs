import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'

// Embedded Postgres fixtures exercise the draft replacement functions and
// privilege boundary. This is not proof that a remote Supabase database has
// applied the bridge or that its cron invokes the replacement function.
async function setup() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema quantum_private;

    create function auth.uid() returns uuid language sql stable as $$
      select nullif(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select coalesce(nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''), 'authenticated')
    $$;

    create table auth.users(id uuid primary key, deleted_at timestamptz, banned_until timestamptz);
    create table quantum_private.ready_users(user_id uuid primary key);
    create table quantum_private.deleting_users(user_id uuid primary key);
    create table quantum_private.voice_restrictions(user_id uuid, until_at timestamptz);
    create function quantum_private.resolve_profile_readiness(p_user uuid)
    returns table(minimum_signup_complete boolean) language sql stable as $$
      select exists(select 1 from quantum_private.ready_users where user_id=p_user)
    $$;
    create function quantum_private.account_deletion_blocks_access(p_user uuid)
    returns boolean language sql stable as $$
      select exists(select 1 from quantum_private.deleting_users where user_id=p_user)
    $$;
    create function quantum_private.tonight_invite_pair_is_blocked(p_left uuid,p_right uuid)
    returns boolean language sql stable as $$select false$$;

    create table public.matches(id uuid primary key,group_a_id uuid,group_b_id uuid,status text);
    create table public.group_members(group_id uuid,user_id uuid,left_at timestamptz);
    create table public.profiles(user_id uuid primary key,display_name text);
    create table public.quantum_event_match_members(match_id uuid,user_id uuid);
    create table public.connections(
      match_id uuid,user_a_id uuid,user_b_id uuid,a_agreed boolean,b_agreed boolean,
      contact_revealed_at timestamptz,target_phone text,
      primary key(match_id,user_a_id,user_b_id)
    );
    create table public.friendships(
      user_id uuid,friend_user_id uuid,status text,source_match_id uuid,
      primary key(user_id,friend_user_id)
    );

    create table public.quantum_couple_parties(
      id uuid primary key,status text,leader_user_id uuid,partner_user_id uuid,updated_at timestamptz
    );
    create table public.quantum_couple_matches(
      id uuid primary key,status text,starts_at timestamptz,pair_a_id uuid,pair_b_id uuid,
      completed_at timestamptz
    );
    create table public.notifications(user_id uuid,kind text,payload jsonb);
    create function quantum_private.require_notification_guard()
    returns trigger language plpgsql as $$begin
      if coalesce(pg_catalog.current_setting('app.bypass_notifications_guard',true),'') <> 'on'
      then raise exception 'notifications_guard_required'; end if;
      return new;
    end$$;
    create trigger require_notification_guard before insert on public.notifications
      for each row execute function quantum_private.require_notification_guard();

    create function public.complete_due_quantum_couple_matches(p_now timestamptz default now())
    returns integer language sql as $$select -1$$;
    create function public.cleanup_quantum_couple_state(p_now timestamptz default now())
    returns jsonb language sql as $$
      select pg_catalog.jsonb_build_object(
        'expired_parties',0,
        'completed_matches',public.complete_due_quantum_couple_matches(p_now)
      )
    $$;
  `)

  const users = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
  const groups = [randomUUID(), randomUUID()]
  const legacyMatch = randomUUID()
  const coupleMatch = randomUUID()
  const parties = [randomUUID(), randomUUID()]
  for (const user of users) {
    await db.query('insert into auth.users(id) values($1)', [user])
    await db.query('insert into quantum_private.ready_users values($1)', [user])
    await db.query('insert into public.profiles values($1,$2)', [user, `member-${user.slice(0, 4)}`])
  }
  await db.query("insert into public.matches values($1,$2,$3,'confirmed')", [legacyMatch, groups[0], groups[1]])
  for (let i = 0; i < users.length; i++) {
    await db.query('insert into public.group_members values($1,$2,null)', [groups[i < 2 ? 0 : 1], users[i]])
  }
  const low = users[0] < users[2] ? users[0] : users[2]
  const high = users[0] < users[2] ? users[2] : users[0]
  await db.query("insert into public.friendships values($1,$2,'active',$3)", [low, high, legacyMatch])
  await db.query(
    "insert into public.connections values($1,$2,$3,true,true,now()-interval '1 hour','010-1234-5678')",
    [legacyMatch, low, high],
  )
  await db.query("insert into public.quantum_couple_parties values($1,'matched',$2,$3,now()),($4,'matched',$5,$6,now())", [
    parties[0], users[0], users[1], parties[1], users[2], users[3],
  ])
  await db.query("insert into public.quantum_couple_matches values($1,'confirmed',now()-interval '4 hours',$2,$3,null)", [
    coupleMatch, parties[0], parties[1],
  ])

  await db.exec(await readFile(
    new URL('../../docs/implementation/community-voice/g9-preservation-bridge.sql', import.meta.url),
    'utf8',
  ))

  async function as(user, role = 'authenticated') {
    await db.query(
      "select pg_catalog.set_config('request.jwt.claim.sub',$1,false),pg_catalog.set_config('request.jwt.claim.role',$2,false)",
      [user, role],
    )
  }
  return { db, users, legacyMatch, coupleMatch, as }
}

test('legacy cleanup still completes and notifies every participant without creating friends', async () => {
  const f = await setup()
  try {
    const before = await f.db.query('select * from public.friendships order by user_id,friend_user_id')
    const contactsBefore = await f.db.query('select * from public.connections order by user_a_id,user_b_id')
    await f.as(f.users[0], 'service_role')
    assert.equal((await f.db.query(
      'select public.connect_completed_quantum_event_match($1) value', [f.coupleMatch],
    )).rows[0].value, 0)
    const cleanup = (await f.db.query(
      "select public.cleanup_quantum_couple_state(now()) value",
    )).rows[0].value
    assert.equal(cleanup.completed_matches, 1)
    assert.equal((await f.db.query('select status from public.quantum_couple_matches where id=$1', [f.coupleMatch])).rows[0].status, 'completed')
    assert.deepEqual((await f.db.query('select * from public.friendships order by user_id,friend_user_id')).rows, before.rows)
    assert.deepEqual((await f.db.query('select * from public.connections order by user_a_id,user_b_id')).rows, contactsBefore.rows)
    const notices = (await f.db.query("select user_id,payload from public.notifications where kind='couple_party_completed' order by user_id")).rows
    assert.equal(notices.length, 4)
    assert.ok(notices.every((notice) => notice.payload.friendship_created === false))
    assert.equal((await f.db.query('select public.cleanup_quantum_couple_state(now()) value')).rows[0].value.completed_matches, 0)
    assert.equal((await f.db.query('select count(*)::int count from public.notifications')).rows[0].count, 4)
  } finally {
    await f.db.close()
  }
})

test('match connection read is side-effect free, preserves legacy records, and never returns a phone', async () => {
  const f = await setup()
  try {
    const connectionsBefore = await f.db.query('select * from public.connections order by user_a_id,user_b_id')
    const friendshipsBefore = await f.db.query('select * from public.friendships order by user_id,friend_user_id')
    await f.as(f.users[0])
    const rows = (await f.db.query('select * from public.get_match_connections($1)', [f.legacyMatch])).rows
    assert.equal(rows.length, 2)
    assert.ok(rows.every((row) => row.target_phone === null && row.contact_revealed_at === null && row.scheduled_reveal_at === null))
    assert.deepEqual((await f.db.query('select * from public.connections order by user_a_id,user_b_id')).rows, connectionsBefore.rows)
    assert.deepEqual((await f.db.query('select * from public.friendships order by user_id,friend_user_id')).rows, friendshipsBefore.rows)
  } finally {
    await f.db.close()
  }
})

test('bridge functions keep least privilege and match UI has no automatic phone disclosure path', async () => {
  const f = await setup()
  try {
    const grants = (await f.db.query(`select
      has_function_privilege('authenticated','public.complete_due_quantum_couple_matches(timestamptz)','EXECUTE') authenticated_cleanup,
      has_function_privilege('service_role','public.complete_due_quantum_couple_matches(timestamptz)','EXECUTE') service_cleanup,
      has_function_privilege('authenticated','public.get_match_connections(uuid)','EXECUTE') authenticated_read,
      has_function_privilege('anon','public.get_match_connections(uuid)','EXECUTE') anon_read`)).rows[0]
    assert.deepEqual(grants, {
      authenticated_cleanup: false,
      service_cleanup: true,
      authenticated_read: true,
      anon_read: false,
    })

    const page = await readFile(new URL('../../app/match/[id]/page.tsx', import.meta.url), 'utf8')
    assert.doesNotMatch(page, /href=\{`tel:/)
    assert.doesNotMatch(page, /target_phone/)
    assert.doesNotMatch(page, /\/connections`/)
    assert.doesNotMatch(page, /연락처가? 자동으로 공개/)
    assert.match(page, /전화번호는 자동으로 공개하지 않아요/)
    assert.match(page, /친구 요청을 서로 수락한 뒤/)
    assert.match(page, /href="\/friends"/)
  } finally {
    await f.db.close()
  }
})
