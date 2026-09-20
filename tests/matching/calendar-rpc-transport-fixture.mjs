import {source} from './event-calendar-fixture.mjs'

export const volatilityMigration='supabase/migrations/20260919160617_calendar_relationship_read_volatility.sql'

export async function installActualCalendarRelationshipReads(f) {
  await f.db.exec(`alter table auth.users add column if not exists deleted_at timestamptz,add column if not exists banned_until timestamptz;
    alter table quantum_private.relationship_states add column if not exists changed_at timestamptz;
    update quantum_private.relationship_states set changed_at=now() where status='in_relationship';
    drop function public.get_my_relationship_state();`)
  const sql=await source('supabase/migrations/20260909165649_private_relationship_state_guard.sql')
  const relationship=sql.match(/create function quantum_private\.my_relationship_state\([\s\S]*?end \$\$;/)?.[0]
  const getter=sql.match(/create function public\.get_my_relationship_state\(\)[\s\S]*?\$\$;/)?.[0]
  if(!relationship||!getter)throw Error('actual locking relationship read is missing')
  await f.db.exec(relationship+'\n'+getter)
  await f.db.exec(`revoke all on function quantum_private.my_relationship_state(text) from public,anon,authenticated,service_role;
    revoke all on function public.get_my_relationship_state() from public,anon,authenticated,service_role;
    grant execute on function public.get_my_relationship_state() to authenticated;`)
}

// Model PostgREST's documented access-mode choice from the actual pg_proc row.
// The SDK uses POST for .rpc(); Next's GET route does not imply GET /rpc.
// SQLSTATE and locking below are real PostgreSQL/PGlite, not mocked responses.
export async function postgrestCalendarRpc(f,actor,name,args={},method='POST') {
  const volatility=await f.value('select provolatile as value from pg_proc where oid=$1::regproc',['public.'+name])
  const mode=method==='POST'&&volatility==='v'?'READ WRITE':'READ ONLY'
  return f.db.transaction(async tx=>{
    await tx.exec('SET TRANSACTION '+mode)
    await tx.exec('SET LOCAL ROLE authenticated')
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[actor??''])
    return (await tx.query(`select public.${name}(${Object.keys(args).map((key,i)=>key+'=>$'+(i+1)).join(',')}) as value`,Object.values(args))).rows[0].value
  })
}
