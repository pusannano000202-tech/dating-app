import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const output = path.join(root, 'artifacts', 'integrated-20260905', 'checks')
await mkdir(output, { recursive: true })
async function run(name, executable, args) {
  const startedAt = new Date().toISOString()
  return await new Promise((resolve) => {
    const child = spawn(executable, args, { cwd: root, windowsHide: true, env: process.env })
    let log = ''
    child.stdout.on('data', (value) => { log += value })
    child.stderr.on('data', (value) => { log += value })
    child.on('error', (error) => { log += String(error) })
    child.on('close', async (exitCode) => {
      await writeFile(path.join(output, `${name}.log`), log)
      const result = { name, startedAt, completedAt: new Date().toISOString(), exitCode, summary: log.split(/\r?\n/).filter((line) => /^ℹ|^✖|^# tests|^# pass|^# fail|^FAIL|^PASS|^New issue/.test(line)).slice(-18) }
      console.log(JSON.stringify(result))
      resolve(result)
    })
  })
}
const suites = process.argv.slice(2)
const results = []
if (suites.length === 1 && suites[0] === '--final') {
  results.push(await run('build', process.execPath, ['node_modules/next/dist/bin/next', 'build']))
  results.push(await run('lint', process.execPath, ['node_modules/next/dist/bin/next', 'lint']))
  results.push(await run('secrets', process.execPath, ['scripts/check-secret-leaks.mjs', '--include-untracked']))
  results.push(await run('migration-ratchet', 'python', ['scripts/verify-migrations.py', '--baseline', 'scripts/migration-warning-baseline.json']))
  await writeFile(path.join(output, 'final-results.json'), JSON.stringify(results, null, 2))
  process.exitCode = results.some((result) => result.exitCode !== 0) ? 1 : 0
} else {
if (suites.some((suite) => !['auth', 'config', 'matching', 'profile'].includes(suite))) throw new Error('Unknown test suite')
for (const suite of suites.length ? suites : ['auth', 'config', 'matching', 'profile']) {
  const compilation = await run(`${suite}-compile`, process.execPath, ['node_modules/typescript/bin/tsc', '-p', `tsconfig.${suite}-tests.json`])
  results.push(compilation)
  if (compilation.exitCode === 0) results.push(await run(suite, process.execPath, ['--test', `.tmp/${suite}-tests/tests/${suite}/*.test.js`]))
}
await writeFile(path.join(output, 'test-results.json'), JSON.stringify(results, null, 2))
if (results.some((result) => result.exitCode !== 0)) process.exitCode = 1
}
