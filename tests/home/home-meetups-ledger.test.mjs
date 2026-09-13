import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Embedded PostgreSQL contract fixture. This is not a live Supabase, PostgREST,
// multi-connection concurrency, or deployed-RLS test.
async function setup() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema quantum_private;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table auth.users(id uuid primary key, deleted_at timestamptz, banned_until timestamptz);
    create table public.users(id uuid primary key references auth.users(id));
    create table public.friendships(
      user_id uuid not null,
      friend_user_id uuid not null,
      status text not null,
      primary key(user_id, friend_user_id)
    );
    create table quantum_private.community_member_profiles(
      user_id uuid primary key,
      school_scope text not null,
      community_gender text not null,
      display_name text not null
    );
    create table quantum_private.test_account_deletion_blocks(user_id uuid primary key);
    create function quantum_private.resolve_profile_readiness(p_user uuid)
      returns table(minimum_signup_complete boolean)
      language sql stable as $$
        select exists(select 1 from quantum_private.community_member_profiles where user_id=p_user)
      $$;
    create function quantum_private.account_deletion_blocks_access(p_user uuid)
      returns boolean language sql stable as $$
        select exists(select 1 from quantum_private.test_account_deletion_blocks where user_id=p_user)
      $$;
    create function quantum_private.meetup_gender_eligibility(p_user uuid,p_mode text)
      returns text language sql stable as $$
        select case
          when p_mode='all' then 'eligible'
          when p_mode='male_only' and community_gender='male' then 'eligible'
          when p_mode='female_only' and community_gender='female' then 'eligible'
          when community_gender not in ('male','female') then 'gender_required'
          else 'gender_restricted'
        end
        from quantum_private.community_member_profiles where user_id=p_user
      $$;
    create function quantum_private.tonight_invite_pair_is_blocked(a uuid,b uuid)
      returns boolean language sql stable as $$
        select exists(
          select 1 from public.friendships
          where status='blocked'
            and ((user_id=a and friend_user_id=b) or (user_id=b and friend_user_id=a))
        )
      $$;
    create function quantum_private.activity_meetup_alias(p_user uuid)
      returns text language sql stable as $$
        select display_name from quantum_private.community_member_profiles where user_id=p_user
      $$;
  `)

  await db.exec(await readFile(new URL(
    '../../supabase/migrations/20260907113358_automatic_activity_rooms.sql',
    import.meta.url,
  ), 'utf8'))
  await db.exec(await readFile(new URL(
    '../../supabase/migrations/20260907121222_activity_room_history.sql',
    import.meta.url,
  ), 'utf8'))

  const users = Array.from({ length: 9 }, () => randomUUID())
  for (let index = 0; index < users.length; index += 1) {
    await db.query('insert into auth.users(id) values($1)', [users[index]])
    await db.query('insert into public.users(id) values($1)', [users[index]])
    await db.query(
      'insert into quantum_private.community_member_profiles values($1,$2,$3,$4)',
      [users[index], index === 8 ? 'other_school' : 'pnu_self_selected', index % 2 ? 'male' : 'female', `별칭${index}`],
    )
  }

  async function as(user) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user])
  }
  async function rpc(name, args = [], params = []) {
    const placeholders = args.map((_, index) => `$${index + 1}`).join(',')
    return (await db.query(`select public.${name}(${placeholders}) as value`, params)).rows[0].value
  }
  async function list(key = 'team-gaming', mode = 'all') {
    return rpc('list_activity_rooms', ['text', 'text'], [key, mode])
  }
  async function ensure(key = 'team-gaming', mode = 'all') {
    return rpc('ensure_activity_room_pool', ['text', 'text'], [key, mode])
  }
  async function join(roomId) {
    return rpc('join_activity_room', ['uuid'], [roomId])
  }
  async function leave(roomId) {
    return rpc('leave_activity_room', ['uuid'], [roomId])
  }
  async function history(roomId, beforeCreatedAt = null, beforeMessageId = null) {
    return (await db.query(`
      select public.get_activity_room_messages(
        $1::uuid,$2::timestamptz,$3::uuid
      ) as value
    `, [roomId, beforeCreatedAt, beforeMessageId])).rows[0].value
  }
  return { db, users, as, list, ensure, join, leave, history, rpc }
}


test('home read returns own current scheduled and automatic rooms only, without creation or contacts', async () => {
  const f = await setup()
  try {
    await f.db.exec(`
      create table public.activity_meetups(id uuid primary key,title text,activity_key text,capacity smallint,scheduled_at timestamptz,ends_at timestamptz,place_name text,status text,school text);
      create table public.activity_meetup_members(meetup_id uuid,user_id uuid,status text);
      create function quantum_private.activity_meetup_scope_eligible(p_id uuid,p_user uuid) returns boolean language sql stable as $$ select exists(select 1 from public.activity_meetups m join quantum_private.community_member_profiles p on p.user_id=p_user where m.id=p_id and m.school=p.school_scope) $$;
    `)
    await f.as(f.users[0])
    const pool = await f.ensure()
    await f.join(pool.rooms[0].id)
    const scheduled = randomUUID()
    await f.db.query("insert into public.activity_meetups values($1,'내 카페',null,5,now()-interval '1 hour',now()+interval '1 hour','정문','open','pnu_self_selected')", [scheduled])
    await f.db.query("insert into public.activity_meetup_members values($1,$2,'joined')",[scheduled,f.users[0]])
    for (let i=0;i<40;i++) await f.db.query("insert into public.activity_meetups values($1,'다른 모집',null,5,now(),now()+interval '2 hour','정문','open','pnu_self_selected')",[randomUUID()])
    const before = (await f.db.query('select count(*)::int as n from quantum_private.activity_room_rooms')).rows[0].n
    const files = await import('node:fs/promises')
    const names = await files.readdir(new URL('../../supabase/migrations/', import.meta.url))
    const migration = names.find(n => n.endsWith('_home_my_meetups_read.sql'))
    assert.ok(migration, 'own-home read migration must exist')
    await f.db.exec(await readFile(new URL('../../supabase/migrations/' + migration, import.meta.url), 'utf8'))
    // Exercise the current home replacement with the real automatic-room access
    // guards too, not only the old home RPC or an empty automatic-room fixture.
    await f.db.exec("alter table public.activity_meetups add column schedule_status text not null default 'confirmed'; alter table public.activity_meetup_members add column joined_at timestamptz not null default now()")
    const pendingMigration=await readFile(new URL('../../supabase/migrations/20260911141856_meetup_pending_schedule.sql',import.meta.url),'utf8')
    const homeReplacement=pendingMigration.slice(pendingMigration.indexOf('create or replace function public.get_my_home_meetups()'))
    await f.db.exec(homeReplacement.slice(0,homeReplacement.indexOf('end $$;')+7))
    const value = await f.rpc('get_my_home_meetups')
    assert.equal(value.items.length,2)
    assert.equal(value.has_more,false)
    assert.deepEqual(value.items.map(x=>x.kind).sort(),['activity_room','scheduled'])
    assert.equal(value.items.find(x=>x.kind==='scheduled').id,scheduled)
    assert.equal(value.items.find(x=>x.kind==='activity_room').member_count,1)
    // A room joined earlier must not displace an upcoming scheduled meeting.
    await f.db.query("update public.activity_meetups set scheduled_at=now()+interval '30 minutes' where id=$1",[scheduled])
    assert.deepEqual((await f.rpc('get_my_home_meetups')).items.map(x=>x.kind),['scheduled','activity_room'])
    assert.ok(value.items.every(x=>!('user_id' in x) && !('phone' in x) && !('members' in x) && !('messages' in x)))
    assert.equal((await f.db.query('select count(*)::int as n from quantum_private.activity_room_rooms')).rows[0].n,before)
    await f.as(f.users[1])
    assert.deepEqual((await f.rpc('get_my_home_meetups')).items,[])
    await f.as(f.users[0])
    await f.leave(pool.rooms[0].id)
    assert.equal((await f.rpc('get_my_home_meetups')).items.length,1)
    await f.db.query("update public.activity_meetup_members set status='left' where user_id=$1",[f.users[0]])
    assert.deepEqual((await f.rpc('get_my_home_meetups')).items,[])
    await f.db.query("insert into quantum_private.test_account_deletion_blocks values($1)",[f.users[0]])
    await assert.rejects(f.rpc('get_my_home_meetups'),/account_deletion_pending/)
    await f.as('')
    await assert.rejects(f.rpc('get_my_home_meetups'),/not_authenticated/)
    const grants = (await f.db.query("select has_function_privilege('anon','public.get_my_home_meetups()','EXECUTE') as anon,has_function_privilege('authenticated','public.get_my_home_meetups()','EXECUTE') as auth")).rows[0]
    assert.deepEqual(grants,{anon:false,auth:true})
  } finally { await f.db.close() }
})
