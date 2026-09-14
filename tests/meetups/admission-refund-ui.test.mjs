import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = new URL('../../', import.meta.url)
function load(path, dependencies, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, root), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  const exports = {}
  new Function('exports','require',...Object.keys(globals),code)(exports,name => {
    assert.ok(Object.hasOwn(dependencies,name), `Blocked UI dependency ${name}`)
    return dependencies[name]
  },...Object.values(globals))
  return exports
}
const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const base = { depositId:'33333333-3333-4333-8333-333333333333',room:{kind:'study',id:other},roomTitle:'토요일 배터리 스터디',
  amountKrw:10000,payment:'refund_due',requestId:null,refundState:'available',requestedAt:null,approvedAt:null,completedAt:null,lastError:null }
const item = state => ({ ...base,refundState:state,payment:state==='unavailable'?'held':state==='completed'?'refunded':'refund_due',
  requestId:['unavailable','available'].includes(state)?null:owner,requestedAt:['unavailable','available'].includes(state)?null:'2026-09-14T01:00:00Z',
  completedAt:state==='completed'?'2026-09-14T02:00:00Z':null })
const contract = load('lib/meetups/admission-refund.ts',{})
const deps = {
  'react':require('react'),'react/jsx-runtime':require('react/jsx-runtime'),
  'next/link':{default:props=>require('react').createElement('a',props)},'lucide-react':require('lucide-react'),
  '@/components/content-history/useHistoryAccount':{useHistoryAccount:()=>owner},
  '@/lib/meetups/admission-refund':contract,
}
const ui = load('components/meetups/AdmissionRefundLedger.tsx',deps)
const card = (state,options={}) => renderToStaticMarkup(require('react').createElement(ui.AdmissionRefundCard,
  {item:item(state),onSelect:()=>{},onBack:()=>{},onConfirm:()=>{},...options}))
const tick = () => new Promise(resolve=>setImmediate(resolve))

test('admin cannot retry an exhausted or owner-unavailable refund from the UI', () => {
  for (const lastError of ['refund_attempts_exhausted', 'refund_owner_unavailable']) {
    const html = renderToStaticMarkup(require('react').createElement(ui.AdmissionRefundCard, {
      item: { ...item('failed'), lastError }, admin: true, onSelect:()=>{}, onBack:()=>{}, onConfirm:()=>{},
    }))
    assert.doesNotMatch(html, />반환 다시 처리/)
    assert.match(html, /별도로 확인|확인 전에는 다시/)
  }
})

test('cards distinguish held, available, pending, approved, failed and actual PG completion', () => {
  for (const state of ['unavailable','requested','approved','processing','failed','completed']) {
    assert.doesNotMatch(card(state),/>반환 신청하기/)
  }
  assert.match(card('available'),/>반환 신청하기/)
  assert.match(card('unavailable'),/보관 중/)
  assert.match(card('approved'),/결제사 반환은 아직 대기 중/)
  assert.doesNotMatch(card('approved'),/>반환 완료</)
  assert.match(card('completed'),/결제사에서 보증금 반환을 확인/)
  assert.match(card('available'),/토요일 배터리 스터디/)
  assert.match(card('available'),/보증금 번호/)
  assert.match(card('available'),/33333333-3333-4333-8333-333333333333/)
  assert.match(card('requested',{admin:true}),/>반환 승인하기/)
  assert.match(card('failed',{admin:true}),/>반환 다시 처리/)
  assert.doesNotMatch(card('processing',{admin:true}),/>반환 (승인하기|다시 처리)/)
})

test('confirmation states show amount and explicitly separate approval from payment completion', () => {
  assert.match(card('available',{confirm:'request'}),/10,000원 반환을 신청할까요/)
  assert.match(card('available',{confirm:'request'}),/반환 신청 확인/)
  assert.match(card('requested',{admin:true,confirm:'approve'}),/결제사 반환이 확인돼야 완료/)
  assert.match(card('requested',{admin:true,confirm:'approve',busy:true}),/disabled/)
})

test('ledger parser refuses other owners, duplicate receipts, malformed summaries and secret-bearing projection', () => {
  assert.equal(ui.parseRefundLedger({accountKey:other,refunds:[base]},owner),null)
  assert.equal(ui.parseRefundLedger({accountKey:owner,refunds:[base,base]},owner),null)
  assert.equal(ui.parseRefundLedger({accountKey:owner,refunds:[{...base,amountKrw:-1}]},owner),null)
  const parsed = ui.parseRefundLedger({accountKey:owner,refunds:[{...base,paymentKey:'private-secret',ownerId:owner}]},owner)
  assert.equal(parsed.length,1)
  assert.ok(!JSON.stringify(parsed).includes('private-secret'))
  assert.ok(!Object.hasOwn(parsed[0],'ownerId'))
})

function harness({ admin=false, getResponse, mutateResponse }={}) {
  const slots=[],effects=[],calls=[];let cursor=0,actor=owner
  const hooks = {
    useState(value){const i=cursor++;if(!(i in slots))slots[i]=typeof value==='function'?value():value;return[slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next}]},
    useRef(value){const i=cursor++;if(!(i in slots))slots[i]={current:value};return slots[i]},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))effects.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()}})},
    useCallback(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))slots[i]={deps,fn};return slots[i].fn},
  }
  const exports=load('components/meetups/AdmissionRefundLedger.tsx',{...deps,'react':hooks,
    '@/components/content-history/useHistoryAccount':{useHistoryAccount:()=>actor}}, {
    fetch:async(url,options)=>{calls.push({url,options});return options.method==='POST'
      ? mutateResponse ? mutateResponse(url,options) : Response.json({accountKey:actor,refund:item(admin?'approved':'requested')})
      : getResponse ? getResponse(url,options) : Response.json({accountKey:actor,refunds:[item(admin?'requested':'available')]})},
  })
  return { calls, render(account=actor){actor=account;cursor=0;const tree=exports.default({admin});effects.splice(0).forEach(fn=>fn());return tree},
    dispose(){slots.forEach(slot=>slot?.cleanup?.())},cardType:exports.AdmissionRefundCard }
}
function walk(node,predicate) {
  if(!node||typeof node!=='object')return null
  if(Array.isArray(node)){for(const child of node){const found=walk(child,predicate);if(found)return found}return null}
  if(predicate(node))return node
  return walk(node.props?.children,predicate)
}
const textOf = tree => {if(typeof tree==='string'||typeof tree==='number')return String(tree);if(!tree||typeof tree!=='object')return '';return Array.isArray(tree)?tree.map(textOf).join(''):textOf(tree.props?.children)}

test('real UI request requires confirmation and sends only deposit ID with the authenticated owner',async()=>{
  const f=harness()
  try {
    f.render();await tick();let tree=f.render(),card=walk(tree,node=>node.type===f.cardType)
    assert.ok(card);assert.equal(f.calls.length,1)
    card.props.onSelect('request');tree=f.render();card=walk(tree,node=>node.type===f.cardType)
    assert.equal(card.props.confirm,'request');assert.equal(f.calls.length,1)
    await card.props.onConfirm();await tick();tree=f.render()
    const post=f.calls.find(call=>call.options.method==='POST')
    assert.equal(post.url,'/api/meetups/admission/refunds')
    assert.deepEqual(JSON.parse(post.options.body),{depositId:base.depositId})
    assert.equal(post.options.headers['X-Quantum-Owner'],owner)
    assert.equal(walk(tree,node=>node.type===f.cardType).props.item.refundState,'requested')
    assert.match(textOf(tree),/운영자 확인을 기다려/)
    assert.ok(f.calls.every(call=>!call.url.includes('/internal/')))
  } finally {f.dispose()}
})

test('administrator approval submits exact request identity and displays pending provider completion',async()=>{
  const f=harness({admin:true})
  try {
    f.render();await tick();walk(f.render(),node=>node.type===f.cardType).props.onSelect('approve')
    await walk(f.render(),node=>node.type===f.cardType).props.onConfirm();await tick()
    const post=f.calls.find(call=>call.options.method==='POST')
    assert.deepEqual(JSON.parse(post.options.body),{depositId:base.depositId,requestId:owner,action:'approve'})
    assert.match(textOf(f.render()),/반환 처리 대기열에 반영/)
    assert.equal(walk(f.render(),node=>node.type===f.cardType).props.item.refundState,'approved')
  } finally {f.dispose()}
})

test('account switch aborts the old request and never displays its late response',async()=>{
  let resolveOld
  const f=harness({getResponse:async(_url,options)=>options.headers['X-Quantum-Owner']===owner
    ?new Promise(resolve=>{resolveOld=resolve}):Response.json({accountKey:other,refunds:[]})})
  try {
    f.render();const old=f.calls[0]
    const immediate=f.render(other)
    assert.equal(old.options.signal.aborted,true)
    assert.equal(walk(immediate,node=>node.type===f.cardType),null)
    resolveOld(Response.json({accountKey:owner,refunds:[base]}));await tick()
    assert.equal(walk(f.render(other),node=>node.type===f.cardType),null)
    assert.match(textOf(f.render(other)),/아직 모임 보증금 내역이 없어요/)
  } finally {f.dispose()}
})

test('network failure stays distinct from an empty list and recent-auth/MFA errors show their next action',async()=>{
  for(const code of ['provider_timeout','reauthentication_required','mfa_required']){
    const f=harness({getResponse:async()=>Response.json({error:code},{status:code==='provider_timeout'?503:403})})
    try {f.render();await tick();const tree=f.render(),text=textOf(tree)
      assert.ok(walk(tree,node=>node.props?.role==='alert'))
      assert.doesNotMatch(text,/아직 모임 보증금 내역이 없어요/)
      if(code==='reauthentication_required')assert.match(text,/다시 로그인하기/)
      if(code==='mfa_required')assert.match(text,/2단계 인증하기/)
    }finally{f.dispose()}
  }
})

test('account switch aborts an in-flight mutation and suppresses its old-account success',async()=>{
  let finish
  const f=harness({mutateResponse:()=>new Promise(resolve=>{finish=resolve})})
  try {
    f.render();await tick();walk(f.render(),node=>node.type===f.cardType).props.onSelect('request')
    const running=walk(f.render(),node=>node.type===f.cardType).props.onConfirm()
    const post=f.calls.find(call=>call.options.method==='POST')
    f.render(null)
    assert.equal(post.options.signal.aborted,true)
    finish(Response.json({accountKey:owner,refund:item('requested')}));await running;await tick()
    const tree=f.render(null)
    assert.equal(walk(tree,node=>node.type===f.cardType),null)
    assert.doesNotMatch(textOf(tree),/반환 신청을 접수했어요/)
    assert.match(textOf(tree),/로그인해 주세요/)
  }finally{f.dispose()}
})
