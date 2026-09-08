import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { integratedLocalConfig } from './integrated-local-config.mjs'
import { synchronizeMigrationSnapshot } from './tonight-local-stack.mjs'

// A separate disposable QA project. Never starts, resets, or changes the existing DB.
const expected = resolve('C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/social-scene-implementation-20260907')
if (resolve(process.cwd()) !== expected || process.argv.length !== 2) throw new Error('unexpected_verification_workspace')
const runtimeRoot = join(expected, '.tmp', 'option2-verify-20260908')
const configPath = join(runtimeRoot, 'supabase', 'config.toml')
const config = integratedLocalConfig()
  .replaceAll('quantum-integrated-campus-20260905', 'quantum-option2-verify-20260908')
  .replaceAll('5642', '5652')
  .replaceAll('localhost:3010', 'localhost:3015')
  + '\n[auth.mfa.totp]\nenroll_enabled = true\nverify_enabled = true\n'
await mkdir(join(runtimeRoot, 'supabase'), { recursive: true })
let existing
try { existing = await readFile(configPath, 'utf8') } catch (error) { if (error.code !== 'ENOENT') throw error }
if (existing !== undefined && existing !== config) throw new Error('existing_qa_config_conflict')
if (existing === undefined) await writeFile(configPath, config, { flag: 'wx' })
const manifest = await synchronizeMigrationSnapshot({
  runtimeRoot,
  migrationsSource: join(expected, 'supabase', 'migrations'),
  migrationsTarget: join(runtimeRoot, 'supabase', 'migrations'),
  manifestPath: join(runtimeRoot, 'migrations-manifest.json'),
})
console.log(JSON.stringify({ runtimeRoot, project: 'quantum-option2-verify-20260908', migrationCount: manifest.migration_count, databaseChanged: false }))
