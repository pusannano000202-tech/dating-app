import {spawn} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
import {refundMigration} from './admission-refund-fixture.mjs'

const container='quantum-financial-audit-20260914'
const expectedContainerId='aae913900b63224228a250243f429bdefc1783868472d453ec2635327927c929'
const database='admission_refund_audit'

function docker(args,input='') {
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe'],windowsHide:true})
  let stdout='',stderr=''
  const finished=new Promise((resolve,reject)=>{
    child.stdout.on('data',chunk=>{stdout+=chunk})
    child.stderr.on('data',chunk=>{stderr+=chunk})
    child.on('error',reject)
    child.on('close',code=>code===0?resolve(stdout):reject(new Error(stderr||stdout||`docker exit ${code}`)))
  })
  child.stdin.end(input)
  return {child,finished}
}
function psql(sql) {
  return docker(['exec','-i',container,'psql','-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],sql)
}
function jsonRows(output) {
  return output.split(/\r?\n/).filter(line=>/^[\[{]/.test(line)).map(line=>JSON.parse(line))
}
async function waitForMarker(run) {
  await new Promise((resolve,reject)=>{
    let seen=''
    run.child.stdout.on('data',chunk=>{seen+=chunk;if(seen.includes('REFUND_LOCK_HELD'))resolve()})
    run.finished.then(()=>reject(new Error('lock marker not observed')),reject)
  })
}
const service="set role service_role;select set_config('request.jwt.claim.role','service_role',false);"

// Opt-in, two independent real PostgreSQL sessions. This deliberately refuses an
// existing DB rather than replacing another agent's or a prior audit's evidence.
export async function runRefundPostgresConcurrency() {
  const inspected=JSON.parse(await docker(['inspect',container]).finished)[0]
  assert.equal(inspected.Id,expectedContainerId)
  assert.equal(inspected.HostConfig.NetworkMode,'none')
  assert.deepEqual(inspected.HostConfig.PortBindings,{})
  assert.equal(inspected.Mounts.some(m=>m.Type==='bind'),false)
  const exists=await docker(['exec',container,'psql','-U','postgres','-d','postgres','-At','-c',`select 1 from pg_database where datname='${database}'`]).finished
  assert.equal(exists.trim(),'','Dedicated refund audit DB already exists; retain it for inspection.')
  await docker(['exec',container,'createdb','-U','postgres',database]).finished
  const lifecycle=await readFile(new URL('../../supabase/migrations/20260912024918_meetup_paid_admission_lifecycle.sql',import.meta.url),'utf8')
  const checkout=await readFile(new URL('../../supabase/migrations/20260913102522_meetup_admission_checkout_orders.sql',import.meta.url),'utf8')
  const depositTable=lifecycle.match(/create table quantum_private\.activity_meetup_admission_deposits\([\s\S]*?\n\);/)[0]
  const outboxTable=lifecycle.match(/create table quantum_private\.activity_meetup_admission_refund_outbox\([\s\S]*?\n\);/)[0]
  const checkoutTables=checkout.slice(checkout.indexOf('create table quantum_private.meetup_admission_checkout_orders'),checkout.indexOf('create function quantum_private.meetup_checkout_json'))
  await psql(`do $$declare r text;begin foreach r in array array['anon','authenticated','service_role']loop
    begin execute format('create role %I',r);exception when duplicate_object then null;end;end loop;end$$;
    create schema quantum_private;create schema auth;
    create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.users(id uuid primary key);
    create table public.activity_meetups(id uuid primary key,title text);
    create table quantum_private.study_rooms(id uuid primary key,title text);
    create table quantum_private.group_mentoring_sessions(id uuid primary key,title text);
    create table public.admins(user_id uuid primary key references public.users(id),role text check(role in('admin','super_admin')));
    ${depositTable}
    alter table quantum_private.activity_meetup_admission_deposits add column source_kind text default 'custom_meetup',add column source_room_id uuid;
    ${outboxTable}
    ${checkoutTables}
    alter table quantum_private.activity_meetup_admission_deposits enable row level security;
    alter table quantum_private.activity_meetup_admission_refund_outbox enable row level security;
    revoke all on quantum_private.activity_meetup_admission_deposits,quantum_private.activity_meetup_admission_refund_outbox from public,anon,authenticated,service_role;
    grant usage on schema public,auth to anon,authenticated,service_role;
    ${await readFile(refundMigration,'utf8')}`).finished
  const owner=randomUUID(),admin=randomUUID(),room=randomUUID(),deposits=[randomUUID(),randomUUID()]
  const seed=deposits.map((id,index)=>{
    const intent=randomUUID(),order='meetup_'+intent.replaceAll('-',''),key='synthetic-key-'+index
    return `insert into quantum_private.activity_meetup_admission_deposits(id,intent_id,meetup_id,user_id,amount_krw,provider,receipt_ref,policy_version,policy_summary,policy_conditions,state,source_room_id)
      values('${id}','${intent}','${room}','${owner}',10000,'toss','${key}','synthetic-only','No real payment',array['synthetic'],'refund_due','${room}');
      insert into quantum_private.activity_meetup_admission_refund_outbox(deposit_id,reason)values('${id}','synthetic_liability');
      insert into quantum_private.meetup_admission_checkout_orders(order_id,intent_id,user_id,room_kind,room_id,amount_krw,policy_version,provider_mode,metadata,expires_at,state,payment_key)
      values('${order}','${intent}','${owner}','custom_meetup','${room}',10000,'synthetic-only','test','{}',now()+interval '1 day','confirmed','${key}');`
  }).join('\n')
  await psql(`insert into public.users(id)values('${owner}'),('${admin}');
    insert into public.admins(user_id,role)values('${admin}','super_admin');
    insert into public.activity_meetups(id,title)values('${room}','Synthetic refund concurrency');${seed}`).finished
  const asOwner=`set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`
  const firstRequest=psql(`begin;${asOwner}select public.request_my_meetup_admission_refund('${deposits[0]}');
    select 'REFUND_LOCK_HELD';
    select pg_sleep(2);commit;`)
  await waitForMarker(firstRequest)
  const secondRequest=psql(`${asOwner}select public.request_my_meetup_admission_refund('${deposits[0]}');`)
  const [firstRequestOutput,secondRequestOutput]=await Promise.all([firstRequest.finished,secondRequest.finished])
  assert.deepEqual(jsonRows(firstRequestOutput)[0],jsonRows(secondRequestOutput)[0])
  await psql(`${asOwner}select public.request_my_meetup_admission_refund('${deposits[1]}');`).finished
  const requests=jsonRows(await psql(`${asOwner}select public.list_my_meetup_admission_refunds();`).finished)[0]
  for(const r of requests) await psql(`${service}select public.review_meetup_admission_refund_for_service('${admin}','${r.depositId}','${r.requestId}','approve');`).finished
  const lease1=randomUUID(),lease2=randomUUID()
  const firstClaim=psql(`begin;${service}select public.claim_meetup_admission_refunds_for_service('${lease1}',1,'test');
    select 'REFUND_LOCK_HELD';
    select pg_sleep(2);commit;`)
  await waitForMarker(firstClaim)
  const secondClaims=jsonRows(await psql(`${service}select public.claim_meetup_admission_refunds_for_service('${lease2}',20,'test');`).finished)[0]
  const firstClaims=jsonRows(await firstClaim.finished)[0]
  assert.equal(firstClaims.length,1);assert.equal(secondClaims.length,1)
  assert.notEqual(firstClaims[0].depositId,secondClaims[0].depositId)
  assert.deepEqual(jsonRows(await psql(`${service}select public.claim_meetup_admission_refunds_for_service('${randomUUID()}',20,'test');`).finished)[0],[])
  const claim=firstClaims[0],transactionKey='synthetic-cancel-'+claim.requestId
  const finalize=`select public.finalize_meetup_admission_refund_for_service('${claim.depositId}','${claim.requestId}','${claim.leaseId}','${claim.orderId}','${claim.paymentKey}','${transactionKey}',10000);`
  const firstFinalize=psql(`begin;${service}${finalize}
    select 'REFUND_LOCK_HELD';
    select pg_sleep(2);commit;`)
  await waitForMarker(firstFinalize)
  const secondFinalize=psql(`${service}${finalize}`)
  const completions=await Promise.all([firstFinalize.finished,secondFinalize.finished])
  assert.deepEqual(jsonRows(completions[0])[0],jsonRows(completions[1])[0])
  const count=await psql(`select count(*)from quantum_private.meetup_admission_refund_audit where deposit_id='${claim.depositId}'and event='completed';`).finished
  assert.equal(count.trim(),'1')
  return {database,duplicateOwnerRequests:1,distinctWorkerClaims:2,concurrentFinalizerCompletions:1,providerCalls:0}
}
