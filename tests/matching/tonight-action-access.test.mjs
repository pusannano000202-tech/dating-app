import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Extract and execute the real action wrapper with controlled state sinks.
// This proves its error handling, not a browser or full React lifecycle.
async function harness() {
  const source = await readFile(new URL('../../components/tonight/UserTonightExperience.tsx', import.meta.url), 'utf8')
  const file = ts.createSourceFile('UserTonightExperience.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let wrapper
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'runAction') wrapper = node.initializer.getText(file)
    ts.forEachChild(node, visit)
  }
  visit(file)
  assert.ok(wrapper, 'Actual action wrapper must exist')
  const changed = {}
  const controller = new AbortController()
  class TonightAccessError extends Error {}
  const scope = { requestGenerationRef: { current: 0 }, requestPendingRef: { current: false }, readControllerRef: { current: controller }, dataRef: { current: { application: { id: 'owned' } } }, TonightAccessError, actionErrorMessage: error => error.message }
  for (const key of ['Refreshing', 'Busy', 'ActionError', 'Notice', 'Data', 'LoadError', 'RoundUnavailable', 'RefreshFailed', 'VerifiedAt', 'Loading']) scope[`set${key}`] = value => { changed[key] = value }
  const compiled = ts.transpileModule(`const runAction = ${wrapper}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const run = new Function(...Object.keys(scope), `${compiled}; return runAction`)(...Object.values(scope))
  return { run, scope, changed, TonightAccessError }
}

test('an explicit access failure in an action clears the private snapshot without retrying the write', async () => {
  const h = await harness()
  let attempts = 0
  await h.run('arrival', async () => { attempts++; throw new h.TonightAccessError('권한이 만료됐어요') })
  assert.equal(attempts, 1)
  assert.equal(h.scope.dataRef.current, null)
  assert.equal(h.changed.Data, null)
  assert.equal(h.changed.VerifiedAt, null)
  assert.equal(h.changed.RefreshFailed, true)
  assert.equal(h.changed.LoadError, '권한이 만료됐어요')
  assert.equal(h.changed.Busy, null)
})

test('an ordinary action failure retains the known receipt and never retries the mutation', async () => {
  const h = await harness()
  let attempts = 0
  await h.run('arrival', async () => { attempts++; throw new Error('일시적인 연결 오류') })
  assert.equal(attempts, 1)
  assert.equal(h.scope.dataRef.current.application.id, 'owned')
  assert.equal(h.changed.ActionError, '일시적인 연결 오류')
  assert.equal(h.changed.Busy, null)
})
