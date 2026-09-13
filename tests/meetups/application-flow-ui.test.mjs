import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import test from 'node:test'
import React from 'react'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '../..')
const nodeRequire = createRequire(import.meta.url)
const file = 'components/meetups/MeetupApplicationFlow.tsx'
const id = '10000000-0000-4000-8000-000000000001'
const room = { kind: 'study', id }
const quote = { id, room, amountKrw: 10000, currency: 'KRW', policyVersion: 'verified-v1', expiresAt: '2099-01-01T00:00:00.000Z', paymentMethods: ['new', 'carryover'] }
const props = { room, meetup: { title: '공학미적분학 같이 풀어요', activityLabel: '전공 공부', imageSrc: '/social-scenes/course-calculus.png', summary: '막혔던 한 문제를 함께 풀어요.', scheduleLabel: '화요일 오후 7시', locationLabel: '부산대 도서관' }, accountKey: 'account-a', quote, policy: { summary: '실제 제공된 정책 요약', conditions: ['서버에서 확인한 반환 조건', '서버에서 확인한 취소 조건'] }, onCancel() {} }
function harness(initialProps = props) {
  const slots = [], cache = new Map(), pending = []
  let cursor = 0, currentProps = initialProps
  const hooks = { ...React,
    useState(value) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next }] },
    useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i] },
    useId() { const i = cursor++; return `test-${i}` },
    useEffect(fn, deps) { const i = cursor++; const old = slots[i]; if (!old || !deps || deps.some((v, j) => !Object.is(v, old.deps[j]))) { pending.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() } }) } },
    useCallback: fn => fn,
    useMemo: fn => fn(),
  }
  function load(path) {
    if (cache.has(path)) return cache.get(path)
    const module = { exports: {} }; cache.set(path, module.exports)
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    const require = name => {
      if (name === 'react') return hooks
      if (name === 'next/image') return { __esModule: true, default: 'img' }
      if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }
      if (name.startsWith('@/') || name.startsWith('.')) { const base = name.startsWith('@/') ? resolve(root, name.slice(2)) : resolve(dirname(path), name); return load([base, `${base}.ts`, `${base}.tsx`].find(existsSync)) }
      return nodeRequire(name)
    }
    new Function('require', 'module', 'exports', code)(require, module, module.exports)
    cache.set(path, module.exports); return module.exports
  }
  const Component = load(resolve(root, file)).default
  return { render(next = currentProps) { currentProps = next; cursor = 0; let tree = Component(next); if (pending.length) { pending.splice(0).forEach(fn => fn()); cursor = 0; tree = Component(next) } return tree }, dispose() { slots.forEach(slot => slot?.cleanup?.()) } }
}
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; if (Array.isArray(tree)) return tree.flatMap(nodes); return [tree, ...nodes(tree.props?.children)] }
function text(tree) { if (typeof tree === 'string' || typeof tree === 'number') return String(tree); if (!tree || typeof tree !== 'object') return ''; return (Array.isArray(tree) ? tree : [tree.props?.children]).map(text).join(' ') }
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && text(node).includes(label))
const field = (tree, name) => nodes(tree).find(node => node.props?.name === name)
const settle = () => new Promise(resolve => setImmediate(resolve))
function enterDeposit(h) { let tree = h.render(); assert.ok(field(tree, 'intro'), 'intro must be an accessible named input'); field(tree, 'intro').props.onChange({ target: { value: '같이 꾸준히 공부하고 싶어요' } }); tree = h.render(); button(tree, '보증금 확인하기').props.onClick(); return h.render() }
function consent(h) { let tree = h.render(); nodes(tree).find(node => node.type === 'details').props.onToggle({ currentTarget: { open: true } }); tree = h.render(); field(tree, 'consent').props.onChange({ target: { checked: true } }); return h.render() }

test('introduction advances to mandatory deposit, read-policy and explicit consent gate submission', () => {
  const h = harness({ ...props, onSubmit: async () => ({ applicationId: id, admission: 'submitted', payment: 'held' }) })
  try {
    let tree = h.render(); assert.ok(button(tree, '보증금 확인하기')); assert.equal(button(tree, '보증금 확인하기').props.disabled, true)
    tree = enterDeposit(h); assert.match(text(tree), /10,000/); assert.equal(button(tree, '동의하고 결제·신청').props.disabled, true)
    assert.equal(field(tree, 'consent').props.disabled, true)
    tree = consent(h); assert.equal(button(tree, '동의하고 결제·신청').props.disabled, false)
    assert.ok(nodes(tree).some(node => node.type === 'h1' && node.props.tabIndex === -1))
  } finally { h.dispose() }
})
test('approved new amount is visible without inventing configured policy, and older different quotes cannot charge',()=>{
 const h=harness({...props,newDepositAmountKrw:10000,quote:null,policy:null})
 try{let tree=h.render();assert.match(text(tree),/10,000\s*원/);tree=enterDeposit(h);assert.match(text(tree),/10,000\s*원/);assert.equal(button(tree,'동의하고 결제·신청').props.disabled,true)}finally{h.dispose()}
 const old=harness({...props,newDepositAmountKrw:10000,quote:{...quote,amountKrw:17000},onSubmit:()=>assert.fail('do not charge old quote')})
 try{enterDeposit(old);const tree=consent(old);assert.match(text(tree),/17,000원/);assert.match(text(tree),/새 참가 신청 보증금은 10,000원/);assert.equal(button(tree,'동의하고 결제·신청').props.disabled,true)}finally{old.dispose()}
})

test('unknown amount and unavailable carryover never become free payment or a selectable method', () => {
  const h = harness({ ...props, quote: null })
  const other = harness({ ...props, carryover: { eligible: true, availableKrw: 9000 }, onSubmit: async () => ({ applicationId: id, admission: 'submitted', payment: 'held' }) })
  try {
    let tree = enterDeposit(h); assert.doesNotMatch(text(tree), /(?:^|\s)0원|무료/); assert.equal(button(tree, '동의하고 결제·신청').props.disabled, true)
    tree = enterDeposit(other); const carryover = nodes(tree).find(node => node.props?.name === 'paymentMethod' && node.props.value === 'carryover'); assert.equal(carryover.props.disabled, true); assert.match(text(tree), /잔액/)
  } finally { h.dispose(); other.dispose() }
})

test('duplicate submission cannot race and pending payment never shows submitted or chat access', async () => {
  let resolveRequest, calls = 0
  const h = harness({ ...props, onSubmit: () => { calls++; return new Promise(resolve => { resolveRequest = resolve }) } })
  try {
    enterDeposit(h); let tree = consent(h); const submit = button(tree, '동의하고 결제·신청'); submit.props.onClick(); submit.props.onClick(); assert.equal(calls, 1)
    tree = h.render(); assert.doesNotMatch(text(tree), /신청을 보냈어요|채팅방 들어가기/)
    resolveRequest({ applicationId: null, admission: 'draft', payment: 'pending' }); await settle(); tree = h.render()
    assert.match(text(tree), /결제 확인 중/); assert.doesNotMatch(text(tree), /신청을 보냈어요|채팅방 들어가기/)
  } finally { h.dispose() }
})

test('callback-confirmed submission waits for host approval and only confirmed approval enables chat', async () => {
  const ready = { ...props, onSubmit: async () => ({ applicationId: id, admission: 'submitted', payment: 'held' }), onOpenChat() {} }
  const h = harness(ready)
  try {
    enterDeposit(h); button(consent(h), '동의하고 결제·신청').props.onClick(); await settle(); let tree = h.render()
    assert.match(text(tree), /신청을 보냈어요/); assert.match(text(tree), /개설자 승인/); assert.equal(button(tree, '채팅방 들어가기'), undefined)
    tree = h.render({ ...ready, application: { applicationId: id, admission: 'accepted', payment: 'held' } }); assert.equal(button(tree, '채팅방 들어가기').props.disabled, false)
  } finally { h.dispose() }
})

test('payment failure preserves input and an account change discards an older asynchronous response', async () => {
  const h = harness({ ...props, onSubmit: async () => { throw new Error('payment_cancelled') } })
  let resolveRequest
  const base = { ...props, onSubmit: () => new Promise(resolve => { resolveRequest = resolve }) }
  const stale = harness(base)
  try {
    enterDeposit(h); button(consent(h), '동의하고 결제·신청').props.onClick(); await settle(); let tree = h.render(); assert.match(text(tree), /취소/)
    button(tree, '이전').props.onClick(); tree = h.render(); assert.equal(field(tree, 'intro').props.value, '같이 꾸준히 공부하고 싶어요')
    enterDeposit(stale); button(consent(stale), '동의하고 결제·신청').props.onClick(); stale.render({ ...base, accountKey: 'account-b' }); resolveRequest({ applicationId: id, admission: 'submitted', payment: 'held' }); await settle(); tree = stale.render()
    assert.doesNotMatch(text(tree), /신청을 보냈어요/); assert.equal(field(tree, 'intro').props.value, '')
  } finally { h.dispose(); stale.dispose() }
})

test('personal application introduction never enters browser storage or query-gated demo behavior', () => {
  const source = readFileSync(resolve(root, file), 'utf8')
  assert.doesNotMatch(source, /localStorage|sessionStorage|useSearchParams|URLSearchParams/)
})

test('prepared unpaid responses are never described as paid, submitted, or awaiting payment confirmation', async () => {
  const h = harness({ ...props, onSubmit: async () => ({ applicationId: null, admission: 'draft', payment: 'unpaid' }) })
  try {
    enterDeposit(h); button(consent(h), '동의하고 결제·신청').props.onClick(); await settle(); const tree = h.render()
    assert.match(text(tree), /결제 준비 상태/); assert.doesNotMatch(text(tree), /결제 확인 중|신청을 보냈어요|채팅방 들어가기/)
  } finally { h.dispose() }
})

test('an unchanged parent receipt cannot leak into another account and unknown failures block a second payment', async () => {
  const initial = { ...props, application: { applicationId: id, admission: 'accepted', payment: 'held' }, onOpenChat() {} }
  const h = harness(initial)
  const uncertain = harness({ ...props, onSubmit: async () => { throw new Error('network_timeout') } })
  try {
    assert.ok(button(h.render(), '채팅방 들어가기'))
    const switched = h.render({ ...initial, accountKey: 'account-b' }); assert.equal(button(switched, '채팅방 들어가기'), undefined)
    enterDeposit(uncertain); button(consent(uncertain), '동의하고 결제·신청').props.onClick(); await settle(); const tree = uncertain.render()
    assert.match(text(tree), /중복 결제/); assert.equal(button(tree, '동의하고 결제·신청'), undefined)
  } finally { h.dispose(); uncertain.dispose() }
})

test('changed quote resets explicit consent without losing the introduction', () => {
  const base = { ...props, onSubmit: async () => ({ applicationId: id, admission: 'submitted', payment: 'held' }) }
  const h = harness(base)
  try {
    enterDeposit(h); consent(h)
    let tree = h.render({ ...base, quote: { ...quote, amountKrw: 15000 } }); assert.equal(field(tree, 'consent').props.checked, false); assert.equal(button(tree, '동의하고 결제·신청').props.disabled, true)
    button(tree, '이전').props.onClick(); tree = h.render(); assert.equal(field(tree, 'intro').props.value, '같이 꾸준히 공부하고 싶어요')
  } finally { h.dispose() }
})

test('Unicode intro limits agree with the contract and hidden controls cannot advance', async () => {
  let sent
  const h = harness({ ...props, onSubmit: async input => { sent = input; return { applicationId: null, admission: 'draft', payment: 'pending' } } })
  try {
    let tree = h.render(); field(tree, 'intro').props.onChange({ target: { value: '숨김\u200b문자' } }); tree = h.render(); assert.equal(button(tree, '보증금 확인하기').props.disabled, true)
    field(tree, 'intro').props.onChange({ target: { value: '😀'.repeat(80) } }); field(tree, 'strength').props.onChange({ target: { value: '⚽'.repeat(120) } }); tree = h.render(); assert.equal(button(tree, '보증금 확인하기').props.disabled, false)
    button(tree, '보증금 확인하기').props.onClick(); button(consent(h), '동의하고 결제·신청').props.onClick(); await settle(); assert.equal([...sent.intro].length, 80); assert.equal([...sent.strength].length, 120)
  } finally { h.dispose() }
})

test('stopping confirmation does not invent a server payment state and preserves the duplicate-payment block', async () => {
  let done
  const h = harness({ ...props, onSubmit: () => new Promise(resolve => { done = resolve }) })
  try {
    enterDeposit(h); button(consent(h), '동의하고 결제·신청').props.onClick(); button(h.render(), '결과 확인 중단').props.onClick(); let tree = h.render()
    assert.match(text(tree), /납부 여부 확인 필요/); assert.match(text(tree), /접수 여부 확인 필요/); assert.doesNotMatch(text(tree), /신청을 보냈어요|결제 실패|보증금 납부 확인/)
    done({ applicationId: id, admission: 'submitted', payment: 'held' }); await settle(); tree = h.render(); assert.doesNotMatch(text(tree), /신청을 보냈어요/)
  } finally { h.dispose() }
})

test('eligible carryover has an explicit transfer CTA and submits the selected method without implying a new charge', async () => {
  let sent
  const h = harness({ ...props, carryover: { eligible: true, availableKrw: 10000 }, onSubmit: async input => { sent = input; return { applicationId: id, admission: 'submitted', payment: 'held' } } })
  try {
    enterDeposit(h); let tree = consent(h); nodes(tree).find(node => node.props?.name === 'paymentMethod' && node.props.value === 'carryover').props.onChange(); tree = h.render()
    assert.ok(button(tree, '동의하고 이월·신청')); assert.equal(button(tree, '동의하고 결제·신청'), undefined)
    button(tree, '동의하고 이월·신청').props.onClick(); await settle(); assert.equal(sent.paymentMethod, 'carryover')
  } finally { h.dispose() }
})
