import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { assertNoNextEnvironmentFiles, buildLocalDockerEnvironment, assertLocalDockerContextEndpoint } from './community-voice-local-runtime.mjs'

export const QA = Object.freeze({
  projectId: 'quantum-option2-verify-20260908',
  apiUrl: 'http://127.0.0.1:56521',
  appOrigin: 'http://127.0.0.1:3015',
  authSiteOrigin: 'http://localhost:3015',
  workspaceRoot: resolve('C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/social-scene-implementation-20260907'),
  runtimeRoot: resolve('C:/Users/82108/.config/superpowers/worktrees/데이팅앱만들기/social-scene-implementation-20260907/.tmp/option2-verify-20260908'),
})
const cli = 'C:/Users/82108/AppData/Local/npm-cache/_npx/aa8e5c70f9d8d161/node_modules/supabase/dist/supabase.js'
export function assertQaTarget() {
  if (resolve(process.cwd()) !== QA.workspaceRoot) throw new Error('unexpected_qa_workspace')
  const config = readFileSync(join(QA.runtimeRoot, 'supabase/config.toml'), 'utf8')
  if (!config.startsWith(`project_id = "${QA.projectId}"`) || !config.includes('port = 56521') || !config.includes(`site_url = "${QA.authSiteOrigin}"`)) throw new Error('unexpected_qa_config')
  const endpoint = execFileSync('docker', ['--context', 'desktop-linux', 'context', 'inspect', 'desktop-linux', '--format', '{{json .Endpoints.docker.Host}}'], { encoding: 'utf8', windowsHide: true, env: buildLocalDockerEnvironment(process.env) })
  assertLocalDockerContextEndpoint(JSON.parse(endpoint))
}
export function readQaStatus() {
  assertQaTarget()
  const status = JSON.parse(execFileSync(process.execPath, [cli, 'status', '--workdir', QA.runtimeRoot, '-o', 'json'], { encoding: 'utf8', windowsHide: true, env: buildLocalDockerEnvironment(process.env), stdio: ['ignore', 'pipe', 'pipe'] }))
  if (status.API_URL !== QA.apiUrl || !status.DB_URL?.includes('@127.0.0.1:56522/postgres') || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error('unexpected_qa_service')
  return status
}
export function qaSql(sql) {
  assertQaTarget()
  return execFileSync('docker', ['--context', 'desktop-linux', 'exec', '-i', `supabase_db_${QA.projectId}`, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-At'], { input: sql, encoding: 'utf8', windowsHide: true, env: buildLocalDockerEnvironment(process.env), stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 }).trim()
}
export function qaAppEnvironment() {
  const status = readQaStatus()
  assertNoNextEnvironmentFiles(readdirSync(QA.workspaceRoot))
  const secretsPath = join(QA.runtimeRoot, 'runtime-secrets.json')
  let secrets
  try { secrets = JSON.parse(readFileSync(secretsPath, 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw error
    secrets = { phoneDigest: randomBytes(32).toString('hex'), profileAlias: randomBytes(32).toString('hex') }
    writeFileSync(secretsPath, JSON.stringify(secrets), { flag: 'wx', mode: 0o600 })
  }
  if (![secrets.phoneDigest, secrets.profileAlias].every(v => /^[a-f0-9]{64}$/.test(v))) throw new Error('invalid_qa_private_settings')
  const friendSecretPath = join(QA.runtimeRoot, 'friend-invite-secret.json')
  let friendSecret
  try { friendSecret = JSON.parse(readFileSync(friendSecretPath, 'utf8')).value } catch (error) {
    if (error.code !== 'ENOENT') throw error
    friendSecret = randomBytes(32).toString('hex')
    writeFileSync(friendSecretPath, JSON.stringify({ value: friendSecret }), { flag: 'wx', mode: 0o600 })
  }
  if (!/^[a-f0-9]{64}$/.test(friendSecret)) throw new Error('invalid_qa_friend_secret')
  return {
    ...buildLocalDockerEnvironment(process.env),
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_APP_ORIGIN: QA.appOrigin,
    NEXT_DIST_DIR: '.next-option2-verify',
    NEXT_PUBLIC_DEV_AUTH_BYPASS: 'false', DEV_AUTH_BYPASS: 'false',
    NEXT_PUBLIC_BOOTING_DEMO_MODE: 'false', BOOTING_DEMO_MODE: 'false',
    QUANTUM_LOCAL_RUNTIME_MODE: 'live-local',
    NEXT_PUBLIC_COMMUNITY_ENABLED: 'true',
    SUPABASE_PHONE_OTP_TTL_SECONDS: '300',
    PHONE_VERIFICATION_DIGEST_SECRET: secrets.phoneDigest,
    PROFILE_ALIAS_SIGNING_SECRET: secrets.profileAlias,
    FRIEND_INVITE_TOKEN_SECRET: friendSecret,
    PAYMENT_PROVIDER: 'mock', NEXT_PUBLIC_PAYMENT_PROVIDER: 'mock',
    TONIGHT_AUTOMATION_ENABLED: 'false', TONIGHT_CARD_PAYMENTS_ENABLED: 'false',
    CONTINUATION_LOCAL_PAYMENT_SIMULATOR_ENABLED: 'false',
  }
}
