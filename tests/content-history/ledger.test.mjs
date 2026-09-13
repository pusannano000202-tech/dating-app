import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const owner='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222'
const snapshot={sourceKey:'visit:pnu:pasta:first',kind:'visit',category:'pasta',title:'내 파스타 1위',winnerId:'a',candidates:[{id:'a',name:'A'},{id:'b',name:'B'}],selections:[{winnerId:'a',loserId:'b'}],completedAt:null}
async function fixture() {
  const db=new PGlite()
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema quantum_private;
    create table auth.users(id uuid primary key,deleted_at timestamptz,banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function quantum_private.account_deletion_blocks_access(p_user uuid) returns boolean language sql stable as $$ select false $$;
    insert into auth.users(id) values('${owner}'),('${other}');`)
  await db.exec(await readFile(new URL('../../supabase/migrations/20260908165812_private_content_history.sql',import.meta.url),'utf8'))
  const as=async(user)=>{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]); await db.exec('set role authenticated')}
  const call=async(name,args=[])=> (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).rows[0].value
  return {db,as,call}
}
test('owner-only save, immutable idempotency, CAS note update and selective deletion',async()=>{
  const {db,as,call}=await fixture()
  try {
    await as(owner)
    const a=await call('save_my_content_record',[snapshot])
    assert.equal((await call('save_my_content_record',[snapshot])).id,a.id)
    await assert.rejects(call('save_my_content_record',[{...snapshot,title:'tamper'}]),/source_conflict/)
    assert.equal((await call('list_my_content_records',[null,null,null])).records.length,1)
    await assert.rejects(db.query('select * from quantum_private.content_history_records'),/permission denied/)
    const revised=await call('update_my_content_record_note',[a.id,'친구와 다시 가기',1])
    assert.equal(revised.revision,2)
    await assert.rejects(call('update_my_content_record_note',[a.id,'old',1]),/revision_conflict/)
    await as(other)
    await assert.rejects(call('get_my_content_record',[a.id]),/record_not_found/)
    assert.equal((await call('list_my_content_records',[null,null,null])).records.length,0)
    await assert.rejects(call('delete_my_content_record',[a.id,2]),/record_not_found/)
    await as(owner)
    await call('delete_my_content_record',[a.id,2])
    assert.equal((await call('list_my_content_records',[null,null,null])).records.length,0)
  } finally { await db.close() }
})
test('unauthenticated, banned and malformed direct RPC requests fail closed',async()=>{
  const {db,as,call}=await fixture()
  try {
    await as('')
    await assert.rejects(call('save_my_content_record',[snapshot]),/auth_required/)
    await as(owner)
    for(const invalid of [{...snapshot,kind:'delivery'},{...snapshot,winnerId:'absent'},{...snapshot,owner_id:other},{...snapshot,candidates:[]},{...snapshot,selections:[]},{...snapshot,title:'bad\u0007title'},{...snapshot,candidates:[{id:'a',name:'bad\u007fname'},{id:'b',name:'B'}]}]) {
      await assert.rejects(call('save_my_content_record',[invalid]),/invalid_snapshot/)
    }
    const saved=await call('save_my_content_record',[snapshot])
    await assert.rejects(call('update_my_content_record_note',[saved.id,'bad\u0007note',1]),/invalid_note/)
    await db.exec('reset role')
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[owner])
    await as(owner)
    await assert.rejects(call('list_my_content_records',[null,null,null]),/account_unavailable/)
  } finally { await db.close() }
})
test('keyset paging, category filter and account deletion preserve owner boundaries',async()=>{
  const {db,as,call}=await fixture()
  try {
    await as(owner)
    for(let i=0;i<23;i++)await call('save_my_content_record',[{...snapshot,sourceKey:`visit:pnu:pasta:round-${i}`}])
    const first=await call('list_my_content_records',['visit',null,null])
    assert.equal(first.records.length,20)
    const next=await call('list_my_content_records',['visit',first.nextCursor.savedAt,first.nextCursor.id])
    assert.equal(next.records.length,3)
    assert.equal(new Set([...first.records,...next.records].map(item=>item.id)).size,23)
    assert.equal((await call('list_my_content_records',['places',null,null])).records.length,0)
    await db.exec('reset role')
    await db.query('delete from auth.users where id=$1',[owner])
    assert.equal((await db.query('select count(*)::int as n from quantum_private.content_history_records')).rows[0].n,0)
    await as(owner)
    await assert.rejects(call('list_my_content_records',[null,null,null]),/account_unavailable/)
  } finally {await db.close()}
})
