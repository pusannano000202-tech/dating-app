import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import test from 'node:test'
import React from 'react'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '../..')
const nodeRequire = createRequire(import.meta.url)
function harness(file, { overrides = {}, initial = [], params = '' } = {}) {
  const slots = [], effects = [], cache = new Map()
  let cursor = 0, first = true
  const hooks = {
    ...React,
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = i in initial ? initial[i] : typeof value === 'function' ? value() : value; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next }] },
    useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i] },
    useEffect(effect) { if (first) effects.push(effect) },
    useCallback: fn => fn,
  }
  function load(path) {
    if (cache.has(path)) return cache.get(path)
    const loaded = { exports: {} }; cache.set(path, loaded.exports)
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    const require = name => {
      if (name in overrides) return overrides[name]
      if (name === 'react') return hooks
      if (name === 'next/navigation') return { useRouter: () => ({ push() {}, replace() {} }), useSearchParams: () => new URLSearchParams(params) }
      if (name === 'next/link' || name === 'next/image') return { __esModule: true, default: name === 'next/link' ? 'a' : 'img' }
      if (name.includes('QuantumLocaleProvider')) return { useQuantumLocale: () => ({ locale: 'ko', t: key => key }) }
      if (name.includes('LanguagePicker') || name.includes('PhoneVerificationPanel') || name.includes('BootingLogo')) return { __esModule: true, default: () => null }
      if (name === '@/lib/supabase') return { createClient: () => ({ auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } }) }
      if (name === '@/lib/chat/useSocialChatRead') return { useSocialChatRead() {} }
      if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? resolve(root, name.slice(2)) : resolve(dirname(path), name)
        const target = [base, `${base}.ts`, `${base}.tsx`].find(candidate => existsSync(candidate))
        if (target?.endsWith('.json')) return JSON.parse(readFileSync(target, 'utf8'))
        return load(target)
      }
      return nodeRequire(name)
    }
    new Function('require', 'module', 'exports', code)(require, loaded, loaded.exports)
    cache.set(path, loaded.exports); return loaded.exports
  }
  const loadedModule = load(resolve(root, file))
  let Component = loadedModule.default
  if (file.endsWith('MentoringExperience.tsx')) {
    // Follow the production entry selector: ordinary visits use hosted rooms;
    // legacy=1 and existing invitation/session links retain the original flow.
    const entry = Component({}).props.children
    Component = entry.type({}).type
  }
  return {
    module: loadedModule,
    effects,
    render(props = {}) { cursor = 0; const tree = Component(props); first = false; return tree },
  }
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  return [tree, ...nodes(tree.props?.children)]
}
function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree)
  if (!tree || typeof tree !== 'object') return ''
  return (Array.isArray(tree) ? tree : [tree.props?.children]).map(text).join(' ')
}
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && text(node).includes(label))
const settle = () => new Promise(resolve => setImmediate(resolve))

test('course filter storage rejects malformed values and supports all-year selection', () => {
  const { parseStudyDiscoveryPreferences: parse } = harness('lib/meetups/study-discovery-preferences.ts').module
  assert.deepEqual(parse('{"department":"기계공학부"}'), { department: '기계공학부' })
  assert.deepEqual(parse('{"department":"기계공학부","year":2}'), { department: '기계공학부', year: 2 })
  for (const value of [null, '', '{}', '[]', 'not JSON', '{"department":"기계","year":0}', '{"department":"기계","year":99}', '{"department":"기계","year":"2"}', JSON.stringify({ department: 'a'.repeat(121) }), JSON.stringify({ department: '기계\u0000' })]) assert.equal(parse(value), null)
})

test('course support reports actual partial coverage rather than treating every listed department as mapped', () => {
  const { getStudyCatalogCoverage, getDepartmentCourseSuggestions, getDepartmentStudyCoverage } = harness('lib/meetups/study-catalog.ts').module
  const coverage = getStudyCatalogCoverage()
  assert.equal(coverage.registeredDepartments, 133)
  const expectedCounts = { '미래에너지전공': 62, '첨단융합학부': 11, '컴퓨터공학전공': 56, '인공지능전공': 52, '경영학과': 13, '통계학과': 32, '관광컨벤션학과': 43, '수학과': 47 }
  assert.deepEqual([...coverage.supportedDepartments].sort(), Object.keys(expectedCounts).sort())
  const uniqueCourses = new Set()
  for (const [department, count] of Object.entries(expectedCounts)) {
    const suggestions = getDepartmentCourseSuggestions({ department })
    assert.equal(suggestions.length, count, department)
    assert.equal(getDepartmentStudyCoverage(department).courseCount, count, department)
    suggestions.forEach(({ course }) => uniqueCourses.add(course.id))
  }
  assert.equal(uniqueCourses.size, 305, 'shared courses retain one canonical recruitment identity')
  assert.equal(coverage.verifiedCourses, uniqueCourses.size)
  const sources = JSON.parse(readFileSync(resolve(root, 'docs/research/pnu-curriculum-20260913.json'), 'utf8'))
  for (const { code, title, year, semesters } of sources.math.rows) {
    for (const semester of semesters) {
      const course = getDepartmentCourseSuggestions({ department: '수학과', year, semester }).filter(row => row.course.code === code)
      assert.equal(course.length, 1, `${code} ${year}-${semester}`)
      assert.equal(course[0].course.title, title)
    }
  }
  assert.equal(getDepartmentStudyCoverage('수학과').curriculumYear, 2026)
  assert.equal(getDepartmentStudyCoverage('기계공학부'), null)
  assert.deepEqual(getDepartmentCourseSuggestions({ department: '기계공학부', year: 2 }), [])
})

test('the audited MUKU asset is classified as a logo without replacing its source or borrowing another photo', () => {
  const { PNU_CAMPUS_EATS_CATEGORIES } = harness('lib/campus-eats/fixtures/pnu-categories.ts').module
  const muku = PNU_CAMPUS_EATS_CATEGORIES.find(category => category.id === 'donkatsu').candidates.find(candidate => candidate.canonicalStoreId === 'pnu:store:001')
  assert.equal(muku.imageKind, 'logo')
  assert.equal(muku.imageSrc, '/campus-eats/restaurants/001.webp')
  assert.match(muku.imageAlt, /음식 사진 아님/)
  assert.equal(muku.sourceSha256, '389126967a473bd6defc8ee286a9cc1cb588ffcad9518d97ff8d4e13dea58261')
})

test('course selection survives a room return and wins over profile defaults', async () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const previous = { window: globalThis.window, sessionStorage: globalThis.sessionStorage, localStorage: globalThis.localStorage, fetch: globalThis.fetch }
  globalThis.window = { setTimeout, clearTimeout, requestAnimationFrame: callback => callback() }
  globalThis.sessionStorage = storage
  globalThis.localStorage = storage
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ profile: { department: '미래에너지전공', year: 1 } }) })
  try {
    const first = harness('components/meetups/DepartmentCourseDiscovery.tsx')
    first.render(); first.effects.forEach(effect => effect()); await settle()
    let tree = first.render()
    button(tree, '미래에너지전공').props.onClick(); tree = first.render()
    nodes(tree).find(node => node.type === 'input' && node.props.id === 'study-department').props.onChange({ target: { value: '기계공학부' } })
    tree = first.render(); button(tree, '기계공학부').props.onClick()
    tree = first.render(); button(tree, '2학년').props.onClick()
    first.render()
    const returned = harness('components/meetups/DepartmentCourseDiscovery.tsx')
    returned.render(); returned.effects.forEach(effect => effect()); await settle()
    tree = returned.render()
    assert.ok(text(button(tree, '기계공학부')).includes('기계공학부'))
    assert.equal(button(tree, '2학년').props['aria-pressed'], true)
  } finally { Object.assign(globalThis, previous) }
})

test('legacy mentoring preserves recovery but cannot start retired parties instead of hosted rooms', () => {
  const initial = [null, 'mentor', 2, 'friends', [], false, false, 'unavailable']
  const ui = harness('components/meetups/MentoringExperience.tsx', { initial, params: 'legacy=1' })
  const tree = ui.render()
  assert.ok(!text(tree).includes('mentor.noFriends'))
  assert.equal(button(tree, 'mentor.soloStart'), undefined)
  assert.equal(button(tree, 'mentor.inviteStart'), undefined)
  const status = nodes(tree).find(node => node.props?.role === 'alert')
  assert.ok(text(status).includes('mentor.unavailable'))
  assert.ok(button(status, 'mentor.refresh'))
  assert.ok(nodes(tree).some(node => node.props?.href === '/meetups/department/mentoring' && text(node).includes('멘토링 모집방 보기')))
})

test('legacy demo does not describe unknown friends as empty and ties its disabled action to recovery', () => {
  const initial = [null, 'mentor', 2, 'friends', [], false, false, 'unavailable']
  const ui = harness('components/meetups/MentoringExperience.tsx', { initial, params: 'legacy=1' })
  const tree = ui.render({ demo: true })
  assert.ok(!text(tree).includes('mentor.noFriends'))
  const start = button(tree, 'mentor.soloStart')
  assert.ok(start, 'the demo retains the old action without reopening it to production')
  assert.equal(start.props.disabled, true)
  assert.ok(start.props['aria-describedby'])
  const status = nodes(tree).find(node => node.props?.id === start.props['aria-describedby'])
  assert.ok(status)
  assert.ok(button(status, 'mentor.refresh'))
})

test('default hosted mentoring recovers failed owner-bound data without treating unknown rooms as empty or submitting', async () => {
  const owner = '11111111-1111-4111-8111-111111111111'
  const otherOwner = '22222222-2222-4222-8222-222222222222'
  const previous = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch }
  const requests = [], cleanups = []
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }
  globalThis.fetch = async (url, init) => {
    requests.push({ url, method: init?.method ?? 'GET' })
    assert.equal(url, '/api/mentoring/rooms')
    assert.equal(init?.method ?? 'GET', 'GET', 'recovery must not create or join a room')
    return { ok: requests.length > 1, status: requests.length === 1 ? 503 : 200, json: async () => requests.length === 1 ? { error: 'unavailable' } : { data: { owner_id: requests.length === 2 ? otherOwner : owner, rooms: [] } } }
  }
  try {
    const ui = harness('components/meetups/MentoringExperience.tsx', { overrides: {
      '@/components/content-history/useHistoryAccount': { useHistoryAccount: () => owner },
      '@/lib/utils': { isSupabaseConfigured: () => true },
    } })
    let tree = ui.render()
    assert.ok(text(tree).includes('우리 과에서 함께 나눠요.'), 'the default entry is the hosted room lobby')
    cleanups.push(...ui.effects.map(effect => effect()).filter(cleanup => typeof cleanup === 'function'))
    await settle()
    tree = ui.render()
    const rolePicker = nodes(tree).find(node => node.type?.name === 'MentoringRolePicker')
    assert.ok(rolePicker)
    button(rolePicker.type(rolePicker.props), '경험을').props.onClick()
    tree = ui.render()
    assert.ok(!text(tree).includes('이 역할로 신청할 수 있는 모임이 아직 없어요.'), 'failed reads are not an empty list')
    function connection(currentTree) {
      const node = nodes(currentTree).find(item => item.type?.name === 'HostedConnection')
      assert.ok(node)
      return node.type(node.props)
    }
    assert.equal(connection(tree).props.role, 'alert')
    assert.ok(button(connection(tree), '다시 확인'))
    button(tree, '내 이야기로 모임 열기').props.onClick()
    tree = ui.render()
    nodes(tree).find(node => node.type === 'input' && node.props.maxLength === 60).props.onChange({ target: { value: '복구해도 유지할 이야기' } })
    tree = ui.render()
    assert.equal(button(tree, '방 만들고 채팅 열기').props.disabled, true)
    nodes(tree).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} })
    await settle()
    assert.equal(requests.length, 1, 'a forced form event still cannot submit without verified data')
    button(connection(tree), '다시 확인').props.onClick()
    await settle(); tree = ui.render()
    assert.equal(connection(tree).props.role, 'alert', 'another owner response is still unavailable')
    assert.equal(button(tree, '방 만들고 채팅 열기').props.disabled, true)
    button(connection(tree), '다시 확인').props.onClick()
    await settle(); tree = ui.render()
    assert.equal(requests.length, 3)
    assert.equal(connection(tree), null, 'the real owner response clears the recovery error')
    assert.equal(button(tree, '방 만들고 채팅 열기').props.disabled, false)
    assert.equal(nodes(tree).find(node => node.type === 'input' && node.props.maxLength === 60).props.value, '복구해도 유지할 이야기')
    assert.ok(text(tree).includes('경험을 나눌래요'), 'the role choice survives retries')
    assert.ok(!text(tree).includes('mentor.soloStart'), 'ordinary visits do not silently resume legacy matching')
    assert.ok(requests.every(request => request.method === 'GET'))
  } finally {
    cleanups.forEach(cleanup => cleanup())
    Object.assign(globalThis, previous)
  }
})

test('voice preserves consent and explains unavailable status next to final action', () => {
  const ui = harness('components/voice/VoiceRandom.tsx', { initial: ['general', 'listener', false, true, true, '', { key: 'general', state: { phase: 'error', refreshing: false, data: null, error: '연결을 확인하지 못했어요.' } }], overrides: {
    './VoiceGlobalProvider': { useVoiceGlobal: () => ({ runtime: null, phase: 'error', connection: 'disconnected', refresh() {}, cancelWaiting() {}, openVoiceSession() {}, sessionCommand() {}, busy: false }) },
  } })
  const tree = ui.render()
  const start = button(tree, '대화 상대 찾기')
  assert.equal(start.props.disabled, true)
  assert.ok(start.props['aria-describedby'])
  const status = nodes(tree).find(node => node.props?.id === start.props['aria-describedby'])
  assert.ok(status)
  assert.ok(button(status, '다시 확인'))
  assert.ok(text(status).includes('선택'))
  assert.equal(nodes(tree).find(node => node.type === 'input' && node.props.type === 'checkbox').props.checked, true)
  assert.ok(!nodes(tree).some(node => node.props?.['aria-label'] === '대화 상대 대기 중'))
})

test('redirect login opens methods immediately while ordinary entry retains introduction', () => {
  const overrides = { '@/lib/utils': { getSupabaseConfigIssue: () => null, getPublicAppOrigin: () => 'https://quantum.invalid' } }
  const direct = harness('app/(auth)/login/page.tsx', { params: 'redirect=%2Fchat%3Ftab%3Dfriends', overrides })
  // LoginPage is a Suspense wrapper; inspect its rendered child in a separate hook scope.
  function loginTree(h) { const wrapper = h.render(); return wrapper.props.children.type() }
  const directTree = loginTree(direct)
  assert.ok(button(directTree, '카카오로 계속하기'))
  assert.ok(!button(directTree, '지금 과팅 시작하기'))
  assert.ok(nodes(directTree).some(node => node.props?.href === '/chat?tab=friends' && node.props?.['aria-label'] === '보고 있던 화면으로 돌아가기'))
  const ordinary = harness('app/(auth)/login/page.tsx', { overrides })
  assert.ok(button(loginTree(ordinary), '지금 과팅 시작하기'))
  const unsafe = harness('app/(auth)/login/page.tsx', { overrides, params: 'redirect=https%3A%2F%2Foutside.invalid' })
  assert.ok(button(loginTree(unsafe), '지금 과팅 시작하기'))
  assert.ok(!nodes(loginTree(unsafe)).some(node => node.props?.href === 'https://outside.invalid'))
})

test('hot posts expose retry after failure and recover in place; auth has a return link', async () => {
  const previous = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; return { ok: calls > 1, status: calls === 1 ? 503 : 200, json: async () => ({ posts: [] }) } }
  try {
    const ui = harness('components/community/HotCommunityBoard.tsx')
    ui.render(); ui.effects.forEach(effect => effect()); await settle()
    let tree = ui.render()
    const retry = button(tree, '다시 시도')
    assert.ok(retry)
    retry.props.onClick(); await settle(); tree = ui.render()
    assert.equal(calls, 2)
    assert.ok(!button(tree, '다시 시도'))
    globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) })
    const auth = harness('components/community/HotCommunityBoard.tsx')
    auth.render(); auth.effects.forEach(effect => effect()); await settle()
    assert.ok(nodes(auth.render()).some(node => node.props?.href === '/login?redirect=%2Fcommunity%2Fhot'))
  } finally { globalThis.fetch = previous }
})

test('hot posts ignore a response after leaving the page', async () => {
  const previous = globalThis.fetch
  let resolveResponse
  globalThis.fetch = () => new Promise(resolve => { resolveResponse = resolve })
  try {
    const ui = harness('components/community/HotCommunityBoard.tsx')
    ui.render(); const cleanup = ui.effects[0]()
    cleanup()
    resolveResponse({ ok: true, status: 200, json: async () => ({ posts: [] }) })
    await settle()
    assert.ok(text(ui.render()).includes('핫 게시글을 모으고 있어요.'))
  } finally { globalThis.fetch = previous }
})
