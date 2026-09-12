import {readFile} from 'node:fs/promises'
import {setup as hostedSetup,ids} from '../mentoring/hosted-fixture.mjs'
export {ids}
const source=name=>readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8')
export async function nativeFullFixture(){
 const f=await hostedSetup()
 try{
  await f.db.exec(await source('20260910142923_social_activity_notifications.sql'))
  const integrated=await source('20260906181225_community_social_integrated.sql'),join=integrated.slice(integrated.indexOf('create or replace function public.join_activity_meetup('))
  await f.db.exec(join.slice(0,join.indexOf('$$;')+3))
  await f.db.exec(await source('20260911165313_meetup_admission_preparation.sql'))
  await f.db.exec(await source('20260912024918_meetup_paid_admission_lifecycle.sql'))
  await f.db.exec(await source('20260912025017_common_notifications_web_push.sql'))
  await f.db.exec(await source('20260912034350_study_hosted_shared_admission.sql'))
  await f.db.exec(await source('20260912034439_native_paid_admission.sql'))
  await f.db.exec(await source('20260912035936_native_admission_push_current.sql'))
  const value=async(sql,args=[])=> (await f.db.query(sql,args)).rows[0].value
  const context=(user,kind,room,metadata)=>f.rpc(user,'get_native_meetup_admission_context',[kind,room,JSON.stringify(metadata)])
  const enable=(kind,room)=>f.db.query(`insert into quantum_private.activity_meetup_admission_policies(${kind==='study'?'study_room_id':'mentoring_session_id'},amount_krw,policy_version,summary,conditions,enabled)values($1,17000,'fixture','테스트 정책',array['실제 돈 없음'],true)`,[room])
  const prepare=async(user,kind,room,metadata)=>{const q=(await context(user,kind,room,metadata)).quote;return f.rpc(user,'prepare_native_meetup_admission',[kind,room,JSON.stringify({intro:'우리 과 이야기 나눠요',strength:'경험을 정리했어요',paymentMethod:'new',consent:true,quoteId:q.id,policyVersion:q.policyVersion,idempotencyKey:crypto.randomUUID(),metadata})])}
  const confirm=async(id,receipt=crypto.randomUUID())=>{await f.db.exec("set role service_role;select set_config('request.jwt.claim.role','service_role',false)");try{return await value('select public.confirm_native_meetup_admission_payment_for_service($1,$2,$3,$4)as value',[id,'fixture-provider',receipt,17000])}finally{await f.db.exec('reset role')}}
  const decide=(user,kind,room,id,action='approve',revision=0)=>f.rpc(user,'decide_native_meetup_admission',[kind,room,id,action,revision])
  return{...f,value,context,enable,prepare,confirm,decide}
 }catch(error){await f.db.close();throw error}
}
