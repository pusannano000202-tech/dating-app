import {PGlite} from '@electric-sql/pglite'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {installCalendarReadiness} from './calendar-readiness-fixture.mjs'
export const calendarMigration='supabase/migrations/20260914191013_matching_event_calendar_preparation.sql'
export const source=path=>readFile(new URL('../../'+path,import.meta.url),'utf8')
// Controlled auth and pre-existing schema adapters. Real new SQL executes in PGlite;
// this is not a live Supabase/PostgREST/payment-provider test.
export async function calendarFixture(){
 const db=new PGlite()
 const ids={leader:randomUUID(),partner:randomUUID(),outsider:randomUUID(),single:randomUUID(),otherSchool:randomUUID(),event:randomUUID(),otherEvent:randomUUID(),window:randomUUID(),round:randomUUID()}
 await db.exec(`create role authenticated;create role anon;create role service_role;
 create schema auth;create schema quantum_private;
 create table public.users(id uuid primary key,school text not null default 'pnu_self_selected',role text not null default 'user');
 create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function public.get_access_context()returns table(access_role text)language sql stable as $$select role from public.users where id=auth.uid()$$;
 create function quantum_private.canonical_school_scope_key(s text)returns text language sql immutable as $$select s$$;
 create function quantum_private.get_member_department_identity(u uuid)returns table(school_scope_key text,department_key text)language sql stable as $$select school,'synthetic'::text from public.users where id=u$$;
 create table quantum_private.relationship_states(user_id uuid primary key references public.users(id),status text);
 create function public.get_my_relationship_state()returns jsonb language sql stable as $$select jsonb_build_object('status',coalesce((select status from quantum_private.relationship_states where user_id=auth.uid()),'single'))$$;
 create table public.friendships(user_id uuid,friend_user_id uuid,status text);
 create function quantum_private.tonight_invite_pair_is_blocked(a uuid,b uuid)returns boolean language sql stable as $$select exists(select 1 from public.friendships where status='blocked'and((user_id=a and friend_user_id=b)or(user_id=b and friend_user_id=a)))$$;
 create table public.quantum_weekly_activity_windows(id uuid primary key,activity_id text default 'board-game',activity_kind text default 'board_game',week_key date,
 title text default '합성 일정',summary text default '실제 행사 아님',starts_at timestamptz,ends_at timestamptz,application_closes_at timestamptz,
 location_name text default '합성 장소',status text default 'recruiting',school_scope_key text default 'pnu_self_selected');
 create table public.quantum_weekly_applications(id uuid primary key,user_id uuid,week_key date,status text,party_size integer,assigned_window_id uuid,updated_at timestamptz default now());
 create table public.quantum_weekly_application_members(application_id uuid,participant_user_id uuid,school_scope_key text,department_key text,consent_status text,lifecycle_status text);
 create table public.quantum_weekly_application_candidates(application_id uuid,window_id uuid);
 create table public.tonight_teams(id uuid primary key default gen_random_uuid(),round_id uuid,status text);
 create function public.get_my_current_tonight_round()returns jsonb language sql stable as $$select jsonb_build_object('round',jsonb_build_object('id',current_setting('fixture.round')))$$;
 create function public.get_my_tonight_participation_summary(p uuid)returns jsonb language plpgsql stable as $$begin if auth.uid() is null then raise exception 'not_authenticated';end if;return '{}'::jsonb;end$$;
 create function public.create_quantum_couple_party(p uuid)returns jsonb language sql as $$select '{}'::jsonb$$;
 create function public.accept_quantum_couple_party(p uuid)returns jsonb language sql as $$select '{}'::jsonb$$;
 grant usage on schema public,auth to authenticated,anon,service_role;
 `)
 const original=await source('supabase/migrations/20260813222000_matching_quantum_couple_double_date.sql')
 await db.exec(original.match(/CREATE TABLE public\.quantum_couple_parties \([\s\S]*?\n\);/)[0])
 await db.exec('alter table public.quantum_couple_parties enable row level security;revoke all on public.quantum_couple_parties from public,anon,authenticated;grant all on public.quantum_couple_parties to service_role')
 await db.exec(await source(calendarMigration))
 for(const key of ['leader','partner','outsider','single','otherSchool'])await db.query('insert into public.users(id,school)values($1,$2)',[ids[key],key==='otherSchool'?'different-school':'pnu_self_selected'])
 await db.query("insert into quantum_private.relationship_states(user_id,status)values($1,'in_relationship'),($2,'in_relationship'),($3,'in_relationship')",[ids.leader,ids.partner,ids.outsider])
 await db.query("insert into public.friendships values($1,$2,'active'),($1,$3,'active')",[ids.leader,ids.partner,ids.outsider])
 await db.query(`insert into quantum_private.couple_calendar_events(id,school_scope_key,title,summary,starts_at,ends_at,application_closes_at,location_name,status,created_by)
 values($1,'pnu_self_selected','합성 커플 일정','실제 행사 아님',now()+interval '2 days',now()+interval '2 days 2 hours',now()+interval '1 day','합성 장소','recruiting',$2),
 ($3,'different-school','별도 학교','실제 행사 아님',now()+interval '2 days',now()+interval '2 days 2 hours',now()+interval '1 day','다른 장소','recruiting',$2)`,[ids.event,ids.leader,ids.otherEvent])
 await db.query(`insert into public.quantum_weekly_activity_windows(id,week_key,starts_at,ends_at,application_closes_at)values($1,date_trunc('week',now())::date,now()+interval '2 days',now()+interval '2 days 2 hours',now()+interval '1 day')`,[ids.window])
  await db.query("select set_config('fixture.round',$1,false)",[ids.round])
  await installCalendarReadiness(db,ids)
 const as=async(actor)=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor??''])
 const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.value
 const rpc=async(actor,name,args={})=>{
  await as(actor);await db.exec('set role authenticated')
  try{return await value(`select public.${name}(${Object.keys(args).map((key,i)=>`${key}=>$${i+1}`).join(',')})as value`,Object.values(args))}
  finally{await db.exec('reset role')}
 }
 const prepare=(actor=ids.leader,partner=ids.partner,key=randomUUID(),event=ids.event)=>rpc(actor,'prepare_calendar_couple_party',{p_event_id:event,p_partner_user_id:partner,p_idempotency_key:key,p_invitation_consent:true})
 const month=(await db.query("select date_trunc('month',now()+interval '2 days')::date::text as month")).rows[0].month
 return {db,ids,as,value,rpc,prepare,month}
}
