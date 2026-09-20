// Explicit local-only fixture. No hosted credentials, migrations, payments or workers.
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

export const TARGET = 'supabase_db_quantum-integrated-campus-20260905'
export const QA_ID = 'e9200000-0000-4000-8000-000000000001'
export const QA_EMAIL = 'tonight-preview-20260920@example.invalid'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const literal = value => `'${String(value).replaceAll("'", "''")}'`
const textArray = values => `ARRAY[${values.map(literal).join(',')}]::text[]`
const identitySql = `INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
SELECT ${literal(QA_ID)},${literal(QA_ID)}::uuid,
 jsonb_build_object('sub',${literal(QA_ID)},'email',${literal(QA_EMAIL)},'email_verified',true),
 'email',now(),now()
WHERE NOT EXISTS(SELECT 1 FROM auth.identities WHERE user_id=${literal(QA_ID)}::uuid);`

// Repairs only the synthetic fixture created by this script, never a real account.
export function buildIdentityRepairSql(apply = false) {
  return `BEGIN;
SET LOCAL statement_timeout='10s';
SELECT pg_advisory_xact_lock(hashtextextended('tonight-integrated-local-preview',0));
DO $qa$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=${literal(QA_ID)}::uuid
  AND email=${literal(QA_EMAIL)} AND role='authenticated'
  AND raw_user_meta_data->>'local_fixture'='tonight-preview-20260920')
 OR EXISTS(SELECT 1 FROM auth.identities WHERE
  (user_id=${literal(QA_ID)}::uuid OR (provider='email' AND provider_id=${literal(QA_ID)}))
  AND (user_id=${literal(QA_ID)}::uuid AND provider='email' AND provider_id=${literal(QA_ID)}
   AND identity_data->>'email'=${literal(QA_EMAIL)}) IS NOT TRUE)
 THEN RAISE EXCEPTION 'qa_identity_owner_mismatch'; END IF;
END $qa$;
UPDATE auth.users SET instance_id=coalesce(instance_id,'00000000-0000-0000-0000-000000000000'::uuid),
 encrypted_password=coalesce(encrypted_password,''),confirmation_token=coalesce(confirmation_token,''),
 recovery_token=coalesce(recovery_token,''),email_change_token_new=coalesce(email_change_token_new,''),
 email_change=coalesce(email_change,''),email_change_token_current=coalesce(email_change_token_current,''),
 phone_change=coalesce(phone_change,''),phone_change_token=coalesce(phone_change_token,''),
 reauthentication_token=coalesce(reauthentication_token,'')
WHERE id=${literal(QA_ID)}::uuid;
${identitySql}
SELECT 'qa_email_identity_attached';
${apply ? 'COMMIT' : 'ROLLBACK'};`
}

// All data below is synthetic local QA data: no SMS, real photo analysis or payment.
const readinessSql = `DO $qa$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=${literal(QA_ID)}::uuid
  AND email=${literal(QA_EMAIL)} AND role='authenticated'
  AND raw_user_meta_data->>'local_fixture'='tonight-preview-20260920' AND phone IS NULL)
 THEN RAISE EXCEPTION 'qa_readiness_target_mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM quantum_private.community_member_profiles WHERE user_id=${literal(QA_ID)}::uuid)
 OR EXISTS(SELECT 1 FROM public.photos WHERE user_id=${literal(QA_ID)}::uuid)
 THEN RAISE EXCEPTION 'qa_readiness_already_exists'; END IF;
END $qa$;
UPDATE auth.users SET phone='821000000920',phone_confirmed_at=now() WHERE id=${literal(QA_ID)}::uuid;
INSERT INTO quantum_private.community_member_profiles(user_id,birth_date,school_scope,department,community_gender,
 display_name,alias_claimed_at,phone_verified_at)
VALUES (${literal(QA_ID)}::uuid,'2002-01-01','pnu_self_selected','로컬 검수','female','오늘밤검수',now(),now());
UPDATE public.profiles SET worldcup_completed_at=now() WHERE user_id=${literal(QA_ID)}::uuid;
INSERT INTO public.photos(user_id,storage_path,public_url,sort_order)
VALUES (${literal(QA_ID)}::uuid,${literal(QA_ID+'/local-qa-not-real-photo.webp')},'/images/match/tonight-social-20260915.webp',0);
-- The normal photo-change trigger invalidates the score. Set only this synthetic
-- account's test score back to ready against the newly generated revision.
UPDATE public.private_appearance_scores SET analyzed_photo_revision=photo_revision,status='ready',
 request_id='e9200000-0000-4000-8000-000000000003',attempt_count=1,
 provider='openai',model_version='gpt-5.6-terra',prompt_version='appearance-anchor-v3',anchor_version='approved-v1',
 score_raw=55,score_normalized=0.55,confidence_0_1=1,appearance_type='warm',analyzed_at=now()
WHERE user_id=${literal(QA_ID)}::uuid;
DO $qa$ BEGIN
 IF (SELECT matching_ready FROM quantum_private.resolve_profile_readiness(${literal(QA_ID)}::uuid)) IS NOT TRUE
 THEN RAISE EXCEPTION 'qa_matching_readiness_failed'; END IF;
END $qa$;`

export function buildReadinessFixtureSql(apply = false) {
 return `BEGIN;\nSET LOCAL statement_timeout='10s';\nSELECT pg_advisory_xact_lock(hashtextextended('tonight-integrated-local-preview',0));\n${readinessSql}\nSELECT 'synthetic_qa_matching_ready';\n${apply ? 'COMMIT' : 'ROLLBACK'};`
}

export function validateTarget(endpoint, labels, port) {
  if (endpoint !== 'npipe:////./pipe/dockerDesktopLinuxEngine'
    || labels?.['com.supabase.cli.project'] !== 'quantum-integrated-campus-20260905'
    || port !== '56422') throw Error('unexpected_local_database')
}

export async function fixtureInputs(serviceDate) {
  const loadPureModule = async path => {
    const source = await readFile(resolve(ROOT, path), 'utf8')
    const compiled = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText
    return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
  }
  const catalog = await loadPureModule('lib/matching/tonight-ranked/activity-catalog.ts')
  const schedule = await loadPureModule('lib/matching/tonight-ranked/schedule.ts')
  return {
    serviceDate,
    schedule: schedule.buildDefaultTonightScheduleKst(serviceDate),
    activities: catalog.selectTonightActivityTemplates({ marketCode: 'PNU', serviceDate }),
  }
}

export function buildFixtureSql({ serviceDate, schedule, activities }, apply = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) || activities.length !== 3) throw Error('invalid_fixture')
  const sql = `BEGIN;
SET LOCAL statement_timeout = '15s';
SELECT pg_advisory_xact_lock(hashtextextended('tonight-integrated-local-preview',0));
CREATE TEMP TABLE preserved AS
 SELECT 'auth' AS name, md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) AS digest FROM auth.users t
 UNION ALL SELECT 'profiles',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY user_id)::text,'')) FROM public.profiles t
 UNION ALL SELECT 'meetups',md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM public.activity_meetups t;
DO $qa$ BEGIN
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=${literal(QA_ID)}::uuid OR email=${literal(QA_EMAIL)}) THEN
  RAISE EXCEPTION 'qa_identity_exists_no_overwrite';
 END IF;
 IF EXISTS(SELECT 1 FROM public.tonight_rounds WHERE market_code='PNU' AND service_date=${literal(serviceDate)}::date) THEN
  RAISE EXCEPTION 'round_exists_no_overwrite';
 END IF;
 IF (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date <> ${literal(serviceDate)}::date
    OR CURRENT_TIMESTAMP >= ${literal(schedule.signupCloseAt)}::timestamptz THEN
  RAISE EXCEPTION 'qa_today_signup_window_required';
 END IF;
END $qa$;
INSERT INTO auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
 encrypted_password,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,
 phone_change,phone_change_token,reauthentication_token)
VALUES (${literal(QA_ID)}::uuid,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated',${literal(QA_EMAIL)},now(),
 '{"provider":"email","providers":["email"]}', '{"local_fixture":"tonight-preview-20260920"}',now(),now(),
 '','','','','','','','','');
${identitySql}
INSERT INTO public.profiles(user_id,gender,age,school,department,year,display_name,is_profile_complete)
VALUES (${literal(QA_ID)}::uuid,'female',24,'부산대학교','로컬 검수',4,'오늘밤검수',true);
-- Synthetic private matching input; this is not a real photo analysis.
INSERT INTO public.private_appearance_scores(user_id,photo_revision,analyzed_photo_revision,status,request_id,
 attempt_count,provider,model_version,prompt_version,anchor_version,score_raw,score_normalized,confidence_0_1,appearance_type,analyzed_at)
VALUES (${literal(QA_ID)}::uuid,'e9200000-0000-4000-8000-000000000002','e9200000-0000-4000-8000-000000000002',
 'ready','e9200000-0000-4000-8000-000000000003',1,'openai','gpt-5.6-terra','appearance-anchor-v3','approved-v1',55,0.55,1,'warm',now());
${readinessSql}
INSERT INTO public.tonight_market_memberships(market_code,user_id,granted_by,grant_idempotency_key)
VALUES ('PNU',${literal(QA_ID)}::uuid,${literal(QA_ID)}::uuid,'local-qa-tonight-preview-20260920');
SELECT public.service_create_tonight_round(
 'PNU',${literal(serviceDate)}::date,${literal(serviceDate+'T00:00:00+09:00')}::timestamptz,
 ${['signupCloseAt','capacityLockAt','allocationPublishAt','depositDueAt','partnerAcceptanceDueAt','revealAt','arrivalAt','startsAt'].map(k=>literal(schedule[k])+'::timestamptz').join(',\n ')},
 ${textArray(activities.map(a=>'[로컬 검수] '+a.title))},
 ${textArray(activities.map(a=>a.activityKind))},
 ${textArray(activities.map(a=>'실제 모집·예약이 아닌 검수용 콘텐츠입니다. '+a.description))},
 ${textArray(activities.map(a=>a.imageUrl))},
 ARRAY[${activities.map(a=>a.durationMinutes).join(',')}]::smallint[],
 ${literal(JSON.stringify(activities.map(a=>a.venueCategories)))}::jsonb,
 ${literal('local-qa-tonight-preview-'+serviceDate)}
) AS round_id;
SELECT set_config('app.bypass_app_config_guard','on',true);
UPDATE public.app_config SET value='true'::jsonb WHERE key='tonight_applications_open';
SELECT set_config('app.bypass_app_config_guard','off',true);
DO $qa$ BEGIN
 IF (SELECT digest FROM preserved WHERE name='auth') IS DISTINCT FROM
   (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM auth.users t WHERE id<>${literal(QA_ID)}::uuid)
 OR (SELECT digest FROM preserved WHERE name='profiles') IS DISTINCT FROM
   (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY user_id)::text,'')) FROM public.profiles t WHERE user_id<>${literal(QA_ID)}::uuid)
 OR (SELECT digest FROM preserved WHERE name='meetups') IS DISTINCT FROM
   (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM public.activity_meetups t)
 THEN RAISE EXCEPTION 'existing_data_changed'; END IF;
END $qa$;
SELECT json_build_object('activities',count(*),'status','local-qa-only') FROM public.tonight_round_activities a
JOIN public.tonight_rounds r ON r.id=a.round_id WHERE r.create_idempotency_key=${literal('local-qa-tonight-preview-'+serviceDate)};
${apply ? 'COMMIT' : 'ROLLBACK'};`
  return sql
}

export function runLocalSql(sql) {
  const env = { ...process.env, DOCKER_CONTEXT: 'desktop-linux' }
  delete env.DOCKER_HOST
  const call = args => execFileSync('docker',['--context','desktop-linux',...args],{
    encoding:'utf8',timeout:25_000,windowsHide:true,env,stdio:['pipe','pipe','pipe'],
  }).trim()
  const endpoint = JSON.parse(call(['context','inspect','desktop-linux','--format','{{json .Endpoints.docker.Host}}']))
  const container = JSON.parse(call(['inspect',TARGET]))[0]
  validateTarget(endpoint,container.Config.Labels,container.NetworkSettings.Ports['5432/tcp']?.[0]?.HostPort)
  return execFileSync('docker',['--context','desktop-linux','exec','-i',TARGET,
    'env','-i','PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-h','/var/run/postgresql','-U','postgres','-d','postgres'],{
    input:sql,encoding:'utf8',timeout:25_000,windowsHide:true,env,stdio:['pipe','pipe','pipe'],
  }).trim()
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode=process.argv[2]
  if (process.argv.length!==3 || !['--verify','--apply'].includes(mode) || process.env.NODE_ENV==='production') throw Error('explicit_local_mode_required')
  const date=new Date(Date.now()+9*3600_000).toISOString().slice(0,10)
  try {
    const inputs=await fixtureInputs(date)
    console.log(runLocalSql(buildFixtureSql(inputs,mode==='--apply')))
    console.log(JSON.stringify({mode,localOnly:true,serviceDate:date,email:QA_EMAIL,realPayments:false,workersEnabled:false}))
  } catch(error) {
    // psql diagnostics from this fixture contain SQL/fixture values only, never credentials.
    console.error(String(error?.stderr || error.message).slice(0,1800))
    process.exitCode=1
  }
}
