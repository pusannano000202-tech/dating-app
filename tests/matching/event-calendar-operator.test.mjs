import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {calendarFixture,source} from './event-calendar-fixture.mjs'
const migration='supabase/migrations/20260914194527_calendar_operator_publication.sql'
async function fixture(){
 const f=await calendarFixture(),session=randomUUID()
 await f.db.exec(`alter table auth.users add deleted_at timestamptz,add banned_until timestamptz;
 create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz,not_after timestamptz);
 create table public.admins(user_id uuid primary key);
 create function auth.jwt()returns jsonb language sql stable as $$select current_setting('request.jwt.claims',true)::jsonb$$;
 create function public.is_super_admin(actor uuid)returns boolean language sql stable as $$select exists(select 1 from public.users where id=actor and role='super_admin')$$;`)
 await f.db.query("update public.users set role='super_admin' where id=$1",[f.ids.otherSchool])
 await f.db.query('insert into public.admins values($1)',[f.ids.otherSchool])
 await f.db.query('insert into auth.sessions(id,user_id,created_at)values($1,$2,now())',[session,f.ids.otherSchool])
 const recent=await source('supabase/migrations/20260902201243_venue_partner_rbac.sql')
 const mfa=await source('supabase/migrations/20260907200713_admin_mfa_privacy_boundary.sql')
 for(const [sql,name] of [[recent,'quantum_private.require_recent_super_admin_auth'],[mfa,'quantum_private.admin_session_has_aal2'],[mfa,'public.verify_admin_aal2_session']]){
  const escaped=name.replaceAll('.','\\.')
  await f.db.exec(sql.match(new RegExp('CREATE OR REPLACE FUNCTION '+escaped+'\\([\\s\\S]*?\\n\\$\\$;','i'))[0])
 }
 const claims=async(aal='aal2')=>f.db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:session,aal,exp:Math.floor(Date.now()/1000)+3600})])
 await claims()
 if(process.env.CALENDAR_OPERATOR_BASELINE!=='true')await f.db.exec(await source(migration))
 const input={p_event_id:randomUUID(),p_school_scope_key:'pnu_self_selected',p_title:'합성 운영 일정',p_summary:'실제 행사 아님',p_image_path:null,
  p_starts_at:new Date(Date.now()+86400000*2).toISOString(),p_ends_at:new Date(Date.now()+86400000*2+7200000).toISOString(),
  p_application_closes_at:new Date(Date.now()+86400000).toISOString(),p_location_name:'합성 장소',p_deposit_amount_krw:10000}
 const create=(actor=f.ids.otherSchool,args=input)=>f.rpc(actor,'admin_create_couple_calendar_event',args)
 const publish=()=>f.rpc(f.ids.otherSchool,'admin_publish_couple_calendar_event',{p_event_id:input.p_event_id})
 return {...f,session,claims,input,create,publish}
}
test('operator creates a hidden draft, explicitly publishes it, and cannot mutate published metadata',async()=>{
 const f=await fixture();try{
  assert.deepEqual(await f.create(),{eventId:f.input.p_event_id,status:'draft',depositAmountKrw:10000})
  assert.deepEqual(await f.create(),{eventId:f.input.p_event_id,status:'draft',depositAmountKrw:10000})
  assert.equal((await f.rpc(f.ids.leader,'get_my_event_calendar',{p_month:f.month,p_audience:'couple'})).events.some(e=>e.id===f.input.p_event_id),false)
  assert.equal((await f.publish()).status,'recruiting');assert.equal((await f.publish()).status,'recruiting')
  assert.equal((await f.rpc(f.ids.leader,'get_my_event_calendar',{p_month:f.month,p_audience:'couple'})).events.some(e=>e.id===f.input.p_event_id),true)
  await assert.rejects(f.create(f.ids.otherSchool,{...f.input,p_title:'different'}),/calendar_idempotency_conflict/)
  await assert.rejects(f.db.query("update quantum_private.couple_calendar_events set starts_at=starts_at+interval '1 hour' where id=$1",[f.input.p_event_id]),/calendar_event_metadata_locked/)
 }finally{await f.db.close()}
})
test('direct operator RPC requires real admin role, recent session and AAL2; invalid money/date fail closed',async()=>{
 const f=await fixture();try{
  await assert.rejects(f.create(f.ids.leader),/super_admin_required/)
  await f.claims('aal1');await assert.rejects(f.create(),/mfa_required/)
  await f.claims();await f.db.query("update auth.sessions set created_at=now()-interval '1 hour' where id=$1",[f.session])
  await assert.rejects(f.create(),/reauthentication_required/)
  await f.db.query('update auth.sessions set created_at=now() where id=$1',[f.session])
  await assert.rejects(f.create(f.ids.otherSchool,{...f.input,p_deposit_amount_krw:0}),/invalid_calendar_event/)
  await assert.rejects(f.create(f.ids.otherSchool,{...f.input,p_ends_at:f.input.p_starts_at}),/invalid_calendar_event/)
  await assert.rejects(f.create(f.ids.otherSchool,{...f.input,p_school_scope_key:''}),/invalid_calendar_event/)
  assert.equal((await f.db.query('select count(*)::integer as n from quantum_private.couple_calendar_events where id=$1',[f.input.p_event_id])).rows[0].n,0)
 }finally{await f.db.close()}
})
