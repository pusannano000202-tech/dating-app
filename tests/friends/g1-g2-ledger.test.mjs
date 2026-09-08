import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'

// Embedded Postgres with explicit Auth fixtures. This does not prove remote
// Supabase migration state, RLS gateway behavior, or real multi-device sessions.
async function setup() {
  const db = new PGlite()
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private; create schema quantum_private;
    create publication supabase_realtime;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table auth.users(id uuid primary key);
    create table public.users(id uuid primary key references auth.users(id) on delete cascade);
    create table quantum_private.community_member_profiles(
      user_id uuid primary key references public.users(id) on delete cascade,
      display_name text,birth_date date,school_scope text,department text,community_gender text,
      height integer,body_type text,hair_density text,year integer,
      minimum_signup_complete boolean default true,updated_at timestamptz default now()
    );
    create table public.friend_requests(
      id uuid primary key default gen_random_uuid(),
      sender_user_id uuid not null references public.users(id),receiver_user_id uuid references public.users(id),
      receiver_phone text,token text not null unique,status text not null,message text,
      expires_at timestamptz not null,responded_at timestamptz,created_at timestamptz default now()
    );
    create table public.friendships(
      user_id uuid not null references public.users(id),friend_user_id uuid not null references public.users(id),
      status text not null,created_from_request_id uuid references public.friend_requests(id),
      created_at timestamptz default now(),primary key(user_id,friend_user_id),check(user_id<friend_user_id)
    );
    create function private.current_request_role() returns text language sql stable as
      $$select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    create function public.complete_minimum_signup(
      p_user_id uuid,p_display_name text,p_birth_date date,p_school_scope text,p_department text,
      p_community_gender text,p_height integer default null,p_body_type text default null,
      p_hair_density text default null,p_year integer default null
    ) returns table(display_name text,minimum_signup_complete boolean,profile_onboarding_complete boolean,
      matching_ready boolean,missing_reasons text[])
    language plpgsql security definer as $$begin
      insert into quantum_private.community_member_profiles(
        user_id,display_name,birth_date,school_scope,department,community_gender,height,body_type,hair_density,year
      ) values(p_user_id,p_display_name,p_birth_date,p_school_scope,p_department,p_community_gender,
        p_height,p_body_type,p_hair_density,p_year)
      on conflict(user_id) do update set display_name=excluded.display_name,birth_date=excluded.birth_date,
        school_scope=excluded.school_scope,department=excluded.department,community_gender=excluded.community_gender;
      return query select p_display_name,true,true,true,array[]::text[];
    end$$;
    create function public.accept_friend_request(p_request_id uuid) returns void
    language plpgsql security definer as $$declare r public.friend_requests%rowtype;begin
      select * into r from public.friend_requests where id=p_request_id for update;
      if r.receiver_user_id is null then raise exception 'receiver_required';end if;
      update public.friend_requests set status='accepted',responded_at=now() where id=p_request_id;
      insert into public.friendships(user_id,friend_user_id,status,created_from_request_id)
        values(least(r.sender_user_id,r.receiver_user_id),greatest(r.sender_user_id,r.receiver_user_id),'active',r.id)
        on conflict(user_id,friend_user_id) do update set status='active',created_from_request_id=excluded.created_from_request_id;
    end$$;
  `)
  await db.exec(await readFile(new URL('../../supabase/migrations/20260906113338_community_friend_chat_preservation.sql', import.meta.url), 'utf8'))
  await db.exec(await readFile(new URL('../../docs/implementation/community-voice/g1-g2-schema.sql', import.meta.url), 'utf8'))
  const users = [randomUUID(), randomUUID(), randomUUID()]
  for (let index = 0; index < users.length; index++) {
    await db.query('insert into auth.users(id) values($1)', [users[index]])
    await db.query('insert into public.users(id) values($1)', [users[index]])
    await db.query(`insert into quantum_private.community_member_profiles(
      user_id,display_name,friend_recognition_name,school_scope,department,community_gender
    ) values($1,$2,$3,'pnu_self_selected','기계공학과','male')`, [users[index], `alias-${index}`, `real-${index}`])
  }
  async function as(user, role = 'authenticated') {
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [user, role])
  }
  return { db, users, as }
}

test('G1/G2 draft executes and a hashed invite requires explicit claim with replay safety', async () => {
  const f = await setup()
  try {
    const [inviter, recipient, stranger] = f.users
    const tokenHash = 'a'.repeat(64)
    const createKey = randomUUID()
    await f.as(inviter)
    const created = (await f.db.query('select * from public.create_my_friend_invite($1,$2)', [tokenHash, createKey])).rows[0]
    const replay = (await f.db.query('select * from public.create_my_friend_invite($1,$2)', [tokenHash, createKey])).rows[0]
    assert.deepEqual(replay, created)

    await f.as(recipient)
    const preview = (await f.db.query('select * from public.preview_friend_invite($1)', [tokenHash])).rows[0]
    assert.equal(preview.inviter_display_name, 'real-0')
    const acceptKey = randomUUID()
    const accepted = (await f.db.query('select * from public.accept_friend_invite($1,$2)', [tokenHash, acceptKey])).rows[0]
    assert.equal(accepted.friend_user_id, inviter)
    assert.deepEqual((await f.db.query('select * from public.accept_friend_invite($1,$2)', [tokenHash, acceptKey])).rows[0], accepted)
    assert.equal((await f.db.query('select status from public.friend_requests where id=$1', [accepted.request_id])).rows[0].status, 'accepted')

    await f.as(stranger)
    await assert.rejects(() => f.db.query('select * from public.preview_friend_invite($1)', [tokenHash]), /invite_not_found/)

    await f.as(inviter)
    const secondHash = 'b'.repeat(64)
    const second = (await f.db.query('select * from public.create_my_friend_invite($1,$2)', [secondHash, randomUUID()])).rows[0]
    const cancelKey = randomUUID()
    assert.equal((await f.db.query('select public.cancel_my_friend_invite($1,$2) value', [second.invite_id, cancelKey])).rows[0].value, true)
    assert.equal((await f.db.query('select public.cancel_my_friend_invite($1,$2) value', [second.invite_id, cancelKey])).rows[0].value, true)
    await f.as(recipient)
    await assert.rejects(() => f.db.query('select * from public.preview_friend_invite($1)', [secondHash]), /invite_not_found/)
  } finally {
    await f.db.close()
  }
})

test('G1/G2 message cursors cannot cross friend pairs and read cursors require the exact pair', async () => {
  const f = await setup()
  try {
    const [a, b, c] = f.users
    const requestAB = await acceptPair(f.db, a, b)
    const requestAC = await acceptPair(f.db, a, c)
    assert.notEqual(requestAB, requestAC)

    await f.as(a)
    const messageAB = (await f.db.query("select public.send_my_friend_direct_message($1,'pair-ab',$2) id", [b, randomUUID()])).rows[0].id
    const messageAC = (await f.db.query("select public.send_my_friend_direct_message($1,'pair-ac',$2) id", [c, randomUUID()])).rows[0].id
    const acStamp = (await f.db.query('select created_at from public.friend_direct_messages where id=$1', [messageAC])).rows[0].created_at
    const pageAB = (await f.db.query('select public.get_my_friend_direct_messages_page($1,$2,$3,50) value', [b, acStamp, messageAC])).rows[0].value
    assert.equal(pageAB.messages.some((message) => message.body === 'pair-ac'), false)
    await assert.rejects(
      () => f.db.query('select public.mark_my_friend_direct_messages_read($1,$2)', [b, messageAC]),
      /message_not_found/,
    )
    assert.equal((await f.db.query('select public.mark_my_friend_direct_messages_read($1,$2) value', [b, messageAB])).rows[0].value, true)
    const conversations = (await f.db.query('select public.get_my_friend_conversations(null,null,30) value')).rows[0].value
    assert.equal(conversations.conversations.length, 2)

    await f.as(b)
    await assert.rejects(
      () => f.db.query('select public.get_my_friend_direct_messages_page($1,null,null,50)', [c]),
      /active_friendship_required/,
    )
  } finally {
    await f.db.close()
  }
})

test('G1/G2 private tables are hidden while narrowly scoped RPCs remain authenticated-only', async () => {
  const f = await setup()
  try {
    const grants = (await f.db.query(`select
      has_table_privilege('authenticated','public.friend_invites','SELECT') invite_rows,
      has_table_privilege('authenticated','public.friend_direct_message_read_cursors','SELECT') cursor_rows,
      has_function_privilege('authenticated','public.create_my_friend_invite(text,uuid)','EXECUTE') create_rpc,
      has_function_privilege('anon','public.create_my_friend_invite(text,uuid)','EXECUTE') anon_rpc`)).rows[0]
    assert.deepEqual(grants, { invite_rows: false, cursor_rows: false, create_rpc: true, anon_rpc: false })
  } finally {
    await f.db.close()
  }
})

test('G2 realtime revision contains no message data and advances for pair, message, and read changes', async () => {
  const f = await setup()
  try {
    const [a, b] = f.users
    await acceptPair(f.db, a, b)
    const low = a < b ? a : b
    const high = a < b ? b : a
    assert.deepEqual(
      (await f.db.query(`select column_name from information_schema.columns
        where table_schema='public' and table_name='friend_conversation_revisions'
        order by column_name`)).rows.map((row) => row.column_name),
      ['changed_at', 'friendship_friend_user_id', 'friendship_user_id', 'revision'],
    )
    assert.equal((await f.db.query('select revision from public.friend_conversation_revisions where friendship_user_id=$1 and friendship_friend_user_id=$2', [low, high])).rows[0].revision, 1)

    await f.as(a)
    const message = (await f.db.query("select public.send_my_friend_direct_message($1,'private-body',$2) id", [b, randomUUID()])).rows[0].id
    assert.equal((await f.db.query('select revision from public.friend_conversation_revisions where friendship_user_id=$1 and friendship_friend_user_id=$2', [low, high])).rows[0].revision, 2)
    await f.db.query('select public.mark_my_friend_direct_messages_read($1,$2)', [b, message])
    assert.equal((await f.db.query('select revision from public.friend_conversation_revisions where friendship_user_id=$1 and friendship_friend_user_id=$2', [low, high])).rows[0].revision, 3)
    await f.db.query('select public.mark_my_friend_direct_messages_read($1,$2)', [b, message])
    assert.equal((await f.db.query('select revision from public.friend_conversation_revisions where friendship_user_id=$1 and friendship_friend_user_id=$2', [low, high])).rows[0].revision, 3)

    const grants = (await f.db.query(`select
      has_table_privilege('authenticated','public.friend_conversation_revisions','SELECT') participant_read,
      has_table_privilege('authenticated','public.friend_conversation_revisions','INSERT') browser_write,
      has_table_privilege('anon','public.friend_conversation_revisions','SELECT') anon_read,
      exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
        and schemaname='public' and tablename='friend_conversation_revisions') realtime_enabled`)).rows[0]
    assert.deepEqual(grants, { participant_read: true, browser_write: false, anon_read: false, realtime_enabled: true })
  } finally {
    await f.db.close()
  }
})

async function acceptPair(db, sender, receiver) {
  const requestId = randomUUID()
  await db.query(`insert into public.friend_requests(
    id,sender_user_id,receiver_user_id,token,status,expires_at
  ) values($1,$2,$3,$4,'accepted',now()+interval '1 day')`, [requestId, sender, receiver, randomUUID()])
  await db.query("insert into public.friendships(user_id,friend_user_id,status,created_from_request_id) values($1,$2,'active',$3)", [
    sender < receiver ? sender : receiver,
    sender < receiver ? receiver : sender,
    requestId,
  ])
  return requestId
}
