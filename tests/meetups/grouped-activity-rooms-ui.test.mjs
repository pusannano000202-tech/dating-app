import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8')
const compile = file => ts.transpileModule(source(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
function pure(file) { const exports = {}; new Function('exports', compile(file))(exports); return exports }
const flatten = node => Array.isArray(node) ? node.flatMap(flatten) : node && typeof node === 'object' ? [node, ...flatten(node.props?.children)] : [node]
const text = node => flatten(node).filter(value => typeof value === 'string' || typeof value === 'number').join('')
const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
const row = n => ({ id: '20000000-0000-4000-8000-' + String(n).padStart(12, '0'), title: '소품숍 친구 ' + n, category: 'other', activity_key: 'campus-small-shop', member_count: 1, capacity: 6, schedule_status: 'schedule_pending', scheduled_at: null, place_name: null, joined: false, is_host: false, status: 'open' })
const cursor = n => JSON.stringify([null, '2026-09-22T00:00:00Z', row(n).id])
const page = (rows, more = false) => ({ meetups: rows, availability: 'ready', has_more: more, next_cursor: more ? cursor(Number(rows.at(-1).id.slice(-12))) : null })

function harness() {
  let index = 0, dirty = true, mounted = true, output
  let props = { activityKey: 'campus-small-shop', category: 'other', genderMode: 'female_only', refreshVersion: 0 }
  const slots = [], effects = new Map(), requests = []
  const react = {
    useState(initial) { const i = index++; slots[i] ??= { value: initial }; return [slots[i].value, value => { if (mounted) { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; dirty = true } }] },
    useRef(initial) { const i = index++; return (slots[i] ??= { value: { current: initial } }).value },
    useCallback(fn, deps) { const i = index++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn },
    useEffect(fn, deps) { const i = index++; slots[i] ??= {}; if (!same(slots[i].deps, deps)) effects.set(i, { fn, deps }) },
  }
  const fetch = (url, options) => new Promise(resolve => requests.push({ url, options, reply(body, status = 200) { resolve({ ok: status === 200, status, json: async () => body }) } }))
  const dependencies = {
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/link': { default: 'link' }, 'lucide-react': new Proxy({}, { get: (_, key) => `icon-${String(key)}` }),
    '@/lib/meetups/create-flow': pure('lib/meetups/create-flow.ts'), '@/lib/meetups/list-page': pure('lib/meetups/list-page.ts'),
    './activity-rooms.module.css': { default: new Proxy({}, { get: (_, key) => key }) },
  }
  const exports = {}
  new Function('exports', 'require', 'fetch', 'window', compile('components/meetups/HostedActivityRooms.tsx'))(exports, name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name] }, fetch, { setTimeout: () => 1, clearTimeout() {} })
  function flush() {
    for (let turns = 0; dirty || effects.size; turns++) {
      assert.ok(turns < 30)
      if (dirty) { index = 0; dirty = false; output = exports.default(props) }
      const pending = [...effects]; effects.clear()
      for (const [i, { fn, deps }] of pending) { slots[i].cleanup?.(); slots[i] = { fn, deps, cleanup: fn() } }
    }
  }
  async function settle() { for (let i = 0; i < 20; i++) { await Promise.resolve(); flush() } }
  flush()
  return {
    requests, settle, get tree() { return flatten(output) }, get text() { return text(output) },
    get cards() { return flatten(output).filter(node => node?.type === 'link' && /^\/meetups\/[0-9]/.test(node.props.href)) },
    click(label) { const button = flatten(output).find(node => node?.type === 'button' && text(node) === label); assert.ok(button, label); button.props.onClick(); flush() },
    change(next) { props = { ...props, ...next }; dirty = true; flush() },
    close() { mounted = false; for (const slot of slots) slot?.cleanup?.() },
  }
}

test('hosted room pages are scoped by exact activity, school and gender before pagination', async () => {
  const f = harness()
  try {
    let query = new URL(f.requests[0].url, 'https://test').searchParams
    assert.equal(query.get('activity_key'), 'campus-small-shop'); assert.equal(query.get('category'), 'other')
    assert.equal(query.get('scope_type'), 'school'); assert.equal(query.get('gender_mode'), 'female_only')
    f.requests[0].reply(page([row(1), row(2)], true)); await f.settle()
    assert.equal(f.cards.length, 2); assert.match(f.text, /시간·장소 함께 정하기/); assert.match(f.text, /신청 후 방장 수락/)
    assert.ok(!f.tree.some(node => node?.type === 'img' || node?.type === 'image'))
    f.click('모임방 더 보기')
    query = new URL(f.requests[1].url, 'https://test').searchParams
    assert.equal(query.get('activity_key'), 'campus-small-shop'); assert.equal(query.get('cursor'), cursor(2)); assert.equal(query.get('gender_mode'), 'female_only')
    f.requests[1].reply(page([row(3)])); await f.settle(); assert.equal(f.cards.length, 3)
    assert.deepEqual(f.cards.map(node => node.props.href), [1, 2, 3].map(n => '/meetups/' + row(n).id))
    assert.ok(!f.tree.some(node => node?.type === 'button' && text(node) === '모임방 더 보기'))
  } finally { f.close() }
})

test('hosted cards distinguish existing membership and confirmed schedule without changing join rules', async () => {
  const f = harness()
  try {
    f.requests[0].reply(page([{ ...row(1), is_host: true, joined: true }, { ...row(2), joined: true }, { ...row(3), status: 'full', member_count: 6, schedule_status: 'confirmed', scheduled_at: '2026-09-23T10:00:00Z', place_name: '학교 앞 소품숍' }]))
    await f.settle()
    assert.match(f.text, /내가 만든 방/); assert.match(f.text, /참여 중/); assert.match(f.text, /모집 마감/)
    assert.match(f.text, /학교 앞 소품숍/); assert.match(f.text, /19:00/)
    assert.equal(f.requests.length, 1); assert.ok(f.requests.every(request => !request.options.method || request.options.method === 'GET'))
  } finally { f.close() }
})

test('load failures and wrong activity responses are never presented as an empty activity', async () => {
  for (const response of [{ body: { error: 'unavailable' }, status: 503 }, { body: page([{ ...row(1), activity_key: 'campus-cafe' }]), status: 200 }]) {
    const f = harness()
    try {
      f.requests[0].reply(response.body, response.status); await f.settle()
      assert.match(f.text, /직접 연 방을 불러오지 못했어요/); assert.doesNotMatch(f.text, /아직 직접 연 방/); assert.equal(f.cards.length, 0)
      f.click('다시 확인'); f.requests[1].reply(page([])); await f.settle(); assert.match(f.text, /아직 직접 연 방/)
    } finally { f.close() }
  }
})

test('pagination failure keeps cards and cursor, activity changes reject late responses', async () => {
  const f = harness()
  try {
    f.requests[0].reply(page([row(1)], true)); await f.settle(); f.click('모임방 더 보기')
    f.requests[1].reply({ error: 'unavailable' }, 503); await f.settle(); assert.equal(f.cards.length, 1)
    f.click('모임방 더 보기'); assert.equal(f.requests[1].url, f.requests[2].url)
    f.change({ activityKey: 'campus-cafe', category: 'cafe' }); assert.equal(f.cards.length, 0); assert.equal(f.requests[2].options.signal.aborted, true)
    f.requests[3].reply(page([{ ...row(4), category: 'cafe', activity_key: 'campus-cafe' }])); await f.settle()
    f.requests[2].reply(page([row(2)])); await f.settle(); assert.deepEqual(f.cards.map(node => node.props.href), ['/meetups/' + row(4).id])
  } finally { f.close() }
})

test('authorization loss clears cards and preserves the exact lobby login destination', async () => {
  const f = harness()
  try {
    f.requests[0].reply(page([row(1)], true)); await f.settle(); f.click('모임방 더 보기')
    f.requests[1].reply({ availability: 'auth_required' }, 401); await f.settle(); assert.equal(f.cards.length, 0)
    const login = f.tree.find(node => node?.type === 'link')
    assert.equal(new URL(login.props.href, 'https://test').searchParams.get('redirect'), '/meetups/activities/campus-small-shop/rooms?gender_mode=female_only')
  } finally { f.close() }
})

test('lobby embeds hosted activity rooms and keeps immediate joining limited to numbered rooms', () => {
  const lobby = source('components/meetups/ActivityRoomLobby.tsx')
  assert.match(lobby, /<HostedActivityRooms/)
  assert.match(lobby, /activityKey=\{activityKey\}/); assert.match(lobby, /category=\{definition.category\}/); assert.match(lobby, /genderMode=\{genderMode\}/)
  const hero = lobby.slice(lobby.indexOf('<section className={styles.hero}>'), lobby.indexOf('<section aria-labelledby="activity-room-list-title">'))
  assert.doesNotMatch(hero, /참여 즉시 채팅|방마다/)
  assert.match(lobby, /\/api\/meetups\/rooms\/\$\{roomId\}\/join/)
  assert.match(lobby, /함께 시간과 장소를 정해요/)
})

test('play activity explorer has a quiet legacy fallback instead of a repeated hosted shelf', () => {
  const explore = source('components/meetups/MeetupExplore.tsx')
  assert.match(explore, /activityGroupsOnly/)
  assert.match(explore, /customMeetupBrowseHref/)
  assert.match(explore, /다른 모임 보기/)
  assert.match(explore, /<CustomMeetupShelf/)
})

test('rendered explorer groups play rooms but retains gender-aware legacy and study entry routes', () => {
  function render(intent) {
    const group = intent === 'play' ? 'lifestyle' : 'language'
    const category = intent === 'play' ? 'other' : 'study'
    const dependencies = {
      'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
      'next/link': { default: 'link' }, 'next/image': { default: 'image' }, 'next/navigation': { useSearchParams: () => new URLSearchParams() },
      'lucide-react': {}, '@/lib/community/meetup-gender': { MEETUP_GENDER_LABELS: { female_only: '여자끼리' }, MEETUP_GENDER_MODES: ['female_only'] },
      '@/lib/meetups/discovery-navigation': {
        readMeetupDiscoveryState: () => ({ intent, group, genderMode: 'female_only' }),
        getMeetupDiscoveryGroups: () => [{ id: group, title: '함께할 활동', imageSrc: '/activity.webp' }],
        getMeetupDiscoveryActivities: () => [{ id: 'campus-small-shop', title: '소품숍', category, kind: 'activity', capacity: 6, href: '/meetups/activities/campus-small-shop/rooms?gender_mode=female_only', imageSrc: '/activity.webp' }],
        buildMeetupExploreHref: state => '/meetups/explore?' + new URLSearchParams({ intent: state.intent, group: state.group ?? '', gender_mode: state.genderMode }),
      },
      '@/lib/meetups/create-flow': pure('lib/meetups/create-flow.ts'), '@/lib/community/catalog': { getMeetupCategoryLabel: value => value },
      './meetup-discovery.module.css': { default: {} }, './CustomMeetupShelf': { default: 'custom-shelf' },
      '@/components/i18n/QuantumLocaleProvider': { useQuantumLocale: () => ({ t: value => value }) }, '@/components/i18n/LanguagePicker': { default: 'language-picker' },
    }
    const exports = {}
    new Function('exports', 'require', compile('components/meetups/MeetupExplore.tsx'))(exports, name => { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name] })
    return flatten(exports.default({ intent }))
  }
  const play = render('play')
  assert.ok(!play.some(node => node?.type === 'custom-shelf'))
  assert.equal(play.filter(node => node?.type === 'image').length, 1, 'only the activity photo appears')
  const legacy = play.find(node => node?.type === 'link' && node.props.href.startsWith('/meetups/browse?'))
  const query = new URL(legacy.props.href, 'https://test').searchParams
  assert.equal(query.get('category'), 'other'); assert.equal(query.get('gender_mode'), 'female_only'); assert.equal(query.get('scope_type'), 'school')
  const study = render('achieve').find(node => node?.type === 'custom-shelf')
  assert.ok(study); assert.equal(study.props.topicGroup, 'language'); assert.equal(study.props.genderMode, 'female_only')
})
