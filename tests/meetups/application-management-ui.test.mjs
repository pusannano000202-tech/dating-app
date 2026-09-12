import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import React from 'react'
import ts from 'typescript'
import * as contract from '../../lib/meetups/application-view.ts'

const require=createRequire(import.meta.url)
const owner='96000000-0000-4000-8000-000000000002',room='96000000-0000-4000-8000-000000000001'
const id=n=>`96000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const row=n=>({id:id(n),alias:'신청자',intro:'함께 할게요',strength:'',admission:'pending',payment:'held',revision:1,createdAt:'2026-09-12T01:00:00Z'})
const payload=(n,more=true)=>({accountKey:owner,room:{id:room,title:'모임',memberCount:3,capacity:5},isHost:true,pendingCount:40,applications:[row(n)],notices:[],hasMore:more,nextCursor:more?id(n):null})
const code=ts.transpileModule(readFileSync(new URL('../../components/meetups/MeetupApplications.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]))
function harness(){
 let index=0,dirty=true,tree,account=owner,timerId=0
 const slots=[],effects=new Map(),timers=new Map(),requests=[]
 const hooks={...React,
  useState(initial){const i=index++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{const v=typeof next==='function'?next(slots[i].value):next;if(!Object.is(v,slots[i].value)){slots[i].value=v;dirty=true}}]},
  useRef(initial){const i=index++;if(!slots[i])slots[i]={value:{current:initial}};return slots[i].value},
  useCallback(fn,deps){const i=index++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={fn,deps};return slots[i].fn},
  useEffect(fn,deps){const i=index++;if(!slots[i])slots[i]={deps:undefined};if(!same(slots[i].deps,deps))effects.set(i,{fn,deps})},
 }
 const window={setInterval(fn){timers.set(++timerId,fn);return timerId},clearInterval(id){timers.delete(id)},addEventListener(){},removeEventListener(){}}
 const document={visibilityState:'visible',addEventListener(){},removeEventListener(){}}
 const fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,reply(body,status=200){resolve({ok:status===200,json:async()=>body})}}))
 const dependencies={react:hooks,'react/jsx-runtime':require('react/jsx-runtime'),'next/link':{__esModule:true,default:'a'},'lucide-react':require('lucide-react'),'@/components/content-history/useHistoryAccount':{useHistoryAccount:()=>account},'@/lib/meetups/application-view':contract,'./meetup-admission.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})}}
 const module={exports:{}}
 new Function('require','module','exports','fetch','window','document',code)(name=>{assert.ok(Object.hasOwn(dependencies,name),name);return dependencies[name]},module,module.exports,fetch,window,document)
 function flush(){for(let n=0;dirty||effects.size;n++){assert.ok(n<30,'hooks converge');if(dirty){index=0;dirty=false;tree=module.exports.default({meetupId:room})}const pending=[...effects];effects.clear();for(const[i,{fn,deps}]of pending){slots[i].cleanup?.();slots[i].deps=deps;slots[i].cleanup=fn()}}}
 async function settle(){for(let i=0;i<15;i++){await Promise.resolve();flush()}}
 flush()
 return{requests,settle,get tree(){flush();return tree},poll(){for(const fn of timers.values())fn()},setAccount(value){account=value;dirty=true;flush()},dispose(){for(const s of slots)s?.cleanup?.()}}
}
const nodes=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)]
const text=tree=>typeof tree==='string'?tree:!tree||typeof tree!=='object'?'':(Array.isArray(tree)?tree:[tree.props?.children]).map(text).join(' ')
const button=(tree,label)=>nodes(tree).find(n=>n.type==='button'&&text(n).includes(label))
const cards=tree=>nodes(tree).find(n=>n.type?.name==='ApplicationReviewCards')?.props.data

test('reading older applications keeps that page on polling and has an explicit latest-page return',async()=>{
 const h=harness()
 try{
  h.requests[0].reply(payload(30));await h.settle()
  button(h.tree,'이전 신청').props.onClick();h.requests[1].reply(payload(20));await h.settle()
  assert.equal(cards(h.tree).applications.at(-1).id,id(20))
  h.poll();assert.match(h.requests[2].url,new RegExp('before='+id(30)))
  h.requests[2].reply(payload(20));await h.settle()
  assert.deepEqual(cards(h.tree).applications.map(a=>a.id),[id(20)])
  const latest=button(h.tree,'최신 신청');assert.ok(latest);latest.props.onClick()
  assert.equal(h.requests[3].url,`/api/meetups/${room}/applications`)
  h.requests[3].reply(payload(31));await h.settle();assert.equal(cards(h.tree).applications[0].id,id(31))
 }finally{h.dispose()}
})

test('account switch clears older-page identity and ignores its late response',async()=>{
 const h=harness()
 try{
  h.requests[0].reply(payload(30));await h.settle();button(h.tree,'이전 신청').props.onClick()
  h.setAccount(id(99));h.requests[1].reply(payload(20));await h.settle()
  assert.equal(cards(h.tree),undefined)
  assert.equal(h.requests[2].url,`/api/meetups/${room}/applications`)
  h.requests[2].reply({...payload(31),accountKey:id(99)});await h.settle()
  assert.equal(cards(h.tree).accountKey,id(99));assert.equal(button(h.tree,'최신 신청'),undefined)
 }finally{h.dispose()}
})
