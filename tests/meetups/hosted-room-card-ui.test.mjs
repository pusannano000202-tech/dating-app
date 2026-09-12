import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import ts from 'typescript'

const require=createRequire(import.meta.url)
const dependencies={'react/jsx-runtime':require('react/jsx-runtime'),'next/link':{__esModule:true,default:'a'},'lucide-react':require('lucide-react'),'@/lib/utils':{isSupabaseConfigured:()=>true},'./hosted-rooms.module.css':{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})}}
const code=ts.transpileModule(readFileSync(new URL('../../components/meetups/HostedRoomCards.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText
const module={exports:{}}
new Function('require','module','exports',code)(name=>{assert.ok(Object.hasOwn(dependencies,name),name);return dependencies[name]},module,module.exports)
const room={id:'97000000-0000-4000-8000-000000000011',title:'참여 상태를 확인할 멘토링',label:'참여 상태 확인',count:0,capacity:4,joined:false,isHost:false,closed:true,href:'/meetups/mentoring-rooms/97000000-0000-4000-8000-000000000011',roles:{mentor:0,mentee:0,size:2}}
const render=value=>renderToStaticMarkup(React.createElement(module.exports.HostedRoomCard,{room:value}))

test('restricted current membership keeps a management link without claiming a zero-person or recruitable room',()=>{
 const html=render({...room,needsAttention:true})
 assert.ok(html.includes(`href="${room.href}"`))
 assert.ok(html.includes('참여 관리'))
 assert.ok(html.includes('신고·나가기'))
 assert.ok(!html.includes('0/2'))
 assert.ok(!html.includes('0자리'))
 assert.ok(!html.includes(' / 4명'))
 assert.ok(!html.includes('빈자리를 기다려'))
 assert.ok(!html.includes('방장 수락 시'))
})
test('ordinary closed rooms cannot be opened as new applications; members still continue their chat',()=>{
 assert.ok(!render(room).includes(`href="${room.href}"`))
 const member=render({...room,joined:true,count:2})
 assert.ok(member.includes(`href="${room.href}"`))
 assert.ok(member.includes('모임 이어가기'))
})
