import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const roomId = '11111111-1111-4111-8111-111111111111'
const compile = path => ts.transpileModule(readFileSync(new URL('../../' + path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
const flatten = node => Array.isArray(node) ? node.flatMap(flatten) : node && typeof node === 'object' ? [node, ...flatten(node.props?.children)] : [node]
const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]))

async function deniedRoom(status) {
  const slots = [], effects = new Map(), requests = []
  let cursor = 0, dirty = true, tree
  const react = {
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; dirty = true }] },
    useRef(initial) { return (slots[cursor++] ??= { value: { current: initial } }).value },
    useMemo(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { value: fn(), deps }; return slots[index].value },
    useCallback(fn, deps) { return this.useMemo(() => fn, deps) },
    useEffect(fn, deps) { const index = cursor++; slots[index] ??= {}; if (!same(slots[index].deps, deps)) effects.set(index, { fn, deps }) },
  }
  react.useCallback = (fn, deps) => react.useMemo(() => fn, deps)
  const stateExports = {}
  vm.runInNewContext(compile('lib/chat/social-messenger-state.ts'), { exports: stateExports, Set, Map })
  const deps = {
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/link': { default: 'link' }, 'next/navigation': { useRouter: () => ({ push() {}, replace() {} }) }, 'lucide-react': {},
    '@/lib/chat/useSocialChatRead': { useSocialChatRead() {} }, '@/lib/chat/social-room-presentation': { socialChatHref: () => '/chat' },
    '@/lib/chat/social-messenger-state': stateExports, '@/lib/community/catalog': {}, '@/lib/community/meetup-gender': {}, '@/lib/community/meetup-place': {},
    '@/components/places/PlaceLinks': {}, '@/components/chat-polls/ActivityRoomPolls': {}, '@/components/chat/SocialMessenger': {},
    './LiveActivityGuide': {}, './MeetupApplications': {}, './MeetupCreatedNotice': {},
    '@/lib/meetups/create-context': { getMeetupDetailBackLink() { throw new Error('unloaded room must not derive a detail return link') } },
  }
  const exports = {}
  vm.runInNewContext(compile('components/meetups/MeetupDetailExperience.tsx'), {
    exports, require: name => { assert.ok(Object.hasOwn(deps, name), name); return deps[name] },
    AbortController, setTimeout, clearTimeout, encodeURIComponent,
    window: { setInterval: () => 1, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
    document: { visibilityState: 'visible' },
    fetch: async url => { requests.push(url); return { ok: false, status, json: async () => ({ error: status === 401 ? 'Unauthorized' : 'unavailable' }) } },
  })
  const flush = () => {
    for (let count = 0; dirty || effects.size; count++) {
      assert.ok(count < 25)
      if (dirty) { cursor = 0; dirty = false; tree = exports.default({ meetupId: roomId }) }
      const pending = [...effects]; effects.clear()
      for (const [index, { fn, deps }] of pending) { slots[index].cleanup?.(); slots[index] = { deps, cleanup: fn() } }
    }
  }
  flush()
  for (let index = 0; index < 20; index++) { await Promise.resolve(); flush() }
  for (const slot of slots) slot?.cleanup?.()
  return { nodes: flatten(tree), requests }
}

test('an unauthenticated shared room offers signup/login with exactly that room and no chat request', async () => {
  const { nodes, requests } = await deniedRoom(401)
  const login = nodes.find(node => node?.type === 'link' && node.props.href.startsWith('/login'))
  assert.ok(login)
  assert.equal(new URL(login.props.href, 'https://quantum.school').searchParams.get('redirect'), '/meetups/' + roomId)
  assert.equal(requests.length, 1)
  assert.equal(requests[0], '/api/meetups/' + roomId)
  assert.ok(nodes.some(node => node?.type === 'link' && node.props.href === '/meetups'))
})

test('service failures keep retry and are not mislabeled as a request to sign up', async () => {
  const { nodes } = await deniedRoom(503)
  assert.equal(nodes.some(node => node?.type === 'link' && node.props.href.startsWith('/login')), false)
  assert.ok(nodes.some(node => node?.type === 'button' && typeof node.props.onClick === 'function'))
})
