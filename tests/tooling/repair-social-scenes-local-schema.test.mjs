import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parseMode, stripOuterTransaction, assertRepairContainer, validateEvidence,
  selectRestoreList, buildTransaction, MIGRATION_NAMES, runRepair, TARGET, dataHashSql, localDatabaseCommand, safeFailureDiagnosis, SCHEMA_HASH_SQL, TABLES_SQL } from '../../scripts/qa/repair-social-scenes-local-schema.mjs'

test('default is inspect; explicit modes only; no target/force overrides', () => {
  assert.equal(parseMode([]), 'inspect')
  assert.equal(parseMode(['--rehearse']), 'rehearse')
  assert.equal(parseMode(['--apply']), 'apply')
  for (const args of [['--force'], ['--apply', '--rehearse'], ['--db', 'production']]) {
    assert.throws(() => parseMode(args))
  }
})

test('only the exact local running container and published database port are accepted', () => {
  const target = { Name: '/supabase_db_quantum-integrated-campus-20260905', Id: 'a'.repeat(64),
    State: { Running: true }, NetworkSettings: { Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '56422' }] } } }
  assert.equal(assertRepairContainer(target), target.Id)
  for (const bad of [{ ...target, Name: '/production' }, { ...target, State: { Running: false } },
    { ...target, NetworkSettings: { Ports: { '5432/tcp': [{ HostPort: '5432' }] } } }]) {
    assert.throws(() => assertRepairContainer(bad))
  }
})

test('outer transaction lines are stripped but function bodies and strings remain exact', () => {
  const body = "CREATE FUNCTION public.f() RETURNS void LANGUAGE plpgsql AS $fn$\nBEGIN;\nPERFORM 'COMMIT;';\nEND;\n$fn$;"
  assert.equal(stripOuterTransaction(`-- header\nBEGIN;\n${body}\nCOMMIT;\n`), `-- header\n\n${body}\n\n`)
  assert.equal(stripOuterTransaction(body), body)
  assert.throws(() => stripOuterTransaction('BEGIN; CREATE TABLE public.x(id int); COMMIT;'))
  assert.throws(() => stripOuterTransaction('BEGIN;\nCREATE TABLE public.x(id int);'))
  assert.throws(() => stripOuterTransaction('ROLLBACK;'))
  assert.throws(() => stripOuterTransaction('SELECT 1;'))
  assert.throws(() => stripOuterTransaction('CREATE DATABASE postgres;'))
})

test('comments, escaped strings, and dollar quoted blocks cannot create transaction boundaries', () => {
  const sql = "/* outer /* COMMIT; */ still comment */\nCREATE FUNCTION public.f() RETURNS text LANGUAGE sql AS $outer$ SELECT E'can\\\'t; COMMIT;' $outer$;"
  assert.equal(stripOuterTransaction(sql), sql)
  assert.throws(() => stripOuterTransaction('CREATE FUNCTION public.f() RETURNS text AS $$unterminated;'))
})

test('restore allowlist excludes cron, net, vault, subscriptions, and public schema creation', () => {
  const toc = '1; 0 0 SCHEMA - public postgres\n2; 0 0 SCHEMA - auth postgres\n3; 0 0 TABLE DATA public users postgres\n4; 0 0 TABLE DATA quantum_private rooms postgres\n5; 0 0 EXTENSION - pg_cron\n6; 0 0 TABLE DATA cron job postgres\n7; 0 0 SUBSCRIPTION - outbound postgres\n8; 0 0 ACL public TABLE users postgres\n9; 0 0 TABLE DATA auth sessions postgres\n'
  const selected = selectRestoreList(toc)
  assert.match(selected, /2;.*SCHEMA - auth/)
  assert.match(selected, /3;.*TABLE DATA public users/)
  assert.match(selected, /8;.*ACL public/)
  assert.doesNotMatch(selected, /^(?:1|5|6|7);/m)
})

test('rehearsal evidence must bind version, target, source, schema, backup and successful preservation', () => {
  const current = { containerId: 'a'.repeat(64), schemaHash: 'b'.repeat(32), sourceHash: 'c'.repeat(64) }
  const evidence = { version: 1, mode: 'rehearse', success: true, ...current,
    apiUrl: 'http://127.0.0.1:56421', database: 'postgres', rehearsalDatabase: 'quantum_social_rehearsal_20260915',
    backupSha256: 'd'.repeat(64), postSchemaHash: 'f'.repeat(32), preservationVerified: true, permissionsVerified: true,
    migrations: Array.from({ length: 9 }, (_, i) => ({ name: MIGRATION_NAMES[i], sha256: 'e'.repeat(64) })) }
  assert.equal(validateEvidence(evidence, current), true)
  for (const update of [{ success: false }, { mode: 'inspect' }, { schemaHash: 'x' }, { sourceHash: 'x' },
    { containerId: 'x' }, { preservationVerified: false }, { permissionsVerified: false }, { backupSha256: null },
    { migrations: [] }, { postSchemaHash: null }, { apiUrl: 'https://production.supabase.co' }]) {
    assert.throws(() => validateEvidence({ ...evidence, ...update }, current))
  }
})

test('all nine real files compose into one transaction without executing them', () => {
  assert.equal(MIGRATION_NAMES.length, 9)
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
  const sources = MIGRATION_NAMES.map(name => ({ name, sql: readFileSync(resolve(root, 'supabase/migrations', name), 'utf8') }))
  const tables = [{ schema: 'public', name: 'users', original_columns: ['id'] }]
  const sql = buildTransaction({ database: 'postgres', schemaHash: 'b'.repeat(32), sources, tables, expectedPostSchemaHash: 'f'.repeat(32) })
  assert.equal((sql.match(/^BEGIN ISOLATION LEVEL REPEATABLE READ;$/gm) ?? []).length, 1)
  assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 1)
  assert.ok(sql.indexOf('pg_advisory_xact_lock') < sql.indexOf('league_admission_room_notices ('))
  assert.match(sql, /lock_timeout/)
  assert.match(sql, /ACCESS EXCLUSIVE MODE/)
  assert.match(sql, /preservation_failed/)
  assert.match(sql, /original_columns/)
  assert.match(sql, /repair_history_already_applied/)
  assert.ok(sql.indexOf('repair_result_differs_from_rehearsal') < sql.lastIndexOf('COMMIT;'))
  assert.match(sql, /pg_notify\('pgrst','reload schema'\)/)
  assert.ok(sql.indexOf('provider_reconciliation_history') < sql.lastIndexOf('COMMIT;'))
  assert.doesNotMatch(sql, /DROP DATABASE|RESET ALL|ALTER SYSTEM|supabase_migrations\.schema_migrations\s*\(/i)
  assert.throws(() => buildTransaction({ database: 'production', schemaHash: 'b'.repeat(32), sources }))
})

test('repeatable-read preservation covers auth without requiring auth table write locks', () => {
  const root=resolve(fileURLToPath(new URL('../..',import.meta.url)))
  const sources=MIGRATION_NAMES.map(name=>({name,sql:readFileSync(resolve(root,'supabase/migrations',name),'utf8')}))
  const tables=[{schema:'public',name:'users',original_columns:['id']},
    {schema:'auth',name:'schema_migrations',original_columns:['version']},
    {schema:'private',name:'legacy_rooms',original_columns:['id']},
    {schema:'quantum_private',name:'rooms',original_columns:['id']}]
  const sql=buildTransaction({database:'postgres',schemaHash:'b'.repeat(32),sources,tables})
  assert.ok(sql.startsWith('BEGIN ISOLATION LEVEL REPEATABLE READ;'))
  const locks=sql.split('\n').find(line=>line.startsWith('LOCK TABLE '))
  assert.doesNotMatch(locks,/"auth"\./)
  for(const name of ['"public"."users"','"private"."legacy_rooms"','"quantum_private"."rooms"'])assert.ok(locks.includes(name))
  assert.match(sql,/SELECT "version" FROM "auth"\."schema_migrations"/)
  assert.ok((sql.match(/FROM "auth"\."schema_migrations"/g)??[]).length>=2)
  assert.throws(()=>buildTransaction({database:'postgres',schemaHash:'b'.repeat(32),sources,tables:[tables[1]]}),/application_lock_tables/)
})

function fixture(overrides = {}) {
  const calls = []
  const current = { containerId: 'a'.repeat(64), schemaHash: 'b'.repeat(32), sourceHash: 'c'.repeat(64),
    tables: [{schema:'public',name:'users',original_columns:['id']}], data:[{name:'public.users',count:'1',hash:'safe-aggregate'}], markers:Array(9).fill(false), historyApplied:0 }
  const bundle = {sourceHash:current.sourceHash,sources:MIGRATION_NAMES.map(name => ({name,sha256:'e'.repeat(64),sql:''}))}
  const evidence = {version:1,mode:'rehearse',success:true,...current,apiUrl:TARGET.apiUrl,database:TARGET.database,
    rehearsalDatabase:TARGET.rehearsal,backupSha256:'d'.repeat(64),postSchemaHash:'f'.repeat(32),preservationVerified:true,
    permissionsVerified:true,migrations:bundle.sources.map(({name,sha256}) => ({name,sha256}))}
  const adapter = {
    inspect:()=>{calls.push('inspect'); return structuredClone(current)},
    readEvidence:()=>{calls.push('readEvidence'); return evidence},
    verifyBackup:()=>calls.push('verifyBackup'),
    assertRehearsalAbsent:()=>calls.push('assertRehearsalAbsent'),
    backup:()=>{calls.push('backup'); return {path:'local.backup',sha256:'d'.repeat(64)}},
    restore:()=>calls.push('restore'),
    transact:(database, _current, _sources, expected)=>{calls.push(`transact:${database}`); if(database==='postgres') assert.equal(expected,evidence.postSchemaHash); return {schemaHash:'f'.repeat(32),preservationVerified:true,permissionsVerified:true}},
    writeEvidence:()=>calls.push('writeEvidence'),writeApplyEvidence:()=>calls.push('writeApplyEvidence'),...overrides,
  }
  return {calls,current,bundle,evidence,adapter}
}

test('each PostgreSQL command clears container environment, pins immutable container ID and local socket', () => {
  for(const tool of ['psql','pg_dump','pg_restore']) {
    const command=localDatabaseCommand('a'.repeat(64),tool,['-d',tool==='pg_restore'?TARGET.rehearsal:'postgres'])
    assert.equal(command[2],'a'.repeat(64))
    assert.deepEqual(command.slice(3,7),['env','-i','PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',tool])
    assert.deepEqual(command.slice(7,13),['-h','/var/run/postgresql','-p','5432','-U',tool==='pg_restore'?'supabase_admin':'postgres'])
  }
  assert.throws(()=>localDatabaseCommand('supabase_db_name','psql',[]))
  assert.throws(()=>localDatabaseCommand('a'.repeat(64),'sh',[]))
  assert.throws(()=>localDatabaseCommand('a'.repeat(64),'pg_restore',['-d','postgres']))
  assert.throws(()=>localDatabaseCommand('a'.repeat(64),'psql',['-U','supabase_admin','-d','postgres']))
})

test('legacy private schema dependencies, owner ACLs and rows are included in restore and preservation', () => {
  const toc='1; 0 0 SCHEMA - private postgres\n2; 0 0 FUNCTION private quantum_public_snapshot_payload_is_safe() postgres\n3; 0 0 TABLE DATA private legacy_rooms postgres\n4; 0 0 ACL - SCHEMA private postgres\n5; 0 0 TABLE DATA vault secrets postgres\n'
  const selected=selectRestoreList(toc)
  for(const number of [1,2,3,4])assert.match(selected,new RegExp(`^${number};`,'m'))
  assert.doesNotMatch(selected,/^5;/m)
  assert.match(SCHEMA_HASH_SQL,/'private'/)
  assert.match(TABLES_SQL,/'private'/)
  assert.match(dataHashSql([{schema:'private',name:'legacy_rooms',original_columns:['id']}]),/FROM "private"\."legacy_rooms"/)
})

test('schema fingerprint resolves NULL ACL through object defaults and retains explicit empty ACL and grant options', () => {
  for(const [acl,defaults] of [['n.nspacl',"acldefault('n',n.nspowner)"],
    ['a.attacl',"acldefault('c',c.relowner)"],['p.proacl',"acldefault('f',p.proowner)"]]) {
    assert.ok(SCHEMA_HASH_SQL.includes(`FROM unnest(coalesce(${acl},${defaults})) AS acl_entry ORDER BY acl_entry::text COLLATE "C"`))
  }
  assert.match(SCHEMA_HASH_SQL,/unnest\(coalesce\(c\.relacl,CASE WHEN c\.relkind='S' THEN acldefault\('s',c\.relowner\)/)
  assert.match(SCHEMA_HASH_SQL,/THEN acldefault\('r',c\.relowner\) ELSE '\{\}'::aclitem\[\] END\)\)/)
  assert.match(SCHEMA_HASH_SQL,/FROM unnest\(a\.defaclacl\) AS acl_entry ORDER BY acl_entry::text COLLATE "C"/)
  assert.doesNotMatch(SCHEMA_HASH_SQL,/nullif\([^)]*(?:nspacl|relacl|attacl|proacl)/i)
  // Each complete aclitem remains intact (including grantor and '*' grant option).
  assert.match(SCHEMA_HASH_SQL,/SELECT acl_entry::text FROM unnest/)
  assert.doesNotMatch(SCHEMA_HASH_SQL,/DISTINCT acl_entry|regexp_replace\(acl_entry|split_part\(acl_entry/)
  for(const owner of ['n.nspowner','c.relowner','p.proowner','a.defaclrole'])assert.ok(SCHEMA_HASH_SQL.includes(owner))
})

test('column fingerprint uses logical ordinal excluding dropped-column holes, preserving live order', () => {
  assert.match(SCHEMA_HASH_SQL,/SELECT count\(\*\) FROM pg_attribute live_column/)
  assert.match(SCHEMA_HASH_SQL,/live_column\.attrelid=a\.attrelid AND live_column\.attnum>0 AND NOT live_column\.attisdropped AND live_column\.attnum<=a\.attnum/)
  assert.doesNotMatch(SCHEMA_HASH_SQL,/a\.attname,a\.attnum,format_type/)
  assert.match(SCHEMA_HASH_SQL,/format_type\(a\.atttypid,a\.atttypmod\),a\.attnotnull,a\.attidentity,a\.attgenerated/)
})

test('failure diagnosis never forwards SQL, values, secrets or raw unknown messages', () => {
  assert.equal(safeFailureDiagnosis('ERROR:  42P01\nDETAIL: private secret payload'),'sqlstate_42p01')
  assert.equal(safeFailureDiagnosis('pg_restore: error: type "net.http_response" does not exist\nSQL: private secret payload'),'missing_type')
  assert.equal(safeFailureDiagnosis('token=private-secret http://user:password@host'),'details_suppressed')
})

test('inspect never backs up, creates a database, applies SQL, or writes evidence', () => {
  const f=fixture(); const result=runRepair('inspect',f.adapter,f.bundle)
  assert.deepEqual(f.calls,['inspect']); assert.equal(result.databaseWritten,false)
  assert.equal(JSON.stringify(result).includes('safe-aggregate'),false)
})

test('rehearse writes only backup, new database, and success evidence in order', () => {
  const f=fixture(); const result=runRepair('rehearse',f.adapter,f.bundle)
  assert.equal(result.existingDatabaseWritten,false)
  assert.deepEqual(f.calls,['inspect','assertRehearsalAbsent','backup','restore','inspect',`transact:${TARGET.rehearsal}`,'writeEvidence'])
})

test('apply requires successful evidence and backup verification before any write', () => {
  const f=fixture(); const result=runRepair('apply',f.adapter,f.bundle)
  assert.equal(result.existingDatabaseWritten,true)
  assert.deepEqual(f.calls,['inspect','readEvidence','verifyBackup','backup','inspect','transact:postgres','writeApplyEvidence'])
  for(const field of ['readEvidence','verifyBackup']) {
    const blocked=fixture({[field]:()=>{throw Error('blocked')}})
    assert.throws(()=>runRepair('apply',blocked.adapter,blocked.bundle))
    assert.equal(blocked.calls.includes('backup'),false)
  }
})

test('partial/manual markers and history independently refuse any backup or apply', () => {
  for(const which of ['markers','historyApplied']) {
    const f=fixture(); if(which==='markers')f.current.markers[3]=true; else f.current.historyApplied=1
    assert.throws(()=>runRepair('rehearse',f.adapter,f.bundle),/partial_or_already_applied/)
    assert.deepEqual(f.calls,['inspect'])
  }
})

test('failed backup, restore, or atomic transaction cannot produce successful evidence', () => {
  for(const phase of ['backup','restore','transact']) {
    const f=fixture({[phase]:()=>{throw Error(`failed_${phase}`)}})
    assert.throws(()=>runRepair('rehearse',f.adapter,f.bundle))
    assert.equal(f.calls.includes('writeEvidence'),false)
    if(phase==='backup')assert.equal(f.calls.includes('restore'),false)
  }
})

test('schema or data changes during rehearsal fail closed before transaction', () => {
  for(const field of ['schemaHash','data']) {
    const f=fixture(); let reads=0
    f.adapter.inspect=()=>{const value=structuredClone(f.current); if(++reads===2)value[field]=field==='data'?[]:'changed'; return value}
    assert.throws(()=>runRepair('rehearse',f.adapter,f.bundle),/original_/)
    assert.equal(f.calls.some(call=>call.startsWith('transact:')),false)
  }
})

test('preservation projects original columns and quotes identifiers; new columns do not alter old-row hash', () => {
  const sql=dataHashSql([{schema:'quantum_private',name:'outbox',original_columns:['deposit_id','state']}])
  assert.match(sql,/SELECT "deposit_id","state" FROM "quantum_private"\."outbox"/)
  assert.doesNotMatch(sql,/SELECT \*/)
  assert.throws(()=>dataHashSql([{schema:'cron',name:'job',original_columns:['id']}]))
})
