import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { QA, qaAppEnvironment } from './option2-local-environment.mjs'

if (process.argv.length !== 2) throw new Error('no_arguments_allowed')
const env = qaAppEnvironment()
await new Promise((resolve, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(3015, '127.0.0.1', () => probe.close(resolve))
})
console.log(JSON.stringify({ app: QA.appOrigin, database: QA.apiUrl, isolatedQa: true, authBypass: false, realPayments: false, mediaProvider: false, emailOtpLogin: true, phoneLogin: 'restricted by existing local safety guard; use email QA login' }))
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', '3015', '-H', '127.0.0.1'], { cwd: QA.workspaceRoot, env, stdio: 'inherit', windowsHide: true })
child.on('error', () => { console.error('qa_app_start_failed'); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
