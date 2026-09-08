import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { integratedLocalConfig, INTEGRATED_STACK } from './integrated-local-config.mjs'
import { synchronizeMigrationSnapshot } from './tonight-local-stack.mjs'

if (process.argv.length !== 2) throw new Error('No command arguments accepted; preparation never starts or resets a DB.')
const root = process.cwd()
const runtimeRoot = resolve(root, INTEGRATED_STACK.runtimeDirectory)
if (!runtimeRoot.startsWith(`${resolve(root)}${process.platform === 'win32' ? '\\' : '/'}`)) throw new Error('unsafe_runtime_path')
const supabaseRoot = join(runtimeRoot, 'supabase')
await mkdir(supabaseRoot, { recursive: true })
const configPath = join(supabaseRoot, 'config.toml')
const expected = integratedLocalConfig()
let existing = null
try { existing = await readFile(configPath, 'utf8') } catch (error) { if (error.code !== 'ENOENT') throw error }
if (existing !== null && existing !== expected) throw new Error('Existing local config differs; refusing to overwrite.')
if (existing === null) await writeFile(configPath, expected, { flag: 'wx' })
const manifest = await synchronizeMigrationSnapshot({
  runtimeRoot,
  migrationsSource: join(root, 'supabase', 'migrations'),
  migrationsTarget: join(supabaseRoot, 'migrations'),
  manifestPath: join(runtimeRoot, 'migrations-manifest.json'),
}, { allowAppend: true })
console.log(JSON.stringify({ prepared: true, runtimeRoot, projectId: INTEGRATED_STACK.projectId, migrationCount: manifest.migration_count, databaseStarted: false, migrationsApplied: false }))
