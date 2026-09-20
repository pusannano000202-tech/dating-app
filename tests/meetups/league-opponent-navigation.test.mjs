import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync,existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import ts from 'typescript'
import React from 'react'

const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(import.meta.url)
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
function loader(react){
 const cache=new Map()
 return function load(file){
  if(cache.has(file))return cache.get(file).exports
  const module={exports:{}};cache.set(file,module)
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
  new Function('require','module','exports',code)(specifier=>{
   if(specifier==='react')return react??React
   if(specifier.includes('QuantumLocaleProvider'))return{useQuantumLocale:()=>({t:key=>key})}
   if(specifier==='./LeagueTier')return{LeagueTierBadge:'tier-badge'}
   if(specifier.endsWith('.module.css'))return{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})}
   if(specifier.startsWith('@/')||specifier.startsWith('.')){
    const base=specifier.startsWith('@/')?path.join(root,specifier.slice(2)):path.resolve(path.dirname(file),specifier)
    return load(path.extname(base)?base:base+(existsSync(base+'.ts')?'.ts':'.tsx'))
   }
   return require(specifier)
  },module,module.exports)
  return module.exports
 }
}
const load=loader(),navigation=load(path.join(root,'lib/meetups/league-navigation.ts'))
const {LEAGUE_SPORTS}=load(path.join(root,'lib/meetups/challenge-journey.ts'))
function team(n,extra={}){
 return{team_id:id(n),challenge_id:id(n+100),title:`상대 ${n}`,department:'다른 학과',capacity:5,accepted_count:5,score_sum:1500,compatibility_score:300,gap:200,is_mine:false,is_captain:false,can_propose:false,incoming:false,outgoing:false,
  players:LEAGUE_SPORTS.lol.slots.map((slot,index)=>({roster_id:id(n*10+index),alias:`선수 ${index}`,slot:slot.key,position:slot.position,tier:'silver',score:300,is_captain:index===0,is_me:false})),...extra}
}
const page=(teams,next_cursor=null)=>({sport:'lol',total_count:teams.length,teams,next_cursor,transfers:[]})
function nodes(node){if(!node||typeof node!=='object')return[];return[node,...React.Children.toArray(node.props?.children).flatMap(nodes)]}
function text(node){if(node===null||node===undefined||typeof node==='boolean')return'';if(typeof node!=='object')return String(node);return React.Children.toArray(node.props?.children).map(text).join('')}
function button(tree,label){return nodes(tree).find(node=>node.type==='button'&&text(node)===label)}
function harness(initial={},pages=new Map([['',page([team(20)])]])){
 let hooks=[],index=0,dirty=true,effects=[],tree,props,requests=[]
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]))
 const react={...React,
  useState(value){const at=index++;if(!(at in hooks))hooks[at]=typeof value==='function'?value():value;return[hooks[at],next=>{const value=typeof next==='function'?next(hooks[at]):next;if(!Object.is(hooks[at],value)){hooks[at]=value;dirty=true}}]},
  useRef(value){const at=index++;return hooks[at]??(hooks[at]={current:value})},
  useCallback(callback,deps){const at=index++;if(!same(hooks[at]?.deps,deps))hooks[at]={value:callback,deps};return hooks[at].value},
  useEffect(callback,deps){const at=index++;if(!same(hooks[at]?.deps,deps)){const prior=hooks[at];hooks[at]={deps,cleanup:prior?.cleanup};effects.push(()=>{hooks[at].cleanup?.();hooks[at].cleanup=callback()})}},
 }
 const Component=loader(react)(path.join(root,'components/community/department/LeagueLobby.tsx')).default
 const own={id:id(2),department:'내 학과',is_mine:true,is_captain:true,ready:true,waiting:true,gap:200,players:team(2).players.map((player,i)=>({id:player.roster_id,...player,status:'accepted',is_me:i===0}))}
 props={sport:'lol',state:{sport:'lol',challenges:[],my_department:'내 학과'},own,revision:1,demo:false,onDemo(){},onRoster(){},onPaired(){},onRefresh:async()=>{},renderRoster:()=>null,opponentId:null,opponentCursor:null,onOpponentChange:(opponentId,opponentCursor)=>{props={...props,opponentId,opponentCursor};dirty=true},...initial}
 const old={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document}
 globalThis.window={setInterval:()=>1,clearInterval(){}}
 globalThis.document={visibilityState:'visible'}
 globalThis.fetch=async url=>{requests.push(String(url));const query=new URL(String(url),'http://localhost').searchParams;const result=pages.get(query.get('cursor')??'');return{ok:!!result,json:async()=>({lobby:result})}}
 async function settle(){for(let round=0;round<20;round++){if(dirty){dirty=false;index=0;tree=Component(props)}const pending=effects;effects=[];pending.forEach(effect=>effect());await new Promise(resolve=>setImmediate(resolve));if(!dirty&&!effects.length)return tree}throw new Error('render did not settle')}
 return{settle,get tree(){return tree},get props(){return props},requests,setProps(next){props={...props,...next};dirty=true},dispose(){for(const hook of hooks)hook?.cleanup?.();Object.assign(globalThis,old)}}
}

test('opponent URL restores a separate target and observed page cursor without changing own team identity',()=>{
 const input={sport:'lol',stage:'opponents',challengeId:id(1),teamId:id(2),opponentId:id(20),opponentCursor:id(19)}
 const href=navigation.leagueLocationHref(input),parsed=navigation.readLeagueLocation(new URL(href,'http://local').searchParams)
 assert.equal(parsed.opponentId,id(20));assert.equal(parsed.opponentCursor,id(19));assert.equal(parsed.teamId,id(2))
 assert.match(href,/opponent=/);assert.match(href,/opponent_cursor=/)
})
test('opponent parameters are restricted to the opponent stage and UUIDs',()=>{
 for(const query of ['sport=lol&view=league','sport=lol&view=roster',`sport=lol&view=opponents&opponent=invalid`]){
  const parsed=navigation.readLeagueLocation(new URLSearchParams(`${query}&opponent_cursor=${id(19)}`))
  assert.equal(parsed.opponentId,null);assert.equal(parsed.opponentCursor,null)
 }
 const href=navigation.leagueLocationHref({sport:'lol',stage:'league',opponentId:id(20),opponentCursor:id(19)})
 assert.doesNotMatch(href,/opponent/)
 const parsed=navigation.readLeagueLocation(new URLSearchParams(`sport=lol&view=opponents&opponent=${id(20)}&opponent_cursor=invalid`))
 assert.equal(parsed.opponentId,id(20));assert.equal(parsed.opponentCursor,null)
})
test('remount restores a later-page opponent with one bounded request and current server permissions',async()=>{
 const h=harness({opponentId:id(20),opponentCursor:id(19)},new Map([[id(19),page([team(20)])]]))
 try{await h.settle();assert.equal(h.requests.length,1);const query=new URL(h.requests[0],'http://local').searchParams;assert.equal(query.get('cursor'),id(19));assert.equal(query.get('team_id'),id(2));assert.match(text(h.tree),/상대 20/);assert.ok(button(h.tree,'← 대기 팀 목록'));assert.equal(button(h.tree,'이 팀에 경기 제안').props.disabled,true)}finally{h.dispose()}
})
test('selection after pagination records that page cursor; back and forward props restore list and detail',async()=>{
 const h=harness({},new Map([['',page([team(10)],id(19))],[id(19),page([team(20,{can_propose:true})])]]))
 try{
  await h.settle();button(h.tree,'대기 팀 더 보기').props.onClick();await h.settle()
  nodes(h.tree).find(node=>node.type==='button'&&node.props.className==='teamRow'&&text(node).includes('상대 20')).props.onClick();await h.settle()
  assert.equal(h.props.opponentId,id(20));assert.equal(h.props.opponentCursor,id(19));assert.equal(button(h.tree,'이 팀에 경기 제안').props.disabled,false)
  h.setProps({opponentId:null,opponentCursor:null});await h.settle();assert.ok(button(h.tree,'대기 팀 더 보기'));assert.equal(button(h.tree,'← 대기 팀 목록'),undefined)
  h.setProps({opponentId:id(20),opponentCursor:id(19)});await h.settle();assert.ok(button(h.tree,'← 대기 팀 목록'))
 }finally{h.dispose()}
})
test('unavailable restored opponent does not scan more pages or show proposal controls and can return to list',async()=>{
 const h=harness({opponentId:id(20),opponentCursor:id(19)},new Map([[id(19),page([team(30)],id(29))],['',page([team(10)])]]))
 try{await h.settle();assert.equal(h.requests.length,1);assert.match(text(h.tree),/이 상대 팀을 현재 대기 목록에서 찾지 못했어요/);assert.equal(button(h.tree,'이 팀에 경기 제안'),undefined);button(h.tree,'← 대기 팀 목록').props.onClick();await h.settle();assert.equal(h.props.opponentId,null);assert.equal(h.props.opponentCursor,null);assert.match(text(h.tree),/상대 10/)}finally{h.dispose()}
})
test('an own-team identifier in the opponent URL never grants opponent proposal controls',async()=>{
 const h=harness({opponentId:id(2)},new Map([['',page([team(2,{is_mine:true,can_propose:false})])]]))
 try{await h.settle();assert.match(text(h.tree),/이 상대 팀을 현재 대기 목록에서 찾지 못했어요/);assert.equal(button(h.tree,'이 팀에 경기 제안'),undefined)}finally{h.dispose()}
})
