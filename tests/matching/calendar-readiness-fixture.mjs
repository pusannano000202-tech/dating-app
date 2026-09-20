import {readFile} from 'node:fs/promises'

const migration = name => readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')

// Execute the production readiness predicates. Only pre-existing table shapes and
// the request-role transport are reduced; no appearance eligibility is mocked.
export async function installCalendarReadiness(db,ids) {
  await db.exec(`create schema private;
    create function private.current_request_role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role',true),'')$$;
    create table auth.users(id uuid primary key,phone text,phone_confirmed_at timestamptz);
    create table public.profiles(user_id uuid primary key,school text,gender text,worldcup_completed_at timestamptz);
    create table public.photos(user_id uuid);
    create table public.private_appearance_scores(user_id uuid primary key,status text,score_effective numeric);
    create table quantum_private.community_member_profiles(user_id uuid primary key,birth_date date,
      school_scope text,department text,community_gender text,display_name text,alias_claimed_at timestamptz);`)
  const normalize = (await migration('20260622000001_profile_display_name_claims.sql'))
    .match(/CREATE OR REPLACE FUNCTION public\.normalize_profile_display_name\([\s\S]*?\n\$\$;/i)?.[0]
  const readiness = (await migration('20260906081607_accept_gotrue_phone_storage.sql'))
    .match(/CREATE OR REPLACE FUNCTION quantum_private\.resolve_profile_readiness\([\s\S]*?\n\$\$;/)?.[0]
  const matching = (await migration('20260905100000_minimum_community_signup.sql'))
    .match(/CREATE OR REPLACE FUNCTION public\.is_profile_matching_ready\([\s\S]*?\n\$\$;/)?.[0]
  if (!normalize || !readiness || !matching) throw Error('actual calendar readiness function missing')
  await db.exec(normalize+'\n'+readiness+'\n'+matching)
  for (const key of ['leader','partner','outsider','single','otherSchool']) {
    const user=ids[key],school=key==='otherSchool'?'different-school':'pnu_self_selected'
    await db.query("insert into auth.users values($1,'821000000000',now())",[user])
    await db.query("insert into public.profiles values($1,$2,'male',now())",[user,school])
    await db.query("insert into quantum_private.community_member_profiles values($1,(current_date-interval '25 years')::date,$2,'synthetic','male','검증사용자',now())",[user,school])
    await db.query('insert into public.photos values($1)',[user])
    await db.query("insert into public.private_appearance_scores values($1,'ready',50)",[user])
  }
}
