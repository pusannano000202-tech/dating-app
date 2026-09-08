import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'

const helperPath = '../../scripts/qa/community-voice-local-runtime.mjs'
const runtime = existsSync(new URL(helperPath, import.meta.url)) ? await import(helperPath) : {}

test('community voice launcher accepts only the fixed workspace and sibling source runtime', () => {
  assert.equal(typeof runtime.resolveCommunityVoiceLocalRoots, 'function')
  const workspace = resolve('.')
  assert.deepEqual(runtime.resolveCommunityVoiceLocalRoots(workspace), {
    workspaceRoot: workspace,
    sourceRoot: join(workspace, '..', 'integrated-campus-20260905'),
    runtimeRoot: join(workspace, '..', 'integrated-campus-20260905', '.tmp', 'integrated-live-local'),
  })
  assert.throws(
    () => runtime.resolveCommunityVoiceLocalRoots(join(workspace, '..', '..', 'another-parent', 'community-voice-20260907')),
    /unexpected_community_voice_workspace/,
  )
})

test('runtime config must identify the dedicated project, API, and fixed 3010 callback', () => {
  assert.equal(typeof runtime.assertDedicatedRuntimeConfig, 'function')
  const exact = `project_id = "quantum-integrated-campus-20260905"\n[api]\nport = 56421\n[auth]\nsite_url = "http://localhost:3010"\nadditional_redirect_urls = ["http://localhost:3010/auth/callback"]`
  assert.equal(runtime.assertDedicatedRuntimeConfig(exact), true)
  for (const changed of [
    exact.replace('quantum-integrated-campus-20260905', 'remote-project'),
    exact.replace('port = 56421', 'port = 56321'),
    exact.replace('http://localhost:3010', 'https://remote.example'),
  ]) assert.throws(() => runtime.assertDedicatedRuntimeConfig(changed), /unexpected_source_runtime_config/)
})

test('child environment keeps only OS essentials and validated local runtime values', () => {
  assert.equal(typeof runtime.buildCommunityVoiceChildEnvironment, 'function')
  const local = {
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56421',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-public',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-public',
    SUPABASE_SERVICE_ROLE_KEY: 'local-service',
    SUPABASE_SECRET_KEY: '',
    SUPABASE_PHONE_OTP_TTL_SECONDS: '3600',
    PHONE_VERIFICATION_DIGEST_SECRET: 'a'.repeat(64),
    PROFILE_ALIAS_SIGNING_SECRET: 'b'.repeat(64),
    NEXT_PUBLIC_DEV_AUTH_BYPASS: 'false',
    PAYMENT_PROVIDER: 'mock',
    NEXT_PUBLIC_PAYMENT_PROVIDER: 'mock',
    CONTINUATION_LOCAL_PAYMENT_SIMULATOR_ENABLED: 'false',
    TONIGHT_AUTOMATION_ENABLED: 'false',
    TONIGHT_CARD_PAYMENTS_ENABLED: 'false',
    TOSS_SECRET_KEY: '',
    NEXT_PUBLIC_TOSS_CLIENT_KEY: '',
  }
  const child = runtime.buildCommunityVoiceChildEnvironment({
    Path: 'C:\\Windows',
    SystemRoot: 'C:\\Windows',
    NEXT_PUBLIC_SUPABASE_URL: 'https://remote.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'remote-service',
    TOSS_SECRET_KEY: 'live-payment',
    LIVEKIT_API_KEY: 'live-media',
    LIVEKIT_API_SECRET: 'live-media-secret',
    RANDOM_PARENT_VALUE: 'do-not-inherit',
  }, local)

  assert.equal(child.Path, 'C:\\Windows')
  assert.equal(child.SystemRoot, 'C:\\Windows')
  assert.equal(child.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:56421')
  assert.equal(child.SUPABASE_SERVICE_ROLE_KEY, 'local-service')
  assert.equal(child.PAYMENT_PROVIDER, 'mock')
  assert.equal(child.TOSS_SECRET_KEY, '')
  for (const key of ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'RANDOM_PARENT_VALUE']) {
    assert.equal(Object.hasOwn(child, key), false)
  }
})

test('workspace dotenv files fail closed before Next can load provider credentials', () => {
  assert.equal(typeof runtime.assertNoNextEnvironmentFiles, 'function')
  assert.equal(runtime.assertNoNextEnvironmentFiles(['.env.example', '.env.local.example']), true)
  for (const name of [
    '.env', '.env.local', '.env.development', '.env.development.local', '.env.production',
    '.ENV.LOCAL', '.Env.development',
  ]) {
    assert.throws(
      () => runtime.assertNoNextEnvironmentFiles(['package.json', name]),
      /workspace_environment_file_forbidden/,
    )
  }
})

test('Docker child environment is pinned to the verified local Desktop engine', () => {
  assert.equal(typeof runtime.buildLocalDockerEnvironment, 'function')
  assert.equal(typeof runtime.assertLocalDockerContextEndpoint, 'function')
  const environment = runtime.buildLocalDockerEnvironment({
    Path: 'C:\\Windows',
    USERPROFILE: 'C:\\Users\\tester',
    DOCKER_HOST: 'tcp://remote.example:2375',
    DOCKER_CONTEXT: 'remote',
    DOCKER_TLS_VERIFY: '1',
  })
  assert.equal(environment.DOCKER_CONTEXT, 'desktop-linux')
  assert.equal(Object.hasOwn(environment, 'DOCKER_HOST'), false)
  assert.equal(Object.hasOwn(environment, 'DOCKER_TLS_VERIFY'), false)
  assert.equal(runtime.assertLocalDockerContextEndpoint('npipe:////./pipe/dockerDesktopLinuxEngine'), true)
  assert.throws(
    () => runtime.assertLocalDockerContextEndpoint('tcp://remote.example:2375'),
    /unexpected_docker_context_endpoint/,
  )
})

test('migration boundary reports workspace additions without claiming database application', () => {
  assert.equal(typeof runtime.describeMigrationBoundary, 'function')
  assert.deepEqual(runtime.describeMigrationBoundary(
    ['20260906133228_existing.sql', '20260906181225_community_social_integrated.sql'],
    {
      schema_version: 1,
      migration_count: 1,
      files: [{ path: '20260906133228_existing.sql', sha256: 'a'.repeat(64) }],
    },
  ), {
    sourceSnapshotMigrationCount: 1,
    workspaceMigrationCount: 2,
    workspaceOnlyMigrations: ['20260906181225_community_social_integrated.sql'],
    databaseMigrationsAppliedByLauncher: false,
    fullFeatureRuntimeVerified: false,
  })
})

test('launcher reads source status and secrets but starts only the current workspace UI', () => {
  const source = readFileSync('scripts/qa/serve-community-voice-local.mjs', 'utf8')
  assert.match(source, /process\.argv\.length !== 2/)
  assert.match(source, /package\.json/)
  assert.match(source, /dist['"], 'supabase\.js/)
  assert.match(source, /process\.execPath/)
  assert.match(source, /'--version'/)
  assert.match(source, /'status', '--workdir', runtimeRoot, '-o', 'json'/)
  assert.match(source, /shell: false/)
  assert.doesNotMatch(source, /npx\.cmd|'npx'|supabase\.exe/)
  assert.match(source, /assertLocalDockerContextEndpoint/)
  assert.match(source, /'--context', 'desktop-linux'/)
  assert.match(source, /env: dockerEnvironment/)
  assert.match(source, /runtime-secrets\.json/)
  assert.match(source, /assertNoNextEnvironmentFiles/)
  assert.match(source, /validateIntegratedLocalAuthEnvironment\(authEnv\)/)
  assert.match(source, /createIntegratedRuntimeEnvironment\(status, secrets, smsTtl\)/)
  assert.match(source, /\['scripts\/qa\/start-integrated-ui\.mjs', '--live-local'\]/)
  assert.match(source, /stdio: 'inherit'/)
  assert.match(source, /localUiCanWriteLocalData: true/)
  assert.doesNotMatch(source, /sourceRuntimeReadOnly/)
  assert.doesNotMatch(source, /writeFile|mkdir|rmSync|migration up|db reset|console\.log\((?:status|secrets|localEnv|childEnv)\)/)
})
