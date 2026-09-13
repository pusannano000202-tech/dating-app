import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const load = async () => {
  const source = await readFile(new URL('../../lib/content-history/contract.ts', import.meta.url), 'utf8')
  const js = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  return import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
}
const valid = {
  sourceKey:'visit:pnu:pasta:round-one', kind:'visit', category:'pasta', title:'내 파스타 1위',
  winnerId:'a', candidates:[{id:'a',name:'가게 A'},{id:'b',name:'가게 B'}],
  selections:[{winnerId:'a',loserId:'b'}], completedAt:null,
}

test('private result accepts a complete snapshot without inventing its original date', async () => {
  const {parseContentRecord} = await load()
  assert.deepEqual(parseContentRecord(valid), valid)
  assert.throws(()=>parseContentRecord({...valid, kind:'delivery'}))
  assert.throws(()=>parseContentRecord({...valid, kind:'mbti'}))
  assert.throws(()=>parseContentRecord({...valid, winnerId:'unknown'}))
  assert.throws(()=>parseContentRecord({...valid, candidates:[valid.candidates[0]]}))
  assert.throws(()=>parseContentRecord({...valid, selections:[{winnerId:'a',loserId:'a'}]}))
  assert.throws(()=>parseContentRecord({...valid, completedAt:'tomorrow'}))
  assert.throws(()=>parseContentRecord({...valid, ownerUserId:'someone-else'}))
})
test('stored snapshot supports only explicit bounded private notes and exact record destinations', async () => {
  const {parseContentNote, contentRestartHref, contentMapHref} = await load()
  assert.equal(parseContentNote({note:' 다음엔 친구와 '}), '다음엔 친구와')
  assert.throws(()=>parseContentNote({note:'x'.repeat(501)}))
  assert.throws(()=>parseContentNote({note:'안녕',winnerId:'b'}))
  assert.equal(contentRestartHref(valid), '/community/campus-eats?category=pasta&mode=setup')
  assert.equal(contentRestartHref({...valid,kind:'places',category:'pc'}), '/community/places?category=pc')
  assert.ok(contentMapHref('가게 A').startsWith('https://map.naver.com/p/search/'))
})
test('visit adapter rejects unfinished or insufficient old records and keeps deterministic import identity', async () => {
  const {visitResultSnapshot} = await load()
  const input = {school:'pnu',category:'pasta',label:'파스타',tournamentId:'round-one',
    candidates:valid.candidates,session:{status:'completed',winnerId:'a',candidateIds:['a','b'],eventOutcomes:{one:{winnerId:'a',loserId:'b',ratingEligible:true}}}}
  const result = visitResultSnapshot(input)
  assert.ok(result)
  assert.equal(result.completedAt, null)
  assert.equal(result.sourceKey, 'visit:pnu:pasta:round-one')
  assert.equal(visitResultSnapshot({...input,session:{...input.session,status:'active'}}), null)
  assert.equal(visitResultSnapshot({...input,tournamentId:'not-started'}), null)
  assert.equal(visitResultSnapshot({...input,candidates:[]}), null)
})
test('MBTI manage deep link reaches owner-gated existing management without copying experiences',async()=>{
  const page=await readFile(new URL('../../app/community/mbti/page.tsx',import.meta.url),'utf8')
  const hub=await readFile(new URL('../../components/community/mbti/MbtiHub.tsx',import.meta.url),'utf8')
  assert.match(page,/initialView=.*manage/)
  assert.match(hub,/screen === 'manage' && \(authenticated !== true \|\| !ownerState.participant\)/)
  assert.match(hub,/next=%2Fcommunity%2Fmbti%3Fview%3Dmanage/)
  assert.doesNotMatch(hub,/api\/content-history/)
})
test('history owner switch invalidates views and device import never erases originals',async()=>{
  const hub=await readFile(new URL('../../components/content-history/ContentHistoryHub.tsx',import.meta.url),'utf8')
  const imports=await readFile(new URL('../../components/content-history/DeviceContentImports.tsx',import.meta.url),'utf8')
  const api=await readFile(new URL('../../lib/content-history/server.ts',import.meta.url),'utf8')
  assert.match(hub,/loadedFor===scopeKey\?records:\[\]/)
  assert.match(hub,/response.status===401\|\|response.status===403/)
  assert.match(imports,/localStorage.getItem/)
  assert.doesNotMatch(imports,/localStorage\.(removeItem|setItem|clear)/)
  assert.match(api,/assertTrustedMutationOrigin\(request,getPublicAppOrigin\(\)\)/)
  assert.match(api,/client.auth.getUser\(\)/)
  assert.doesNotMatch(api,/SERVICE_ROLE/)
})

test('history mutations clear revoked records and prevent overlapping commands',async()=>{
  const hub=await readFile(new URL('../../components/content-history/ContentHistoryHub.tsx',import.meta.url),'utf8')
  const save=await readFile(new URL('../../components/content-history/SaveContentRecord.tsx',import.meta.url),'utf8')
  const auth=await readFile(new URL('../../components/content-history/useHistoryAccount.ts',import.meta.url),'utf8')
  assert.match(hub,/loadedFor!==scopeKey/)
  assert.match(hub,/if\(response.status===401\|\|response.status===403\)clearPrivateView\(\)/)
  assert.match(hub,/operation.current=true/)
  assert.match(hub,/if\(!account\|\|account==='unavailable'\)/)
  assert.ok(hub.indexOf("if(!account||account==='unavailable')") < hub.indexOf('await fetch(endpoint'))
  assert.match(save,/operation.current=true/)
  assert.match(save,/savedFor===scopeKey/)
  assert.match(auth,/error\?'unavailable'/)
})
