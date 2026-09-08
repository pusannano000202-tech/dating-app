import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const output = path.resolve('artifacts/journey-clarity-20260906/checks')
await mkdir(output, { recursive: true })
const results = []
async function run(name, args, env = process.env) {
  const startedAt = new Date().toISOString()
  let log = ''
  const exitCode = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, { windowsHide: true, env })
    child.stdout.on('data', (chunk) => { log += chunk })
    child.stderr.on('data', (chunk) => { log += chunk })
    child.on('error', (error) => { log += String(error) })
    child.on('close', resolve)
  })
  await writeFile(path.join(output, `${name}.log`), log)
  const result = { name, startedAt, completedAt: new Date().toISOString(), exitCode, summary: log.split(/\r?\n/).filter((line) => /^ℹ|^✖|^Error|^Failed|^✔/.test(line)).slice(-12) }
  results.push(result)
  console.log(JSON.stringify(result))
  return exitCode === 0
}
const mode = process.argv[2] ?? 'tests'
if (mode === 'tests') {
  for (const suite of ['auth', 'config', 'matching', 'profile']) {
    const dir = `.tmp/journey-final-${suite}`
    if (await run(`${suite}-compile`, ['node_modules/typescript/bin/tsc', '-p', `tsconfig.${suite}-tests.json`, '--outDir', dir])) {
      await run(suite, ['--test', `${dir}/tests/${suite}/*.test.js`])
    }
  }
  await run('public-flow', ['--test', 'tests/tooling/journey-public-clarity.test.mjs', 'tests/tooling/journey-recovery-ui.test.mjs'])
} else if (mode === 'build') {
  await run('build', ['node_modules/next/dist/bin/next', 'build'], { ...process.env, NEXT_DIST_DIR: '.next-journey-build' })
  await run('lint', ['node_modules/next/dist/bin/next', 'lint'])
} else {
  throw new Error('Use tests or build')
}
await writeFile(path.join(output, `${mode}-results.json`), JSON.stringify(results, null, 2))
process.exitCode = results.some((result) => result.exitCode !== 0) ? 1 : 0
