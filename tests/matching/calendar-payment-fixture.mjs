import {randomUUID} from 'node:crypto'
import {calendarFixture,source} from './event-calendar-fixture.mjs'
import {installCalendarErasurePolicy} from './calendar-erasure-fixture.mjs'
export const paymentMigration='supabase/migrations/20260914192111_calendar_event_deposit_payments.sql'
export async function installActualSoloWeeklyApplication(f) {
  // Minimal pre-existing tables/auth eligibility adapters; the allocation-writing RPC
  // below is read verbatim from the existing forward migration, not reimplemented.
  await f.db.exec(`alter table public.quantum_weekly_applications alter column id set default gen_random_uuid();
    alter table public.quantum_weekly_applications add activity_id text,add idempotency_key uuid,add request_hash text,
      add party_type text,add party_group_id uuid,add roster_snapshot_hash text,add revision integer default 0;
    alter table public.quantum_weekly_application_candidates add preference_rank smallint;
    alter table public.quantum_weekly_application_members add week_key date,add role text,add school_snapshot text,
      add gender_snapshot text,add roster_snapshot_hash text,add request_hash text,add consented_at timestamptz;
    alter table public.friendships add created_from_request_id uuid;
    create table public.friend_requests(id uuid,status text,sender_user_id uuid,receiver_user_id uuid);
    create table public.quantum_weekly_party_commands(application_id uuid,actor_user_id uuid,action text,request_hash text,
      idempotency_key uuid,prior_revision integer,resulting_revision integer);
    create function public.get_my_weekly_activity_discovery_v2(week_date date)returns jsonb language sql as $$select '{}'::jsonb$$;`)
  const original=await source('supabase/migrations/20260906114007_weekly_accepted_friend_party.sql')
  const eligible=original.match(/create or replace function quantum_private\.weekly_party_member_is_eligible\([\s\S]*?\n\$\$;/)?.[0]
  const apply=original.match(/create or replace function public\.apply_to_my_weekly_activity_v2\([\s\S]*?\n\$\$;/)?.[0]
  if(!eligible||!apply)throw Error('actual weekly RPC missing')
  await f.db.exec(eligible+'\n'+apply)
}
export async function paymentFixture() {
  const f=await calendarFixture()
  await installCalendarErasurePolicy(f)
  await f.db.exec(`create function quantum_private.assert_activity_room_access(actor uuid)returns void language plpgsql as $$begin
    if not exists(select 1 from public.users where id=actor and role='user')then raise exception 'forbidden';end if;end$$;`)
  await f.db.exec(await source(paymentMigration))
  f.service={rpc:async(name,args)=>{
    await f.db.exec("set role service_role;select set_config('request.jwt.claim.role','service_role',false);select set_config('request.jwt.claim.sub','',false)")
    try{return {data:await f.value(`select public.${name}(${Object.keys(args).map((k,i)=>k+'=>$'+(i+1)).join(',')})as value`,Object.values(args)),error:null}}
    catch(error){return {data:null,error}}
    finally{await f.db.exec("reset role;select set_config('request.jwt.claim.role','',false)")}
  }}
  const prepared=await f.prepare()
  f.entry=prepared.entryId
  await f.rpc(f.ids.partner,'accept_calendar_couple_party',{p_party_id:f.entry,p_partner_consent:true})
  f.prepareOrder=async(owner=f.ids.leader,key=randomUUID())=>{
    const r=await f.service.rpc('prepare_calendar_payment_for_service',{p_actor:owner,p_audience:'couple',p_event_id:f.ids.event,p_application_id:f.entry,p_intent_id:key,p_provider_mode:'test'})
    if(r.error)throw r.error;return r.data
  }
  f.record=async(order,state='confirmed',key='fixture-'+order.intentId)=>{
    const r=await f.service.rpc('record_calendar_payment_for_service',{p_actor:order.ownerId,p_audience:'couple',p_event_id:f.ids.event,p_order_id:order.orderId,p_state:state,p_payment_key:key,p_amount_krw:10000})
    if(r.error)throw r.error;return r.data
  }
  f.finalize=(actor=f.ids.leader)=>f.rpc(actor,'finalize_calendar_payment_application',{p_audience:'couple',p_event_id:f.ids.event,p_application_id:f.entry})
  f.cancel=()=>f.rpc(f.ids.leader,'cancel_calendar_couple_party',{p_party_id:f.entry})
  f.request=order=>f.rpc(order.ownerId,'request_my_calendar_refund',{p_audience:'couple',p_event_id:f.ids.event,p_order_id:order.orderId})
  f.read=async(order)=>{
    const r=await f.service.rpc('get_calendar_payment_for_service',{p_actor:order.ownerId,p_audience:'couple',p_event_id:f.ids.event,p_order_id:order.orderId})
    if(r.error)throw r.error;return r.data
  }
  return f
}
