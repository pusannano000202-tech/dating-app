import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { integratedUiEnvironment } from './integrated-ui-config.mjs'

const output = path.resolve('artifacts/food-worldcup-entry-20260906/checks')
await mkdir(output, { recursive: true })
const results = []
async function run(name, args, env = process.env) {
  let log = ''
  const startedAt = new Date().toISOString()
  const exitCode = await new Promise(resolve => {
    const child = spawn(process.execPath, args, { windowsHide: true, env })
    child.stdout.on('data', chunk => { log += chunk })
    child.stderr.on('data', chunk => { log += chunk })
    child.on('error', error => { log += String(error) })
    child.on('close', resolve)
  })
  await writeFile(path.join(output, name + '.log'), log)
  const result = { name, startedAt, completedAt: new Date().toISOString(), exitCode,
    summary: log.split(/\r?\n/).filter(line => /^ℹ|^✖|^Error|^Failed|^✔/.test(line)).slice(-10) }
  results.push(result)
  console.log(JSON.stringify(result))
  return exitCode === 0
}
const mode = process.argv[2] ?? 'tests'
if (mode === 'tests') {
  for (const suite of ['config', 'matching']) {
    if (await run(suite + '-compile', ['node_modules/typescript/bin/tsc', '-p', `tsconfig.${suite}-tests.json`, '--outDir', `.tmp/food-entry-${suite}`])) {
      await run(suite, ['--test', `.tmp/food-entry-${suite}/tests/${suite}/*.test.js`])
    }
  }
  await run('entry-flow', ['--test', 'tests/tooling/campus-eats-entry-state.test.mjs', 'tests/tooling/campus-eats-entry-ui.test.mjs', 'tests/tooling/community-photo-explorer.test.mjs', 'tests/tooling/journey-public-clarity.test.mjs'])
} else if (mode === 'build') {
  const env = { ...integratedUiEnvironment(process.env, '--offline-ui'), NEXT_DIST_DIR: '.next-food-entry-build' }
  await run('build', ['node_modules/next/dist/bin/next', 'build'], env)
  await run('lint', ['node_modules/next/dist/bin/next', 'lint'], env)
} else {
  throw new Error('Use tests or build')
}
await writeFile(path.join(output, mode + '-results.json'), JSON.stringify(results, null, 2))
process.exitCode = results.some(result => result.exitCode !== 0) ? 1 : 0
