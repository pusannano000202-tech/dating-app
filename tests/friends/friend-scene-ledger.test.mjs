import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

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
    create table public.users(id uuid primary key);
    create table public.profiles(user_id uuid primary key references public.users(id), display_name text, age int, school text, department text, year int, height int, body_type text);
    create table quantum_private.community_member_profiles(user_id uuid primary key references public.users(id), school_scope text, department text, display_name text, friend_recognition_name text);
    create table public.friend_requests(id uuid primary key, sender_user_id uuid not null references public.users(id), receiver_user_id uuid references public.users(id), status text not null);
    create table public.friendships(user_id uuid not null references public.users(id), friend_user_id uuid not null references public.users(id), status text not null, created_from_request_id uuid references public.friend_requests(id), source_match_id uuid, created_at timestamptz not null default now(), primary key(user_id,friend_user_id));
    create table public.friend_invites(id uuid primary key, inviter_user_id uuid not null references public.users(id), claimed_by_user_id uuid references public.users(id), friend_request_id uuid references public.friend_requests(id), status text not null, responded_at timestamptz);
    create table public.department_challenges(id uuid primary key, school_scope_key text not null, category text not null, title text not null, status text not null, team_capacity int not null, scheduled_at timestamptz, revision int not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table public.department_challenge_teams(id uuid primary key, challenge_id uuid not null references public.department_challenges(id), side text not null, department_key text not null, captain_user_id uuid not null references public.users(id), status text not null default 'accepted');
    create table public.department_challenge_roster(id uuid primary key default gen_random_uuid(), challenge_id uuid not null references public.department_challenges(id), team_id uuid not null references public.department_challenge_teams(id), user_id uuid not null references public.users(id), status text not null, department_key_snapshot text not null, revision int not null default 0, requested_at timestamptz not null default now(), accepted_at timestamptz, left_at timestamptz, unique(challenge_id,user_id));
    create function quantum_private.get_member_department_identity(p_user_id uuid)
    returns table(school_scope_key text,department_key text) language sql stable security definer set search_path='' as $$
      select lower(replace(profile.school_scope,' ','')),lower(replace(profile.department,' ',''))
      from quantum_private.community_member_profiles profile where profile.user_id=p_user_id
    $$;
    create function quantum_private.activity_meetup_alias(p_user_id uuid) returns text language sql stable security definer set search_path='' as $$
      select coalesce(profile.friend_recognition_name,profile.display_name,'익명') from quantum_private.community_member_profiles profile where profile.user_id=p_user_id
    $$;
  `)
  const migration = (await readdir(new URL('../../supabase/migrations/', import.meta.url))).find((name) => /_friend_scene\.sql$/.test(name))
  assert.ok(migration)
  await db.exec(await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), 'utf8'))
  const ids = Object.fromEntries(['actor','direct','matched','unknown','outsider'].map((key) => [key, randomUUID()]))
  for (const [key,id] of Object.entries(ids)) {
    await db.query('insert into public.users(id) values ($1)',[id])
    await db.query('insert into public.profiles(user_id,display_name,age,school,department) values ($1,$2,22,$3,$4)',[id,key,'부산대학교',key==='outsider'?'컴퓨터공학과':'기계공학과'])
    await db.query('insert into quantum_private.community_member_profiles(user_id,school_scope,department,display_name,friend_recognition_name) values ($1,$2,$3,$4,$5)',[id,'pnu_self_selected',key==='outsider'?'컴퓨터공학과':'기계공학과',key,`${key} 친구`])
  }
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.actor])
  return { db, ids }
}

async function connect(db, actor, friend, kind) {
  const [low,high] = [actor,friend].sort()
  const request = randomUUID()
  await db.query("insert into public.friend_requests(id,sender_user_id,receiver_user_id,status) values ($1,$2,$3,'accepted')",[request,actor,friend])
  await db.query("insert into public.friendships(user_id,friend_user_id,status,created_from_request_id,source_match_id) values ($1,$2,'active',$3,$4)",[low,high,request,kind==='matching'?randomUUID():null])
  if (kind==='direct') await db.query("insert into public.friend_invites(id,inviter_user_id,claimed_by_user_id,friend_request_id,status,responded_at) values ($1,$2,$3,$4,'accepted',now())",[randomUUID(),actor,friend,request])
}

test('friend scenes expose only accepted relationships and never leak evidence ids', async () => {
  const {db,ids} = await setup()
  try {
    await connect(db,ids.actor,ids.direct,'direct')
    await connect(db,ids.actor,ids.matched,'matching')
    await connect(db,ids.actor,ids.unknown,'unknown')
    const [low,high]=[ids.actor,ids.outsider].sort()
    await db.query("insert into public.friendships(user_id,friend_user_id,status,source_match_id) values ($1,$2,'active',$3)",[low,high,randomUUID()])
    const rows=(await db.query('select * from public.get_my_friend_scene_summaries() order by friend_user_id')).rows
    assert.equal(rows.length,3)
    assert.deepEqual(new Set(rows.map((row)=>`${row.scene_kind}:${row.evidence_kind}`)),new Set(['acquaintance:direct_invite','app_met:matching','unclassified:unknown']))
    assert.deepEqual(Object.keys(rows[0]).sort(),['evidence_kind','friend_user_id','scene_kind'])
    assert.equal((await db.query('select count(*)::int as count from public.get_friend_summaries()')).rows[0].count,3)
    assert.equal((await db.query("select has_function_privilege('anon','public.get_my_friend_scene_summaries()','execute') as allowed")).rows[0].allowed,false)
    assert.equal((await db.query("select has_function_privilege('authenticated','public.get_my_friend_scene_summaries()','execute') as allowed")).rows[0].allowed,true)
    assert.equal((await db.query("select has_table_privilege('authenticated','public.department_challenge_friend_invites','select') as allowed")).rows[0].allowed,false)
  } finally { await db.close() }
})

test('department invite rejection never reserves a slot or advances revision', async () => {
  const {db,ids} = await setup()
  try {
    await connect(db,ids.actor,ids.outsider,'direct')
    await connect(db,ids.actor,ids.direct,'direct')
    const challenge=randomUUID(),team=randomUUID()
    await db.query("insert into public.department_challenges(id,school_scope_key,category,title,status,team_capacity) values ($1,'pnu_self_selected','soccer','학과 축구 대항','recruiting',1)",[challenge])
    await db.query("insert into public.department_challenge_teams(id,challenge_id,side,department_key,captain_user_id) values ($1,$2,'challenger','기계공학과',$3)",[team,challenge,ids.actor])
    await db.query("insert into public.department_challenge_roster(challenge_id,team_id,user_id,status,department_key_snapshot,accepted_at) values ($1,$2,$3,'accepted','기계공학과',now())",[challenge,team,ids.actor])
    await assert.rejects(()=>db.query('select public.invite_friend_to_department_challenge($1,$2,$3,0,$4)',[challenge,team,ids.outsider,randomUUID()]),/department_restricted/)
    await assert.rejects(()=>db.query('select public.invite_friend_to_department_challenge($1,$2,$3,0,$4)',[challenge,team,ids.direct,randomUUID()]),/team_full/)
    assert.equal((await db.query('select revision from public.department_challenges where id=$1',[challenge])).rows[0].revision,0)
    assert.equal((await db.query('select count(*)::int as count from public.department_challenge_friend_invites where challenge_id=$1',[challenge])).rows[0].count,0)
  } finally { await db.close() }
})

test('captain invite and invited-friend acceptance recheck friendship, department, capacity, and revision', async () => {
  const {db,ids} = await setup()
  try {
    await connect(db,ids.actor,ids.direct,'direct')
    const challenge=randomUUID(),team=randomUUID()
    await db.query("insert into public.department_challenges(id,school_scope_key,category,title,status,team_capacity) values ($1,'pnu_self_selected','gaming','학과 게임 대항','recruiting',2)",[challenge])
    await db.query("insert into public.department_challenge_teams(id,challenge_id,side,department_key,captain_user_id) values ($1,$2,'challenger','기계공학과',$3)",[team,challenge,ids.actor])
    await db.query("insert into public.department_challenge_roster(challenge_id,team_id,user_id,status,department_key_snapshot,accepted_at) values ($1,$2,$3,'accepted','기계공학과',now())",[challenge,team,ids.actor])
    const state=(await db.query('select public.get_my_department_challenge_invite_state($1) as value',[challenge])).rows[0].value
    assert.deepEqual(state.candidates.map((row)=>row.user_id),[ids.direct])
    const key=randomUUID()
    const invited=(await db.query('select public.invite_friend_to_department_challenge($1,$2,$3,$4,$5) as value',[challenge,team,ids.direct,0,key])).rows[0].value
    assert.equal(invited.status,'pending')
    assert.equal(invited.revision,1)
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.direct])
    const accepted=(await db.query('select public.accept_my_department_challenge_invite($1,$2,$3) as value',[invited.invite_id,1,randomUUID()])).rows[0].value
    assert.equal(accepted.status,'accepted')
    assert.equal(accepted.revision,2)
    assert.equal((await db.query("select count(*)::int as count from public.department_challenge_roster where challenge_id=$1 and status='accepted'",[challenge])).rows[0].count,2)
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.actor])
    await db.query("update public.friendships set status='blocked' where user_id=least($1::uuid,$2::uuid) and friend_user_id=greatest($1::uuid,$2::uuid)",[ids.actor,ids.direct])
    const privateState=(await db.query('select public.get_my_department_challenge_invite_state($1) as value',[challenge])).rows[0].value
    assert.equal(privateState.sent[0].display_name,'친구 정보 비공개')
    await assert.rejects(()=>db.query('select public.invite_friend_to_department_challenge($1,$2,$3,$4,$5)',[challenge,team,ids.unknown,2,randomUUID()]),/active_friendship_required/)
  } finally { await db.close() }
})
