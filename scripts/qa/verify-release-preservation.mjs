import { spawn } from 'node:child_process'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { resolve, join, sep } from 'node:path'

// Bounded, local verification only. Outputs get a new timestamp; old QA is never replaced.
const root = process.cwd()
if (!root.endsWith('integrated-campus-20260905')) throw new Error('wrong_verification_workspace')
for (const path of ['.tmp/auth-tests', '.tmp/config-tests', '.tmp/matching-tests', '.tmp/profile-tests']) {
  if (!resolve(root, path).startsWith(root + sep)) throw new Error('unsafe_test_output')
}
const output = resolve(root, 'artifacts/qa/release-preservation-20260906', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(output, { recursive: true })
const npmCli = 'C:/Users/82108/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe/node-v24.14.1-win-x64/node_modules/npm/bin/npm-cli.js'
await access(npmCli)
const full = process.argv.includes('--full')
const checks = [
  ['tests', process.execPath, [npmCli, 'test']],
  ['typecheck', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['lint', process.execPath, [npmCli, 'run', 'lint']],
  ['tooling', process.execPath, ['--test', 'tests/tooling/local-preservation.test.mjs']],
  ...(full ? [
    ['build', process.execPath, [npmCli, 'run', 'build']],
    ['migrations', process.execPath, [npmCli, 'run', 'check:migrations']],
    ['secrets', process.execPath, [npmCli, 'run', 'check:secrets:all']],
  ] : []),
]
const results = []
for (const [name, command, args] of checks) {
  console.log(`START ${name}`)
  const result = await new Promise(resolveResult => {
    const child = spawn(command, args, { cwd: root, windowsHide: true, env: {
      ...process.env, NEXT_DIST_DIR: '.next-release-preservation-20260906', NEXT_TELEMETRY_DISABLED: '1',
    } })
    let stdout = '', stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', error => { stderr += error.message })
    child.on('close', code => resolveResult({ name, code, stdout, stderr }))
  })
  await writeFile(join(output, `${name}.log`), result.stdout + '\n' + result.stderr, { flag: 'wx' })
  const lines = (result.stdout + '\n' + result.stderr).split(/\r?\n/)
  const summary = lines.filter(line => /^[ℹ✖]|error TS|Error:|Failed|Warning:/.test(line)).slice(-35)
  console.log(JSON.stringify({ name, code: result.code, summary }))
  results.push({ name, code: result.code })
}
await writeFile(join(output, 'results.json'), JSON.stringify({ output, results }, null, 2), { flag: 'wx' })
console.log(JSON.stringify({ output, results }))
process.exitCode = results.every(result => result.code === 0) ? 0 : 1
