import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {setup} from './pending-schedule-fixture.mjs'
async function fixture(){
  const f=await setup()
  await f.db.exec("alter table public.activity_meetup_members add column identity_alias_snapshot text not null default '별친구'")
  // Empty automatic-room side only; these tests exercise real meetup scope/RPCs.
  await f.db.exec(`create table quantum_private.activity_room_members(room_id uuid,user_id uuid,status text,joined_at timestamptz);
   create table quantum_private.activity_room_rooms(id uuid,pool_id uuid,status text,room_number integer);
   create table quantum_private.activity_room_pools(id uuid,activity_key text,capacity smallint);
   create function quantum_private.activity_room_member_current(uuid,uuid) returns boolean language sql as $$select false$$;
   create function quantum_private.assert_activity_room_access(p_actor uuid) returns void language plpgsql as $$begin if p_actor is null then raise exception 'not_authenticated';end if;end$$;`)
  await f.db.exec(await readFile(new URL('../../supabase/migrations/20260907201908_home_my_meetups_read.sql',import.meta.url),'utf8'))
  await f.db.exec(await readFile(new URL('../../supabase/migrations/20260911141856_meetup_pending_schedule.sql',import.meta.url),'utf8'))
  await f.db.exec('grant usage on schema public,auth to authenticated,anon')
  return f
}
async function create(f,extra={}){
  const p={category:'dining',title:'채팅에서 약속 정하기',description:'만날 시간은 함께 투표해요',place:null,start:null,capacity:3,gender:'all',end:null,scope:'department',activity:null,key:randomUUID(),state:'schedule_pending',...extra}
  return f.value('select public.create_activity_meetup_v4($1,$2,$3,$4,$5::timestamptz,$6,$7,$8::timestamptz,$9,$10,$11::uuid,$12) as value',Object.values(p))
}
test('pending meetup persists actual NULL schedule, lists, joins, leaves, confirms and retains idempotency',async()=>{
 const f=await fixture()
 try{
  await f.as(f.users.mechanicalCaptain)
  await f.db.exec('set role authenticated')
  const key=randomUUID(),m=await create(f,{key})
  assert.equal(m.schedule_status,'schedule_pending')
  assert.deepEqual(await create(f,{key}),m)
  await assert.rejects(f.db.query('update public.activity_meetups set title=$1 where id=$2',['권한 없는 변경',m.id]),/permission denied/)
  await f.db.exec('reset role')
  const stored=(await f.db.query('select scheduled_at,ends_at,place_name,schedule_status from public.activity_meetups where id=$1',[m.id])).rows[0]
  assert.deepEqual(stored,{scheduled_at:null,ends_at:null,place_name:null,schedule_status:'schedule_pending'})
  const listed=await f.db.query("select * from public.list_activity_meetups_v4('dining',30,null,'department')")
  assert.equal(listed.rows[0].schedule_status,'schedule_pending')
  await assert.rejects(create(f,{key,title:'다른 내용으로 변경'}),/idempotency_key_reused/)
  await assert.rejects(f.value('select public.complete_my_activity_meetup($1,0,$2) as value',[m.id,randomUUID()]),/schedule_pending/)
  await assert.rejects(f.value("select public.advance_my_activity_meetup_shared_guide($1,'wrap',0,$2) as value",[m.id,randomUUID()]),/schedule_pending/)
  await f.as(f.users.mechanicalMember)
  await f.value('select public.join_activity_meetup($1) as value',[m.id])
  await f.as(f.users.mechanicalReserve)
  await f.value('select public.join_activity_meetup($1) as value',[m.id])
  await f.value('select public.leave_activity_meetup($1) as value',[m.id])
  assert.equal((await f.db.query('select status from public.activity_meetups where id=$1',[m.id])).rows[0].status,'open')
  await f.as(f.users.mechanicalCaptain)
  const detail=await f.value('select public.get_my_activity_meetup_detail($1) as value',[m.id])
  assert.equal(detail.schedule_status,'schedule_pending')
  const start=new Date(Date.now()+3*3600000).toISOString(),end=new Date(Date.now()+5*3600000).toISOString()
  await f.value('select public.update_my_activity_meetup_schedule($1,$2,$3,$4,$5,$6) as value',[m.id,start,end,'학생회관',detail.revision,randomUUID()])
  assert.equal((await f.db.query('select schedule_status from public.activity_meetups where id=$1',[m.id])).rows[0].schedule_status,'confirmed')
 }finally{await f.db.close()}
})

test('home resumes a pending membership, preserves confirmed rooms and rejects outsiders, left and stale departments',async()=>{
 const f=await fixture()
 try{
  await f.as(f.users.mechanicalCaptain)
  const pending=await create(f)
  const start=new Date(Date.now()+3*3600000).toISOString(),end=new Date(Date.now()+5*3600000).toISOString()
  const confirmed=await create(f,{state:'confirmed',start,end,place:'학생회관'})
  await f.db.exec('set role authenticated')
  let home=await f.value('select public.get_my_home_meetups() as value')
  assert.equal(home.items.find(x=>x.id===pending.id)?.schedule_status,'schedule_pending')
  assert.equal(home.items.find(x=>x.id===pending.id)?.scheduled_at,null)
  assert.equal(home.items.find(x=>x.id===confirmed.id)?.schedule_status,'confirmed')
  await f.db.exec('reset role')
  await f.as(f.users.mechanicalMember)
  assert.deepEqual((await f.value('select public.get_my_home_meetups() as value')).items,[])
  await f.value('select public.join_activity_meetup($1) as value',[pending.id])
  assert.equal((await f.value('select public.get_my_home_meetups() as value')).items.length,1)
  await f.value('select public.leave_activity_meetup($1) as value',[pending.id])
  assert.deepEqual((await f.value('select public.get_my_home_meetups() as value')).items,[])
  await f.as(f.users.computerCaptain)
  assert.deepEqual((await f.value('select public.get_my_home_meetups() as value')).items,[])
  await f.as(f.users.mechanicalCaptain)
  await f.db.query("update quantum_private.community_member_profiles set department='컴퓨터공학과' where user_id=$1",[f.users.mechanicalCaptain])
  assert.deepEqual((await f.value('select public.get_my_home_meetups() as value')).items,[])
  await f.as('')
  await assert.rejects(f.value('select public.get_my_home_meetups() as value'),/not_authenticated/)
  await f.db.exec('set role anon')
  await assert.rejects(f.value('select public.get_my_home_meetups() as value'),/permission denied/)
 }finally{await f.db.close()}
})

test('keyset pages expose pending and confirmed rooms beyond thirty without duplicates or an existing cursor row',async()=>{
 const f=await fixture()
 try{
  await f.as(f.users.mechanicalCaptain)
  const pending=await create(f)
  for(let i=0;i<31;i++)await create(f,{state:'confirmed',start:new Date(Date.now()+(4+i)*3600000).toISOString(),end:new Date(Date.now()+(6+i)*3600000).toISOString(),place:'학생회관'})
  const first=(await f.db.query("select * from public.list_activity_meetups_v4('dining',30,null,'department',null)")).rows
  assert.equal(first.length,30)
  assert.ok(first.every(x=>x.schedule_status==='confirmed'))
  const cursor=first.at(-1).list_cursor
  assert.equal(typeof cursor,'string')
  await f.db.query("update public.activity_meetups set status='cancelled' where id=$1",[first.at(-1).id])
  const second=(await f.db.query("select * from public.list_activity_meetups_v4('dining',30,null,'department',$1)",[cursor])).rows
  assert.equal(second.length,2)
  assert.ok(second.some(x=>x.id===pending.id))
  assert.equal(new Set([...first,...second].map(x=>x.id)).size,32)
  const final=(await f.db.query("select * from public.list_activity_meetups_v4('dining',30,null,'department',$1)",[second.at(-1).list_cursor])).rows
  assert.deepEqual(final,[])
  await assert.rejects(f.db.query("select * from public.list_activity_meetups_v4(null,30,null,null,'bad')"),/invalid_cursor/)
  await f.as(f.users.computerCaptain)
  assert.deepEqual((await f.db.query("select * from public.list_activity_meetups_v4('dining',30,null,'department',$1)",[cursor])).rows,[])
 }finally{await f.db.close()}
})
test('pending create preserves profile gender, department, authority and confirmed legacy checks',async()=>{
 const f=await fixture()
 try{
  await f.as('')
  await assert.rejects(create(f),/not_authenticated/)
  await f.as(f.users.mechanicalMember)
  await assert.rejects(create(f,{gender:'female_only'}),/meetup_gender_restricted/)
  await assert.rejects(create(f,{gender:null}),/invalid_gender_mode/)
  await assert.rejects(create(f,{scope:null}),/invalid_meetup_scope/)
  await assert.rejects(create(f,{place:'임시 장소'}),/invalid_pending_schedule/)
  await assert.rejects(create(f,{state:'confirmed'}),/invalid_end_time/)
  await f.as(f.users.mechanicalCaptain)
  const m=await create(f,{gender:'female_only'})
  await f.as(f.users.mechanicalMember)
  await assert.rejects(f.value('select public.join_activity_meetup($1) as value',[m.id]),/meetup_gender_restricted/)
  await f.as(f.users.computerCaptain)
  await assert.rejects(f.value('select public.join_activity_meetup($1) as value',[m.id]),/meetup_not_found/)
  await assert.rejects(f.value('select public.get_my_activity_meetup_chat($1) as value',[m.id]),/meetup_not_found/)
  await f.as(f.users.mechanicalCaptain)
  const start=new Date(Date.now()+3*3600000).toISOString(),end=new Date(Date.now()+5*3600000).toISOString()
  const c=await create(f,{state:'confirmed',start,end,place:'학생회관'})
  assert.equal(c.schedule_status,'confirmed')
  assert.ok((await f.db.query('select scheduled_at from public.activity_meetups where id=$1',[c.id])).rows[0].scheduled_at)
 }finally{await f.db.close()}
})
