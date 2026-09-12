import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {setup} from './pending-schedule-fixture.mjs'
export const lifecycleMigration = new URL('../../supabase/migrations/20260912024918_meetup_paid_admission_lifecycle.sql',import.meta.url)
export async function lifecycleFixture(){
 const f=await setup()
 await f.db.exec(`create table quantum_private.admission_test_account_gate(user_id uuid primary key,blocked boolean default false,ready boolean default true);
 create function quantum_private.account_deletion_blocks_access(u uuid)returns boolean language sql as $$select coalesce((select blocked from quantum_private.admission_test_account_gate where user_id=u),false)$$;
 create function quantum_private.resolve_profile_readiness(u uuid)returns table(minimum_signup_complete boolean)language sql as $$select coalesce((select ready from quantum_private.admission_test_account_gate where user_id=u),true)$$;
 create function quantum_private.tonight_invite_pair_is_blocked(a uuid,b uuid)returns boolean language sql as $$select exists(select 1 from public.friendships where status='blocked'and((user_id=a and friend_user_id=b)or(user_id=b and friend_user_id=a)))$$;
 create table public.notifications(id uuid primary key,user_id uuid references public.users(id)on delete cascade,kind text,payload jsonb,created_at timestamptz default now());
 create table quantum_private.social_notification_events(notification_id uuid primary key references public.notifications(id)on delete cascade deferrable initially deferred,domain text,entity_id uuid,team_id uuid,entity_type text,source_id uuid,source_version text,event text,actor_id uuid,recipient_id uuid,created_at timestamptz default now(),unique(domain,entity_id,source_id,source_version,event,recipient_id));`)
 const accountSource=await readFile(new URL('../../supabase/migrations/20260907113358_automatic_activity_rooms.sql',import.meta.url),'utf8')
 await f.db.exec(accountSource.match(/create function quantum_private\.assert_activity_room_access\(p_user uuid\)[\s\S]*?\$\$;/)[0])
 const social=await readFile(new URL('../../supabase/migrations/20260910142923_social_activity_notifications.sql',import.meta.url),'utf8')
 // Real event writer. Non-meetup branches are not exercised by this fixture.
 for(const name of ['social_notification_scope','social_notification_href','emit_social_notification'])
  await f.db.exec(social.match(new RegExp('create function quantum_private\\.'+name+'\\([\\s\\S]*?end\\$\\$;'))[0])
 await f.db.exec(`create function public.resolve_my_social_notification(p_notification_id uuid)returns jsonb language sql as $$select jsonb_build_object('status','ended','href',null)$$;
 alter table public.activity_meetup_messages add column sender_alias_snapshot text;`)
 const chat=await readFile(new URL('../../supabase/migrations/20260908165129_daily_identity.sql',import.meta.url),'utf8')
 await f.db.exec(chat.match(/create or replace function public\.get_my_activity_meetup_chat\(p_meetup_id uuid\)[\s\S]*?\$\$;/)[0])
 await f.db.exec(await readFile(new URL('../../supabase/migrations/20260911165313_meetup_admission_preparation.sql',import.meta.url),'utf8'))
 await f.db.exec(await readFile(lifecycleMigration,'utf8'))
 await f.db.exec('grant usage on schema public,auth to authenticated,anon,service_role')
 await f.as(f.users.mechanicalCaptain)
 const room=await f.value(`select public.create_activity_meetup_v3('board_game','보증금 신청 테스트','실제 결제 아님','학생회관',now()+interval '2 days',3,'all',now()+interval '2 days 2 hours','department','board-game-round',$1)as value`,[randomUUID()]);f.roomId=room.id
 await f.db.query(`insert into quantum_private.activity_meetup_admission_policies(meetup_id,amount_krw,policy_version,summary,conditions,enabled)values($1,17000,'fixture-only','테스트 정책',array['실제 돈 없음'],true)`,[f.roomId])
 f.prepare=async(user=f.users.mechanicalMember)=>{await f.as(user);const q=(await f.value('select public.get_activity_meetup_admission_context($1)as value',[f.roomId])).quote;return f.value('select public.prepare_activity_meetup_admission($1,$2::jsonb)as value',[f.roomId,JSON.stringify({intro:'함께할래요',strength:'설명을 잘해요',paymentMethod:'new',consent:true,policyVersion:q.policyVersion,quoteId:q.id,idempotencyKey:randomUUID()})])}
 f.confirm=async(intent,receipt=randomUUID(),amount=17000)=>{await f.db.exec("set role service_role;select set_config('request.jwt.claim.role','service_role',false)");try{return await f.value('select public.confirm_activity_meetup_admission_payment_for_service($1,$2,$3,$4)as value',[intent,'fixture-provider',receipt,amount])}finally{await f.db.exec('reset role')}}
 f.list=(cursor=null)=>f.value('select public.get_activity_meetup_admissions($1,$2)as value',[f.roomId,cursor])
 f.status=()=>f.value('select public.get_my_activity_meetup_admission($1)as value',[f.roomId])
 f.decide=(id,action='approve',revision=0)=>f.value('select public.decide_activity_meetup_admission($1,$2,$3,$4)as value',[f.roomId,id,action,revision])
 f.cancel=(id,revision=0)=>f.value('select public.cancel_my_activity_meetup_admission($1,$2,$3)as value',[f.roomId,id,revision])
 return f
}
