import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {setup} from './pending-schedule-fixture.mjs'
import {registerHooks} from 'node:module'
registerHooks({resolve(specifier,context,nextResolve){return nextResolve(specifier==='./admission-contract'&&context.parentURL?.endsWith('/admission-server.ts')?'./admission-contract.ts':specifier,context)}})
const {getMeetupAdmissionContext,prepareMeetupAdmission}=await import('../../lib/meetups/admission-server.ts')
const migrationUrl=new URL('../../supabase/migrations/20260911165313_meetup_admission_preparation.sql',import.meta.url)
async function fixture(){
 const f=await setup()
 // Real account assertion; supporting readiness/deletion checks are fixture controls.
 await f.db.exec(`create table quantum_private.admission_test_account_gate(user_id uuid primary key,blocked boolean not null default false,ready boolean not null default true);
 create function quantum_private.account_deletion_blocks_access(p_user uuid) returns boolean language sql as $$select coalesce((select blocked from quantum_private.admission_test_account_gate where user_id=p_user),false)$$;
 create function quantum_private.resolve_profile_readiness(p_user uuid) returns table(minimum_signup_complete boolean) language sql as $$select coalesce((select ready from quantum_private.admission_test_account_gate where user_id=p_user),true)$$;`)
 const accountSource=await readFile(new URL('../../supabase/migrations/20260907113358_automatic_activity_rooms.sql',import.meta.url),'utf8')
 const accountFunction=accountSource.match(/create function quantum_private\.assert_activity_room_access\(p_user uuid\)[\s\S]*?\$\$;/)?.[0]
 assert.ok(accountFunction)
 await f.db.exec(accountFunction)
 await f.db.exec(await readFile(migrationUrl,'utf8'))
 await f.db.exec('grant usage on schema public,auth to authenticated,anon')
 await f.as(f.users.mechanicalCaptain)
 const room=await f.value(`select public.create_activity_meetup_v3('board_game','준비 계약 테스트','실제 돈 사용 안 함','학생회관',now()+interval '2 days',4,'all',now()+interval '2 days 2 hours','department','board-game-round',$1) as value`,[randomUUID()])
 f.roomId=room.id
 await f.as(f.users.mechanicalMember)
 f.context=()=>f.value('select public.get_activity_meetup_admission_context($1) as value',[f.roomId])
 f.prepare=(input,id=f.roomId)=>f.value('select public.prepare_activity_meetup_admission($1,$2::jsonb) as value',[id,JSON.stringify(input)])
 f.configure=()=>f.db.query(`insert into quantum_private.activity_meetup_admission_policies(meetup_id,amount_krw,policy_version,summary,conditions,enabled) values($1,17000,'test-only-v1','테스트용 정책',array['실제 결제 아님','운영 정책 승인 필요'],true)`,[f.roomId])
 return f
}
const inputFor=q=>({intro:'함께 공부해요',strength:'설명을 도와요',paymentMethod:'new',consent:true,policyVersion:q.policyVersion,quoteId:q.id,idempotencyKey:randomUUID()})

async function accountCascadeFixture(f){
 // Match existing production FK actions omitted by the small shared fixture:
 // 20260521000000_00_create_public_users_table, 20260905100000_minimum_community_signup,
 // and 20260808093918_community_activity_meetups_and_posts. No production DDL is changed.
 await f.db.exec(`alter table public.users drop constraint users_id_fkey,
  add constraint users_id_fkey foreign key(id) references auth.users(id) on delete cascade;
 alter table quantum_private.community_member_profiles drop constraint community_member_profiles_user_id_fkey,
  add constraint community_member_profiles_user_id_fkey foreign key(user_id) references public.users(id) on delete cascade;
 alter table public.activity_meetups drop constraint activity_meetups_host_user_id_fkey,
  add constraint activity_meetups_host_user_id_fkey foreign key(host_user_id) references public.users(id) on delete cascade;
 alter table public.activity_meetup_members drop constraint activity_meetup_members_user_id_fkey,
  add constraint activity_meetup_members_user_id_fkey foreign key(user_id) references public.users(id) on delete cascade;
 alter table public.activity_meetup_members drop constraint activity_meetup_members_meetup_id_fkey,
  add constraint activity_meetup_members_meetup_id_fkey foreign key(meetup_id) references public.activity_meetups(id) on delete cascade;`)
}

test('unconfigured and default-disabled policy return null quote/terms and cannot prepare',async()=>{
 const f=await fixture();try{
  assert.deepEqual(await f.context(),{room:{kind:'custom_meetup',id:f.roomId},quote:null,policy:null,checkoutEnabled:false,preparationOnly:true})
  await f.db.query(`insert into quantum_private.activity_meetup_admission_policies(meetup_id,amount_krw,policy_version,summary,conditions) values($1,17000,'test-v1','테스트',array['조건'])`,[f.roomId])
  assert.equal((await f.context()).quote,null)
  await assert.rejects(f.prepare(inputFor({id:randomUUID(),policyVersion:'test-v1'})),/deposit_policy_unavailable/)
 }finally{await f.db.close()}
})
test('configured quote is server-owned, stable while valid, and prepares an unpaid draft without joining',async()=>{
 const f=await fixture();try{
  await f.configure();const context=await f.context(),q=context.quote
  assert.equal(q.amountKrw,17000);assert.deepEqual(q.paymentMethods,['new']);assert.deepEqual(context.policy.conditions,['실제 결제 아님','운영 정책 승인 필요'])
  assert.equal((await f.context()).quote.id,q.id)
  const input=inputFor(q),result=await f.prepare(input)
  assert.deepEqual(result,{applicationId:null,intentId:result.intentId,admission:'draft',payment:'unpaid',preparation:'prepared',checkoutEnabled:false,reused:false})
  assert.deepEqual(await f.prepare(input),{...result,reused:true})
  const row=(await f.db.query('select * from quantum_private.activity_meetup_admission_intents where id=$1',[result.intentId])).rows[0]
  assert.equal(row.user_id,f.users.mechanicalMember);assert.equal(row.amount_krw,17000);assert.equal(row.payment_state,'unpaid');assert.equal(row.admission_state,'draft')
  assert.equal((await f.db.query('select * from public.activity_meetup_members where meetup_id=$1 and user_id=$2',[f.roomId,f.users.mechanicalMember])).rows.length,0)
  await assert.rejects(f.prepare({...input,intro:'다른 입력'}),/idempotency_key_reused/)
  await assert.rejects(f.prepare({...input,idempotencyKey:randomUUID()}),/admission_preparation_exists/)
 }finally{await f.db.close()}
})
test('RPC independently rejects forged values, controls, missing consent, and unsupported carryover',async()=>{
 const f=await fixture();try{
  await f.configure();const q=(await f.context()).quote,input=inputFor(q)
  for(const patch of [{amountKrw:1},{userId:f.users.mechanicalCaptain},{payment:'held'},{consent:false},{intro:'숨김\u200b문자'},{intro:'😀'.repeat(81)},{strength:'제어\r문자'},{policyVersion:4},{quoteId:'invalid'},{paymentMethod:'carryover'}])await assert.rejects(f.prepare({...input,...patch}))
  const result=await f.prepare({...input,intro:'😀'.repeat(80),strength:'😀'.repeat(119)+'\n'})
  assert.equal(result.payment,'unpaid')
 }finally{await f.db.close()}
})
test('quote ownership, expiry, changed money or terms and disabled policy fail closed',async()=>{
 const f=await fixture();try{
  await f.configure();const q=(await f.context()).quote,input=inputFor(q)
  await f.as(f.users.mechanicalReserve);await assert.rejects(f.prepare(input),/deposit_quote_mismatch/)
  await f.as(f.users.mechanicalMember)
  await f.db.query('update quantum_private.activity_meetup_admission_quotes set expires_at=now()-interval \'1 second\' where id=$1',[q.id])
  await assert.rejects(f.prepare(input),/deposit_quote_expired/)
  const q2=(await f.context()).quote
  await f.db.query('update quantum_private.activity_meetup_admission_policies set amount_krw=18000 where meetup_id=$1',[f.roomId])
  await assert.rejects(f.prepare(inputFor(q2)),/deposit_policy_changed/)
  const q3=(await f.context()).quote
  await f.db.query("update quantum_private.activity_meetup_admission_policies set summary='바뀐 약관' where meetup_id=$1",[f.roomId])
  await assert.rejects(f.prepare(inputFor(q3)),/deposit_policy_changed/)
  await f.db.query('update quantum_private.activity_meetup_admission_policies set enabled=false where meetup_id=$1',[f.roomId])
  await assert.rejects(f.prepare(inputFor(q3)),/deposit_policy_unavailable/)
 }finally{await f.db.close()}
})
test('current membership, scope, account, capacity and closure are rechecked',async()=>{
 const f=await fixture();try{
  await f.configure();const input=inputFor((await f.context()).quote)
  await f.as(f.users.computerCaptain);await assert.rejects(f.context(),/meetup_not_found/)
  await f.as(f.users.mechanicalCaptain);await assert.rejects(f.context(),/meetup_already_joined/)
  await f.as(f.users.mechanicalMember)
  await f.db.query("update auth.users set banned_until=now()+interval '1 hour' where id=$1",[f.users.mechanicalMember]);await assert.rejects(f.prepare(input),/activity_room_forbidden/)
  await f.db.query('update auth.users set banned_until=null where id=$1',[f.users.mechanicalMember])
  await f.db.query('insert into quantum_private.admission_test_account_gate(user_id,blocked) values($1,true)',[f.users.mechanicalMember]);await assert.rejects(f.context(),/account_deletion_pending/)
  await f.db.query('update quantum_private.admission_test_account_gate set blocked=false,ready=false where user_id=$1',[f.users.mechanicalMember]);await assert.rejects(f.context(),/profile_required/)
  await f.db.query('update quantum_private.admission_test_account_gate set ready=true where user_id=$1',[f.users.mechanicalMember])
  await f.db.query("update public.activity_meetups set status='cancelled' where id=$1",[f.roomId]);await assert.rejects(f.prepare(input),/meetup_closed/)
  await f.db.query("update public.activity_meetups set status='open',capacity=2 where id=$1",[f.roomId])
  await f.db.query("insert into public.activity_meetup_members(meetup_id,user_id,role) values($1,$2,'member')",[f.roomId,f.users.mechanicalReserve]);await assert.rejects(f.prepare(input),/meetup_full/)
 }finally{await f.db.close()}
})
test('authenticated role has RPC-only access; anonymous and old direct join are denied',async()=>{
 const f=await fixture();try{
  await f.configure();await f.db.exec('set role authenticated')
  const context=await f.context();assert.equal((await f.prepare(inputFor(context.quote))).payment,'unpaid')
  for(const table of ['activity_meetup_admission_policies','activity_meetup_admission_quotes','activity_meetup_admission_intents'])await assert.rejects(f.db.query(`select * from quantum_private.${table}`),/permission denied/)
  await assert.rejects(f.value('select public.join_activity_meetup($1) as value',[f.roomId]),/permission denied/)
  await f.db.exec('reset role;set role anon');await assert.rejects(f.context(),/permission denied/)
  await f.db.exec('reset role')
  const tables=await f.db.query("select relname,relrowsecurity from pg_class where relname like 'activity_meetup_admission_%' and relkind='r'")
  assert.equal(tables.rows.length,3);assert.ok(tables.rows.every(row=>row.relrowsecurity))
  const functions=await f.db.query("select proname,prosecdef,proconfig from pg_proc where proname in ('get_activity_meetup_admission_context','prepare_activity_meetup_admission')")
  assert.equal(functions.rows.length,2);assert.ok(functions.rows.every(row=>row.prosecdef&&row.proconfig.includes('search_path=""')))
 }finally{await f.db.close()}
})

test('expired preparation can be replaced by a new quote and cannot replay as paid',async()=>{
 const f=await fixture();try{
  await f.configure();const input=inputFor((await f.context()).quote),first=await f.prepare(input)
  await f.db.query("update quantum_private.activity_meetup_admission_quotes set expires_at=now()-interval '1 second' where id=$1",[input.quoteId])
  await f.db.query("update quantum_private.activity_meetup_admission_intents set expires_at=now()-interval '1 second' where id=$1",[first.intentId])
  await assert.rejects(f.prepare(input),/deposit_quote_expired/)
  const second=await f.prepare(inputFor((await f.context()).quote))
  assert.notEqual(first.intentId,second.intentId);assert.equal(second.payment,'unpaid')
  const rows=(await f.db.query('select preparation_state,payment_state from quantum_private.activity_meetup_admission_intents where user_id=$1 order by created_at',[f.users.mechanicalMember])).rows
  assert.deepEqual(rows,[{preparation_state:'expired',payment_state:'unpaid'},{preparation_state:'prepared',payment_state:'unpaid'}])
 }finally{await f.db.close()}
})

test('changed gender, department and signed-out account cannot use an earlier quote',async()=>{
 const f=await fixture();try{
  await f.configure();const input=inputFor((await f.context()).quote)
  await f.db.query("update public.activity_meetups set gender_mode='female_only' where id=$1",[f.roomId]);await assert.rejects(f.prepare(input),/meetup_gender_restricted/)
  await f.db.query("update public.activity_meetups set gender_mode='all' where id=$1",[f.roomId])
  await f.db.query("update quantum_private.community_member_profiles set department='다른학과' where user_id=$1",[f.users.mechanicalMember]);await assert.rejects(f.prepare(input),/meetup_not_found/)
  await f.as('');await assert.rejects(f.context(),/not_authenticated/)
 }finally{await f.db.close()}
})

test('actual PostgreSQL DTOs pass the shared server adapter without becoming checkout success',async()=>{
 const f=await fixture();try{
  const client={rpc:async(name,args)=>{
   try{return{data:name==='get_activity_meetup_admission_context'?await f.context():await f.prepare(args.p_input,args.p_meetup_id),error:null}}
   catch(error){return{data:null,error:{message:error.message,code:error.code}}}
  }}
  assert.equal((await getMeetupAdmissionContext(client,f.roomId)).quote,null)
  await f.configure()
  const context=await getMeetupAdmissionContext(client,f.roomId)
  assert.equal(context.quote.amountKrw,17000);assert.equal(context.checkoutEnabled,false)
  const result=await prepareMeetupAdmission(client,f.roomId,inputFor(context.quote))
  assert.equal(result.admission,'draft');assert.equal(result.payment,'unpaid');assert.equal(result.applicationId,null)
 }finally{await f.db.close()}
})

test('account deletion cleans only its unpaid quotes/intents and preserves other applicants',async()=>{
 const f=await fixture();try{
  await accountCascadeFixture(f);await f.configure()
  const ownQuote=(await f.context()).quote,ownIntent=await f.prepare(inputFor(ownQuote))
  await f.as(f.users.mechanicalReserve)
  const otherQuote=(await f.context()).quote,otherIntent=await f.prepare(inputFor(otherQuote))
  await assert.doesNotReject(f.db.query('delete from auth.users where id=$1',[f.users.mechanicalMember]))
  assert.equal((await f.db.query('select * from public.users where id=$1',[f.users.mechanicalMember])).rows.length,0)
  assert.equal((await f.db.query('select * from quantum_private.activity_meetup_admission_quotes where id=$1',[ownQuote.id])).rows.length,0)
  assert.equal((await f.db.query('select * from quantum_private.activity_meetup_admission_intents where id=$1',[ownIntent.intentId])).rows.length,0)
  assert.equal((await f.db.query('select payment_state from quantum_private.activity_meetup_admission_intents where id=$1',[otherIntent.intentId])).rows[0].payment_state,'unpaid')
  assert.equal((await f.db.query('select * from quantum_private.activity_meetup_admission_policies where meetup_id=$1',[f.roomId])).rows.length,1)
  // The quote -> intent edge is also safe independently of FK trigger ordering.
  await f.db.query('delete from quantum_private.activity_meetup_admission_quotes where id=$1',[otherQuote.id])
  assert.equal((await f.db.query('select * from quantum_private.activity_meetup_admission_intents where id=$1',[otherIntent.intentId])).rows.length,0)
  assert.equal((await f.db.query('select * from auth.users where id=$1',[f.users.mechanicalReserve])).rows.length,1)
 }finally{await f.db.close()}
})

test('host account cascade is not blocked by new room policy or unpaid applicant drafts',async()=>{
 const f=await fixture();try{
  await accountCascadeFixture(f)
  const originalRoom=f.roomId
  // Bare fixture room has no legacy chat/events to require their separate deletion workflow.
  f.roomId=(await f.db.query(`insert into public.activity_meetups(host_user_id,school,category,title,place_name,scheduled_at,capacity)
   values($1,'부산대학교','board_game','호스트 삭제 회귀','학생회관',now()+interval '2 days',4) returning id`,[f.users.mechanicalReserve])).rows[0].id
  await f.configure();const quote=(await f.context()).quote,intent=await f.prepare(inputFor(quote))
  await assert.doesNotReject(f.db.query('delete from auth.users where id=$1',[f.users.mechanicalReserve]))
  for(const table of ['activity_meetup_admission_policies','activity_meetup_admission_quotes','activity_meetup_admission_intents'])
   assert.equal((await f.db.query(`select * from quantum_private.${table} where meetup_id=$1`,[f.roomId])).rows.length,0)
  assert.equal((await f.db.query('select * from public.activity_meetups where id=$1',[f.roomId])).rows.length,0)
  assert.equal((await f.db.query('select * from public.activity_meetups where id=$1',[originalRoom])).rows.length,1)
  assert.equal((await f.db.query('select * from auth.users where id=$1',[f.users.mechanicalMember])).rows.length,1)
  assert.equal(intent.payment,'unpaid')
 }finally{await f.db.close()}
})
