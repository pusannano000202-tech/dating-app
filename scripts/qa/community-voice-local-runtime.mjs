import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_NAME = 'integrated-campus-20260905'
const PROJECT_ID = 'quantum-integrated-campus-20260905'
const LOCAL_API_URL = 'http://127.0.0.1:56421'
const LOCAL_APP_ORIGIN = 'http://localhost:3010'
const LOCAL_DOCKER_CONTEXT = 'desktop-linux'
const LOCAL_DOCKER_ENDPOINT = 'npipe:////./pipe/dockerDesktopLinuxEngine'
const TRUSTED_WORKSPACE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const HOST_ENV_ALLOWLIST = [
  'Path', 'PATH', 'SystemRoot', 'SYSTEMROOT', 'ComSpec', 'COMSPEC', 'PATHEXT',
  'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'ProgramData', 'PROGRAMDATA', 'HOMEDRIVE', 'HOMEPATH', 'WINDIR',
]

const LOCAL_ENV_ALLOWLIST = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_PHONE_OTP_TTL_SECONDS',
  'PHONE_VERIFICATION_DIGEST_SECRET',
  'PROFILE_ALIAS_SIGNING_SECRET',
  'NEXT_PUBLIC_DEV_AUTH_BYPASS',
  'PAYMENT_PROVIDER',
  'NEXT_PUBLIC_PAYMENT_PROVIDER',
  'CONTINUATION_LOCAL_PAYMENT_SIMULATOR_ENABLED',
  'TONIGHT_AUTOMATION_ENABLED',
  'TONIGHT_CARD_PAYMENTS_ENABLED',
  'TOSS_SECRET_KEY',
  'NEXT_PUBLIC_TOSS_CLIENT_KEY',
]

export function resolveCommunityVoiceLocalRoots(inputRoot) {
  const workspaceRoot = resolve(inputRoot)
  if (workspaceRoot.toLowerCase() !== TRUSTED_WORKSPACE_ROOT.toLowerCase()) {
    throw new Error('unexpected_community_voice_workspace')
  }
  const sourceRoot = join(dirname(workspaceRoot), SOURCE_NAME)
  return {
    workspaceRoot,
    sourceRoot,
    runtimeRoot: join(sourceRoot, '.tmp', 'integrated-live-local'),
  }
}

function readSection(config, name) {
  const match = config.match(new RegExp(`(?:^|\\n)\\[${name}\\]\\r?\\n([\\s\\S]*?)(?=\\r?\\n\\[|$)`))
  return match?.[1] ?? ''
}

export function assertDedicatedRuntimeConfig(config) {
  const api = readSection(config, 'api')
  const auth = readSection(config, 'auth')
  if (
    !new RegExp(`^project_id\\s*=\\s*"${PROJECT_ID}"\\s*$`, 'm').test(config)
    || !/^port\s*=\s*56421\s*$/m.test(api)
    || !new RegExp(`^site_url\\s*=\\s*"${LOCAL_APP_ORIGIN}"\\s*$`, 'm').test(auth)
    || !new RegExp(`^additional_redirect_urls\\s*=\\s*\\["${LOCAL_APP_ORIGIN}/auth/callback"\\]\\s*$`, 'm').test(auth)
  ) throw new Error('unexpected_source_runtime_config')
  return true
}

export function buildCommunityVoiceChildEnvironment(hostEnv, localEnv) {
  if (
    localEnv.NEXT_PUBLIC_SUPABASE_URL !== LOCAL_API_URL
    || !(localEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    || !(localEnv.SUPABASE_SECRET_KEY || localEnv.SUPABASE_SERVICE_ROLE_KEY)
    || localEnv.PAYMENT_PROVIDER !== 'mock'
    || localEnv.NEXT_PUBLIC_PAYMENT_PROVIDER !== 'mock'
    || localEnv.TOSS_SECRET_KEY !== ''
    || localEnv.NEXT_PUBLIC_TOSS_CLIENT_KEY !== ''
  ) throw new Error('unsafe_community_voice_local_environment')

  const child = {}
  for (const key of HOST_ENV_ALLOWLIST) {
    if (typeof hostEnv[key] === 'string' && hostEnv[key]) child[key] = hostEnv[key]
  }
  for (const key of LOCAL_ENV_ALLOWLIST) {
    if (typeof localEnv[key] === 'string') child[key] = localEnv[key]
  }
  return child
}

export function assertNoNextEnvironmentFiles(names) {
  if (!Array.isArray(names)) throw new Error('workspace_environment_file_forbidden')
  const forbidden = names.filter((name) => {
    const normalized = name.toLowerCase()
    return normalized === '.env' || (normalized.startsWith('.env.') && !normalized.endsWith('.example'))
  })
  if (forbidden.length > 0) throw new Error('workspace_environment_file_forbidden')
  return true
}

export function buildLocalDockerEnvironment(hostEnv) {
  const child = {}
  for (const key of HOST_ENV_ALLOWLIST) {
    if (typeof hostEnv[key] === 'string' && hostEnv[key]) child[key] = hostEnv[key]
  }
  child.DOCKER_CONTEXT = LOCAL_DOCKER_CONTEXT
  return child
}

export function assertLocalDockerContextEndpoint(endpoint) {
  if (endpoint.trim() !== LOCAL_DOCKER_ENDPOINT) throw new Error('unexpected_docker_context_endpoint')
  return true
}

export function describeMigrationBoundary(workspaceMigrationNames, sourceManifest) {
  if (
    !Array.isArray(workspaceMigrationNames)
    || !sourceManifest
    || !Array.isArray(sourceManifest.files)
    || sourceManifest.migration_count !== sourceManifest.files.length
    || !sourceManifest.files.every((entry) => typeof entry?.path === 'string')
  ) throw new Error('invalid_source_migration_manifest')

  const workspace = [...new Set(workspaceMigrationNames)].sort()
  const source = new Set(sourceManifest.files.map((entry) => entry.path))
  return {
    sourceSnapshotMigrationCount: sourceManifest.migration_count,
    workspaceMigrationCount: workspace.length,
    workspaceOnlyMigrations: workspace.filter((name) => !source.has(name)),
    databaseMigrationsAppliedByLauncher: false,
    fullFeatureRuntimeVerified: false,
  }
}

export const COMMUNITY_VOICE_LOCAL = Object.freeze({
  projectId: PROJECT_ID,
  apiUrl: LOCAL_API_URL,
  appOrigin: LOCAL_APP_ORIGIN,
  dockerContext: LOCAL_DOCKER_CONTEXT,
})
