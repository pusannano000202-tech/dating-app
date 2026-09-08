import { spawn } from 'node:child_process'
import { integratedUiEnvironment, integratedUiLaunchInfo } from './integrated-ui-config.mjs'
import { preflightIntegratedLocalAuth } from './integrated-auth-preflight.mjs'

if (process.argv.length !== 3) throw new Error('Usage: node scripts/qa/start-integrated-ui.mjs --offline-ui|--live-local')
const mode = process.argv[2]
const env = integratedUiEnvironment(process.env, mode)
let authPreflight

if (mode === '--live-local') {
  try {
    authPreflight = await preflightIntegratedLocalAuth({
      url: env.NEXT_PUBLIC_SUPABASE_URL,
      publicKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    })
  } catch {
    console.error('로컬 Auth 사전 점검에 실패했습니다. 127.0.0.1:56421의 전용 로컬 서비스를 확인한 뒤 다시 실행해 주세요.')
    process.exitCode = 1
  }
}

if (process.exitCode !== 1) {
  console.log(JSON.stringify(integratedUiLaunchInfo(env, mode, authPreflight)))
  if (mode === '--offline-ui') console.warn('공개 화면 검수 전용: 로그인·홈·저장은 사용할 수 없습니다.')
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', '3010', '-H', '127.0.0.1'], {
    cwd: process.cwd(), env, stdio: 'inherit', windowsHide: true,
  })
  child.on('error', (error) => { console.error(error.message); process.exitCode = 1 })
  child.on('exit', (code) => { process.exitCode = code ?? 1 })
}
