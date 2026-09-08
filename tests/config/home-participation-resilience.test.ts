import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

type HomeViewInput = {
  participationStatus: 'loading' | 'ready' | 'error'
  continuationStatus: 'loading' | 'ready' | 'error'
  hasParticipation: boolean
  hasContinuation: boolean
}

type HomeModule = {
  resolveHomeParticipationPayload?: (payload: unknown) => {
    participation: unknown
    status: 'ready' | 'error'
  }
  resolveHomeParticipationView?: (input: HomeViewInput) => string
}

function loadHomeModule(): HomeModule {
  const source = readFileSync(
    join(process.cwd(), 'components/home/QuantumHomeParticipation.tsx'),
    'utf8',
  )
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'QuantumHomeParticipation.tsx',
  }).outputText
  const module = { exports: {} as HomeModule }
  const dependencyStub = new Proxy({}, { get: () => () => null })

  vm.runInNewContext(output, {
    AbortController,
    clearTimeout,
    console,
    exports: module.exports,
    fetch: () => Promise.reject(new Error('fetch is not used by the pure view resolver')),
    module,
    require: () => dependencyStub,
    setTimeout,
  })

  return module.exports
}

test('a continuation lookup failure keeps a successfully loaded participation visible', () => {
  const resolveView = loadHomeModule().resolveHomeParticipationView
  assert.equal(typeof resolveView, 'function')

  assert.equal(resolveView?.({
    participationStatus: 'ready',
    continuationStatus: 'error',
    hasParticipation: true,
    hasContinuation: false,
  }), 'participation')
})

test('an unknown continuation state never opens the new-application fallback', () => {
  const resolveView = loadHomeModule().resolveHomeParticipationView
  assert.equal(typeof resolveView, 'function')

  assert.equal(resolveView?.({
    participationStatus: 'ready',
    continuationStatus: 'error',
    hasParticipation: false,
    hasContinuation: false,
  }), 'blocked')
})

test('a loaded continuation preserves a distinct warning when the first meeting lookup fails', () => {
  const resolveView = loadHomeModule().resolveHomeParticipationView
  assert.equal(resolveView?.({
    participationStatus: 'error',
    continuationStatus: 'ready',
    hasParticipation: false,
    hasContinuation: true,
  }), 'continuation-partial')
  const source = readFileSync('components/home/QuantumHomeParticipation.tsx', 'utf8')
  assert.match(source, /오늘·이번 주 신청 상태만 확인하지 못했어요/)
})

test('the fallback opens only after both lookups confirm that no saved journey exists', () => {
  const resolveView = loadHomeModule().resolveHomeParticipationView
  assert.equal(typeof resolveView, 'function')

  assert.equal(resolveView?.({
    participationStatus: 'ready',
    continuationStatus: 'ready',
    hasParticipation: false,
    hasContinuation: false,
  }), 'fallback')
})

test('ready availability distinguishes a confirmed null from an invalid participation payload', () => {
  const resolvePayload = loadHomeModule().resolveHomeParticipationPayload
  assert.equal(typeof resolvePayload, 'function')

  const confirmedAbsent = resolvePayload?.({ availability: 'ready', participation: null })
  assert.equal(confirmedAbsent?.status, 'ready')
  assert.equal(confirmedAbsent?.participation, null)

  for (const invalidPayload of [
    { availability: 'ready' },
    { availability: 'ready', participation: { unexpected: true } },
  ]) {
    const result = resolvePayload?.(invalidPayload)
    assert.equal(result?.status, 'error')
    assert.equal(result?.participation, null)
  }
})
