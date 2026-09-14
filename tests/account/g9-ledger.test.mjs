import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'

// Embedded Postgres with explicit Auth/storage/voice fixtures. This is not live
// Supabase RLS, Storage object deletion, Auth provider, cron, or legal approval proof.
async function setup({ preG9Sql = '', admissionFinance = false } = {}) {
  const db = new PGlite()
  try {
    await db.exec(`
    create role anon; create role authenticated; create role service_role; create role authenticator;
    create schema auth; create schema private; create schema quantum_private; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub',true),''),
        nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')
      )::uuid
    $$;
    create function auth.role() returns text language sql stable as $$
      select coalesce(
        nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',''),
        nullif(current_setting('request.jwt.claim.role',true),'')
      )
    $$;
    create function private.current_request_role() returns text
    language plpgsql stable set search_path='' as $$
    declare
      v_claims_text text:=nullif(pg_catalog.current_setting('request.jwt.claims',true),'');
      v_claims_role text;
      v_auth_role text;
    begin
      if v_claims_text is not null then
        begin
          v_claims_role:=v_claims_text::jsonb->>'role';
        exception when invalid_text_representation then
          v_claims_role:=null;
        end;
      end if;
      begin
        v_auth_role:=nullif(auth.role(),'');
      exception when others then
        v_auth_role:=null;
      end;
      return coalesce(nullif(v_claims_role,''),v_auth_role);
    end
    $$;
    create table auth.users(id uuid primary key);
    create table public.users(id uuid primary key references auth.users(id) on delete cascade);
    create table public.admins(user_id uuid primary key,role text);
    create table public.venue_partner_memberships(
      user_id uuid,venue_id uuid,revoked_at timestamptz
    );
    create table public.legacy_product_events(actor_user_id uuid,payload text);
    create table public.community_mbti_experiences(owner_user_id uuid,payload text);
    create table public.activity_meetups(host_user_id uuid,payload text);
    create table public.groups(leader_user_id uuid,payload text);
    create table public.match_pool(group_id uuid,payload text);
    alter table public.legacy_product_events enable row level security;
    grant select on public.legacy_product_events to authenticated;
    create policy legacy_product_events_read on public.legacy_product_events
      for select to authenticated using(true);
    create table storage.objects(id uuid primary key,owner_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,update,delete on storage.objects to authenticated;
    create policy storage_objects_existing_access on storage.objects
      for all to authenticated using(true) with check(true);
    create table quantum_private.community_member_profiles(
      user_id uuid primary key,friend_recognition_name text,updated_at timestamptz default now()
    );
    create table public.friend_requests(
      id uuid primary key default gen_random_uuid(),sender_user_id uuid,receiver_user_id uuid,
      status text,responded_at timestamptz
    );
    create table public.friendships(
      user_id uuid,friend_user_id uuid,status text,primary key(user_id,friend_user_id)
    );
    create table public.friend_invites(
      id uuid primary key default gen_random_uuid(),inviter_user_id uuid,claimed_by_user_id uuid,
      status text,cancelled_at timestamptz,updated_at timestamptz default now()
    );
    create table public.friend_direct_messages(
      id uuid primary key default gen_random_uuid(),friendship_user_id uuid,
      friendship_friend_user_id uuid,sender_user_id uuid,body text
    );
    create table public.photos(id uuid primary key,user_id uuid,storage_path text);
    create table public.meeting_photo_evidence(
      id uuid primary key,uploader_user_id uuid,storage_path text,status text,
      dispute_hold boolean default false,retention_until timestamptz
    );
    create table public.quantum_continuation_album_photos(
      id uuid primary key,uploader_user_id uuid,storage_path text,status text,
      retention_until timestamptz,deleted_at timestamptz,processing_token uuid,
      processing_lease_expires_at timestamptz
    );
    create table public.campus_seven_enrollments(id uuid primary key,user_id uuid);
    create table public.campus_seven_attendance_evidence(
      id uuid primary key,enrollment_id uuid,object_path text,status text,
      delete_after timestamptz,deleted_at timestamptz
    );
    create table public.deposits(id uuid primary key default gen_random_uuid(),user_id uuid);
    create table public.deposit_refund_requests(id uuid primary key default gen_random_uuid(),user_id uuid);
    create table public.campus_seven_deposit_holds(id uuid primary key default gen_random_uuid(),user_id uuid);
    create table public.campus_seven_deposit_reviews(id uuid primary key default gen_random_uuid(),user_id uuid);
    create table public.tonight_deposits(id uuid primary key default gen_random_uuid(),user_id uuid);
    create table public.tonight_deposit_refund_requests(id uuid primary key default gen_random_uuid(),requested_by uuid);
    create table public.quantum_continuation_fee_orders(
      id uuid primary key default gen_random_uuid(),owner_user_id uuid,target_user_id uuid
    );
    create table quantum_private.voice_rooms(id uuid primary key,kind text);
    create table quantum_private.voice_sessions(id uuid primary key,room_id uuid,state text);
    create table quantum_private.voice_members(session_id uuid,user_id uuid,active boolean);
    create table quantum_private.voice_queue(user_id uuid);
    create table quantum_private.voice_searches(user_id uuid);
    create table quantum_private.voice_friend_invitations(sender_id uuid,recipient_id uuid,status text);
    create table quantum_private.voice_media_outbox(
      id uuid primary key default gen_random_uuid(),session_id uuid,user_id uuid,action text
    );
    create function quantum_private.voice_revoke_member(p_session uuid,p_user uuid)
    returns void language plpgsql as $$begin
      update quantum_private.voice_members set active=false where session_id=p_session and user_id=p_user;
      insert into quantum_private.voice_media_outbox(session_id,user_id,action) values(p_session,p_user,'remove');
    end$$;
    create function quantum_private.voice_end_session(p_session uuid)
    returns void language plpgsql as $$begin
      update quantum_private.voice_members set active=false where session_id=p_session;
      update quantum_private.voice_sessions set state='ended' where id=p_session;
      insert into quantum_private.voice_media_outbox(session_id,action) values(p_session,'delete_room');
    end$$;
    `)
    if (preG9Sql) await db.exec(preG9Sql)
    await db.exec(await readFile(new URL('../../docs/implementation/community-voice/g9-schema.sql', import.meta.url), 'utf8'))
    if (admissionFinance) {
      // Minimal FK/state fixtures; full real admission migrations are exercised
      // separately by admission-deletion-finance.test.mjs.
      await db.exec(`
        create table quantum_private.meetup_admission_checkout_orders(
          order_id text primary key,intent_id uuid not null unique,
          user_id uuid references public.users(id) on delete set null,
          state text not null,expires_at timestamptz default now(),payment_key text
        );
        create table quantum_private.activity_meetup_admission_deposits(
          id uuid primary key,intent_id uuid not null unique,
          user_id uuid references public.users(id) on delete set null,state text not null
        );
        create table quantum_private.activity_meetup_admission_refund_outbox(
          deposit_id uuid primary key references quantum_private.activity_meetup_admission_deposits(id),state text not null
        );
      `)
      // Use the deployed-source definitions rather than relying on draft parity.
      const integrated = await readFile(new URL('../../supabase/migrations/20260906181225_community_social_integrated.sql', import.meta.url), 'utf8')
      for (const name of [
        'quantum_private.account_has_legal_retention_candidates',
        'quantum_private.enqueue_retention_cleanup_jobs',
        'public.request_account_deletion_for_service',
        'public.approve_account_legal_retention_for_service',
        'public.claim_retention_cleanup_jobs_for_service',
        'public.confirm_account_auth_delete_ready_for_service',
      ]) {
        const tail = integrated.slice(integrated.indexOf(`create or replace function ${name}(`))
        await db.exec(tail.slice(0, tail.indexOf('$$;') + 3))
      }
      if (process.env.ACCOUNT_ADMISSION_BASELINE !== '1') {
        await db.exec(await readFile(new URL('../../supabase/migrations/20260914032828_account_admission_erasure_guard.sql', import.meta.url), 'utf8'))
      }
    }
  } catch (error) {
    await db.close()
    throw error
  }
  const users = [randomUUID(), randomUUID()]
  for (const user of users) {
    await db.query('insert into auth.users(id) values($1)', [user])
    await db.query('insert into public.users(id) values($1)', [user])
    await db.query('insert into quantum_private.community_member_profiles(user_id,friend_recognition_name) values($1,$2)', [user, `friend-${user.slice(0, 4)}`])
  }
  async function service() {
    await db.exec("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','service_role',false)")
  }
  async function authenticated(user) {
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",
      [user ?? ''],
    )
  }
  async function jsonOnly(role, user) {
    await db.query(
      "select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false),set_config('request.jwt.claims',$1,false)",
      [JSON.stringify({ role, ...(user ? { sub: user } : {}) })],
    )
  }
  return { db, users, service, authenticated, jsonOnly }
}

test('admission checkout history requires legal review and unresolved payment survives auth erasure', async () => {
  const f = await setup({admissionFinance: true})
  try {
    const user = f.users[0], intent = randomUUID()
    await f.service()
    await f.db.query("insert into quantum_private.meetup_admission_checkout_orders(order_id,intent_id,user_id,state) values('checkout',$1,$2,'prepared')", [intent, user])
    const request = (await f.db.query('select public.request_account_deletion_for_service($1,$2) value', [user, randomUUID()])).rows[0].value
    assert.equal((await f.db.query('select legal_retention_ready from quantum_private.account_deletion_requests where id=$1', [request.request_id])).rows[0].legal_retention_ready, false)
    assert.equal((await f.db.query('select quantum_private.account_deletion_blocks_access($1) value', [user])).rows[0].value, true)
    await f.db.query("select public.approve_account_legal_retention_for_service($1,null,'retention_preserved',$2)", [request.request_id, 'a'.repeat(64)])
    const worker = randomUUID()
    await f.db.query('select * from public.claim_retention_cleanup_jobs_for_service($1,25)', [worker])
    for (const state of ['prepared', 'confirming', 'reconciliation_required']) {
      await f.db.query('update quantum_private.meetup_admission_checkout_orders set state=$1,expires_at=now()-interval \'1 day\' where user_id=$2', [state, user])
      assert.equal((await f.db.query('select public.confirm_account_auth_delete_ready_for_service($1,$2,$3) value', [request.request_id, user, worker])).rows[0].value, false, state)
      await assert.rejects(f.db.query('delete from auth.users where id=$1', [user]), /account_financial_retention_pending/)
      assert.equal((await f.db.query('select user_id from quantum_private.meetup_admission_checkout_orders')).rows[0].user_id, user)
    }
    // Only an explicit verified abort is terminal; elapsed time alone never is.
    await f.db.query("update quantum_private.meetup_admission_checkout_orders set state='aborted' where user_id=$1", [user])
    assert.equal((await f.db.query('select public.confirm_account_auth_delete_ready_for_service($1,$2,$3) value', [request.request_id, user, worker])).rows[0].value, true)
    await f.db.query('delete from auth.users where id=$1', [user])
    assert.equal((await f.db.query('select user_id from quantum_private.meetup_admission_checkout_orders')).rows[0].user_id, null)
  } finally { await f.db.close() }
})

test('actual deletion catches finance arriving after readiness and rechecks old automatic legal approval', async () => {
  const f = await setup({admissionFinance: true})
  try {
    const user = f.users[0], intent = randomUUID(), deposit = randomUUID(), worker = randomUUID()
    await f.service()
    const request = (await f.db.query('select public.request_account_deletion_for_service($1,$2) value', [user, randomUUID()])).rows[0].value
    await f.db.query('select * from public.claim_retention_cleanup_jobs_for_service($1,25)', [worker])
    const ready = async () => (await f.db.query('select public.confirm_account_auth_delete_ready_for_service($1,$2,$3) value', [request.request_id, user, worker])).rows[0].value
    assert.equal(await ready(), true)
    // Simulates a service confirmation committed between the RPC and Auth call.
    await f.db.query("insert into quantum_private.activity_meetup_admission_deposits values($1,$2,$3,'held')", [deposit, intent, user])
    await assert.rejects(f.db.query('delete from auth.users where id=$1', [user]), /account_financial_retention_pending/)
    assert.equal(await ready(), false)
    await f.db.query("select public.approve_account_legal_retention_for_service($1,null,'retention_preserved',$2)", [request.request_id, 'b'.repeat(64)])
    await f.db.query("update quantum_private.activity_meetup_admission_deposits set state='refund_due' where id=$1", [deposit])
    await f.db.query("insert into quantum_private.activity_meetup_admission_refund_outbox values($1,'pending')", [deposit])
    assert.equal(await ready(), false)
    await f.db.query("update quantum_private.activity_meetup_admission_deposits set state='refunded' where id=$1", [deposit])
    for (const state of ['pending', 'processing', 'failed']) {
      await f.db.query('update quantum_private.activity_meetup_admission_refund_outbox set state=$1 where deposit_id=$2', [state, deposit])
      assert.equal(await ready(), false, state)
    }
    await f.db.query("update quantum_private.activity_meetup_admission_refund_outbox set state='completed' where deposit_id=$1", [deposit])
    assert.equal(await ready(), true)
    await f.db.query('delete from auth.users where id=$1', [user])
    assert.equal((await f.db.query('select user_id,state from quantum_private.activity_meetup_admission_deposits')).rows[0].user_id, null)
    assert.equal((await f.db.query('select state from quantum_private.activity_meetup_admission_refund_outbox')).rows[0].state, 'completed')
  } finally { await f.db.close() }
})

test('closed admission history needs explicit review on stale requests; finance helpers remain private', async () => {
  const f = await setup({admissionFinance: true})
  try {
    await f.service()
    const user = f.users[0], worker = randomUUID()
    const request = (await f.db.query('select public.request_account_deletion_for_service($1,$2) value', [user, randomUUID()])).rows[0].value
    await f.db.query('select * from public.claim_retention_cleanup_jobs_for_service($1,25)', [worker])
    await f.db.query("insert into quantum_private.meetup_admission_checkout_orders(order_id,intent_id,user_id,state) values('aborted',$1,$2,'aborted')", [randomUUID(), user])
    assert.equal((await f.db.query('select public.confirm_account_auth_delete_ready_for_service($1,$2,$3) value', [request.request_id, user, worker])).rows[0].value, false)
    await assert.rejects(f.db.query('delete from auth.users where id=$1', [user]), /account_financial_retention_pending/)
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const name of ['account_has_unresolved_meetup_payments(uuid)', 'account_admission_finance_owner_lock()', 'guard_account_admission_erasure()']) {
        assert.equal((await f.db.query('select has_function_privilege($1,$2,\'EXECUTE\') allowed', [role, `quantum_private.${name}`])).rows[0].allowed, false)
      }
    }
    await f.db.query("select public.approve_account_legal_retention_for_service($1,null,'retention_preserved',$2)", [request.request_id, 'c'.repeat(64)])
    await f.db.query('delete from auth.users where id=$1', [user])
    // Users without money can still complete their ordinary deletion path.
    const peerRequest = (await f.db.query('select public.request_account_deletion_for_service($1,$2) value', [f.users[1], randomUUID()])).rows[0].value
    const peerWorker = randomUUID()
    await f.db.query('select * from public.claim_retention_cleanup_jobs_for_service($1,25)', [peerWorker])
    assert.equal((await f.db.query('select public.confirm_account_auth_delete_ready_for_service($1,$2,$3) value', [peerRequest.request_id, f.users[1], peerWorker])).rows[0].value, true)
    await f.db.query('delete from auth.users where id=$1', [f.users[1]])
  } finally { await f.db.close() }
})

test('G9 draft executes and account request replay revokes friend and voice access', async () => {
  const f = await setup()
  try {
    const [user, peer] = f.users
    const low = user < peer ? user : peer
    const high = user < peer ? peer : user
    const session = randomUUID()
    const room = randomUUID()
    await f.db.query("insert into public.friendships values($1,$2,'active')", [low, high])
    await f.db.query("insert into public.friend_requests(sender_user_id,receiver_user_id,status) values($1,$2,'pending')", [user, peer])
    await f.db.query("insert into public.friend_invites(inviter_user_id,status) values($1,'pending')", [user])
    await f.db.query("insert into quantum_private.voice_rooms values($1,'group')", [room])
    await f.db.query("insert into quantum_private.voice_sessions values($1,$2,'active')", [session, room])
    await f.db.query('insert into quantum_private.voice_members values($1,$2,true)', [session, user])
    await f.service()
    const key = randomUUID()
    const first = (await f.db.query(
      'select public.request_account_deletion_for_service($1,$2) value', [user, key],
    )).rows[0].value
    const replay = (await f.db.query(
      'select public.request_account_deletion_for_service($1,$2) value', [user, key],
    )).rows[0].value
    assert.equal(first.request_id, replay.request_id)
    assert.equal((await f.db.query('select friend_recognition_name from quantum_private.community_member_profiles where user_id=$1', [user])).rows[0].friend_recognition_name, null)
    assert.equal((await f.db.query('select status from public.friendships where user_id=$1 and friend_user_id=$2', [low, high])).rows[0].status, 'blocked')
    assert.equal((await f.db.query('select status from public.friend_invites where inviter_user_id=$1', [user])).rows[0].status, 'cancelled')
    assert.equal((await f.db.query('select active from quantum_private.voice_members where user_id=$1', [user])).rows[0].active, false)
    assert.equal((await f.db.query('select quantum_private.account_deletion_blocks_access($1) value', [user])).rows[0].value, true)
    await assert.rejects(
      () => f.db.query('insert into public.friend_direct_messages(friendship_user_id,friendship_friend_user_id,sender_user_id,body) values($1,$2,$3,$4)', [low, high, user, 'blocked']),
      /account_deletion_pending/,
    )
  } finally {
    await f.db.close()
  }
})

test('G9 private tables and worker RPCs are service-only', async () => {
  const f = await setup()
  try {
    const grants = (await f.db.query(`select
      has_table_privilege('authenticated','quantum_private.account_deletion_requests','SELECT') exposed,
      has_function_privilege('authenticated','public.claim_retention_cleanup_jobs_for_service(uuid,integer)','EXECUTE') callable,
      has_function_privilege('service_role','public.claim_retention_cleanup_jobs_for_service(uuid,integer)','EXECUTE') service_callable`)).rows[0]
    assert.deepEqual(grants, { exposed: false, callable: false, service_callable: true })
    await f.authenticated()
    await assert.rejects(
      () => f.db.query('select public.preview_retention_cleanup_jobs_for_service(25)'),
      /service_role_required/,
    )
  } finally {
    await f.db.close()
  }
})

test('storage failure remains retryable and auth deletion is claimed only after cleanup', async () => {
  const f = await setup()
  try {
    const user = f.users[0]
    const photo = randomUUID()
    await f.db.query('insert into public.photos values($1,$2,$3)', [photo, user, `${user}/photo_0.jpg`])
    await f.service()
    const request = (await f.db.query('select public.request_account_deletion_for_service($1,$2) value', [user, randomUUID()])).rows[0].value
    const worker = randomUUID()
    let claimed = (await f.db.query('select * from public.claim_retention_cleanup_jobs_for_service($1,25)', [worker])).rows
    assert.equal(claimed.length, 1)
    assert.equal(claimed[0].kind, 'storage_object')
    assert.equal(await retry(f.db, claimed[0], 'storage_failed'), true)
    assert.equal((await f.db.query('select status from quantum_private.retention_cleanup_jobs where id=$1', [claimed[0].job_id])).rows[0].status, 'retry_wait')
    assert.equal((await f.db.query('select count(*)::int count from public.photos where id=$1', [photo])).rows[0].count, 1)

    await f.db.query('update quantum_private.retention_cleanup_jobs set next_attempt_at=clock_timestamp() where id=$1', [claimed[0].job_id])
    const worker2 = randomUUID()
    claimed = (await f.db.query('select * from public.claim_retention_cleanup_jobs_for_service($1,25)', [worker2])).rows
    assert.equal(claimed[0].kind, 'storage_object')
    assert.equal((await f.db.query('select public.complete_retention_cleanup_job_for_service($1,$2) value', [claimed[0].job_id, worker2])).rows[0].value, true)
    assert.equal((await f.db.query('select count(*)::int count from public.photos where id=$1', [photo])).rows[0].count, 0)

    const worker3 = randomUUID()
    claimed = (await f.db.query('select * from public.claim_retention_cleanup_jobs_for_service($1,25)', [worker3])).rows
    assert.equal(claimed.length, 1)
    assert.equal(claimed[0].kind, 'auth_user')
    assert.equal((await f.db.query('select public.confirm_account_auth_delete_ready_for_service($1,$2,$3) value', [request.request_id, user, worker3])).rows[0].value, true)
    assert.equal((await f.db.query('select public.complete_retention_cleanup_job_for_service($1,$2) value', [claimed[0].job_id, worker3])).rows[0].value, true)
    assert.equal((await f.db.query('select status from quantum_private.account_deletion_requests where id=$1', [request.request_id])).rows[0].status, 'completed')
  } finally {
    await f.db.close()
  }
})

test('album cleanup uses a narrowly scoped service bypass while account writes stay blocked', async () => {
  const f = await setup()
  try {
    const user = f.users[0]
    const album = randomUUID()
    await f.db.query(
      "insert into public.quantum_continuation_album_photos values($1,$2,$3,'ready',now()+interval '1 day',null,null,null)",
      [album, user, `continuation-series/${randomUUID()}/source/${randomUUID()}/${randomUUID()}.jpg`],
    )
    await f.service()
    await f.db.query('select public.request_account_deletion_for_service($1,$2)', [user, randomUUID()])

    await f.authenticated()
    await assert.rejects(
      () => f.db.query("update public.quantum_continuation_album_photos set status='ready' where id=$1", [album]),
      /account_deletion_pending/,
    )
    await assert.rejects(
      () => f.db.query(
        "insert into public.quantum_continuation_album_photos values($1,$2,$3,'ready',now()+interval '1 day',null,null,null)",
        [randomUUID(), user, `continuation-series/${randomUUID()}/source/${randomUUID()}/${randomUUID()}.jpg`],
      ),
      /account_deletion_pending/,
    )

    await f.service()
    await assert.rejects(
      () => f.db.query("update public.quantum_continuation_album_photos set status='deleted',deleted_at=now() where id=$1", [album]),
      /account_deletion_pending/,
    )
    const worker = randomUUID()
    const claimed = (await f.db.query(
      'select * from public.claim_retention_cleanup_jobs_for_service($1,25)', [worker],
    )).rows
    assert.equal(claimed.length, 1)
    assert.equal(claimed[0].kind, 'storage_object')
    assert.equal(
      (await f.db.query(
        'select public.complete_retention_cleanup_job_for_service($1,$2) value',
        [claimed[0].job_id, worker],
      )).rows[0].value,
      true,
    )
    const cleaned = (await f.db.query(
      'select status,deleted_at from public.quantum_continuation_album_photos where id=$1', [album],
    )).rows[0]
    assert.equal(cleaned.status, 'deleted')
    assert.ok(cleaned.deleted_at)
  } finally {
    await f.db.close()
  }
})

test('pending deletion blocks central access and all pre-existing public actor writes while status replay remains available', async () => {
  const f = await setup()
  try {
    const [user, peer] = f.users
    await f.service()
    const key = randomUUID()
    const requested = (await f.db.query(
      'select public.request_account_deletion_for_service($1,$2) value', [user, key],
    )).rows[0].value

    await f.authenticated(user)
    await assert.rejects(
      () => f.db.query('select * from public.get_access_context()'),
      (error) => error?.code === '42501' && /account_deletion_pending/.test(error.message),
    )
    await assert.rejects(
      () => f.db.query('insert into public.legacy_product_events values($1,$2)', [user, 'blocked']),
      /account_deletion_pending/,
    )
    for (const statement of [
      'insert into public.community_mbti_experiences values($1,$2)',
      'insert into public.activity_meetups values($1,$2)',
      'insert into public.groups values($1,$2)',
      'insert into public.match_pool values($1,$2)',
    ]) {
      await assert.rejects(
        () => f.db.query(statement, [user, 'blocked']),
        /account_deletion_pending/,
      )
    }

    await f.authenticated(peer)
    await f.db.query('insert into public.legacy_product_events values($1,$2)', [peer, 'allowed'])
    assert.equal((await f.db.query('select count(*)::int count from public.legacy_product_events')).rows[0].count, 1)

    await f.service()
    const replay = (await f.db.query(
      'select public.request_account_deletion_for_service($1,$2) value', [user, key],
    )).rows[0].value
    const status = (await f.db.query(
      'select public.get_account_deletion_status_for_service($1) value', [user],
    )).rows[0].value
    assert.equal(replay.request_id, requested.request_id)
    assert.equal(status.request_id, requested.request_id)

    await assert.rejects(
      () => f.db.query(
        'update quantum_private.community_member_profiles set friend_recognition_name=$2 where user_id=$1',
        [user, 'must-stay-private'],
      ),
      /account_deletion_pending/,
    )
  } finally {
    await f.db.close()
  }
})

test('existing RLS select policies preserve active access and restrict a pending account without exposing private tables', async () => {
  const f = await setup()
  let roleChanged = false
  try {
    const [user, peer] = f.users
    await f.db.query('insert into public.legacy_product_events values($1,$2)', [peer, 'visible'])
    await f.service()
    await f.db.query('select public.request_account_deletion_for_service($1,$2)', [user, randomUUID()])

    const policy = (await f.db.query(`select policy.permissive,policy.roles,policy.qual
      from pg_catalog.pg_policies policy
      where policy.schemaname='public' and policy.tablename='legacy_product_events'
        and policy.policyname='account_deletion_active_select'`)).rows[0]
    assert.equal(policy.permissive, 'RESTRICTIVE')
    assert.match(String(policy.roles), /authenticated/)
    assert.match(policy.qual, /account_allows_current_access/)

    await f.authenticated(peer)
    await f.db.exec('set role authenticated')
    roleChanged = true
    assert.equal((await f.db.query('select count(*)::int count from public.legacy_product_events')).rows[0].count, 1)
    await f.db.exec('reset role')
    roleChanged = false

    await f.authenticated(user)
    await f.db.exec('set role authenticated')
    roleChanged = true
    assert.equal((await f.db.query('select count(*)::int count from public.legacy_product_events')).rows[0].count, 0)
    await assert.rejects(
      () => f.db.query('select * from quantum_private.account_deletion_requests'),
      /permission denied/,
    )
  } finally {
    if (roleChanged) await f.db.exec('reset role')
    await f.db.close()
  }
})

test('Data API pre-request blocks only pending authenticated callers and preserves an existing identical hook', async () => {
  const f = await setup()
  try {
    const [user, peer] = f.users
    const roleConfig = (await f.db.query(`select config
      from pg_catalog.pg_roles role
      cross join lateral unnest(coalesce(role.rolconfig,array[]::text[])) config
      where role.rolname='authenticator' and config like 'pgrst.db_pre_request=%'`)).rows
    assert.deepEqual(roleConfig, [{ config: 'pgrst.db_pre_request=public.enforce_active_account_data_api_request' }])

    await f.service()
    await f.db.query('select public.request_account_deletion_for_service($1,$2)', [user, randomUUID()])
    await f.authenticated(peer)
    await f.db.query('select public.enforce_active_account_data_api_request()')
    await f.authenticated(user)
    await assert.rejects(
      () => f.db.query('select public.enforce_active_account_data_api_request()'),
      (error) => error?.code === '42501' && /account_deletion_pending/.test(error.message),
    )
    await f.db.exec("select set_config('request.jwt.claim.role','anon',false)")
    await f.db.query('select public.enforce_active_account_data_api_request()')
    await f.service()
    await f.db.query('select public.enforce_active_account_data_api_request()')
  } finally {
    await f.db.close()
  }

  const identical = await setup({
    preG9Sql: "alter role authenticator set pgrst.db_pre_request='public.enforce_active_account_data_api_request'",
  })
  await identical.db.close()
})

test('JSON-only PostgREST claims preserve service work and block a pending authenticated caller', async () => {
  const f = await setup()
  try {
    const [user, peer] = f.users
    const album = randomUUID()
    await f.db.query(
      "insert into public.quantum_continuation_album_photos values($1,$2,$3,'ready',now()+interval '1 day',null,null,null)",
      [album, user, `continuation-series/${randomUUID()}/source/${randomUUID()}/${randomUUID()}.jpg`],
    )

    await f.jsonOnly('service_role')
    await f.db.query('select public.request_account_deletion_for_service($1,$2)', [user, randomUUID()])

    await f.jsonOnly('authenticated', peer)
    await f.db.query('select public.enforce_active_account_data_api_request()')
    await f.jsonOnly('authenticated', user)
    await assert.rejects(
      () => f.db.query('select public.enforce_active_account_data_api_request()'),
      (error) => error?.code === '42501' && /account_deletion_pending/.test(error.message),
    )
    await f.jsonOnly('anon')
    await f.db.query('select public.enforce_active_account_data_api_request()')

    await f.jsonOnly('service_role')
    const worker = randomUUID()
    const claimed = (await f.db.query(
      'select * from public.claim_retention_cleanup_jobs_for_service($1,25)', [worker],
    )).rows
    const albumJob = claimed.find((job) => job.kind === 'storage_object' && job.storage_path.includes(album))
      ?? claimed.find((job) => job.kind === 'storage_object')
    assert.ok(albumJob)
    assert.equal(
      (await f.db.query(
        'select public.complete_retention_cleanup_job_for_service($1,$2) value',
        [albumJob.job_id, worker],
      )).rows[0].value,
      true,
    )
    assert.equal(
      (await f.db.query('select status from public.quantum_continuation_album_photos where id=$1', [album])).rows[0].status,
      'deleted',
    )
  } finally {
    await f.db.close()
  }
})

test('Data API hook conflicts and disabled Storage RLS stop the draft instead of being overwritten or enabled', async () => {
  await assert.rejects(
    () => setup({ preG9Sql: "alter role authenticator set pgrst.db_pre_request='public.existing_request_hook'" }),
    /pgrst_db_pre_request_conflict/,
  )
  await assert.rejects(
    () => setup({ preG9Sql: 'alter table storage.objects disable row level security' }),
    /storage_objects_rls_required/,
  )
})

test('Storage RLS keeps active access and blocks pending authenticated reads and writes', async () => {
  const f = await setup()
  let roleChanged = false
  try {
    const [user, peer] = f.users
    await f.db.query('insert into storage.objects values($1,$2,$3)', [randomUUID(), peer, 'voice/example'])
    await f.service()
    await f.db.query('select public.request_account_deletion_for_service($1,$2)', [user, randomUUID()])

    await f.authenticated(peer)
    await f.db.exec('set role authenticated')
    roleChanged = true
    assert.equal((await f.db.query('select count(*)::int count from storage.objects')).rows[0].count, 1)
    await f.db.exec('reset role')
    roleChanged = false

    await f.authenticated(user)
    await f.db.exec('set role authenticated')
    roleChanged = true
    assert.equal((await f.db.query('select count(*)::int count from storage.objects')).rows[0].count, 0)
    await assert.rejects(
      () => f.db.query('insert into storage.objects values($1,$2,$3)', [randomUUID(), user, 'blocked']),
      /row-level security policy/,
    )
  } finally {
    if (roleChanged) await f.db.exec('reset role')
    await f.db.close()
  }
})

test('financial records fail closed until an explicit hashed legal review', async () => {
  const f = await setup()
  try {
    const user = f.users[0]
    await f.db.query('insert into public.deposits(user_id) values($1)', [user])
    await f.service()
    const request = (await f.db.query('select public.request_account_deletion_for_service($1,$2) value', [user, randomUUID()])).rows[0].value
    assert.equal((await f.db.query('select legal_retention_ready from quantum_private.account_deletion_requests where id=$1', [request.request_id])).rows[0].legal_retention_ready, false)
    assert.equal((await f.db.query('select count(*)::int count from public.claim_retention_cleanup_jobs_for_service($1,25)', [randomUUID()])).rows[0].count, 0)
    const hash = 'a'.repeat(64)
    assert.equal((await f.db.query("select public.approve_account_legal_retention_for_service($1,$2,'retention_preserved',$3) value", [request.request_id, f.users[1], hash])).rows[0].value, true)
    const claimed = (await f.db.query('select * from public.claim_retention_cleanup_jobs_for_service($1,25)', [randomUUID()])).rows
    assert.equal(claimed[0].kind, 'auth_user')
  } finally {
    await f.db.close()
  }
})

async function retry(db, job, code) {
  return (await db.query(
    'select public.retry_retention_cleanup_job_for_service($1,$2,$3,60) value',
    [job.job_id, job.claim_token, code],
  )).rows[0].value
}
