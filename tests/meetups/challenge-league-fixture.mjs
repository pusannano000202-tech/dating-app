import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
export const ids=Array.from({length:24},(_,i)=>`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`)
const migration=new URL('../../supabase/migrations/20260909165940_department_challenge_fair_league.sql',import.meta.url)
export async function fixture(extraMigrations=[]){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema quantum_private;
 create table public.users(id uuid primary key);create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
 create table quantum_private.community_member_profiles(user_id uuid primary key,school_scope text,department text,community_gender text);
 create table quantum_private.test_blocks(a uuid,b uuid);create table quantum_private.test_admins(id uuid,role text,mfa boolean,recent boolean);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function quantum_private.account_deletion_blocks_access(uuid) returns boolean language sql stable as $$select false$$;
 create function quantum_private.resolve_profile_readiness(uuid) returns table(minimum_signup_complete boolean) language sql stable as $$select true$$;
 create function quantum_private.tonight_invite_pair_is_blocked(uuid,uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from quantum_private.test_blocks where (a=$1 and b=$2) or(a=$2 and b=$1))$$;
 create function quantum_private.get_community_identity(uuid) returns table(school text) language sql stable as $$select '부산대'::text$$;
 create function quantum_private.activity_meetup_alias(uuid) returns text language sql stable as $$select '별친구'::text$$;
 create function public.verify_admin_aal2_session() returns boolean language plpgsql security definer set search_path='' as $$begin if not exists(select 1 from quantum_private.test_admins where id=auth.uid() and role='super_admin' and mfa) then raise exception 'mfa_required';end if;return true;end$$;
 create function quantum_private.require_recent_super_admin_auth(uuid) returns void language plpgsql security definer set search_path='' as $$begin if not exists(select 1 from quantum_private.test_admins where id=$1 and role='super_admin' and recent) then raise exception 'super_admin_required';end if;end$$;`);
 const base=await readFile(new URL('../../supabase/migrations/20260906181225_community_social_integrated.sql',import.meta.url),'utf8');
 const extract=(source,start)=>{const tail=source.slice(source.indexOf(start));return tail.slice(0,tail.indexOf('$$;')+3)};
 for(const name of ['canonical_department_key','canonical_school_scope_key','get_member_department_identity']) await db.exec(extract(base,`create or replace function quantum_private.${name}(`));
 await db.exec(base.slice(base.indexOf('create table public.department_challenges ('),base.indexOf('create index activity_meetup_messages_page_idx')));
 for(const table of ['department_challenges','department_challenge_teams','department_challenge_roster','department_challenge_schedule_confirmations','department_challenge_result_confirmations','department_challenge_events']) await db.exec(`alter table public.${table} enable row level security;revoke all on public.${table} from public,anon,authenticated,service_role;`);
 for(const name of ['department_challenge_projection']) await db.exec(extract(base,`create or replace function quantum_private.${name}(`));
 for(const name of ['create_department_challenge','request_department_challenge_roster','accept_department_challenge_roster_request','leave_my_department_challenge_roster','accept_department_challenge_opponent','confirm_my_department_challenge_schedule','confirm_my_department_challenge_result'])await db.exec(extract(base,`create or replace function public.${name}(`));
 const access=await readFile(new URL('../../supabase/migrations/20260907113358_automatic_activity_rooms.sql',import.meta.url),'utf8');await db.exec(extract(access,'create function quantum_private.assert_activity_room_access('));
 const friends=await readFile(new URL('../../supabase/migrations/20260907085612_friend_scene.sql',import.meta.url),'utf8');await db.exec(friends.slice(friends.indexOf('create table public.department_challenge_friend_invites ('),friends.indexOf('create unique index department_challenge_friend_invites_pending_idx')));
 const polls=await readFile(new URL('../../supabase/migrations/20260908164747_activity_room_chat_polls.sql',import.meta.url),'utf8');await db.exec(polls.slice(polls.indexOf('create table quantum_private.activity_room_polls ('),polls.indexOf('create table quantum_private.activity_room_poll_agreements (')));
 for(let i=0;i<ids.length;i++){await db.query('insert into public.users values($1)',[ids[i]]);await db.query('insert into auth.users(id) values($1)',[ids[i]]);await db.query('insert into quantum_private.community_member_profiles values($1,$2,$3,$4)',[ids[i],i===23?'other':'pnu_self_selected',i<5?'기계공학과':i<10?'전자공학과':i<15?'건축학과':'다른학과','male']);}
 await db.exec(await readFile(migration,'utf8'));
 for(const extra of extraMigrations)await db.exec(await readFile(extra,'utf8'));
 async function rpc(user,name,args){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);await db.exec('set role authenticated');try{return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value}finally{await db.exec('reset role')}}
 const act=(user,action,args={})=>rpc(user,'department_league_action',[action,JSON.stringify(args)]);
 async function team(offset,tiers=['gold','gold','gold','gold','gold']){const c=await rpc(ids[offset],'create_department_challenge',['gaming',`우리 팀 ${offset}`,'',5,crypto.randomUUID()]);const t=c.teams[0].id;for(let i=1;i<5;i++){const req=await rpc(ids[offset+i],'request_department_challenge_roster',[c.id,t,i===1?0:i*2-2,crypto.randomUUID()]);await rpc(ids[offset],'accept_department_challenge_roster_request',[c.id,req.roster_id,req.revision,crypto.randomUUID()]);}for(let i=0;i<5;i++)await act(ids[offset+i],'profile',{team_id:t,position:['top','jungle','mid','adc','support'][i],tier:tiers[i]});return {id:c.id,team:t,actor:ids[offset]};}
 return {db,rpc,act,team};
}
