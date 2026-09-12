import test from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
registerHooks({resolve(specifier,context,nextResolve){return nextResolve(specifier.startsWith('./admission-')&&context.parentURL?.includes('/lib/meetups/')?specifier+'.ts':specifier,context)}})
const api=await import('../../lib/meetups/admission-lifecycle.ts')
const room='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222'
const pending={id,admission:'pending',payment:'held',amountKrw:17000,revision:0,chatHref:null}
const client=(data,error=null)=>({rpc:async()=>({data,error})})
test('strict owner decisions reject browser-supplied payment, target user and unexpected action',()=>{
 const input={applicationId:id,action:'approve',revision:0};assert.deepEqual(api.parseAdmissionDecisionInput(input),input)
 for(const patch of [{paid:true},{user_id:id},{amountKrw:1},{action:'join'},{revision:-1},{revision:0.5},{applicationId:'../'}])assert.equal(api.parseAdmissionDecisionInput({...input,...patch}),null)
 assert.equal(api.parseAdmissionCancelInput({applicationId:id,revision:0,action:'approve'}),null)
})
test('status cannot expose arbitrary navigation or invent payment/refund state',()=>{
 assert.deepEqual(api.parseAdmissionStatus(pending,room),pending)
 for(const patch of [{payment:'unpaid'},{chatHref:`/chat/rooms/meetup/${room}`},{amountKrw:0},{providerSecret:'private'},{admission:'cancelled',payment:'held'},{admission:'accepted',chatHref:'https://evil.example'}])assert.equal(api.parseAdmissionStatus({...pending,...patch},room),null)
 assert.ok(api.parseAdmissionStatus({...pending,admission:'accepted',chatHref:`/chat/rooms/meetup/${room}`},room))
})
test('member management response never includes private application bodies or financial receipts',()=>{
 const data={room:{id:room,title:'우리 과 모임',memberCount:2,capacity:4},isHost:false,pendingCount:1,applications:[],notices:[],hasMore:false,nextCursor:null}
 assert.deepEqual(api.parseAdmissionManagement(data,room),data)
 const item={id,alias:'신청자',intro:'함께해요',strength:'설명',admission:'pending',payment:'held',revision:0,createdAt:new Date().toISOString()}
 assert.equal(api.parseAdmissionManagement({...data,applications:[item]},room),null)
 assert.ok(api.parseAdmissionManagement({...data,isHost:true,applications:[item]},room))
 assert.equal(api.parseAdmissionManagement({...data,isHost:true,applications:[{...item,amountKrw:17000}]},room),null)
 assert.equal(api.parseAdmissionManagement({...data,hasMore:true,nextCursor:null},room),null)
})
test('RPC adapter passes only bound room/application and converts failures to safe errors',async()=>{
 const calls=[],input={applicationId:id,action:'approve',revision:0},accepted={...pending,admission:'accepted',revision:1,chatHref:`/chat/rooms/meetup/${room}`}
 const rpc={rpc:async(name,args)=>{calls.push([name,args]);return{data:accepted,error:null}}}
 assert.deepEqual(await api.decideAdmission(rpc,room,input),accepted)
 assert.deepEqual(calls,[['decide_activity_meetup_admission',{p_meetup_id:room,p_application_id:id,p_action:'approve',p_revision:0}]])
 await assert.rejects(api.decideAdmission(client(null,{message:'private SQL/secret'}),room,input),error=>error.code==='admission_unavailable'&&error.status===503)
 await assert.rejects(api.decideAdmission(client(null,{message:'meetup_full'}),room,input),error=>error.code==='meetup_full'&&error.status===409)
 await assert.rejects(api.decideAdmission(client({...accepted,id:room}),room,input),error=>error.code==='admission_response_invalid')
})
test('self status absence is different from unavailable or invalid server response',async()=>{
 assert.deepEqual(await api.getMyAdmissionStatus(client({application:null}),room),{application:null})
 assert.deepEqual(await api.getMyAdmissionStatus(client({application:pending}),room),{application:pending})
 await assert.rejects(api.getMyAdmissionStatus(client(null),room),error=>error.code==='admission_response_invalid')
 await assert.rejects(api.getMyAdmissionStatus(client({application:pending,secret:'hidden'}),room),error=>error.code==='admission_response_invalid')
})
