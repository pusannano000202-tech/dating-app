import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import {readLeagueLocation,leagueLocationHref} from '../../lib/meetups/league-navigation.ts'
const source=readFileSync(new URL('../../components/community/department/DepartmentLeagueJourney.tsx',import.meta.url),'utf8')
const tree=ts.createSourceFile('journey.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let effect,writer
function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(tree)==='useEffect'){const body=node.arguments[0]?.getText(tree);if(body?.includes("addEventListener('popstate'"))effect=body;if(body?.includes('window.history.pushState'))writer=body}ts.forEachChild(node,visit)}
visit(tree)
const compiled=ts.transpileModule('const effect='+effect,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
test('actual browser URL wins over cached Next page props on return from team chat',()=>{
 const state={},listeners={},window={location:{search:'?sport=lol&view=roster&panel=applications&challenge=554a7522-4f8c-4067-8df3-c916d51f5cd1'},addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:(name)=>delete listeners[name]}
 const bindings={demo:false,coordinationOnly:false,sport:'lol',historyMounted:{current:false},historyRestoring:{current:false},activeDetail:{current:null},readLeagueLocation,URLSearchParams,window,load:()=>{state.loads=(state.loads??0)+1}}
 for(const key of ['Sport','Stage','SelectedId','TargetTeamId','Draft','ReviewOpen','ReviewSlot','InviteId','InviteChallengeId','FromNotice','SelectedSlot','Tier','ManageOpen','LiveDetail','Notice','OpponentId','OpponentCursor'])bindings['set'+key]=value=>state[key]=value
 const run=new Function(...Object.keys(bindings),compiled+';return effect')(...Object.values(bindings))
 const cleanup=run()
 assert.equal(state.Stage,'roster');assert.equal(state.ReviewOpen,true)
 assert.equal(bindings.historyRestoring.current,true);assert.equal(state.loads,1)
 window.location.search='?sport=football&view=recruitment'
 listeners.popstate();assert.equal(state.Sport,'football');assert.equal(state.Stage,'recruitment')
 assert.equal(state.loads,1,'sport change waits for the new sport loader rather than fetching the old sport')
 cleanup();assert.equal(listeners.popstate,undefined)
})

test('first navigation after mount pushes history so Back restores the entry screen',()=>{
 const historyReady={current:false},historyRestoring={current:true},entries=['/meetups/league?sport=lol'],calls=[]
 const window={location:{pathname:'/meetups/league',search:'?sport=lol'},history:{pushState:(_state,_title,href)=>{calls.push('push');entries.push(href)},replaceState:(_state,_title,href)=>{calls.push('replace');entries[entries.length-1]=href}}}
 const bindings={demo:false,coordinationOnly:false,sport:'lol',stage:'league',activeDetail:{current:null},selectedId:null,targetTeamId:null,draft:false,reviewOpen:false,reviewSlot:null,inviteId:null,fromNotice:false,opponentId:null,opponentCursor:null,historyReady,historyRestoring,leagueLocationHref,window}
 const writerCode=ts.transpileModule('const effect='+writer,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
 const run=()=>new Function(...Object.keys(bindings),writerCode+';return effect')(...Object.values(bindings))()
 run();assert.equal(historyReady.current,true,'restored initial URL is already a valid history entry')
 bindings.stage='recruitment';run();assert.deepEqual(calls,['push'])
 entries.pop();const restored=readLeagueLocation(new URL(entries.at(-1),'http://localhost').searchParams)
 assert.equal(restored.stage,'league')
 historyRestoring.current=true;bindings.stage=restored.stage;run();assert.deepEqual(calls,['push'],'Back must not add another entry')
})
