// Deliberately one local target, nine forward migrations, no reset/drop or remote override.
// Importing this module performs no I/O. --inspect is the default and writes nothing.
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertDedicatedRuntimeConfig, assertLocalDockerContextEndpoint, buildLocalDockerEnvironment,
  resolveCommunityVoiceLocalRoots } from './community-voice-local-runtime.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const TARGET = Object.freeze({ container: 'supabase_db_quantum-integrated-campus-20260905',
  database: 'postgres', rehearsal: 'quantum_social_rehearsal_20260915', apiUrl: 'http://127.0.0.1:56421' })
export const MIGRATION_NAMES = Object.freeze([
  '20260913074852_league_admission_awareness.sql',
  '20260913102522_meetup_admission_checkout_orders.sql',
  '20260913103032_meetup_chat_sender_identity.sql',
  '20260913103841_native_study_mentoring_chat_polls.sql',
  '20260913182440_social_room_activity_presentation.sql',
  '20260913193248_meetup_cancelled_admission_liability.sql',
  '20260914032828_account_admission_erasure_guard.sql',
  '20260914032930_meetup_admission_refund_workflow.sql',
  '20260914033128_deposit_webhook_reconciliation.sql',
])
// `private` is legacy application code referenced by public CHECK constraints.
const SCHEMAS = "('public','quantum_private','private','auth')"
const sha256 = value => createHash('sha256').update(value).digest('hex')
const literal = value => `'${String(value).replaceAll("'", "''")}'`
const identifier = value => `"${String(value).replaceAll('"', '""')}"`
const fail = code => { throw new Error(code) }
// NULL means the object's PostgreSQL default ACL, not no permissions. An explicit
// empty ACL stays empty. Preserve complete grantor/grantee/grant-option aclitems.
// pg_default_acl.defaclacl is NOT NULL, so it needs ordering only.
const canonicalAclSql = (column,defaults) => `ARRAY(SELECT acl_entry::text FROM unnest(${defaults ? `coalesce(${column},${defaults})` : column}) AS acl_entry ORDER BY acl_entry::text COLLATE "C")`

export function localDatabaseCommand(containerId, tool, args) {
  if (!/^[a-f0-9]{64}$/.test(containerId ?? '') || !['psql','pg_dump','pg_restore'].includes(tool)) fail('invalid_local_database_command')
  if (args.some(arg => /^-(?:h|p|U).*/.test(arg) || /^--(?:host|port|username)(?:=|$)/.test(arg))) fail('database_connection_override_forbidden')
  const databaseValues = []
  for (let index=0; index<args.length; index++) {
    const arg=args[index]
    if (arg==='-d' || arg==='--dbname') databaseValues.push(args[++index])
    else if (arg.startsWith('--dbname=')) databaseValues.push(arg.slice(9))
    else if (/^-d.+/.test(arg)) databaseValues.push(arg.slice(2))
  }
  if (databaseValues.length>1 || databaseValues.some(database => ![TARGET.database,TARGET.rehearsal].includes(database))) fail('unexpected_database')
  if (tool==='pg_restore' && (databaseValues.length ? databaseValues[0]!==TARGET.rehearsal : !args.includes('--list'))) fail('restore_requires_rehearsal_database')
  if (tool==='pg_dump' && databaseValues[0]!==TARGET.database) fail('backup_requires_original_local_database')
  // Local postgres cannot SET ROLE to the auth schema owner. Only restoration
  // into the named clone uses the existing local superuser; no roles are changed.
  const role=tool==='pg_restore'?'supabase_admin':'postgres'
  return ['exec','-i',containerId,'env','-i',
    'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',tool,
    '-h','/var/run/postgresql','-p','5432','-U',role,...args]
}

export function safeFailureDiagnosis(stderr) {
  const text = String(stderr ?? '')
  const sqlstate = text.match(/ERROR:\s+([0-9A-Z]{5})(?:\s|$)/)?.[1]
  if (sqlstate) return `sqlstate_${sqlstate.toLowerCase()}`
  for (const [pattern,code] of [[/type .* does not exist/i,'missing_type'],[/schema .* does not exist/i,'missing_schema'],
    [/function .* does not exist/i,'missing_function'],[/relation .* does not exist/i,'missing_relation'],
    [/role .* does not exist/i,'missing_role'],[/permission denied/i,'permission_denied'],
    [/already exists/i,'already_exists'],[/syntax error/i,'syntax_error'],
    [/could not connect|connection .*failed|No such file or directory/i,'connection_or_file_unavailable']]) {
    if (pattern.test(text)) return code
  }
  return 'details_suppressed'
}

export function parseMode(args) {
  if (args.length === 0) return 'inspect'
  if (args.length === 1 && ['--inspect', '--rehearse', '--apply'].includes(args[0])) return args[0].slice(2)
  return fail('usage_inspect_or_rehearse_or_apply_only')
}

export function assertRepairContainer(target) {
  const ports = target?.NetworkSettings?.Ports?.['5432/tcp']
  if (target?.Name !== `/${TARGET.container}` || !/^[a-f0-9]{64}$/.test(target?.Id ?? '')
    || target?.State?.Running !== true || !Array.isArray(ports) || !ports.length
    || ports.some(port => port.HostPort !== '56422'
      || !['127.0.0.1', '0.0.0.0', '::', '::1'].includes(port.HostIp))) fail('unexpected_local_database_container')
  return target.Id
}

// A bounded SQL lexer, not a SQL parser: comments, E strings, identifiers and dollar
// bodies are skipped. Only complete standalone outer BEGIN/COMMIT lines are removed.
export function stripOuterTransaction(sql) {
  const tokens = []; let start = -1; let i = 0; let visible = ''
  while (i < sql.length) {
    if (sql.startsWith('--', i)) { const end = sql.indexOf('\n', i); i = end < 0 ? sql.length : end; continue }
    if (sql.startsWith('/*', i)) {
      let depth = 1; i += 2
      while (i < sql.length && depth) {
        if (sql.startsWith('/*', i)) { depth++; i += 2 }
        else if (sql.startsWith('*/', i)) { depth--; i += 2 } else i++
      }
      if (depth) fail('unclosed_sql_comment'); continue
    }
    const c = sql[i]
    if (start < 0 && /\s/.test(c)) { i++; continue }
    if (start < 0) start = i
    const dollar = c === '$' ? sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/)?.[0] : null
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length)
      if (end < 0) fail('unclosed_sql_dollar_quote')
      visible += ' quoted_body '; i = end + dollar.length; continue
    }
    if (c === "'" || c === '"') {
      const escaped = c === "'" && /[eE]/.test(sql[i - 1] ?? '') && !/[a-zA-Z_0-9$]/.test(sql[i - 2] ?? '')
      let closed = false; i++
      while (i < sql.length) {
        if (escaped && sql[i] === '\\') { i += 2; continue }
        if (sql[i] === c) { if (sql[i + 1] === c) { i += 2; continue } i++; closed = true; break }
        i++
      }
      if (!closed) fail('unclosed_sql_string')
      visible += ' quoted_value '; continue
    }
    if (c === '\\') fail('psql_meta_command_forbidden')
    visible += c; i++
    if (c === ';') { tokens.push({ start, end: i, code: visible.trim() }); start = -1; visible = '' }
  }
  if (start >= 0) fail('incomplete_top_level_statement')
  const boundaries = tokens.filter(token => /^(?:BEGIN|COMMIT);$/i.test(token.code))
  if (boundaries.length && (boundaries.length !== 2 || boundaries[0] !== tokens[0]
    || boundaries[1] !== tokens.at(-1) || !/^BEGIN;$/i.test(boundaries[0].code)
    || !/^COMMIT;$/i.test(boundaries[1].code))) fail('invalid_outer_transaction')
  for (const token of tokens) {
    if (boundaries.includes(token)) {
      const lineStart = sql.lastIndexOf('\n', token.start - 1) + 1
      const lineEnd = sql.indexOf('\n', token.end)
      if (!/^\s*(BEGIN|COMMIT);\s*$/i.test(sql.slice(lineStart, lineEnd < 0 ? sql.length : lineEnd))) fail('transaction_boundary_not_standalone')
    } else if (!/^(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|TABLE|(?:UNIQUE\s+)?INDEX|(?:CONSTRAINT\s+)?TRIGGER)\b|ALTER\s+(?:TABLE|FUNCTION)\b|REVOKE\b|GRANT\b|COMMENT\s+ON\s+(?:FUNCTION|TABLE|COLUMN)\b)/i.test(token.code)) {
      fail('unexpected_top_level_migration_statement')
    }
  }
  for (const token of [...boundaries].reverse()) sql = sql.slice(0, token.start) + sql.slice(token.end)
  return sql
}

export function selectRestoreList(toc) {
  // No extension, cron/job, publication/subscription, event-trigger or database item
  // is restored. Dependencies outside these schemas must be explicitly resolved,
  // never skipped after a restore error.
  const allowed = /^(?:TABLE DATA|TABLE ATTACH|TABLE|SEQUENCE SET|SEQUENCE OWNED BY|SEQUENCE|FUNCTION|PROCEDURE|TYPE|DOMAIN|CONSTRAINT|CHECK CONSTRAINT|FK CONSTRAINT|INDEX ATTACH|INDEX|TRIGGER|RULE|ROW SECURITY|POLICY|VIEW|MATERIALIZED VIEW DATA|MATERIALIZED VIEW|DEFAULT ACL|DEFAULT|ACL|COMMENT) (?:public|quantum_private|private|auth) /
  return toc.split(/\r?\n/).filter(line => {
    const item = line.match(/^\d+; \d+ \d+ (.+)$/)?.[1]
    return item && (allowed.test(item) || /^SCHEMA - (?:auth|quantum_private|private) /.test(item)
      || /^(?:ACL|COMMENT) - SCHEMA (?:public|quantum_private|private|auth) /.test(item))
  }).join('\n') + '\n'
}

// Stable catalog definition hash, independent of pg_dump's random \restrict nonce
// and object OIDs allocated while restoring into the rehearsal database.
export const SCHEMA_HASH_SQL = `WITH objects AS (
 SELECT jsonb_build_array('schema',n.nspname,n.nspowner,${canonicalAclSql('n.nspacl',"acldefault('n',n.nspowner)")}) value FROM pg_namespace n WHERE n.nspname IN ${SCHEMAS}
 UNION ALL SELECT jsonb_build_array('relation',n.nspname,c.relname,c.relkind,c.relowner,${canonicalAclSql('c.relacl',"CASE WHEN c.relkind='S' THEN acldefault('s',c.relowner) WHEN c.relkind IN ('r','p','v','m','f') THEN acldefault('r',c.relowner) ELSE '{}'::aclitem[] END")},c.relrowsecurity,c.relforcerowsecurity,c.reloptions,
 CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) END) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${SCHEMAS}
 UNION ALL SELECT jsonb_build_array('column',n.nspname,c.relname,a.attname,
 (SELECT count(*) FROM pg_attribute live_column WHERE live_column.attrelid=a.attrelid AND live_column.attnum>0 AND NOT live_column.attisdropped AND live_column.attnum<=a.attnum),
 format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,${canonicalAclSql('a.attacl',"acldefault('c',c.relowner)")},pg_get_expr(d.adbin,d.adrelid))
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname IN ${SCHEMAS} AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL SELECT jsonb_build_array('function',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proowner,${canonicalAclSql('p.proacl',"acldefault('f',p.proowner)")}) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ${SCHEMAS} AND p.prokind IN ('f','p')
 UNION ALL SELECT jsonb_build_array('constraint',n.nspname,c.relname,x.conname,pg_get_constraintdef(x.oid,true)) FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${SCHEMAS}
 UNION ALL SELECT jsonb_build_array('index',n.nspname,c.relname,pg_get_indexdef(i.indexrelid)) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${SCHEMAS}
 UNION ALL SELECT jsonb_build_array('trigger',n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true)) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${SCHEMAS} AND NOT t.tgisinternal
 UNION ALL SELECT jsonb_build_array('policy',n.nspname,c.relname,p.polname,p.polcmd,p.polpermissive,p.polroles,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ${SCHEMAS}
 UNION ALL SELECT jsonb_build_array('enum',n.nspname,t.typname,e.enumlabel,e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ${SCHEMAS}
 UNION ALL SELECT jsonb_build_array('default_acl',n.nspname,a.defaclrole,a.defaclobjtype,${canonicalAclSql('a.defaclacl')}) FROM pg_default_acl a JOIN pg_namespace n ON n.oid=a.defaclnamespace WHERE n.nspname IN ${SCHEMAS}
) SELECT md5(coalesce(string_agg(value::text,E'\\n' ORDER BY value::text),'')) FROM objects`

export const TABLES_SQL = `SELECT coalesce(jsonb_agg(x ORDER BY x.schema,x.name),'[]'::jsonb) FROM (
 SELECT n.nspname schema,c.relname name,jsonb_agg(a.attname ORDER BY a.attnum) original_columns
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 WHERE n.nspname IN ${SCHEMAS} AND c.relkind IN ('r','p') GROUP BY n.nspname,c.relname) x`

export function dataHashSql(tables) {
  if (!tables.length) fail('expected_local_application_tables_missing')
  const parts = tables.map(table => {
    if (!['public','quantum_private','private','auth'].includes(table.schema) || !table.original_columns?.length) fail('invalid_preservation_table')
    return `SELECT ${literal(`${table.schema}.${table.name}`)} name,count(*)::text count,
 md5(coalesce(string_agg(md5(to_jsonb(original_columns)::text),'' ORDER BY md5(to_jsonb(original_columns)::text)),'')) hash
 FROM (SELECT ${table.original_columns.map(identifier).join(',')} FROM ${identifier(table.schema)}.${identifier(table.name)}) original_columns`
  })
  return `SELECT jsonb_agg(x ORDER BY x.name) FROM (${parts.join('\nUNION ALL\n')}) x`
}

// Probe direct schema changes as well as the optional migration history. This
// refuses partial/manual installations instead of replaying renamed wrappers.
export const MARKERS_SQL = `SELECT jsonb_build_array(
 to_regclass('quantum_private.league_admission_room_notices') IS NOT NULL,
 to_regclass('quantum_private.meetup_admission_checkout_orders') IS NOT NULL,
 coalesce((SELECT position('''is_me''' IN prosrc)>0 FROM pg_proc WHERE oid=to_regprocedure('public.get_my_activity_meetup_chat(uuid)')),false),
 to_regprocedure('quantum_private.chat_poll_current_members_before_native(text,uuid)') IS NOT NULL,
 coalesce((SELECT position('''activity_key''' IN prosrc)>0 FROM pg_proc WHERE oid=to_regprocedure('quantum_private.social_chat_room(text,uuid,uuid)')),false),
 coalesce((SELECT position('state = ''accepted''' IN prosrc)>0 FROM pg_proc WHERE oid=to_regprocedure('quantum_private.admission_room_closed()')),false),
 to_regprocedure('quantum_private.guard_account_admission_erasure()') IS NOT NULL,
 to_regclass('quantum_private.meetup_admission_refund_audit') IS NOT NULL,
 EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='deposit_refund_requests' AND column_name='provider_reconciliation_history'))`

export function validateEvidence(evidence, current) {
  if (evidence?.version !== 1 || evidence.mode !== 'rehearse' || evidence.success !== true
    || evidence.apiUrl !== TARGET.apiUrl || evidence.database !== TARGET.database || evidence.rehearsalDatabase !== TARGET.rehearsal
    || evidence.containerId !== current.containerId || evidence.schemaHash !== current.schemaHash || evidence.sourceHash !== current.sourceHash
    || evidence.preservationVerified !== true || evidence.permissionsVerified !== true || !/^[a-f0-9]{64}$/.test(evidence.backupSha256 ?? '')
    || !/^[a-f0-9]{32}$/.test(evidence.postSchemaHash ?? '')
    || !Array.isArray(evidence.migrations) || evidence.migrations.length !== 9
    || evidence.migrations.some((entry,index) => entry.name !== MIGRATION_NAMES[index] || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? ''))) fail('rehearsal_evidence_invalid_or_stale')
  return true
}

export const PERMISSIONS_SQL = `DO $repair_permissions$ BEGIN
 IF NOT has_function_privilege('authenticated','public.get_my_activity_meetup_chat(uuid)','EXECUTE')
 OR has_function_privilege('anon','public.get_my_activity_meetup_chat(uuid)','EXECUTE')
 OR NOT has_function_privilege('authenticated','public.list_my_meetup_admission_refunds()','EXECUTE')
 OR has_function_privilege('anon','public.list_my_meetup_admission_refunds()','EXECUTE')
 OR NOT has_function_privilege('service_role','public.claim_meetup_admission_refunds_for_service(uuid,integer,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.claim_meetup_admission_refunds_for_service(uuid,integer,text)','EXECUTE')
 OR has_function_privilege('anon','public.claim_meetup_admission_refunds_for_service(uuid,integer,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.reconcile_toss_deposit_cancellation(uuid,uuid,uuid,uuid,jsonb)','EXECUTE')
 OR has_function_privilege('anon','public.reconcile_toss_deposit_cancellation(uuid,uuid,uuid,uuid,jsonb)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.reconcile_toss_deposit_cancellation(uuid,uuid,uuid,uuid,jsonb)','EXECUTE')
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='quantum_private' AND c.relname IN ('league_admission_room_notices','meetup_admission_checkout_orders','meetup_admission_refund_audit')
 AND (NOT c.relrowsecurity OR has_table_privilege('anon',c.oid,'SELECT') OR has_table_privilege('authenticated',c.oid,'SELECT')))
 THEN RAISE EXCEPTION 'repair_permissions_failed'; END IF;
 END $repair_permissions$;`

export function buildTransaction({ database, schemaHash, sources, tables, expectedPostSchemaHash }) {
  if (![TARGET.database,TARGET.rehearsal].includes(database) || !/^[a-f0-9]{32}$/.test(schemaHash)) fail('invalid_transaction_target')
  if (sources.length !== 9 || sources.some((source,index) => source.name !== MIGRATION_NAMES[index])) fail('exact_nine_sources_required')
  if (expectedPostSchemaHash !== undefined && !/^[a-f0-9]{32}$/.test(expectedPostSchemaHash)) fail('invalid_expected_post_schema_hash')
  const rows = dataHashSql(tables)
  // Auth system tables are readable by postgres but not necessarily lockable.
  // None of the nine migrations alters auth. Retain their complete row hashes
  // in one repeatable-read snapshot, which also exposes this transaction's writes.
  const applicationTables = tables.filter(table => table.schema !== 'auth')
  if (!applicationTables.length) fail('expected_application_lock_tables_missing')
  const locks = applicationTables.map(table => `${identifier(table.schema)}.${identifier(table.name)}`).join(',')
  return `BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SET LOCAL idle_in_transaction_session_timeout='120s';
SELECT pg_advisory_xact_lock(20260915,56421);
DO $repair_target$ BEGIN IF current_database()<>${literal(database)} THEN RAISE EXCEPTION 'repair_wrong_database'; END IF; END $repair_target$;
LOCK TABLE ${locks} IN ACCESS EXCLUSIVE MODE;
DO $repair_schema$ BEGIN IF (${SCHEMA_HASH_SQL})<>${literal(schemaHash)} THEN RAISE EXCEPTION 'repair_schema_changed'; END IF;
IF (${MARKERS_SQL})<>'[false,false,false,false,false,false,false,false,false]'::jsonb THEN RAISE EXCEPTION 'repair_partial_or_already_applied'; END IF; END $repair_schema$;
DO $repair_history$ DECLARE applied integer; BEGIN
IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
 EXECUTE ${literal(`SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN (${MIGRATION_NAMES.map(name => literal(name.slice(0,14))).join(',')})`)} INTO applied;
 IF applied<>0 THEN RAISE EXCEPTION 'repair_history_already_applied'; END IF;
END IF; END $repair_history$;
CREATE TEMP TABLE repair_preservation ON COMMIT DROP AS ${rows};
${sources.map(source => `-- ${source.name}\n${stripOuterTransaction(source.sql)}`).join('\n')}
DO $repair_preservation$ BEGIN
 IF (${rows}) IS DISTINCT FROM (SELECT * FROM repair_preservation) THEN RAISE EXCEPTION 'repair_preservation_failed'; END IF;
 IF (${MARKERS_SQL})<>'[true,true,true,true,true,true,true,true,true]'::jsonb THEN RAISE EXCEPTION 'repair_incomplete'; END IF;
END $repair_preservation$;
${PERMISSIONS_SQL}
${expectedPostSchemaHash ? `DO $repair_post_schema$ BEGIN IF (${SCHEMA_HASH_SQL})<>${literal(expectedPostSchemaHash)} THEN RAISE EXCEPTION 'repair_result_differs_from_rehearsal'; END IF; END $repair_post_schema$;` : ''}
SELECT pg_notify('pgrst','reload schema');
COMMIT;
`
}

function readSources() {
  const sources = MIGRATION_NAMES.map(name => {
    const bytes = readFileSync(join(ROOT,'supabase/migrations',name))
    const sql = bytes.toString('utf8'); stripOuterTransaction(sql)
    return { name, sql, sha256: sha256(bytes) }
  })
  return { sources, sourceHash: sha256(JSON.stringify(sources.map(({name,sha256: hash}) => ({name,sha256: hash})))) }
}

function createLocalAdapter() {
  const env = buildLocalDockerEnvironment(process.env)
  let pinnedContainerId
  const docker = (args, options = {}) => {
    try { return execFileSync('docker',['--context','desktop-linux',...args],{
      env,windowsHide:true,encoding:'utf8',maxBuffer:32*1024*1024,timeout:180000,
      stdio:['pipe','pipe','pipe'],...options }) }
    catch (error) {
      const tool = ['psql','pg_dump','pg_restore'].find(name => args.includes(name)) ?? 'docker'
      fail(`local_${tool}_failed_${safeFailureDiagnosis(error?.stderr)}`)
    }
  }
  const sql = (database, query) => {
    if (![TARGET.database,TARGET.rehearsal].includes(database)) fail('unexpected_database')
    return docker(localDatabaseCommand(pinnedContainerId,'psql',[
      '-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-v','SHOW_CONTEXT=never','-d',database]),{input:query}).trim()
  }
  const guard = () => {
    if (realpathSync(process.cwd()).toLowerCase() !== realpathSync(ROOT).toLowerCase()) fail('unexpected_repair_workspace')
    const {runtimeRoot} = resolveCommunityVoiceLocalRoots(ROOT)
    assertDedicatedRuntimeConfig(readFileSync(join(runtimeRoot,'supabase/config.toml'),'utf8'))
    assertLocalDockerContextEndpoint(JSON.parse(docker(['context','inspect','desktop-linux','--format','{{json .Endpoints.docker.Host}}'])))
    const containerId = assertRepairContainer(JSON.parse(docker(['inspect',TARGET.container]))[0])
    if (pinnedContainerId && pinnedContainerId !== containerId) fail('container_changed')
    pinnedContainerId = containerId
    return containerId
  }
  const inspect = () => {
    const containerId = guard()
    const markers = JSON.parse(sql(TARGET.database,`BEGIN READ ONLY; ${MARKERS_SQL}; COMMIT;`))
    const hasHistory = sql(TARGET.database,"SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL;") === 't'
    const historyApplied = hasHistory ? Number(sql(TARGET.database,`SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN (${MIGRATION_NAMES.map(name => literal(name.slice(0,14))).join(',')});`)) : 0
    const tables = JSON.parse(sql(TARGET.database,TABLES_SQL))
    const schemaHash = sql(TARGET.database,SCHEMA_HASH_SQL)
    const data = JSON.parse(sql(TARGET.database,dataHashSql(tables)))
    const schemas = JSON.parse(sql(TARGET.database,`SELECT jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner))) FROM pg_namespace WHERE nspname IN ${SCHEMAS};`))
    const extensions = JSON.parse(sql(TARGET.database,"SELECT jsonb_agg(jsonb_build_object('name',e.extname,'schema',n.nspname,'version',e.extversion)) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname IN ('pgcrypto','uuid-ossp');")) ?? []
    return { containerId,markers,historyApplied,tables,schemaHash,data,schemas,extensions }
  }
  const base = join(ROOT,'.tmp/social-schema-repair-20260915')
  const evidencePath = join(base,'rehearsal-evidence.json')
  let runRoot
  const writeJson = (path,value) => writeFileSync(path,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600})
  const backup = () => {
    guard()
    mkdirSync(base,{recursive:true,mode:0o700})
    runRoot = join(base,randomUUID()); mkdirSync(runRoot,{mode:0o700})
    const path = join(runRoot,'postgres.backup')
    const fd = openSync(path,'wx',0o600)
    try { docker(localDatabaseCommand(pinnedContainerId,'pg_dump',['-d',TARGET.database,'--format=custom']),{encoding:null,stdio:['ignore',fd,'pipe']}) }
    finally { closeSync(fd) }
    const bytes = readFileSync(path)
    if (bytes.subarray(0,5).toString('ascii') !== 'PGDMP') fail('invalid_custom_backup')
    return {path,sha256:sha256(bytes)}
  }
  return {
    inspect,backup,
    readEvidence: () => JSON.parse(readFileSync(evidencePath,'utf8')),
    verifyBackup: evidence => {
      const path = resolve(evidence.backupPath ?? '')
      if (!path.startsWith(base + '/') && !path.startsWith(base + '\\')) fail('backup_outside_repair_directory')
      if (sha256(readFileSync(path)) !== evidence.backupSha256) fail('backup_hash_changed')
    },
    assertRehearsalAbsent: () => {
      if (existsSync(evidencePath) || sql(TARGET.database,`SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=${literal(TARGET.rehearsal)});`) !== 'f') fail('rehearsal_already_exists_no_overwrite')
    },
    restore: (backupInfo,current) => {
      if (guard() !== current.containerId) fail('container_changed')
      const containerRoot = `/tmp/quantum-social-schema-repair-${randomUUID()}`
      docker(['exec',pinnedContainerId,'mkdir','-m','700',containerRoot])
      docker(['cp',backupInfo.path,`${pinnedContainerId}:${containerRoot}/postgres.backup`])
      const toc = docker(localDatabaseCommand(pinnedContainerId,'pg_restore',['--list',`${containerRoot}/postgres.backup`]))
      const list = selectRestoreList(toc)
      if (!list.includes('TABLE DATA auth ') || !list.includes('TABLE DATA public ')) fail('required_backup_sections_missing')
      const listPath = join(runRoot,'restore.list'); writeFileSync(listPath,list,{flag:'wx',mode:0o600})
      docker(['cp',listPath,`${pinnedContainerId}:${containerRoot}/restore.list`])
      sql(TARGET.database,`CREATE DATABASE ${identifier(TARGET.rehearsal)} WITH TEMPLATE template0 OWNER postgres;`)
      const extensions = current.extensions.map(extension => {
        if (!['pgcrypto','uuid-ossp'].includes(extension.name)) fail('unexpected_restore_extension')
        return `CREATE SCHEMA IF NOT EXISTS ${identifier(extension.schema)}; CREATE EXTENSION IF NOT EXISTS ${identifier(extension.name)} WITH SCHEMA ${identifier(extension.schema)} VERSION ${literal(extension.version)};`
      }).join('\n')
      const publicOwner = current.schemas.find(schema => schema.name === 'public')?.owner
      if (!publicOwner) fail('public_schema_owner_missing')
      sql(TARGET.rehearsal,`${extensions}\nALTER SCHEMA public OWNER TO ${identifier(publicOwner)};`)
      docker(localDatabaseCommand(pinnedContainerId,'pg_restore',['-d',TARGET.rehearsal,'--exit-on-error','--single-transaction',`--use-list=${containerRoot}/restore.list`,`${containerRoot}/postgres.backup`]))
      const restoredData = JSON.parse(sql(TARGET.rehearsal,dataHashSql(current.tables)))
      if (JSON.stringify(restoredData) !== JSON.stringify(current.data)) fail('restore_data_preservation_failed')
      if (sql(TARGET.rehearsal,SCHEMA_HASH_SQL) !== current.schemaHash) fail('restore_schema_or_permissions_differ')
    },
    transact: (database,current,sources,expectedPostSchemaHash) => {
      if (guard() !== current.containerId) fail('container_changed')
      sql(database,buildTransaction({database,schemaHash:current.schemaHash,tables:current.tables,sources,expectedPostSchemaHash}))
      return {schemaHash:sql(database,SCHEMA_HASH_SQL),preservationVerified:true,permissionsVerified:true}
    },
    writeEvidence: evidence => writeJson(evidencePath,evidence),
    writeApplyEvidence: evidence => writeJson(join(runRoot,'apply-evidence.json'),evidence),
  }
}

export function runRepair(mode, adapter, sourceBundle) {
  if (!['inspect','rehearse','apply'].includes(mode)) fail('invalid_repair_mode')
  const current = {...adapter.inspect(),sourceHash:sourceBundle.sourceHash}
  if (mode === 'inspect') return {mode,apiUrl:TARGET.apiUrl,containerId:current.containerId,
    schemaHash:current.schemaHash,sourceHash:current.sourceHash,markers:current.markers,
    historyApplied:current.historyApplied,tableCount:current.tables.length,databaseWritten:false}
  if (current.markers.length !== 9 || current.markers.some(Boolean) || current.historyApplied !== 0) fail('partial_or_already_applied_refusing_replay')
  let rehearsalEvidence
  if (mode === 'apply') {
    rehearsalEvidence = adapter.readEvidence(); validateEvidence(rehearsalEvidence,current); adapter.verifyBackup(rehearsalEvidence)
  } else adapter.assertRehearsalAbsent()
  const backupInfo = adapter.backup()
  if (mode === 'rehearse') adapter.restore(backupInfo,current)
  // Refresh before either transaction: original schema must remain unchanged.
  // Rehearsal also requires its backup to represent the unchanged local data.
  const fresh = adapter.inspect()
  if (fresh.containerId !== current.containerId || fresh.schemaHash !== current.schemaHash
    || fresh.markers.some(Boolean) || fresh.historyApplied !== 0) fail('original_changed_before_transaction')
  if (mode === 'rehearse' && JSON.stringify(fresh.data) !== JSON.stringify(current.data)) fail('original_data_changed_during_rehearsal')
  const result = adapter.transact(mode === 'rehearse' ? TARGET.rehearsal : TARGET.database,
    mode === 'rehearse' ? current : {...fresh,sourceHash:current.sourceHash},sourceBundle.sources,rehearsalEvidence?.postSchemaHash)
  const evidence = {version:1,mode,success:true,apiUrl:TARGET.apiUrl,database:TARGET.database,
    rehearsalDatabase:TARGET.rehearsal,containerId:current.containerId,schemaHash:current.schemaHash,
    postSchemaHash:result.schemaHash,sourceHash:current.sourceHash,
    migrations:sourceBundle.sources.map(({name,sha256:hash}) => ({name,sha256:hash})),
    backupPath:backupInfo.path,backupSha256:backupInfo.sha256,preservationVerified:result.preservationVerified,
    permissionsVerified:result.permissionsVerified,tableCount:current.tables.length,createdAt:new Date().toISOString()}
  if (mode === 'rehearse') adapter.writeEvidence(evidence); else adapter.writeApplyEvidence(evidence)
  return {mode,success:true,apiUrl:TARGET.apiUrl,tableCount:current.tables.length,
    migrationCount:9,preservationVerified:true,permissionsVerified:true,existingDatabaseWritten:mode==='apply'}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(runRepair(parseMode(process.argv.slice(2)),createLocalAdapter(),readSources()))) }
  catch (error) {
    // Never forward subprocess output: PostgreSQL errors can contain row values,
    // tokens, function bodies or credentials. Failure remains fail-closed.
    const code = /^[a-z_0-9]+$/.test(error?.message ?? '') ? error.message : 'local_schema_repair_failed_output_suppressed'
    console.error(JSON.stringify({success:false,error:code})); process.exitCode=1
  }
}
