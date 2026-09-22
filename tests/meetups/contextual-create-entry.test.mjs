import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const root = fileURLToPath(new URL('../../', import.meta.url))
const cache = new Map()
function load(file, dependencies = {}, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const require = name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name]
    const target = name.startsWith('@/') ? name.slice(2) : name.startsWith('.') ? path.join(path.dirname(file), name) : null
    assert.ok(target, `unexpected import ${name}`)
    const key = `${target}.ts`
    if (!cache.has(key)) cache.set(key, load(key))
    return cache.get(key)
  }
  new Function('exports', 'require', ...Object.keys(globals), code)(exports, require, ...Object.values(globals))
  return exports
}
const context = load('lib/meetups/create-context.ts')
const catalog = load('lib/community/catalog.ts')
const flatten = node => Array.isArray(node) ? node.flatMap(flatten)
  : node && typeof node === 'object' ? [node, ...flatten(node.props?.children)] : [node]
const text = node => flatten(node).filter(value => typeof value === 'string' || typeof value === 'number').join('')
const params = href => new URL(href, 'https://quantum.test').searchParams

test('every activity create entry keeps its canonical activity, gender and exact room-list return', () => {
  for (const idea of catalog.featuredMeetupIdeas) {
    const href = context.buildContextualMeetupCreateHref({ activityKey: idea.id, genderMode: 'female_only' })
    const entry = context.readMeetupCreateContext(params(href))
    assert.equal(entry.idea.id, idea.id)
    assert.equal(entry.category, idea.category)
    assert.equal(entry.genderMode, 'female_only')
    assert.equal(entry.startAtRecruitment, true)
    assert.equal(entry.backHref, `/meetups/activities/${idea.id}/rooms?gender_mode=female_only`)
    assert.deepEqual([...params(href).keys()].sort(), ['category', 'from', 'gender_mode', 'idea', 'scope', 'start'].sort())
  }
})

test('category creation preserves the study topic and browse origin without inventing an activity', () => {
  const from = '/meetups/explore?intent=achieve&group=language&gender_mode=female_only'
  const href = context.buildContextualMeetupCreateHref({ category: 'study', genderMode: 'female_only', topicGroup: 'language', from })
  const entry = context.readMeetupCreateContext(params(href))
  assert.equal(entry.idea, undefined)
  assert.equal(entry.category, 'study')
  assert.equal(entry.topicGroup, 'language')
  assert.equal(entry.backHref, from)
  assert.equal(entry.startAtRecruitment, true)
})

test('unknown prefills cannot skip activity choice and untrusted origins never become return links', () => {
  for (const input of [{ activityKey: 'not-a-real-activity', genderMode: 'all' }, { category: 'invalid', genderMode: 'all' }, { category: 'gaming', genderMode: 'admin' }]) {
    assert.equal(context.buildContextualMeetupCreateHref(input), null)
  }
  const unknown = context.readMeetupCreateContext(new URLSearchParams('idea=not-real&category=forged&gender_mode=admin&start=recruitment'))
  assert.equal(unknown.idea, undefined)
  assert.equal(unknown.category, 'running')
  assert.equal(unknown.genderMode, 'all')
  assert.equal(unknown.startAtRecruitment, false)
  for (const from of ['https://outside.example', '//outside.example', '/meetups/../admin', '/meetups/activities/not-real/rooms', '/meetups/activities/team-gaming/rooms?gender_mode=admin']) {
    const entry = context.readMeetupCreateContext(new URLSearchParams({ category: 'gaming', from }))
    assert.equal(entry.backHref, '/meetups')
  }
  assert.equal(context.readMeetupCreateContext(new URLSearchParams('category=gaming')).startAtRecruitment, false, 'existing generic entry keeps activity choice')
})

function fixture(file, { query = '', props = {}, overrides = {}, responses = [] } = {}) {
  const slots = [], requests = [], pushes = [], replacements = [], navigation = []
  let index = 0, tree
  const search = new URLSearchParams(query)
  const react = {
    useState(initial) { const i = index++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next }] },
    useRef(initial) { const i = index++; return (slots[i] ??= { value: { current: initial } }).value },
    useMemo(fn) { return fn() }, useCallback(fn) { return fn }, useEffect() {},
  }
  const dependencies = {
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'next/link': { default: 'a' }, 'next/image': { default: 'img' },
    'next/navigation': { useRouter: () => ({
      push: href => { pushes.push(href); navigation.push({ type: 'push', href }) },
      replace: href => { replacements.push(href); navigation.push({ type: 'replace', href }) },
      refresh: () => navigation.push({ type: 'refresh' }),
    }), useSearchParams: () => search },
    'lucide-react': new Proxy({}, { get: (_, key) => `icon-${String(key)}` }),
    '@/components/i18n/QuantumLocaleProvider': { useQuantumLocale: () => ({ t: value => value }) },
    '@/components/i18n/LanguagePicker': { default: 'language' },
    '@/components/content-history/useHistoryAccount': { useHistoryAccount: () => null },
    '@/lib/meetups/study-catalog': { getStudyCourse: () => null, searchStudyCourses: () => [] },
    '@/lib/meetups/activity-room-client': { fetchActivityRoom: async () => { throw Error('unexpected room request') } },
    './activity-rooms.module.css': { default: new Proxy({}, { get: (_, key) => key }) },
    './meetup-discovery.module.css': { default: new Proxy({}, { get: (_, key) => key }) },
    './create-meetup.module.css': { default: new Proxy({}, { get: (_, key) => key }) },
    './HostedActivityRooms': { default: 'hosted-activity-rooms' },
    ...overrides,
  }
  const component = load(file, dependencies, {
    fetch: async (url, options) => {
      requests.push({ url, options })
      const response = responses[requests.length - 1]
      if (response instanceof Error) throw response
      return response ?? { ok: true, json: async () => ({ meetup: { id: '20000000-0000-4000-8000-000000000001' } }) }
    },
    window: { scrollTo() {}, setTimeout: () => 1, clearTimeout() {} },
  }).default
  function render() {
    index = 0; tree = component(props)
    const form = flatten(tree).find(node => node?.type === 'form')
    if (form) form.props.ref.current = { reportValidity: () => true }
  }
  render()
  return {
    requests, pushes, replacements, navigation, get tree() { return tree },
    find(predicate) { return flatten(tree).find(predicate) },
    async next() { const form = this.find(node => node?.type === 'form'); await form.props.onSubmit({ preventDefault() {} }); render() },
    click(label) { const button = this.find(node => node?.type === 'button' && text(node) === label); assert.ok(button, label); button.props.onClick(); render() },
  }
}

test('activity room lobby offers a visible create link without changing the join action', () => {
  const f = fixture('components/meetups/ActivityRoomLobby.tsx', { props: { activityKey: 'team-gaming', genderMode: 'male_only' }, overrides: { '@/lib/chat/social-room-presentation': { socialChatHref: () => '/chat' } } })
  const create = f.find(node => node?.type === 'a' && text(node).includes('모임방 만들기'))
  assert.ok(create)
  assert.equal(params(create.props.href).get('idea'), 'team-gaming')
  assert.equal(params(create.props.href).get('gender_mode'), 'male_only')
  assert.match(text(f.tree), /직접 여는 모임/)
  assert.equal(f.requests.length, 0)
})

test('custom shelf exposes creation in its heading while the list is still loading', () => {
  const f = fixture('components/meetups/CustomMeetupShelf.tsx', { props: { categories: ['study'], genderMode: 'female_only', imageSrc: '/test.webp', topicGroup: 'language', fromHref: '/meetups/explore?intent=achieve&group=language&gender_mode=female_only' } })
  const create = f.find(node => node?.type === 'a' && text(node) === '만들기')
  assert.ok(create)
  assert.ok(text(f.tree).indexOf('만들기') < text(f.tree).indexOf('common.loading'))
  assert.equal(params(create.props.href).get('topic_group'), 'language')
  assert.equal(params(create.props.href).get('start'), 'recruitment')
})

test('prefilled creation starts at recruitment and publishes only the current public activity choices', async () => {
  const href = context.buildContextualMeetupCreateHref({ activityKey: 'team-gaming', genderMode: 'female_only' })
  const f = fixture('components/meetups/CreateMeetupForm.tsx', { query: params(href).toString() })
  assert.ok(f.find(node => node?.type === 'input' && node.props.value === catalog.featuredMeetupIdeas.find(idea => idea.id === 'team-gaming').title))
  assert.equal(f.find(node => node?.props?.['aria-label'] === '어떤 종류의 모임인가요?'), undefined)
  assert.match(text(f.tree), /2\/4/)
  assert.match(text(f.tree), /활동 바꾸기/)
  assert.equal(f.requests.length, 0)
  await f.next(); await f.next()
  assert.equal(f.requests.length, 0, 'next stages never create a room')
  await f.next()
  assert.equal(f.requests.length, 1)
  assert.equal(f.requests[0].url, '/api/meetups')
  const body = JSON.parse(f.requests[0].options.body)
  assert.equal(body.activity_key, 'team-gaming')
  assert.equal(body.category, 'gaming')
  assert.equal(body.gender_mode, 'female_only')
  assert.equal(body.scope_type, 'school')
  assert.equal(body.schedule_status, 'schedule_pending')
  assert.equal(body.place_name, null)
  assert.deepEqual(Object.keys(body).sort(), ['category', 'title', 'description', 'place_name', 'scheduled_at', 'ends_at', 'schedule_status', 'capacity', 'gender_mode', 'scope_type', 'activity_key', 'idempotency_key'].sort())
  assert.deepEqual(f.replacements, ['/meetups/20000000-0000-4000-8000-000000000001?created=1'])
})

test('confirmed creation replaces the form once, without refresh, and stays locked until navigation unmounts it', async () => {
  const href = context.buildContextualMeetupCreateHref({ activityKey: 'team-gaming', genderMode: 'all' })
  const f = fixture('components/meetups/CreateMeetupForm.tsx', { query: params(href).toString() })
  await f.next(); await f.next(); await f.next()
  assert.deepEqual(f.navigation, [{ type: 'replace', href: '/meetups/20000000-0000-4000-8000-000000000001?created=1' }])
  assert.equal(f.find(node => node?.type === 'button' && node.props.type === 'submit').props.disabled, true)
  assert.equal(f.find(node => node?.type === 'button' && text(node) === 'common.back').props.disabled, true)
  await f.next()
  assert.equal(f.requests.length, 1, 'late or duplicate submit events cannot republish during navigation')
  assert.equal(f.navigation.length, 1)
})

test('network, HTTP and malformed-success failures unlock retry while preserving the same idempotency key', async () => {
  const href = context.buildContextualMeetupCreateHref({ activityKey: 'team-gaming', genderMode: 'all' })
  for (const failure of [
    new Error('offline'),
    { ok: false, status: 503, json: async () => ({ error: 'community_unavailable' }) },
    { ok: true, status: 200, json: async () => ({ meetup: { id: 'invalid' } }) },
  ]) {
    const f = fixture('components/meetups/CreateMeetupForm.tsx', { query: params(href).toString(), responses: [failure] })
    await f.next(); await f.next(); await f.next()
    assert.equal(f.navigation.length, 0)
    assert.equal(f.find(node => node?.type === 'button' && node.props.type === 'submit').props.disabled, false)
    assert.ok(f.find(node => node?.props?.role === 'alert'))
    await f.next()
    assert.equal(f.requests.length, 2)
    assert.equal(JSON.parse(f.requests[0].options.body).idempotency_key, JSON.parse(f.requests[1].options.body).idempotency_key)
    assert.deepEqual(f.navigation, [{ type: 'replace', href: '/meetups/20000000-0000-4000-8000-000000000001?created=1' }])
  }
})

test('contextual studies remain free-topic creation and activity changes are explicit', () => {
  const href = context.buildContextualMeetupCreateHref({ category: 'study', genderMode: 'all', topicGroup: 'language' })
  const f = fixture('components/meetups/CreateMeetupForm.tsx', { query: params(href).toString() })
  assert.match(text(f.tree), /자유 주제/)
  assert.match(text(f.tree), /어학 스터디/)
  assert.equal(f.find(node => node?.type === 'a' && String(node.props.href).includes('/meetups/department/courses')), undefined)
  f.click('활동 바꾸기')
  assert.ok(f.find(node => node?.props?.['aria-label'] === '어떤 종류의 모임인가요?'))
  assert.ok(f.find(node => node?.type === 'button' && text(node) === '어학' && node.props['aria-pressed'] === true))
})

test('detail return links derive only from a known server-confirmed school activity and gender', () => {
  for (const idea of catalog.featuredMeetupIdeas) {
    for (const gender_mode of ['all', 'male_only', 'female_only']) {
      const link = context.getMeetupDetailBackLink({ scope_type: 'school', category: idea.category, activity_key: idea.id, gender_mode })
      assert.equal(link.href, `/meetups/activities/${idea.id}/rooms?gender_mode=${gender_mode}`)
      assert.equal(link.label, '활동 모임방으로')
    }
  }
  for (const room of [
    {}, { scope_type: 'school', activity_key: null, gender_mode: 'all' },
    { scope_type: 'department', category: 'other', activity_key: 'campus-small-shop', gender_mode: 'all' },
    { scope_type: 'school', category: 'other', activity_key: 'unknown', gender_mode: 'all' },
    { scope_type: 'school', category: 'other', activity_key: 'campus-small-shop', gender_mode: 'admin' },
    { scope_type: 'school', category: 'other', activity_key: 'campus-small-shop', gender_mode: 'mixed' },
    { scope_type: 'school', category: 'gaming', activity_key: 'campus-small-shop', gender_mode: 'all' },
    { scope_type: 'school', category: 'other', activity_key: '//outside.example', gender_mode: 'all', from: 'https://outside.example' },
  ]) assert.deepEqual(context.getMeetupDetailBackLink(room), { href: '/meetups', label: '모임 목록' })
})

test('rendered successful detail goes back to its activity while chat-only and legacy detail stay unchanged', () => {
  function render(room, chatOnly = false) {
    let first = true
    return fixture('components/meetups/MeetupDetailExperience.tsx', {
      props: { meetupId: room.id, chatOnly },
      overrides: {
        react: { useState(initial) { const value = first ? room : initial; first = false; return [value, () => {}] }, useRef: initial => ({ current: initial }), useMemo: fn => fn(), useCallback: fn => fn, useEffect() {} },
        '@/lib/chat/useSocialChatRead': { useSocialChatRead() {} }, '@/lib/chat/social-room-presentation': { socialChatHref: () => '/chat' },
        '@/lib/community/meetup-place': { projectLegacyMeetupPlace: () => null },
        '@/components/places/PlaceLinks': { default: 'place-links' }, '@/components/chat-polls/ActivityRoomPolls': { default: 'polls' },
        '@/components/chat/SocialMessenger': { default: 'messenger', SocialChatComposer: 'composer' },
        './LiveActivityGuide': { default: 'guide' }, './MeetupApplications': { default: 'applications' }, './MeetupCreatedNotice': { default: 'created-notice' },
      },
    })
  }
  const room = { id: '20000000-0000-4000-8000-000000000001', category: 'other', activity_key: 'campus-small-shop', gender_mode: 'female_only', scope_type: 'school', title: '같이 구경해요', description: '', place_name: null, scheduled_at: null, ends_at: null, schedule_status: 'schedule_pending', status: 'open', joined: false, is_host: false, member_count: 1, capacity: 6, members: [], events: [] }
  const f = render(room)
  assert.equal(f.find(node => node?.type === 'a' && text(node) === '활동 모임방으로').props.href, '/meetups/activities/campus-small-shop/rooms?gender_mode=female_only')
  assert.equal(f.find(node => node?.type === 'a' && text(node) === '보증금 확인하고 참가 신청').props.href, '/meetups/' + room.id + '/apply')
  const legacy = render({ ...room, activity_key: null })
  assert.equal(legacy.find(node => node?.type === 'a' && text(node) === '모임 목록').props.href, '/meetups')
  const chat = render({ ...room, joined: true }, true)
  assert.ok(chat.find(node => node?.type === 'messenger'))
  assert.equal(chat.find(node => node?.type === 'a' && text(node) === '활동 모임방으로'), undefined)
  const deniedChat = render(room, true)
  assert.equal(deniedChat.find(node => node?.type === 'a' && text(node) === '모임 목록').props.href, '/meetups')
  assert.equal(deniedChat.find(node => node?.type === 'a' && text(node) === '활동 모임방으로'), undefined)
})
