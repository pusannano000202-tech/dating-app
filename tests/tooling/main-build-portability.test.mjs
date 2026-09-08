import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('CI runs the JavaScript tooling regressions after installing dependencies', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')

  assert.equal(packageJson.scripts['test:tooling:js'], 'node --test --test-concurrency=1 tests/tooling/*.test.mjs')
  const webJob = workflow.slice(workflow.indexOf('  nextjs-typecheck:'))
  const installIndex = webJob.indexOf('run: npm ci')
  const toolingIndex = webJob.indexOf('run: npm run test:tooling:js')
  assert.ok(installIndex >= 0 && toolingIndex > installIndex)
})

test('shared TypeScript config includes only canonical production and development build types', () => {
  const config = JSON.parse(readFileSync('tsconfig.json', 'utf8'))
  const buildTypeIncludes = config.include.filter(path => path.startsWith('.next'))

  assert.deepEqual(buildTypeIncludes.sort(), [
    '.next-dev/types/**/*.ts',
    '.next/types/**/*.ts',
  ])
  assert.ok(config.include.includes('next-env.d.ts'))
  assert.ok(config.include.includes('**/*.ts'))
  assert.ok(config.include.includes('**/*.tsx'))
  assert.ok(config.exclude.includes('node_modules'))
  assert.ok(config.exclude.includes('apps/mobile'))
})

test('committable Next environment types do not reference a local QA build', () => {
  const nextEnv = readFileSync('next-env.d.ts', 'utf8')
  const routeTypeReferences = [...nextEnv.matchAll(/reference path="([^"]+)"/g)].map(match => match[1])

  assert.ok(routeTypeReferences.length > 0)
  for (const path of routeTypeReferences) {
    assert.match(path, /^\.\/\.next(?:-dev)?\/types\/routes\.d\.ts$/)
  }
})
