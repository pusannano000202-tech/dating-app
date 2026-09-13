import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {createRequire} from 'node:module'
function load(file,deps={}){const module={exports:{}};new Function('module','exports','require',ts.transpileModule(readFileSync(new URL('../../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports,name=>deps[name]);return module.exports}
const notifications=load('lib/notifications/common-contract.ts'),contract=load('lib/chat/social-rooms-contract.ts'),presentation=load('lib/chat/social-room-presentation.ts')
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0')
test('unread empty state cannot announce all read while older unread exists or total is unavailable',()=>{
 assert.equal(notifications.notificationEmptyState('unread',1,true),'older_unread')
 assert.equal(notifications.notificationEmptyState('unread',1,false),'refresh_unread')
 assert.equal(notifications.notificationEmptyState('unread',null,false),'unknown')
 assert.equal(notifications.notificationEmptyState('unread',0,true),'all_read')
})
test('directory prioritizes unread then latest conversation and validates server preview/count',()=>{
 const room=(n,unread,time)=>({kind:'league_team',id:id(n),title:'우리 팀',affiliation:'학과',member_count:2,writable:true,updated_at:time,unread_count:unread,latest_message:{id:id(n+10),body:'안녕하세요',created_at:time,is_me:false}})
 const a=room(1,0,'2026-09-11T10:00:00Z'),b=room(2,1,'2026-09-11T08:00:00Z'),c=room(3,2,'2026-09-11T09:00:00Z')
 assert.deepEqual(presentation.sortSocialChatRooms([a,b,c]).map(r=>r.id),[c.id,b.id,a.id])
 const response={owner_id:id(4),rooms:[a],has_more:false,next_cursor:null}
 assert.ok(contract.parseSocialRoomsResponse(response))
 assert.equal(contract.parseSocialRoomsResponse({...response,rooms:[{...a,unread_count:-1}]}),null)
 assert.equal(contract.parseSocialRoomsResponse({...response,rooms:[{...a,latest_message:{...a.latest_message,id:'forged'}}]}),null)
})

test('actual notification screen renders older unread guidance for a read first page and never the all-read claim',()=>{
 const require=createRequire(import.meta.url),module={exports:{}}
 const state={items:Array.from({length:50},(_,n)=>({id:id(n+10),kind:'social_activity',payload:{},created_at:'2026-09-11T10:00:00Z',read_at:'2026-09-11T11:00:00Z'})),unread:1,status:'ready',hasMore:true,busy:false,error:null,refresh(){},loadMore(){},markRead(){}}
 const deps={react:{...React,useState:initial=>[initial==='all'?'unread':initial,()=>{}]},'react/jsx-runtime':require('react/jsx-runtime'),'next/link':{default:({children,...props})=>React.createElement('a',props,children)},'next/navigation':{},'./NotificationsProvider':{useNotifications:()=>state},'@/lib/notifications/common-presentation':{},'@/lib/notifications/common-contract':notifications,'./notifications.module.css':{default:{}}}
 // Embedded inboxes deliberately omit push settings; resolve the import without
 // loading its browser hooks, and fail if the tested screen renders it anyway.
 deps['./PushNotificationSettings']={default:()=>{throw new Error('embedded inbox must not render push settings')}}
 const js=ts.transpileModule(readFileSync(new URL('../../components/notifications/NotificationSurfaces.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
 new Function('module','exports','require',js)(module,module.exports,name=>deps[name]??require(name))
 const html=renderToStaticMarkup(React.createElement(module.exports.NotificationsScreen,{embedded:true}))
 assert.match(html,/이전 안내에 읽지 않은 소식이 남아 있어요/)
 assert.match(html,/이전 안내에서 읽지 않은 소식 확인/)
 assert.doesNotMatch(html,/새 소식을 모두 확인했어요/)
})
