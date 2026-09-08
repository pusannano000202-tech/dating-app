import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

import { createClient } from '@supabase/supabase-js'

import { assertLocalSupabaseUrl } from './tonight-local-safety.mjs'

export const SEED_NAMESPACE = 'quantum-tonight-local-v1'
export const FIXED_CONTAINER_NAME = 'supabase_db_quantum-tonight-live-local'

const FIXED_SUPABASE_URL = 'http://127.0.0.1:56321/'
const FIXED_DATABASE_NAME = 'postgres'
const FIXED_DATABASE_USER = 'postgres'
const DEFAULT_RUNTIME_ENV_PATH = join('.tmp', 'tonight-live-local', 'runtime-env.json')
const DEFAULT_CREDENTIAL_PATH = join('.tmp', 'tonight-live-local', 'seed-credentials.json')
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function requiredString(value, code = 'local_seed_environment_incomplete') {
  if (typeof value !== 'string' || value.length === 0) throw new Error(code)
  return value
}

function sanitizeDetail(value) {
  return String(value || '')
    .replace(/\b(password|token|apikey|api_key|authorization)\s*[:=]\s*[^\s|]+/gi, '$1=[REDACTED]')
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

function seedFailure(code, cause) {
  const error = new Error(code)
  error.code = code
  error.detail = sanitizeDetail([
    cause?.code,
    cause?.message,
    cause?.details,
    cause?.hint,
  ].filter(Boolean).join(' | '))
  return error
}

export function summarizeSeedError(error) {
  const code = typeof error?.code === 'string' && /^[a-z][a-z0-9_]+$/.test(error.code)
    ? error.code
    : error instanceof Error && /^[a-z][a-z0-9_]+$/.test(error.message)
      ? error.message
      : 'local_seed_unexpected_failure'
  const detail = sanitizeDetail(error?.detail || (error?.message === code ? '' : error?.message))
  return detail ? `code=${code} detail=${detail}` : `code=${code}`
}

export function parseRuntimeEnv(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.schema_version !== 1) {
    throw new Error('local_runtime_env_invalid')
  }
  if (input.NODE_ENV === 'production') throw new Error('local_runner_production_refused')

  const url = assertLocalSupabaseUrl(requiredString(input.NEXT_PUBLIC_SUPABASE_URL))
  if (url.href !== FIXED_SUPABASE_URL) throw new Error('local_supabase_target_invalid')
  const publicKey = input.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || input.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const adminKey = input.SUPABASE_SECRET_KEY || input.SUPABASE_SERVICE_ROLE_KEY
  requiredString(publicKey)
  requiredString(adminKey)

  if (
    input.LOCAL_SUPABASE_DB_CONTAINER !== FIXED_CONTAINER_NAME
    || input.LOCAL_SUPABASE_DB_NAME !== FIXED_DATABASE_NAME
    || input.LOCAL_SUPABASE_DB_USER !== FIXED_DATABASE_USER
  ) {
    throw new Error('local_database_target_invalid')
  }

  return {
    url,
    publicKey,
    adminKey,
    container: FIXED_CONTAINER_NAME,
    database: FIXED_DATABASE_NAME,
    databaseUser: FIXED_DATABASE_USER,
  }
}

export function buildAccountSpecs() {
  const definitions = [
    ['super-admin', 'male', false],
    ['admin', 'female', false],
    ['partner', 'male', false],
    ['user', 'female', true],
    ['applicant-m1', 'male', true],
    ['applicant-m2', 'male', true],
    ['applicant-m3', 'male', true],
    ['applicant-f1', 'female', true],
  ]

  return definitions.map(([label, gender, applicant], index) => ({
    label,
    gender,
    applicant,
    email: `tonight.local.${label}@example.invalid`,
    displayName: `TonightLocal${index + 1}`,
    age: 22 + (index % 4),
    score: 52 + index,
  }))
}

function stableUuid(value) {
  const bytes = Buffer.from(createHash('sha1').update(`${SEED_NAMESPACE}:${value}`).digest().subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function sqlUuid(value) {
  if (!UUID_PATTERN.test(value)) throw new Error('local_seed_user_id_invalid')
  return `${sqlText(value)}::uuid`
}

function accountSql(account) {
  const userId = sqlUuid(account.id)
  const email = sqlText(account.email)
  const displayName = sqlText(account.displayName)
  const gender = sqlText(account.gender)
  const score = Number(account.score)
  const scoreNormalized = score / 100
  const photoRevision = sqlUuid(stableUuid(`photo:${account.label}`))
  const requestId = sqlUuid(stableUuid(`score-request:${account.label}`))

  return `
DO $seed$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = ${userId} AND lower(email) = lower(${email})
  ) THEN
    RAISE EXCEPTION 'tonight_local_seed_auth_user_conflict';
  END IF;

  INSERT INTO public.profiles (
    user_id, gender, age, school, department, year, display_name, is_profile_complete
  ) VALUES (
    ${userId}, ${gender}, ${account.age}, '부산대학교', 'Local QA', 4, ${displayName}, TRUE
  ) ON CONFLICT (user_id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = ${userId}
      AND gender = ${gender}
      AND age = ${account.age}
      AND school = '부산대학교'
      AND department = 'Local QA'
      AND year = 4
      AND display_name = ${displayName}
      AND is_profile_complete = TRUE
  ) THEN
    RAISE EXCEPTION 'tonight_local_seed_profile_conflict';
  END IF;

  INSERT INTO public.private_appearance_scores (
    user_id, photo_revision, analyzed_photo_revision, status, request_id,
    attempt_count, provider, model_version, prompt_version, anchor_version,
    score_raw, score_normalized, confidence_0_1, appearance_type, analyzed_at
  ) VALUES (
    ${userId}, ${photoRevision}, ${photoRevision}, 'ready', ${requestId},
    1, 'openai', 'gpt-5.6-terra', 'appearance-anchor-v3', 'approved-v1',
    ${score}, ${scoreNormalized}, 1, 'warm', CURRENT_TIMESTAMP
  ) ON CONFLICT (user_id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.private_appearance_scores
    WHERE user_id = ${userId}
      AND photo_revision = ${photoRevision}
      AND analyzed_photo_revision = ${photoRevision}
      AND status = 'ready'
      AND request_id = ${requestId}
      AND lease_expires_at IS NULL
      AND attempt_count = 1
      AND score_raw = ${score}
      AND score_normalized = ${scoreNormalized}
      AND score_effective = ${score}
      AND score_override IS NULL
      AND confidence_0_1 = 1
      AND appearance_type = 'warm'
      AND provider = 'openai'
      AND model_version = 'gpt-5.6-terra'
      AND prompt_version = 'appearance-anchor-v3'
      AND anchor_version = 'approved-v1'
      AND error_code IS NULL
  ) THEN
    RAISE EXCEPTION 'tonight_local_seed_score_conflict';
  END IF;
END;
$seed$;`
}

export function buildBootstrapSql({ accounts }) {
  if (!Array.isArray(accounts) || accounts.length !== 8) throw new Error('local_seed_accounts_invalid')
  const accountByLabel = new Map(accounts.map((account) => [account.label, account]))
  const superAdmin = accountByLabel.get('super-admin')
  if (!superAdmin) throw new Error('local_seed_accounts_invalid')

  const venueId = stableUuid('venue:pnu-local-qa')
  const snapshotId = stableUuid('venue-snapshot:pnu-local-qa-v1')
  const snapshotRevision = stableUuid('venue-snapshot-revision:pnu-local-qa-v1')
  const accountStatements = accounts.map(accountSql).join('\n')

  return `BEGIN;
${accountStatements}

DO $seed$
DECLARE
  seeded_super_admin uuid := ${sqlUuid(superAdmin.id)};
  active_super_admin uuid;
BEGIN
  SELECT user_id INTO active_super_admin
  FROM public.admins
  WHERE role = 'super_admin'
  ORDER BY granted_at, user_id
  LIMIT 1;

  IF active_super_admin IS NULL THEN
    PERFORM quantum_private.bootstrap_initial_super_admin(seeded_super_admin);
  ELSIF active_super_admin <> seeded_super_admin OR EXISTS (
    SELECT 1 FROM public.admins
    WHERE role = 'super_admin' AND user_id <> seeded_super_admin
  ) THEN
    RAISE EXCEPTION 'tonight_local_seed_super_admin_conflict';
  END IF;
END;
$seed$;

INSERT INTO public.venues (
  id, name, category, address, latitude, longitude, area, nearest_school,
  min_group_size, max_group_size, suitable_for_group_meeting,
  reservation_required, map_url, status, notes
) VALUES (
  ${sqlUuid(venueId)}, 'Quantum Tonight Local QA', 'restaurant',
  '부산광역시 금정구 부산대학로63번길 2', 35.2320, 129.0840,
  '부산대 앞', '부산대학교', 5, 6, TRUE, TRUE,
  'https://map.naver.com/p/search/부산대학교', 'active', ${sqlText(SEED_NAMESPACE)}
) ON CONFLICT (id) DO NOTHING;

DO $seed$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.venues
    WHERE id = ${sqlUuid(venueId)}
      AND name = 'Quantum Tonight Local QA'
      AND category = 'restaurant'
      AND address = '부산광역시 금정구 부산대학로63번길 2'
      AND latitude = 35.2320
      AND longitude = 129.0840
      AND area = '부산대 앞'
      AND nearest_school = '부산대학교'
      AND min_group_size = 5
      AND max_group_size = 6
      AND suitable_for_group_meeting = TRUE
      AND price_level IS NULL
      AND noise_level IS NULL
      AND privacy_level IS NULL
      AND vibe_tags = ARRAY[]::TEXT[]
      AND has_alcohol = FALSE
      AND reservation_required = TRUE
      AND phone IS NULL
      AND map_url = 'https://map.naver.com/p/search/부산대학교'
      AND opening_hours IS NULL
      AND available_timeslots IS NULL
      AND checkin_radius_m = 50
      AND status = 'active'
      AND admin_priority = 0
      AND quality_score = 0.5
      AND notes = ${sqlText(SEED_NAMESPACE)}
  ) THEN
    RAISE EXCEPTION 'tonight_local_seed_venue_conflict';
  END IF;
END;
$seed$;

INSERT INTO public.venue_snapshots (
  id, venue_id, snapshot_revision, display_name, venue_category, area_label,
  address, address_evidence, address_verified_at,
  latitude, longitude, coordinate_evidence, coordinates_verified_at,
  naver_url, naver_link_kind, kakao_url, kakao_link_kind
) VALUES (
  ${sqlUuid(snapshotId)}, ${sqlUuid(venueId)}, ${sqlUuid(snapshotRevision)},
  'Quantum Tonight Local QA', 'restaurant', '부산대 앞',
  '부산광역시 금정구 부산대학로63번길 2', 'operator-verified', CURRENT_TIMESTAMP,
  35.2320, 129.0840, 'operator-verified', CURRENT_TIMESTAMP,
  'https://map.naver.com/p/search/부산대학교', 'search',
  'https://map.kakao.com/?q=부산대학교', 'search'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO quantum_private.venue_snapshot_provenance (
  snapshot_id, venue_id, created_by
) VALUES (
  ${sqlUuid(snapshotId)}, ${sqlUuid(venueId)}, ${sqlUuid(superAdmin.id)}
) ON CONFLICT (snapshot_id) DO NOTHING;

DO $seed$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.venue_snapshots
    WHERE id = ${sqlUuid(snapshotId)}
      AND venue_id = ${sqlUuid(venueId)}
      AND snapshot_revision = ${sqlUuid(snapshotRevision)}
      AND display_name = 'Quantum Tonight Local QA'
      AND venue_category = 'restaurant'
      AND area_label = '부산대 앞'
      AND address = '부산광역시 금정구 부산대학로63번길 2'
      AND address_evidence = 'operator-verified'
      AND address_verified_at IS NOT NULL
      AND latitude = 35.2320
      AND longitude = 129.0840
      AND coordinate_evidence = 'operator-verified'
      AND coordinates_verified_at IS NOT NULL
      AND naver_url = 'https://map.naver.com/p/search/부산대학교'
      AND naver_link_kind = 'search'
      AND kakao_url = 'https://map.kakao.com/?q=부산대학교'
      AND kakao_link_kind = 'search'
  ) OR NOT EXISTS (
    SELECT 1 FROM quantum_private.venue_snapshot_provenance
    WHERE snapshot_id = ${sqlUuid(snapshotId)}
      AND venue_id = ${sqlUuid(venueId)}
      AND created_by = ${sqlUuid(superAdmin.id)}
  ) THEN
    RAISE EXCEPTION 'tonight_local_seed_venue_snapshot_conflict';
  END IF;
END;
$seed$;
COMMIT;`
}

function kstDateParts(date) {
  const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return [shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate()]
}

function addUtcDays(year, month, day, count) {
  const result = new Date(Date.UTC(year, month - 1, day + count))
  return [result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate()]
}

function kstInstant(year, month, day, hour, minute) {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute)).toISOString()
}

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function buildRoundWindow(now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('local_seed_time_invalid')
  const current = kstDateParts(now)
  const service = addUtcDays(...current, 1)
  return {
    serviceDate: isoDate(...service),
    signupOpenAt: kstInstant(...current, 0, 0),
    signupCloseAt: kstInstant(...service, 18, 30),
    capacityLockAt: kstInstant(...service, 18, 30),
    allocationPublishAt: kstInstant(...service, 18, 32),
    depositDueAt: kstInstant(...service, 18, 45),
    partnerAcceptanceDueAt: kstInstant(...service, 18, 50),
    revealAt: kstInstant(...service, 18, 55),
    arrivalAt: kstInstant(...service, 19, 20),
    startsAt: kstInstant(...service, 19, 30),
  }
}

export function buildRoundRpcArgs(round) {
  return {
    p_market_code: 'PNU',
    p_service_date: round.serviceDate,
    p_signup_open_at: round.signupOpenAt,
    p_signup_close_at: round.signupCloseAt,
    p_capacity_lock_at: round.capacityLockAt,
    p_allocation_publish_at: round.allocationPublishAt,
    p_deposit_due_at: round.depositDueAt,
    p_partner_acceptance_due_at: round.partnerAcceptanceDueAt,
    p_reveal_at: round.revealAt,
    p_arrival_at: round.arrivalAt,
    p_starts_at: round.startsAt,
    p_activity_titles: ['보드게임 한 판', '온천천 산책', '부산대 맛집 탐방'],
    p_activity_kinds: ['board_game', 'walk', 'experience'],
    p_activity_descriptions: [
      '규칙이 쉬운 보드게임으로 대화를 시작해요.',
      '밝은 산책로를 함께 걸으며 이야기해요.',
      '부산대 앞 검증용 로컬 업장에서 식사해요.',
    ],
    p_activity_image_urls: [
      '/images/match/events/event-board-game.webp',
      '/images/match/events/event-walk-v2.webp',
      '/images/match/quantum-tonight-five.webp',
    ],
    p_activity_duration_minutes: [90, 60, 90],
    p_activity_allowed_venue_categories: [
      ['activity'],
      ['public-meeting-point'],
      ['restaurant'],
    ],
    p_idempotency_key: `${SEED_NAMESPACE}:round:${round.serviceDate}`,
  }
}

async function readRuntimeEnv(path = DEFAULT_RUNTIME_ENV_PATH) {
  let value
  try {
    value = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw seedFailure('local_runtime_env_unreadable', error)
  }
  return parseRuntimeEnv(value)
}

async function runPsql(runtime, sql) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('docker', [
      'exec', '-i', runtime.container,
      'psql', '-U', runtime.databaseUser, '-d', runtime.database,
      '-v', 'ON_ERROR_STOP=1', '--no-psqlrc', '--quiet',
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => rejectPromise(seedFailure('local_seed_psql_unavailable', error)))
    child.on('close', (code) => {
      if (code === 0) resolvePromise()
      else {
        const conflictCode = stderr.match(/tonight_local_seed_[a-z_]+/)?.[0]
        rejectPromise(seedFailure(conflictCode || 'local_seed_sql_failed', { message: stderr }))
      }
    })
    child.stdin.end(sql)
  })
}

function client(url, key) {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function listSeedUsers(admin) {
  const users = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw seedFailure('local_seed_account_discovery_failed', error)
    users.push(...(data.users || []))
    if (!data.users || data.users.length < 200) return users
  }
}

async function ensureAccounts(admin, specs) {
  const users = await listSeedUsers(admin)
  const byEmail = new Map()
  for (const user of users) {
    const email = user.email?.toLowerCase()
    if (!email) continue
    if (byEmail.has(email)) throw new Error('local_seed_duplicate_email')
    byEmail.set(email, user)
  }

  const result = []
  for (const spec of specs) {
    const password = `Local-${randomBytes(24).toString('base64url')}-9!`
    const metadata = {
      tonight_local_seed_namespace: SEED_NAMESPACE,
      tonight_local_seed_label: spec.label,
    }
    const existing = byEmail.get(spec.email.toLowerCase())
    let user
    if (existing) {
      if (
        existing.user_metadata?.tonight_local_seed_namespace !== SEED_NAMESPACE
        || existing.user_metadata?.tonight_local_seed_label !== spec.label
      ) {
        throw new Error('local_seed_existing_account_conflict')
      }
      const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        user_metadata: metadata,
      })
      if (error || !data.user) throw seedFailure('local_seed_account_update_failed', error)
      user = data.user
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: spec.email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      })
      if (error || !data.user) throw seedFailure('local_seed_account_create_failed', error)
      user = data.user
    }
    result.push({ ...spec, id: user.id, password })
  }
  return result
}

async function rpc(clientInstance, name, args, failure) {
  const { data, error } = await clientInstance.rpc(name, args)
  if (error) throw seedFailure(failure, error)
  return data
}

async function signIn(runtime, account) {
  const signedInClient = client(runtime.url.href, runtime.publicKey)
  const { data, error } = await signedInClient.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  })
  if (error || !data.session?.access_token) throw seedFailure('local_seed_sign_in_failed', error)
  return signedInClient
}

export async function seedTonightLocal({
  runtimeEnvPath = DEFAULT_RUNTIME_ENV_PATH,
  credentialPath = DEFAULT_CREDENTIAL_PATH,
  now = new Date(),
  executeSql = runPsql,
} = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('local_runner_production_refused')
  const runtime = await readRuntimeEnv(runtimeEnvPath)
  const admin = client(runtime.url.href, runtime.adminKey)
  const accounts = await ensureAccounts(admin, buildAccountSpecs())
  await executeSql(runtime, buildBootstrapSql({ accounts }))

  const byLabel = new Map(accounts.map((account) => [account.label, account]))
  const superAdminClient = await signIn(runtime, byLabel.get('super-admin'))
  await rpc(superAdminClient, 'verify_recent_super_admin_session', {}, 'local_seed_super_admin_session_failed')
  await rpc(superAdminClient, 'grant_admin_revisioned', {
    p_user_id: byLabel.get('admin').id,
    p_role: 'admin',
    p_expected_revision: 0,
    p_idempotency_key: `${SEED_NAMESPACE}:admin`,
  }, 'local_seed_admin_grant_failed')

  const venueId = stableUuid('venue:pnu-local-qa')
  await rpc(superAdminClient, 'grant_venue_partner_membership', {
    p_user_id: byLabel.get('partner').id,
    p_venue_id: venueId,
    p_role: 'owner',
    p_expected_revision: 0,
    p_idempotency_key: `${SEED_NAMESPACE}:partner`,
  }, 'local_seed_partner_grant_failed')

  for (const account of accounts.filter((account) => account.applicant)) {
    await rpc(superAdminClient, 'super_admin_grant_tonight_market_membership', {
      p_market_code: 'PNU',
      p_user_id: account.id,
      p_idempotency_key: `${SEED_NAMESPACE}:market:${account.label}`,
    }, 'local_seed_market_grant_failed')
  }

  const round = buildRoundWindow(now)
  const roundId = await rpc(
    admin,
    'service_create_tonight_round',
    buildRoundRpcArgs(round),
    'local_seed_round_create_failed',
  )

  const applicationsOpen = await rpc(
    admin,
    'service_get_tonight_activation_gate',
    {},
    'local_seed_application_gate_read_failed',
  )
  if (applicationsOpen !== true) {
    await rpc(superAdminClient, 'set_app_config', {
      p_key: 'tonight_applications_open',
      p_value: true,
    }, 'local_seed_application_gate_open_failed')
  }

  const credentials = {
    schema_version: 1,
    namespace: SEED_NAMESPACE,
    supabase_url: runtime.url.href,
    venue_id: venueId,
    round_id: roundId,
    service_date: round.serviceDate,
    warning: 'LOCAL_SYNTHETIC_ONLY_NO_REAL_PAYMENT_NO_REMOTE',
    accounts: accounts.map(({ label, email, password, id, applicant }) => ({
      label, email, password, id, applicant,
    })),
  }
  await mkdir(dirname(credentialPath), { recursive: true })
  await writeFile(credentialPath, `${JSON.stringify(credentials, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  return { accountCount: accounts.length, applicantCount: 5, roundId, serviceDate: round.serviceDate }
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isMain) {
  try {
    const result = await seedTonightLocal()
    console.log(`tonight-local-seed status=pass accounts=${result.accountCount} applicants=${result.applicantCount}`)
  } catch (error) {
    console.error(`tonight-local-seed status=fail ${summarizeSeedError(error)}`)
    process.exitCode = 1
  }
}
