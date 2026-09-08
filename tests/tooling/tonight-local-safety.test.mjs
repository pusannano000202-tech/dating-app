import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import {
  assertLocalSupabaseUrl,
  assertSafeLocalRuntimeEnvironment,
} from '../../scripts/qa/tonight-local-safety.mjs'
import {
  LOCAL_STACK,
  buildLocalSupabaseConfig,
  createLocalRuntimeEnvironment,
  parseRunnerOptions,
  redactCliDiagnostic,
  localPaths,
  synchronizeMigrationSnapshot,
} from '../../scripts/qa/tonight-local-stack.mjs'

function migrationName(sequence) {
  return `${String(20260101000000 + sequence).padStart(14, '0')}_local_${String(sequence).padStart(3, '0')}.sql`
}

async function migrationFixture({ count = 204 } = {}) {
  const root = await mkdtemp(resolve(tmpdir(), 'tonight-local-migrations-'))
  const migrationsSource = resolve(root, 'source')
  const migrationsTarget = resolve(root, 'target')
  const manifestPath = resolve(root, 'migrations-manifest.json')
  await mkdir(migrationsSource, { recursive: true })
  for (let sequence = 1; sequence <= count; sequence += 1) {
    await writeFile(resolve(migrationsSource, migrationName(sequence)), `-- ${sequence}\n`, 'utf8')
  }
  return {
    root,
    paths: { runtimeRoot: root, migrationsSource, migrationsTarget, manifestPath },
    async dispose() { await rm(root, { recursive: true, force: true }) },
  }
}

test('email template paths resolve from Supabase workdir, not its config directory', () => {
  const paths = localPaths(process.cwd())
  const contentPaths = [...buildLocalSupabaseConfig().matchAll(/content_path = "([^"]+)"/g)]
  assert.equal(contentPaths.length, 2)
  assert.equal(resolve(paths.runtimeRoot, contentPaths[0][1]), paths.magicLinkTemplatePath)
  assert.equal(resolve(paths.runtimeRoot, contentPaths[1][1]), paths.confirmationTemplatePath)
})

test('accepts only explicit-port HTTP loopback Supabase URLs', () => {
  for (const value of [
    'http://127.0.0.1:56321',
    'http://localhost:56321',
    'http://[::1]:56321',
  ]) {
    const parsed = assertLocalSupabaseUrl(value)
    assert.equal(parsed.protocol, 'http:')
    assert.equal(parsed.port, '56321')
  }
})

test('rejects remote, credentialed, and non-root Supabase URLs', () => {
  for (const value of [
    'https://project.supabase.co',
    'http://localhost',
    'http://localhost:56321/not-local',
    'http://user:password@localhost:56321',
    'http://localhost:56321?target=remote',
    'http://localhost:56321#fragment',
  ]) {
    assert.throws(() => assertLocalSupabaseUrl(value), /local_supabase_url_invalid/)
  }
})

test('rejects production and remote-like local runner environments', () => {
  assert.throws(() => assertSafeLocalRuntimeEnvironment({
    NODE_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56321',
  }), /local_runner_production_refused/)

  assert.throws(() => assertSafeLocalRuntimeEnvironment({
    NODE_ENV: 'development',
    NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  }), /local_supabase_url_invalid/)

  assert.throws(() => assertSafeLocalRuntimeEnvironment({
    NODE_ENV: 'development',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56321',
    NEXT_PUBLIC_DEV_AUTH_BYPASS: 'true',
  }), /unsafe_local_runtime_flag/)
})

test('accepts the fixed non-production live-local runtime policy', () => {
  const result = assertSafeLocalRuntimeEnvironment({
    NODE_ENV: 'development',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56321',
    NEXT_PUBLIC_APP_ORIGIN: 'http://localhost:3004',
    NEXT_PUBLIC_DEV_AUTH_BYPASS: 'false',
    NEXT_PUBLIC_BOOTING_DEMO_MODE: 'false',
    TONIGHT_APPLICATIONS_OPEN: 'true',
    TONIGHT_AUTOMATION_ENABLED: 'false',
    TONIGHT_CARD_PAYMENTS_ENABLED: 'false',
  })

  assert.equal(result.href, 'http://127.0.0.1:56321/')
})

test('builds an isolated Supabase config with the local-only ports', () => {
  const config = buildLocalSupabaseConfig()
  assert.match(config, /project_id = "quantum-tonight-live-local"/)
  assert.match(config, /port = 56321/)
  assert.match(config, /port = 56322/)
  assert.match(config, /port = 56320/)
  assert.match(config, /port = 56323/)
  assert.match(config, /port = 56324/)
  assert.match(config, /\[auth\.email\.template\.magic_link\]/)
  assert.match(config, /content_path = "\.\/templates\/magic_link\.html"/)
  assert.match(config, /\[auth\.email\.template\.confirmation\]/)
  assert.equal(LOCAL_STACK.dbContainer, 'supabase_db_quantum-tonight-live-local')
})

test('creates a non-production app environment only from local status values', () => {
  const env = createLocalRuntimeEnvironment({
    'API URL': 'http://127.0.0.1:56321',
    'anon key': 'local-anon-key',
    'service_role key': 'local-service-key',
  })

  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:56321')
  assert.equal(env.NEXT_PUBLIC_APP_ORIGIN, 'http://localhost:3004')
  assert.equal(env.NEXT_DIST_DIR, '.next-live-local')
  assert.equal(env.TONIGHT_APPLICATIONS_OPEN, 'true')
  assert.equal(env.TONIGHT_AUTOMATION_ENABLED, 'false')
  assert.equal(env.TOSS_SECRET_KEY, '')
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, 'local-service-key')
})

test('refuses a remote status payload before it can become app env', () => {
  assert.throws(() => createLocalRuntimeEnvironment({
    'API URL': 'https://project.supabase.co',
    'anon key': 'not-used',
    'service_role key': 'not-used',
  }), /local_supabase_url_invalid/)
})

test('requires the exact isolated API endpoint from Supabase status', () => {
  assert.throws(() => createLocalRuntimeEnvironment({
    'API URL': 'http://localhost:56321',
    'anon key': 'not-used',
    'service_role key': 'not-used',
  }), /local_supabase_status_url_mismatch/)

  assert.throws(() => createLocalRuntimeEnvironment({
    'API URL': 'http://127.0.0.1:56320',
    'anon key': 'not-used',
    'service_role key': 'not-used',
  }), /local_supabase_status_url_mismatch/)
})

test('keeps stack preparation separate from starting Supabase or the app', () => {
  assert.deepEqual(parseRunnerOptions(['--prepare']), { start: false, serve: false })
  assert.deepEqual(parseRunnerOptions(['--start']), { start: true, serve: false })
  assert.deepEqual(parseRunnerOptions(['--serve']), { start: true, serve: true })
  assert.deepEqual(parseRunnerOptions(['--migrate-local']), { start: false, serve: false, migrateLocal: true })
  assert.throws(() => parseRunnerOptions(['--migrate-local', '--serve']), /local_runner_invalid_arguments/)
  assert.throws(() => parseRunnerOptions(['--prepare', '--serve']), /local_runner_invalid_arguments/)
})

test('redacts local CLI credentials before writing diagnostics', () => {
  const secretPrefix = ['sb', 'secret'].join('_')
  const publishablePrefix = ['sb', 'publishable'].join('_')
  const unlabelledSecret = `${secretPrefix}_unlabelled-secret`
  const unlabelledPublishable = `${publishablePrefix}_unlabelled-public`
  const diagnostic = redactCliDiagnostic([
    'service_role_key: local-secret',
    'Authorization: Bearer local-token',
    'postgresql://postgres:db-password@127.0.0.1:56322/postgres',
    '{"ANON_KEY":"eyJlabelled.header.signature","SERVICE_ROLE_KEY":"json-service-secret"}',
    'eyJunlabelled.header.signature',
    unlabelledSecret,
    unlabelledPublishable,
  ].join('\n'))
  assert.doesNotMatch(diagnostic, /local-secret|local-token|db-password/)
  assert.doesNotMatch(diagnostic, /eyJlabelled|json-service-secret|eyJunlabelled/)
  assert.equal(diagnostic.includes(unlabelledSecret), false)
  assert.equal(diagnostic.includes(unlabelledPublishable), false)
  assert.match(diagnostic, /\[REDACTED\]/)
})

test('creates an immutable initial migration manifest with at least 204 files', async () => {
  const fixture = await migrationFixture()
  try {
    const manifest = await synchronizeMigrationSnapshot(fixture.paths)
    assert.equal(manifest.migration_count, 204)
    assert.equal(JSON.parse(await readFile(fixture.paths.manifestPath, 'utf8')).files.length, 204)
  } finally {
    await fixture.dispose()
  }
})

test('allows only an explicitly requested append after preserving the prior manifest', async () => {
  const fixture = await migrationFixture()
  try {
    const initial = await synchronizeMigrationSnapshot(fixture.paths)
    const initialManifest = await readFile(fixture.paths.manifestPath, 'utf8')
    await writeFile(resolve(fixture.paths.migrationsSource, migrationName(205)), '-- appended\n', 'utf8')

    const appended = await synchronizeMigrationSnapshot(fixture.paths, { allowAppend: true })
    assert.equal(initial.migration_count, 204)
    assert.equal(appended.migration_count, 205)
    assert.equal(await readFile(resolve(fixture.paths.runtimeRoot, 'migrations-manifest.before-append-204.json'), 'utf8'), initialManifest)
  } finally {
    await fixture.dispose()
  }
})

test('refuses pending source migrations without the explicit append option', async () => {
  const fixture = await migrationFixture()
  try {
    await synchronizeMigrationSnapshot(fixture.paths)
    await writeFile(resolve(fixture.paths.migrationsSource, migrationName(205)), '-- pending\n', 'utf8')
    await assert.rejects(() => synchronizeMigrationSnapshot(fixture.paths), /local_migration_append_pending/)
  } finally {
    await fixture.dispose()
  }
})

test('refuses mutation or deletion of the immutable migration prefix', async () => {
  const fixture = await migrationFixture()
  try {
    await synchronizeMigrationSnapshot(fixture.paths)
    await writeFile(resolve(fixture.paths.migrationsSource, migrationName(1)), '-- mutated\n', 'utf8')
    await assert.rejects(() => synchronizeMigrationSnapshot(fixture.paths, { allowAppend: true }), /local_migration_file_mismatch/)
    await writeFile(resolve(fixture.paths.migrationsSource, migrationName(1)), '-- 1\n', 'utf8')
    await rm(resolve(fixture.paths.migrationsSource, migrationName(2)))
    await assert.rejects(() => synchronizeMigrationSnapshot(fixture.paths, { allowAppend: true }), /local_migration_source_prefix_missing/)
  } finally {
    await fixture.dispose()
  }
})

test('refuses a newly inserted migration whose version is not later than the frozen prefix', async () => {
  const fixture = await migrationFixture()
  try {
    await synchronizeMigrationSnapshot(fixture.paths)
    await writeFile(resolve(fixture.paths.migrationsSource, '20260101000001_midstream.sql'), '-- inserted\n', 'utf8')
    await assert.rejects(() => synchronizeMigrationSnapshot(fixture.paths, { allowAppend: true }), /local_migration_append_order_invalid/)
  } finally {
    await fixture.dispose()
  }
})
