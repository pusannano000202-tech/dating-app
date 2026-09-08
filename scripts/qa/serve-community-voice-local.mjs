import { execFileSync, spawn } from 'node:child_process'
import { access, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import {
  COMMUNITY_VOICE_LOCAL,
  assertDedicatedRuntimeConfig,
  assertLocalDockerContextEndpoint,
  assertNoNextEnvironmentFiles,
  buildCommunityVoiceChildEnvironment,
  buildLocalDockerEnvironment,
  describeMigrationBoundary,
  resolveCommunityVoiceLocalRoots,
} from './community-voice-local-runtime.mjs'
import {
  createIntegratedRuntimeEnvironment,
  validateIntegratedLocalAuthEnvironment,
} from './integrated-runtime-environment.mjs'

if (process.argv.length !== 2) throw new Error('Usage: node scripts/qa/serve-community-voice-local.mjs')

const { workspaceRoot, runtimeRoot } = resolveCommunityVoiceLocalRoots(process.cwd())
const configPath = join(runtimeRoot, 'supabase', 'config.toml')
const secretsPath = join(runtimeRoot, 'runtime-secrets.json')
const manifestPath = join(runtimeRoot, 'migrations-manifest.json')

async function readJson(path, errorCode) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new Error(errorCode)
  }
}

async function resolveSupabaseCliScript(dockerEnvironment) {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) throw new Error('supabase_cli_2_116_0_not_cached')
  const cacheRoot = join(localAppData, 'npm-cache', '_npx')
  let entries
  try {
    entries = await readdir(cacheRoot, { withFileTypes: true })
  } catch {
    throw new Error('supabase_cli_2_116_0_not_cached')
  }
  for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const packageRoot = join(cacheRoot, entry.name, 'node_modules', 'supabase')
    const packagePath = join(packageRoot, 'package.json')
    const scriptPath = join(packageRoot, 'dist', 'supabase.js')
    try {
      const packageMetadata = JSON.parse(await readFile(packagePath, 'utf8'))
      if (packageMetadata.version !== '2.116.0' || packageMetadata.bin?.supabase !== 'dist/supabase.js') continue
      await access(scriptPath)
      const version = execFileSync(process.execPath, [scriptPath, '--version'], {
        encoding: 'utf8', timeout: 10_000, windowsHide: true, shell: false,
        env: dockerEnvironment,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
      if (version === '2.116.0') return scriptPath
    } catch {
      // Continue until the exact pinned package and executable are found.
    }
  }
  throw new Error('supabase_cli_2_116_0_not_cached')
}

function readLocalStatus(scriptPath, dockerEnvironment) {
  try {
    return JSON.parse(execFileSync(process.execPath, [scriptPath,
      'status', '--workdir', runtimeRoot, '-o', 'json',
    ], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      timeout: 120_000,
      windowsHide: true,
      shell: false,
      env: dockerEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    }))
  } catch {
    throw new Error('source_local_stack_status_unavailable')
  }
}

function readLocalAuthEnvironment(dockerEnvironment) {
  try {
    return JSON.parse(execFileSync('docker', [
      '--context', 'desktop-linux', 'inspect', `supabase_auth_${COMMUNITY_VOICE_LOCAL.projectId}`,
      '--format', '{{json .Config.Env}}',
    ], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      timeout: 10_000,
      windowsHide: true,
      shell: false,
      env: dockerEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    }))
  } catch {
    throw new Error('source_local_auth_settings_unavailable')
  }
}

function assertLocalDockerContext(dockerEnvironment) {
  try {
    const endpoint = execFileSync('docker', [
      '--context', 'desktop-linux', 'context', 'inspect', 'desktop-linux',
      '--format', '{{json .Endpoints.docker.Host}}',
    ], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      timeout: 10_000,
      windowsHide: true,
      shell: false,
      env: dockerEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    assertLocalDockerContextEndpoint(JSON.parse(endpoint))
  } catch (error) {
    if (error instanceof Error && error.message === 'unexpected_docker_context_endpoint') throw error
    throw new Error('local_docker_context_unavailable')
  }
}

try {
  assertNoNextEnvironmentFiles(await readdir(workspaceRoot))
  assertDedicatedRuntimeConfig(await readFile(configPath, 'utf8'))
  const dockerEnvironment = buildLocalDockerEnvironment(process.env)
  assertLocalDockerContext(dockerEnvironment)
  const supabaseCliScript = await resolveSupabaseCliScript(dockerEnvironment)
  const status = readLocalStatus(supabaseCliScript, dockerEnvironment)
  const authEnv = readLocalAuthEnvironment(dockerEnvironment)
  const smsTtl = validateIntegratedLocalAuthEnvironment(authEnv)
  const secrets = await readJson(secretsPath, 'source_runtime_secrets_unavailable')
  const localEnv = createIntegratedRuntimeEnvironment(status, secrets, smsTtl)
  const childEnv = buildCommunityVoiceChildEnvironment(process.env, localEnv)

  const sourceManifest = await readJson(manifestPath, 'source_migration_manifest_unavailable')
  const workspaceMigrationNames = (await readdir(join(workspaceRoot, 'supabase', 'migrations'), {
    withFileTypes: true,
  })).filter((entry) => entry.isFile() && entry.name.endsWith('.sql')).map((entry) => entry.name)
  const migrationBoundary = describeMigrationBoundary(workspaceMigrationNames, sourceManifest)

  console.log(JSON.stringify({
    application: COMMUNITY_VOICE_LOCAL.appOrigin,
    localAuth: COMMUNITY_VOICE_LOCAL.apiUrl,
    sourceRuntimeFilesReadOnly: true,
    databaseReadOnly: false,
    localUiCanWriteLocalData: true,
    authPreflight: 'runs_before_next_server',
    authBypass: false,
    privateKeysLogged: false,
    realPayments: false,
    mediaProviderConfigured: false,
    migrationBoundary,
  }))
  if (migrationBoundary.workspaceOnlyMigrations.length > 0) {
    console.warn(`주의: ${migrationBoundary.workspaceOnlyMigrations.join(', ')}은 기존 로컬 스택 snapshot에 없습니다. 이 런처는 migration을 적용하지 않으며 새 기능 전체 완료를 증명하지 않습니다.`)
  }

  const child = spawn(process.execPath, ['scripts/qa/start-integrated-ui.mjs', '--live-local'], {
    cwd: workspaceRoot,
    env: childEnv,
    stdio: 'inherit',
    windowsHide: true,
  })
  child.on('error', () => {
    console.error('community_voice_local_ui_start_failed')
    process.exitCode = 1
  })
  child.on('exit', (code) => { process.exitCode = code ?? 1 })
} catch (error) {
  console.error(error instanceof Error ? error.message : 'community_voice_local_launcher_failed')
  process.exitCode = 1
}
