import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createElement } from 'react'
import * as jsx from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

async function load(path, deps = {}, browser = {}) {
  const exports = {}
  const source = await readFile(new URL('../../' + path, import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  new Function('exports', 'require', 'window', js)(exports, name => {
    assert.ok(Object.hasOwn(deps, name), `Unexpected dependency: ${name}`)
    return deps[name]
  }, browser)
  return exports
}
async function view({ state = null, unavailable = false, owner = 'account' } = {}) {
  let retries = 0, reloads = 0
  const Icon = () => null
  const { default: Discovery } = await load('components/matching/QuantumMatchDiscovery.tsx', {
    'react/jsx-runtime': jsx,
    react: { useEffect: () => {} },
    'lucide-react': { ArrowRight: Icon, Heart: Icon, LoaderCircle: Icon, RefreshCw: Icon },
    'next/image': () => null,
    'next/link': ({ href, children, ...props }) => createElement('a', { href, ...props }, children),
    'next/navigation': { useRouter: () => ({ replace: () => {} }) },
    '@/components/relationship/useRelationshipState': { useRelationshipState: () => ({ state, unavailable, owner, refresh: () => { retries++ } }) },
    '@/lib/matching/match-entry-policy': await load('lib/matching/match-entry-policy.ts'),
    './match-journey.module.css': {},
  }, { location: { reload: () => { reloads++ } } })
  const tree = Discovery()
  return { html: renderToStaticMarkup(tree), tree, counts: () => ({ retries, reloads }) }
}
function buttons(tree) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(buttons)
  return [...(tree.type === 'button' ? [tree] : []), ...buttons(tree.props?.children)]
}

test('unknown relationship never renders an actionable singles card during initial loading or error', async () => {
  for (const unavailable of [false, true]) {
    const v = await view({ unavailable })
    assert.doesNotMatch(v.html, /href="\/tonight"/)
    assert.match(v.html, /role="status"/)
  }
})
test('retry recovers relationship reads, or restarts account discovery when identity is unavailable', async () => {
  for (const owner of ['account', 'unavailable', null]) {
    const v = await view({ unavailable: true, owner })
    buttons(v.tree)[0].props.onClick()
    assert.deepEqual(v.counts(), owner === 'account' ? { retries: 1, reloads: 0 } : { retries: 0, reloads: 1 })
  }
})
test('confirmed couples and singles keep the existing respective destinations', async () => {
  const couple = await view({ state: { status: 'in_relationship' } })
  assert.match(couple.html, /href="\/match\/calendar\?audience=couple"/)
  assert.doesNotMatch(couple.html, /href="\/tonight"/)
  const single = await view({ state: { status: 'single' } })
  assert.match(single.html, /href="\/tonight"/)
})
test('a refresh failure preserves the last same-account setting with a retry, not a singles fallback', async () => {
  const v = await view({ state: { status: 'in_relationship' }, unavailable: true })
  assert.match(v.html, /최근 확인한 설정/)
  assert.doesNotMatch(v.html, /href="\/tonight"/)
  buttons(v.tree)[0].props.onClick()
  assert.equal(v.counts().retries, 1)
})
