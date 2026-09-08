import { createHash } from 'node:crypto'
import { access, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

import { assertLocalSupabaseUrl, assertSafeLocalRuntimeEnvironment } from './tonight-local-safety.mjs'

const ROOT = process.cwd()
const SUPABASE_VERSION = '2.116.0'
const LOCAL_API_URL = 'http://127.0.0.1:56321'
const MINIMUM_INITIAL_MIGRATION_COUNT = 204
const MIGRATION_FILENAME_PATTERN = /^(\d{14})_.+\.sql$/

export const LOCAL_STACK = Object.freeze({
  projectId: 'quantum-tonight-live-local',
  runtimeDirectory: join('.tmp', 'tonight-live-local'),
  apiPort: 56321,
  dbPort: 56322,
  shadowPort: 56320,
  studioPort: 56323,
  mailpitPort: 56324,
  dbContainer: 'supabase_db_quantum-tonight-live-local',
})

export function localPaths(root = ROOT) {
  const runtimeRoot = resolve(root, LOCAL_STACK.runtimeDirectory)
  const supabaseRoot = join(runtimeRoot, 'supabase')
  return {
    root: resolve(root),
    runtimeRoot,
    supabaseRoot,
    configPath: join(supabaseRoot, 'config.toml'),
    migrationsSource: join(resolve(root), 'supabase', 'migrations'),
    migrationsTarget: join(supabaseRoot, 'migrations'),
    manifestPath: join(runtimeRoot, 'migrations-manifest.json'),
    runtimeEnvPath: join(runtimeRoot, 'runtime-env.json'),
    templatesRoot: join(runtimeRoot, 'templates'),
    magicLinkTemplatePath: join(runtimeRoot, 'templates', 'magic_link.html'),
    confirmationTemplatePath: join(runtimeRoot, 'templates', 'confirmation.html'),
    cliDiagnosticsPath: join(runtimeRoot, 'cli-diagnostics.log'),
  }
}

const LOCAL_OTP_TEMPLATE = '<!doctype html><html><body><p>Quantum local sign-in code:</p><p><strong>{{ .Token }}</strong></p></body></html>\n'

export function buildLocalSupabaseConfig() {
  return `project_id = "${LOCAL_STACK.projectId}"

[api]
enabled = true
port = ${LOCAL_STACK.apiPort}
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = ${LOCAL_STACK.dbPort}
shadow_port = ${LOCAL_STACK.shadowPort}
major_version = 17

[db.migrations]
enabled = true

[db.seed]
enabled = false
sql_paths = []

[studio]
enabled = true
port = ${LOCAL_STACK.studioPort}
api_url = "http://127.0.0.1:${LOCAL_STACK.apiPort}"

[local_smtp]
enabled = true
port = ${LOCAL_STACK.mailpitPort}

[auth]
enabled = true
site_url = "http://localhost:3004"
additional_redirect_urls = ["http://localhost:3004"]
enable_signup = true
enable_anonymous_sign_ins = false

[auth.email]
enable_signup = true
enable_confirmations = false
otp_length = 6
otp_expiry = 3600

[auth.email.template.magic_link]
subject = "Quantum local sign-in code"
content_path = "./templates/magic_link.html"

[auth.email.template.confirmation]
subject = "Quantum local confirmation code"
content_path = "./templates/confirmation.html"

[auth.external.google]
enabled = false
`
}

async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function expandWindowsEnvironment(value) {
  return value.replace(/%([^%]+)%/g, (_match, name) => process.env[name] ?? `%${name}%`)
}

async function resolveNodePackageCli(command) {
  if (process.platform !== 'win32') return { command, prefix: [] }

  for (const entry of (process.env.Path ?? process.env.PATH ?? '').split(delimiter)) {
    if (!entry) continue
    const shimPath = join(entry, `${command}.cmd`)
    if (!(await pathExists(shimPath))) continue
    const shim = await readFile(shimPath, 'utf8')
    const target = shim.match(new RegExp(`"([^"\\r\\n]+\\\\${command}\\.cmd)"`, 'i'))?.[1]
    if (!target) continue
    const cliPath = join(dirname(expandWindowsEnvironment(target)), 'node_modules', 'npm', 'bin', `${command}-cli.js`)
    if (await pathExists(cliPath)) return { command: process.execPath, prefix: [cliPath] }
  }
  throw new Error('local_node_cli_unavailable')
}

export function redactCliDiagnostic(value) {
  return value
    .replace(/(Bearer\s+)[^\s"']+/gi, '$1[REDACTED]')
    .replace(/(["']?(?:api[_ -]?key|anon(?:ymous)?[_ -]?key|publishable[_ -]?key|service[_ -]?role[_ -]?key|password|token|secret|authorization)["']?\s*[=:]\s*["']?)([^\s"',}]+)/gi, '$1[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/gi, '$1[REDACTED]@')
}

async function writeCliDiagnostics(path, command, stdout, stderr) {
  if (!path) return
  const content = `[${command} failed]\n${redactCliDiagnostic(`${stdout}\n${stderr}`)}`
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, { encoding: 'utf8', mode: 0o600 })
}

async function runNodePackageCli(command, args, { cwd = ROOT, diagnosticsPath } = {}) {
  const executable = await resolveNodePackageCli(command)
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable.command, [...executable.prefix, ...args], {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.once('error', async () => {
      await writeCliDiagnostics(diagnosticsPath, command, '', 'local process spawn failed')
      rejectPromise(new Error('local_supabase_cli_unavailable'))
    })
    child.once('close', async (code) => {
      if (code === 0) return resolvePromise({ stdout, stderr })
      await writeCliDiagnostics(diagnosticsPath, command, stdout, stderr)
      return rejectPromise(new Error('local_supabase_cli_failed'))
    })
  })
}

async function runSupabase(args, options) {
  return runNodePackageCli('npx', ['--yes', `supabase@${SUPABASE_VERSION}`, ...args], options)
}

async function assertCliHelp(paths, { includeMigrationUp = false } = {}) {
  for (const command of ['init', 'start', 'status']) {
    await runSupabase([command, '--help'], { diagnosticsPath: paths.cliDiagnosticsPath })
  }
  if (includeMigrationUp) {
    await runSupabase(['migration', 'up', '--help'], { diagnosticsPath: paths.cliDiagnosticsPath })
  }
}

async function readIfPresent(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return null
    throw error
  }
}

async function ensureLocalConfig(paths) {
  const expected = buildLocalSupabaseConfig()
  const existing = await readIfPresent(paths.configPath)
  if (existing !== null) {
    if (existing !== expected) throw new Error('local_supabase_config_mismatch')
  } else {
    await mkdir(paths.runtimeRoot, { recursive: true })
    await runSupabase(['init', '--workdir', paths.runtimeRoot, '--yes'], { diagnosticsPath: paths.cliDiagnosticsPath })
    const initialized = await readIfPresent(paths.configPath)
    if (initialized === null) throw new Error('local_supabase_init_failed')
    await writeFile(paths.configPath, expected, { encoding: 'utf8', mode: 0o600 })
  }
  await mkdir(paths.templatesRoot, { recursive: true })
  for (const templatePath of [paths.magicLinkTemplatePath, paths.confirmationTemplatePath]) {
    const template = await readIfPresent(templatePath)
    if (template === null) {
      await writeFile(templatePath, LOCAL_OTP_TEMPLATE, { encoding: 'utf8', mode: 0o600 })
    } else if (template !== LOCAL_OTP_TEMPLATE) {
      throw new Error('local_supabase_template_mismatch')
    }
  }
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

async function listSqlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

function migrationVersion(name) {
  const match = MIGRATION_FILENAME_PATTERN.exec(name)
  if (!match) throw new Error('local_migration_filename_invalid')
  return match[1]
}

function formatManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

function parseExactManifest(value) {
  let manifest
  try {
    manifest = JSON.parse(value)
  } catch {
    throw new Error('local_migration_manifest_mismatch')
  }
  if (
    !manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || manifest.schema_version !== 1
    || !Number.isInteger(manifest.migration_count)
    || manifest.migration_count < MINIMUM_INITIAL_MIGRATION_COUNT
    || !Array.isArray(manifest.files)
    || manifest.files.length !== manifest.migration_count
  ) {
    throw new Error('local_migration_manifest_mismatch')
  }
  const files = manifest.files.map((file) => {
    if (
      !file || typeof file !== 'object' || Array.isArray(file)
      || typeof file.path !== 'string' || typeof file.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(file.sha256)
      || file.path.includes('/') || file.path.includes('\\')
    ) throw new Error('local_migration_manifest_mismatch')
    migrationVersion(file.path)
    return { path: file.path, sha256: file.sha256 }
  })
  const names = files.map((file) => file.path)
  if (
    new Set(names).size !== names.length
    || names.some((name, index) => name !== [...names].sort((left, right) => left.localeCompare(right))[index])
    || value !== formatManifest({ schema_version: 1, migration_count: files.length, files })
  ) throw new Error('local_migration_manifest_mismatch')
  return { schema_version: 1, migration_count: files.length, files }
}

async function migrationFiles(directory, names) {
  return Promise.all(names.map(async (name) => ({
    path: name,
    sha256: await sha256(join(directory, name)),
  })))
}

async function assertTargetMatchesManifest(paths, manifest) {
  const targetNames = await listSqlFiles(paths.migrationsTarget)
  const manifestNames = manifest.files.map((file) => file.path)
  if (targetNames.length !== manifestNames.length || targetNames.some((name, index) => name !== manifestNames[index])) {
    throw new Error('local_migration_manifest_mismatch')
  }
  for (const file of manifest.files) {
    if (await sha256(join(paths.migrationsTarget, file.path)) !== file.sha256) {
      throw new Error('local_migration_file_mismatch')
    }
  }
}

async function writeManifest(paths, manifest) {
  await writeFile(paths.manifestPath, formatManifest(manifest), { encoding: 'utf8', mode: 0o600 })
}

async function preserveManifestBeforeAppend(paths, existingManifest, existingRaw) {
  const backupPath = join(paths.runtimeRoot, `migrations-manifest.before-append-${existingManifest.migration_count}.json`)
  const existingBackup = await readIfPresent(backupPath)
  if (existingBackup === null) {
    await writeFile(backupPath, existingRaw, { encoding: 'utf8', mode: 0o600 })
  } else if (existingBackup !== existingRaw) {
    throw new Error('local_migration_manifest_backup_mismatch')
  }
}

export async function synchronizeMigrationSnapshot(paths, { allowAppend = false } = {}) {
  const sourceNames = await listSqlFiles(paths.migrationsSource)
  await mkdir(paths.migrationsTarget, { recursive: true })
  sourceNames.forEach(migrationVersion)

  const existingRaw = await readIfPresent(paths.manifestPath)
  if (existingRaw === null) {
    if (sourceNames.length < MINIMUM_INITIAL_MIGRATION_COUNT) throw new Error('local_migration_source_count_invalid')
    const targetNames = await listSqlFiles(paths.migrationsTarget)
    if (targetNames.length !== 0) throw new Error('local_migration_manifest_missing')
    const files = await migrationFiles(paths.migrationsSource, sourceNames)
    for (const file of files) await copyFile(join(paths.migrationsSource, file.path), join(paths.migrationsTarget, file.path))
    const manifest = { schema_version: 1, migration_count: files.length, files }
    await writeManifest(paths, manifest)
    return manifest
  }

  const existingManifest = parseExactManifest(existingRaw)
  await assertTargetMatchesManifest(paths, existingManifest)
  const existingNames = existingManifest.files.map((file) => file.path)
  const sourceNameSet = new Set(sourceNames)
  for (const file of existingManifest.files) {
    if (!sourceNameSet.has(file.path)) throw new Error('local_migration_source_prefix_missing')
    if (await sha256(join(paths.migrationsSource, file.path)) !== file.sha256) {
      throw new Error('local_migration_file_mismatch')
    }
  }

  const appendedNames = sourceNames.filter((name) => !existingNames.includes(name))
  const maximumExistingVersion = migrationVersion(existingNames.at(-1))
  if (appendedNames.some((name) => migrationVersion(name) <= maximumExistingVersion)) {
    throw new Error('local_migration_append_order_invalid')
  }
  if (appendedNames.length === 0) return existingManifest
  if (!allowAppend) throw new Error('local_migration_append_pending')

  const expectedSourceNames = [...existingNames, ...appendedNames].sort((left, right) => left.localeCompare(right))
  if (sourceNames.length !== expectedSourceNames.length || sourceNames.some((name, index) => name !== expectedSourceNames[index])) {
    throw new Error('local_migration_source_prefix_missing')
  }
  await preserveManifestBeforeAppend(paths, existingManifest, existingRaw)
  const appendedFiles = await migrationFiles(paths.migrationsSource, appendedNames)
  for (const file of appendedFiles) await copyFile(join(paths.migrationsSource, file.path), join(paths.migrationsTarget, file.path))
  const manifest = {
    schema_version: 1,
    migration_count: existingManifest.migration_count + appendedFiles.length,
    files: [...existingManifest.files, ...appendedFiles],
  }
  await writeManifest(paths, manifest)
  return manifest
}

function normalizeStatus(status) {
  if (Array.isArray(status) && status.length === 1 && status[0] && typeof status[0] === 'object') return status[0]
  if (status && typeof status === 'object' && !Array.isArray(status)) return status
  throw new Error('local_supabase_status_invalid')
}

function readStatusString(status, names) {
  const record = normalizeStatus(status)
  const indexed = new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase().replaceAll(/[^a-z0-9]/g, ''), value]))
  for (const name of names) {
    const value = indexed.get(name)
    if (typeof value === 'string' && value) return value
  }
  throw new Error('local_supabase_status_invalid')
}

export function createLocalRuntimeEnvironment(status) {
  const apiUrl = readStatusString(status, ['apiurl'])
  const publicKey = readStatusString(status, ['anonkey', 'publishablekey'])
  const serviceRoleKey = readStatusString(status, ['servicerolekey'])
  if (assertLocalSupabaseUrl(apiUrl).href !== `${LOCAL_API_URL}/`) {
    throw new Error('local_supabase_status_url_mismatch')
  }

  const env = {
    NODE_ENV: 'development',
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
    SUPABASE_SECRET_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    NEXT_PUBLIC_APP_ORIGIN: 'http://localhost:3004',
    NEXT_DIST_DIR: '.next-live-local',
    NEXT_PUBLIC_DEV_AUTH_BYPASS: 'false',
    NEXT_PUBLIC_BOOTING_DEMO_MODE: 'false',
    DEV_AUTH_BYPASS: 'false',
    BOOTING_DEMO_MODE: 'false',
    NEXT_PUBLIC_TONIGHT_ENABLED: 'true',
    TONIGHT_APPLICATIONS_OPEN: 'true',
    TONIGHT_AUTOMATION_ENABLED: 'false',
    TONIGHT_CARD_PAYMENTS_ENABLED: 'false',
    NEXT_PUBLIC_PAYMENT_PROVIDER: 'mock',
    PAYMENT_PROVIDER: 'mock',
    NEXT_PUBLIC_TOSS_CLIENT_KEY: '',
    TOSS_SECRET_KEY: '',
    AI_SERVER_URL: '',
    AI_SERVER_SECRET: '',
    WEB_PUSH_VAPID_PUBLIC_KEY: '',
    WEB_PUSH_VAPID_PRIVATE_KEY: '',
    WEB_PUSH_VAPID_SUBJECT: '',
    CAMPUS_SEVEN_PUSH_CRON_SECRET: '',
    PAYMENT_INTERNAL_SECRET: '',
    CRON_SECRET: '',
    LOCAL_SUPABASE_DB_CONTAINER: LOCAL_STACK.dbContainer,
    LOCAL_SUPABASE_DB_NAME: 'postgres',
    LOCAL_SUPABASE_DB_USER: 'postgres',
  }
  assertSafeLocalRuntimeEnvironment(env)
  return env
}

async function writeRuntimeEnvironment(paths, env) {
  const payload = `${JSON.stringify({ schema_version: 1, ...env }, null, 2)}\n`
  await writeFile(paths.runtimeEnvPath, payload, { encoding: 'utf8', mode: 0o600 })
}

async function startAndReadStatus(paths) {
  await runSupabase(['start', '--workdir', paths.runtimeRoot, '--yes'], { diagnosticsPath: paths.cliDiagnosticsPath })
  const { stdout } = await runSupabase(['status', '--workdir', paths.runtimeRoot, '--output', 'json'], { diagnosticsPath: paths.cliDiagnosticsPath })
  let status
  try {
    status = JSON.parse(stdout)
  } catch {
    throw new Error('local_supabase_status_invalid')
  }
  return status
}

async function applyLocalMigrations(paths) {
  await runSupabase([
    'migration', 'up', '--local', '--workdir', paths.runtimeRoot, '--yes',
  ], { diagnosticsPath: paths.cliDiagnosticsPath })
}

function appEnvironment(env) {
  const inherited = { ...process.env }
  for (const key of [
    'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_APP_ORIGIN', 'NEXT_DIST_DIR',
  ]) delete inherited[key]
  return { ...inherited, ...env }
}

async function serveApp(env) {
  const executable = await resolveNodePackageCli('npm')
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable.command, [...executable.prefix, 'run', 'dev', '--', '--port', '3004'], {
      cwd: ROOT,
      shell: false,
      windowsHide: false,
      stdio: 'inherit',
      env: appEnvironment(env),
    })
    child.once('error', () => rejectPromise(new Error('local_app_start_failed')))
    child.once('close', (code) => resolvePromise(code === 0 ? undefined : Promise.reject(new Error('local_app_start_failed'))))
  })
}

export function parseRunnerOptions(argumentsList) {
  if (!Array.isArray(argumentsList)) throw new Error('local_runner_invalid_arguments')
  if (argumentsList.length === 0 || (argumentsList.length === 1 && argumentsList[0] === '--start')) {
    return { start: true, serve: false }
  }
  if (argumentsList.length === 1 && argumentsList[0] === '--prepare') {
    return { start: false, serve: false }
  }
  if (argumentsList.length === 1 && argumentsList[0] === '--serve') {
    return { start: true, serve: true }
  }
  if (argumentsList.length === 1 && argumentsList[0] === '--migrate-local') {
    return { start: false, serve: false, migrateLocal: true }
  }
  throw new Error('local_runner_invalid_arguments')
}

export async function prepareLocalTonightStack({ start, serve = false, migrateLocal = false } = {}) {
  if (process.env.NODE_ENV === 'production') throw new Error('local_runner_production_refused')
  const shouldStart = start ?? !migrateLocal
  if ((serve && !shouldStart) || (migrateLocal && (shouldStart || serve))) throw new Error('local_runner_invalid_arguments')
  const paths = localPaths()
  await assertCliHelp(paths, { includeMigrationUp: migrateLocal })
  await ensureLocalConfig(paths)
  const manifest = await synchronizeMigrationSnapshot(paths, { allowAppend: migrateLocal })
  if (migrateLocal) {
    await applyLocalMigrations(paths)
    return { runtimeDirectory: paths.runtimeRoot, manifest, runtimeEnvPath: null }
  }
  if (!shouldStart) {
    return { runtimeDirectory: paths.runtimeRoot, manifest, runtimeEnvPath: null }
  }
  const status = await startAndReadStatus(paths)
  const env = createLocalRuntimeEnvironment(status)
  await writeRuntimeEnvironment(paths, env)
  if (serve) await serveApp(env)
  return { runtimeDirectory: paths.runtimeRoot, manifest, runtimeEnvPath: paths.runtimeEnvPath }
}

if (import.meta.main) {
  const options = parseRunnerOptions(process.argv.slice(2))
  prepareLocalTonightStack(options).catch((error) => {
    // Error codes are intentionally generic: local CLI output may include credentials.
    process.stderr.write(`${error instanceof Error ? error.message : 'local_runner_failed'}\n`)
    process.exitCode = 1
  })
}
