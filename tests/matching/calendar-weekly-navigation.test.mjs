import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]
const eventId = 'b1b496aa-aead-4e2e-b2c5-882b76d23eb6'
const Link = () => null
const Explorer = () => null
const Controls = () => null

async function load(path, deps = {}, fetch = () => assert.fail('Unexpected request')) {
  const source = await readFile(new URL('../../' + path, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText
  const exports = {}
  new Function('exports', 'require', 'fetch', compiled)(exports, name => {
    assert.ok(Object.hasOwn(deps, name), `Unexpected dependency ${name}`)
    return deps[name]
  }, fetch)
  return exports
}

async function navigation() {
  const weekly = await load('lib/matching/weekly-availability.ts')
  const calendar = await load('lib/matching/calendar-navigation.ts')
  const nav = await load('lib/matching/weekly-navigation.ts', {
    './weekly-availability': weekly, './calendar-navigation': calendar,
  })
  return { weekly, calendar, nav }
}

function hooks(initialStates = []) {
  const state = [...initialStates], effects = []
  let index = 0
  return {
    state, effects, reset: () => { index = 0 },
    react: {
      useState(initial) { const key = index++; if (!(key in state)) state[key] = initial; return [state[key], value => { state[key] = typeof value === 'function' ? value(state[key]) : value }] },
      useRef: initial => ({ current: initial }), useCallback: fn => fn, useMemo: fn => fn(),
      useEffect: fn => { effects.push(fn) },
    },
  }
}

test('calendar assigned-result link preserves the event week in Korea time across year boundaries', async () => {
  const { calendar, nav } = await navigation()
  const h = hooks([{ status: 'assigned', applicationFinalized: true, refundState: 'unavailable' }, [], 'ready', 0, '', false, false])
  const component = await load('components/matching/CalendarParticipation.tsx', {
    'react/jsx-runtime': jsx, react: h.react, 'next/link': Link, 'lucide-react': {},
    '@/lib/matching/event-calendar': {}, '@/lib/matching/calendar-navigation': calendar,
    '@/lib/matching/weekly-navigation': nav,
    './CalendarReadinessGate': { useCalendarReadiness: () => ({ value: { status: 'ready' } }) }, './match-journey.module.css': {},
  })
  for (const [startsAt, expectedWeek, expectedMonth] of [
    ['2026-09-27T15:00:00Z', '2026-09-28', '2026-09'],
    ['2026-12-31T15:00:00Z', '2026-12-28', '2027-01'],
    ['2027-01-03T15:00:00Z', '2027-01-04', '2027-01'],
  ]) {
    h.reset()
    const tree = component.default({ event: { id: eventId, audience: 'single', title: '선택 행사', startsAt }, preview: true })
    const link = nodes(tree).find(node => node.type === Link && node.props.href.startsWith('/match/weekly'))
    assert.ok(link)
    const url = new URL(link.props.href, 'https://quantum.test')
    assert.equal(url.searchParams.get('week_key'), expectedWeek)
    assert.equal(url.searchParams.get('month'), expectedMonth)
    assert.equal(url.searchParams.get('event'), eventId)
  }
})

async function pageFixture() {
  const { nav } = await navigation()
  return load('app/match/weekly/page.tsx', {
    'react/jsx-runtime': jsx, 'next/link': Link, 'lucide-react': {},
    'next/navigation': { notFound: () => { throw Error('not_found') } },
    '@/lib/matching/weekly-navigation': nav,
    '@/components/matching/WeeklyActivityExplorer': Explorer,
  })
}

test('weekly page forwards the selected Monday and returns to the selected calendar event after cancellation', async () => {
  const page = await pageFixture()
  const tree = await page.default({ searchParams: Promise.resolve({ week_key: '2026-12-28', month: '2027-01', event: eventId }) })
  assert.equal(nodes(tree).find(node => node.type === Explorer).props.weekKey, '2026-12-28')
  assert.equal(nodes(tree).find(node => node.type === Explorer).props.calendarHref, nodes(tree).find(node => node.type === Link).props.href)
  const href = nodes(tree).find(node => node.type === Link).props.href
  const back = new URL(href, 'https://quantum.test')
  assert.equal(back.pathname, '/match/calendar')
  assert.equal(back.searchParams.get('month'), '2027-01')
  assert.equal(back.searchParams.get('event'), eventId)
  assert.equal(back.searchParams.get('audience'), 'single')
  assert.equal(back.searchParams.get('step'), 'participation')
})

test('weekly page rejects invalid dates, non-Mondays and repeated week parameters', async () => {
  const page = await pageFixture()
  for (const week_key of ['2026-09-29', '2026-02-30', '', 'https://evil.test', ['2026-09-28', '2026-10-05']]) {
    await assert.rejects(async () => page.default({ searchParams: Promise.resolve({ week_key }) }), /not_found/)
  }
})

test('weekly page keeps current-week entry and ignores unsafe return URLs', async () => {
  const page = await pageFixture()
  const tree = await page.default({ searchParams: Promise.resolve({ returnTo: 'https://evil.test', event: '//evil.test', month: '2027-99' }) })
  assert.equal(nodes(tree).find(node => node.type === Explorer).props.weekKey, undefined)
  assert.equal(nodes(tree).find(node => node.type === Link).props.href, '/match/calendar')
})

function discovery(week = '2026-09-28', status = null) {
  return { server_now: '2026-09-15T01:00:00Z', week_key: week, windows: [], application: status ? {
    id: 'application', activity_id: 'activity', week_key: week, status, revision: 1,
    candidate_window_ids: [], assigned_window_id: null, assigned_occurrence_id: null,
    party: { type: 'solo', size: 1, accepted_count: 1, pending_count: 0, my_role: 'owner', my_consent_status: 'accepted' },
  } : null }
}

async function explorerFixture(payload, weekKey = '2026-09-28') {
  const h = hooks(), calls = []
  const component = await load('components/matching/WeeklyActivityExplorer.tsx', {
    'react/jsx-runtime': jsx, react: h.react, 'next/image': () => null, 'next/link': Link, 'lucide-react': {},
    '@/components/matching/ScheduledContinuationStartButton': () => null,
    '@/components/matching/WeeklyPartyControls': Controls,
    '@/lib/matching/continuation-journey-client': {},
  }, async (url, options) => { calls.push({ url, options }); return Response.json(payload) })
  component.default({ weekKey })
  h.effects[0]()
  await new Promise(resolve => setImmediate(resolve))
  return { component, h, calls, props: { weekKey } }
}

test('weekly explorer requests the selected week instead of silently loading this week', async () => {
  const f = await explorerFixture(discovery())
  assert.equal(f.calls[0].url, '/api/match/weekly-availability?week_key=2026-09-28')
  assert.equal(f.h.state[0]?.week_key, '2026-09-28')
})

test('weekly view sends new or cancelled applications to the paid calendar flow and never posts a free application',async()=>{
  for(const status of [null,'cancelled']){
    const f=await explorerFixture(discovery('2026-09-28',status))
    f.h.reset()
    const href='/match/calendar?audience=single&month=2026-09&event='+eventId+'&step=participation'
    const tree=f.component.default({...f.props,calendarHref:href})
    assert.equal(nodes(tree).some(node=>node.type===Controls),false)
    assert.equal(nodes(tree).find(node=>node.type===Link)?.props.href,href)
    assert.equal(f.calls.some(call=>call.options?.method==='POST'),false)
    assert.ok(JSON.stringify(tree).includes('보증금'))
  }
})

test('weekly API errors explain the paid calendar boundary as a conflict instead of an opaque server failure',async()=>{
  const {weekly}=await navigation()
  for(const message of ['calendar_payment_not_ready','calendar_payment_conflict'])
    assert.deepEqual(weekly.mapWeeklyAvailabilityRpcError({message}),{status:409,error:'calendar_payment_required'})
})

test('weekly explorer rejects a valid response belonging to a different week', async () => {
  const f = await explorerFixture(discovery('2026-09-14'))
  assert.equal(f.h.state[0], null)
  assert.match(f.h.state[5], /불러오지 못했어요/)
})

test('cancel and consent responses must stay in the selected week; reload preserves it', async () => {
  const f = await explorerFixture(discovery('2026-09-28', 'active'))
  f.h.reset()
  const tree = f.component.default(f.props)
  const controls = nodes(tree).find(node => node.type === Controls)
  assert.ok(controls)
  assert.equal(controls.props.onDiscovery(discovery('2026-10-05', 'cancelled')), false)
  assert.equal(f.h.state[0].application.status, 'active')
  assert.equal(controls.props.onDiscovery(discovery('2026-09-28', 'cancelled')), true)
  assert.equal(f.h.state[0].application.status, 'cancelled')
  controls.props.onNotice('다시 확인', true)
  f.h.reset()
  const next = f.component.default(f.props)
  const reload = nodes(next).find(node => node.type === 'button' && node.props.children === '다시 불러오기')
  assert.ok(reload)
  reload.props.onClick()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.calls.at(-1).url, '/api/match/weekly-availability?week_key=2026-09-28')
})
