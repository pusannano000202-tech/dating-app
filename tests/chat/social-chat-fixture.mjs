import {readFile} from 'node:fs/promises'
import {fixture,ids} from '../meetups/challenge-league-fixture.mjs'
export {ids}
const source=async name=>readFile(new URL(`../../supabase/migrations/${name}`,import.meta.url),'utf8')
const migration=name=>new URL(`../../supabase/migrations/${name}`,import.meta.url)
export function meetupSchemaSection(source){
 const sql=source.replace(/\r\n/g,'\n')
 const start=sql.indexOf('alter table public.activity_meetups\n')
 const end=sql.indexOf('create table public.department_challenges (')
 if(start<0||end<=start)throw new Error('social_chat_fixture_meetup_schema_markers_missing')
 return sql.slice(start,end)
}
export async function setup(){
 const f=await fixture([migration('20260910035348_department_league_position_journey.sql')]),{db}=f
 try{
  const fn=async(file,name)=>{
   const s=await source(file),start=s.search(new RegExp(`create (?:or replace )?function quantum_private\\.${name}\\(`))
   if(start<0)throw new Error(name)
   const tail=s.slice(start);await db.exec(tail.slice(0,tail.indexOf('$$;')+3))
  }
  await db.exec(`create table public.friend_requests(id uuid primary key,sender_user_id uuid,receiver_user_id uuid,status text);
   create table public.friendships(user_id uuid,friend_user_id uuid,status text,created_from_request_id uuid);
   alter table quantum_private.community_member_profiles add column display_name text default '별친구',add column friend_recognition_name text;
   create function quantum_private.meetup_gender_eligibility(uuid,text)returns text language sql as $$select 'eligible'::text$$;
   create function quantum_private.get_or_create_daily_identity(uuid,timestamptz)returns jsonb language sql as $$select '{"display_name":"별친구"}'::jsonb$$;
   create table quantum_private.test_deletions(user_id uuid primary key);
   create or replace function quantum_private.account_deletion_blocks_access(uuid)returns boolean language sql stable as $$select exists(select 1 from quantum_private.test_deletions where user_id=$1)$$;`)
  await fn('20260906133228_continuation_friend_fee_pair_guard.sql','friend_pair_lock_key')
  await fn('20260907085612_friend_scene.sql','is_active_accepted_friend_pair')
  const notif=await source('20260522000009_z39_notifications_system.sql')
  await db.exec(notif.slice(notif.indexOf('CREATE TABLE IF NOT EXISTS notifications ('),notif.indexOf('CREATE INDEX IF NOT EXISTS idx_notifications_user')))
  const friends=await source('20260907085612_friend_scene.sql')
  await db.exec(friends.slice(friends.indexOf('create unique index department_challenge_friend_invites_pending_idx'),friends.indexOf('comment on function public.get_my_friend_scene_summaries')))
  await db.exec(await source('20260910095144_department_league_manual_lobby.sql'))
  await db.exec(await source('20260910102511_department_league_position_invites.sql'))
  await db.exec(await source('20260910120701_department_league_recruitment.sql'))
  const meetup=await source('20260808093918_community_activity_meetups_and_posts.sql')
  await db.exec(meetup.slice(meetup.indexOf('CREATE TABLE public.activity_meetups ('),meetup.indexOf('CREATE TABLE public.community_posts (')))
  const integrated=await source('20260906181225_community_social_integrated.sql')
  await db.exec(meetupSchemaSection(integrated))
  await fn('20260906181225_community_social_integrated.sql','activity_meetup_scope_eligible')
  const activity=await source('20260907113358_automatic_activity_rooms.sql')
  await db.exec(activity.slice(0,activity.indexOf('create function quantum_private.activity_room_definition('))+'commit;')
  await fn('20260907113358_automatic_activity_rooms.sql','activity_room_member_current')
  await db.exec(await source('20260909150749_meetup_recurring_study_rooms.sql'))
  await db.exec(await source('20260909170157_mentoring_role_matching.sql'))
  await db.exec(await source('20260910034819_group_mentoring_consent.sql'))
  await db.exec(await source('20260910162823_team_chat_social_index.sql'))
  const chat=(user,action,args)=>f.rpc(user,'league_team_chat',[action,JSON.stringify(args)])
  const rooms=(user,args={kind:null,id:null,cursor:null})=>f.rpc(user,'social_chat_rooms',[JSON.stringify(args)])
  const create=async(user=ids[0])=>f.rpc(user,'department_league_journey',['create',JSON.stringify({sport:'lol',title:'전략 공유 팀',slot:'mid',tier:'gold',idempotency_key:crypto.randomUUID()})])
  const invite=async(c,recipient=ids[1])=>{
   const request=crypto.randomUUID();await db.query("insert into public.friend_requests values($1,$2,$3,'accepted')",[request,ids[0],recipient]);
   await db.query("insert into public.friendships values($1,$2,'active',$3)",[ids[0],recipient,request]);
   const revision=(await db.query('select revision from public.department_challenges where id=$1',[c.challenge_id])).rows[0].revision
   return f.rpc(ids[0],'department_league_invites',['invite',JSON.stringify({sport:'lol',challenge_id:c.challenge_id,team_id:c.team_id,friend_user_id:recipient,slot:'top',expected_revision:revision,idempotency_key:crypto.randomUUID()})])
  }
  const accept=async(c,invitation,user=ids[1])=>{
   const revision=(await db.query('select revision from public.department_challenges where id=$1',[c.challenge_id])).rows[0].revision
   return f.rpc(user,'department_league_invites',['accept',JSON.stringify({sport:'lol',invite_id:invitation.id,tier:'gold',expected_revision:revision,idempotency_key:crypto.randomUUID()})])
  }
  return {...f,chat,rooms,create,invite,accept}
 }catch(error){await db.close();throw error}
}
