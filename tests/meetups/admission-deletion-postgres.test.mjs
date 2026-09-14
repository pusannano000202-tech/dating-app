import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {setTimeout as delay} from 'node:timers/promises'
import {accountFinanceDependencies, erasureMigration} from '../account/admission-finance-fixture.mjs'

// Explicit opt-in only to the authorized throwaway, network-isolated container.
// Never uses project .env, Supabase credentials, a host port, or real Auth.
const CONTAINER = 'quantum-financial-audit-20260914'
const DATABASE = 'deletion_guard_audit'
const enabled = process.env.ACCOUNT_ERASURE_POSTGRES_CONTAINER === CONTAINER

function docker(args,input='') {
  return new Promise((resolve,reject) => {
    const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']})
    let out='',err=''
    child.stdout.on('data',v=>{out+=v})
    child.stderr.on('data',v=>{err+=v})
    child.on('error',reject)
    child.on('exit',code=>code===0?resolve(out.trim()):reject(new Error(err||out||`docker exit ${code}`)))
    child.stdin.end(input)
  })
}
const sql = (text,database=DATABASE) => docker(['exec','-i',CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],text)

function session(name) {
  const child=spawn('docker',['exec','-i',CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',DATABASE],{windowsHide:true,stdio:['pipe','pipe','pipe']})
  let output='',errors='',pending=null,closed=false
  child.stdout.on('data',chunk=>{
    output+=chunk
    if(pending&&output.includes(pending.marker)){
      const before=output.slice(0,output.indexOf(pending.marker))
      output=output.slice(output.indexOf(pending.marker)+pending.marker.length)
      const active=pending;pending=null;active.resolve(before.trim())
    }
  })
  child.stderr.on('data',chunk=>{errors+=chunk})
  child.on('exit',code=>{closed=true;if(pending){const active=pending;pending=null;active.reject(new Error(errors||`session exit ${code}`))}})
  child.on('error',error=>{if(pending){pending.reject(error);pending=null}})
  const send = text => new Promise((resolve,reject)=>{
    if(closed||pending)return reject(new Error('session unavailable'))
    const marker='done_'+randomUUID().replaceAll('-','')
    pending={marker,resolve,reject};child.stdin.write(`${text}\n\\echo ${marker}\n`)
  })
  return {name,send,async close(){if(!closed){child.stdin.end('rollback;\n\\q\n');await new Promise(resolve=>child.once('exit',resolve))}}}
}

async function assertWaiting(name) {
  for(let attempt=0;attempt<60;attempt++){
    const state=await sql(`select coalesce(wait_event_type,'') from pg_stat_activity where application_name='${name}';`)
    if(state==='Lock')return
    await delay(25)
  }
  assert.fail(`${name} never waited for the owner row lock`)
}

test('PostgreSQL owner row serializes both checkout/erasure race directions and refund completion', {skip: !enabled,timeout:60000}, async () => {
  const inspected=JSON.parse(await docker(['inspect',CONTAINER]))[0]
  assert.equal(inspected.HostConfig.NetworkMode,'none')
  assert.equal(inspected.Mounts.some(m=>m.Type==='bind'),false)
  assert.match(inspected.Config.Image,/^postgres:17-alpine$/)
  // This one database is owned by this test; other agent databases are untouched.
  await sql(`drop database if exists ${DATABASE};create database ${DATABASE};`,'postgres')
  await sql(`do $$begin
    if not exists(select from pg_roles where rolname='anon')then create role anon;end if;
    if not exists(select from pg_roles where rolname='authenticated')then create role authenticated;end if;
    if not exists(select from pg_roles where rolname='service_role')then create role service_role;end if;
  end$$;
  create schema auth;create schema quantum_private;
  create table auth.users(id uuid primary key);
  create table public.users(id uuid primary key references auth.users(id) on delete cascade);
  create table quantum_private.meetup_admission_checkout_orders(
    order_id text primary key,intent_id uuid not null unique,user_id uuid references public.users(id) on delete set null,state text not null
  );
  create table quantum_private.activity_meetup_admission_deposits(
    id uuid primary key,intent_id uuid not null unique,user_id uuid references public.users(id) on delete set null,state text not null
  );
  create table quantum_private.activity_meetup_admission_refund_outbox(
    deposit_id uuid primary key references quantum_private.activity_meetup_admission_deposits(id),state text not null
  );`)
  await sql(await accountFinanceDependencies())
  await sql(await readFile(erasureMigration,'utf8'))
  const users=[randomUUID(),randomUUID(),randomUUID()]
  for(const user of users)await sql(`insert into auth.users values('${user}');insert into public.users values('${user}');`)

  let holder=session('erasure_holder'),contender=session('erasure_contender')
  try {
    // Writer first: DELETE starts before COMMIT and must see that new checkout
    // after waiting, despite its outer statement having an older snapshot.
    await holder.send(`set application_name='erasure_holder';begin;insert into quantum_private.meetup_admission_checkout_orders values('race-order','${randomUUID()}','${users[0]}','prepared');`)
    await contender.send("set application_name='erasure_contender';")
    const deletion=assert.rejects(contender.send(`delete from auth.users where id='${users[0]}';`),/account_financial_retention_pending/)
    await assertWaiting(contender.name)
    await holder.send('commit;')
    await deletion
    assert.equal(await sql(`select user_id from quantum_private.meetup_admission_checkout_orders where order_id='race-order';`),users[0])
    assert.equal(await sql(`select count(*) from auth.users where id='${users[0]}';`),'1')
  } finally {await holder.close();await contender.close()}

  holder=session('erasure_holder');contender=session('erasure_contender')
  try {
    // Deletion first: preparation waits, then fails before it can return an order
    // that the application could send to a payment provider.
    await holder.send(`set application_name='erasure_holder';begin;delete from auth.users where id='${users[1]}';`)
    await contender.send("set application_name='erasure_contender';")
    const preparation=assert.rejects(contender.send(`insert into quantum_private.meetup_admission_checkout_orders values('too-late','${randomUUID()}','${users[1]}','prepared');`),/account_financial_retention_pending/)
    await assertWaiting(contender.name)
    await holder.send('commit;')
    await preparation
    assert.equal(await sql("select count(*) from quantum_private.meetup_admission_checkout_orders where order_id='too-late';"),'0')
  } finally {await holder.close();await contender.close()}

  const deposit=randomUUID()
  await sql(`insert into quantum_private.activity_meetup_admission_deposits values('${deposit}','${randomUUID()}','${users[2]}','refund_due');insert into quantum_private.activity_meetup_admission_refund_outbox values('${deposit}','processing');`)
  holder=session('erasure_holder');contender=session('erasure_contender')
  try {
    await holder.send(`set application_name='erasure_holder';begin;update quantum_private.activity_meetup_admission_deposits set state='refunded' where id='${deposit}';update quantum_private.activity_meetup_admission_refund_outbox set state='completed' where deposit_id='${deposit}';`)
    await contender.send("set application_name='erasure_contender';")
    const deletion=contender.send(`delete from auth.users where id='${users[2]}';`)
    await assertWaiting(contender.name)
    await holder.send('commit;')
    await deletion
    assert.equal(await sql(`select (user_id is null)::text||':'||state from quantum_private.activity_meetup_admission_deposits where id='${deposit}';`),'true:refunded')
    assert.equal(await sql(`select state from quantum_private.activity_meetup_admission_refund_outbox where deposit_id='${deposit}';`),'completed')
  } finally {await holder.close();await contender.close()}
})
