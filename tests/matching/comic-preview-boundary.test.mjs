import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

test('comic preview is offline-development only and does not import account or payment code', async () => {
  const source = await readFile(new URL('../../app/meetups/dev-comic-guide/page.tsx', import.meta.url), 'utf8')
  const javascript = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  const env = {}
  const exports = {}
  const preview = () => null
  new Function('exports', 'require', 'process', javascript)(exports, name => {
    if (name === 'next/navigation') return { notFound() { throw Error('not_found') } }
    if (name === 'react/jsx-runtime') return { jsx: (component, props) => ({ component, props }) }
    if (name === '@/components/matching/TonightDesignPreview') return { default: preview }
    assert.fail(`Unexpected dependency: ${name}`)
  }, { env })
  for (const nodeMode of ['production', 'test', undefined]) {
    env.NODE_ENV = nodeMode; env.QUANTUM_LOCAL_RUNTIME_MODE = 'offline-ui'
    assert.throws(() => exports.default(), /not_found/)
  }
  env.NODE_ENV = 'development'
  for (const runtimeMode of ['connected-local', undefined]) {
    env.QUANTUM_LOCAL_RUNTIME_MODE = runtimeMode
    assert.throws(() => exports.default(), /not_found/)
  }
  env.QUANTUM_LOCAL_RUNTIME_MODE = 'offline-ui'
  assert.equal(exports.default().component, preview)
})
