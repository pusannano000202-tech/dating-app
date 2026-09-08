import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { INTEGRATED_STACK } from './integrated-local-config.mjs'
import { createIntegratedRuntimeEnvironment, validateIntegratedLocalAuthEnvironment } from './integrated-runtime-environment.mjs'

if (process.argv.length !== 2) throw new Error('Usage: node scripts/qa/serve-integrated-local.mjs')

async function prepareRuntimeEnvironment() {
  // Only fixed CLI arguments are passed to the Windows npm command shim.
  // Keep stdout/stderr private: CLI status includes local secret keys.
  let status
  try {
    status = JSON.parse(execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
      '--offline', '--yes', 'supabase@2.116.0', 'status', '--workdir', INTEGRATED_STACK.runtimeDirectory, '-o', 'json',
    ], { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000, windowsHide: true,
      shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] }))
  } catch { throw new Error('전용 로컬 DB 상태를 읽을 수 없습니다. Supabase CLI 2.116.0 설치와 .tmp/integrated-live-local 서비스 상태를 확인해 주세요.') }

  let smsTtl
  try {
    const authEnv = JSON.parse(execFileSync('docker', ['inspect', `supabase_auth_${INTEGRATED_STACK.projectId}`, '--format', '{{json .Config.Env}}'], {
      encoding: 'utf8', timeout: 10_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    }))
    smsTtl = validateIntegratedLocalAuthEnvironment(authEnv)
  } catch { throw new Error('전용 로컬 Auth의 SMS 만료 설정을 확인할 수 없습니다.') }

  const runtimeRoot = resolve(INTEGRATED_STACK.runtimeDirectory)
  const secretsPath = join(runtimeRoot, 'runtime-secrets.json')
  let secrets
  try { secrets = JSON.parse(await readFile(secretsPath, 'utf8')) } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('기존 로컬 비밀 설정을 읽을 수 없습니다. 자동으로 덮어쓰지 않습니다.')
    secrets = { phoneDigest: randomBytes(32).toString('hex'), profileAlias: randomBytes(32).toString('hex') }
    await mkdir(runtimeRoot, { recursive: true })
    await writeFile(secretsPath, JSON.stringify(secrets), { flag: 'wx', mode: 0o600 })
  }
  const env = createIntegratedRuntimeEnvironment(status, secrets, smsTtl)
  console.log(JSON.stringify({ localAuth: INTEGRATED_STACK.apiUrl, providerSmsOtpTtlSeconds: Number(smsTtl), applicationChallengeTtlSeconds: Number(env.SUPABASE_PHONE_OTP_TTL_SECONDS), privateKeysLogged: false }))
  return env
}

try {
  const localEnv = await prepareRuntimeEnvironment()
  const child = spawn(process.execPath, ['scripts/qa/start-integrated-ui.mjs', '--live-local'], {
    cwd: process.cwd(), env: { ...process.env, ...localEnv }, stdio: 'inherit', windowsHide: true,
  })
  child.on('error', () => { console.error('로컬 앱을 실행할 수 없습니다.'); process.exitCode = 1 })
  child.on('exit', code => { process.exitCode = code ?? 1 })
} catch (error) {
  // Our own validation errors contain no provider response, token or secret.
  console.error(error instanceof Error ? error.message : '로컬 실행 설정을 확인할 수 없습니다.')
  process.exitCode = 1
}
