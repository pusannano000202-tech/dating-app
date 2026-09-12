import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {hostedStudyFixture} from './hosted-study-fixture.mjs'
export const nativeMigration=new URL('../../supabase/migrations/20260912034439_native_paid_admission.sql',import.meta.url)
export async function nativeFixture(){
 const f=await hostedStudyFixture()
 // Study-focused fixture: foreign-key target exists, but mentoring behavior is not mocked as passing.
 await f.db.exec(`create table quantum_private.group_mentoring_sessions(id uuid primary key,admission_mode text,host_user_id uuid,status text);
 create table quantum_private.group_mentoring_members(id uuid primary key,session_id uuid,user_id uuid,left_at timestamptz);`)
 await f.db.exec(await readFile(nativeMigration,'utf8'))
 f.nativeRoom=(await f.createStudy()).id
 f.nativeContext=(metadata={})=>f.value('select public.get_native_meetup_admission_context($1,$2,$3::jsonb)as value',['study',f.nativeRoom,JSON.stringify(metadata)])
 f.enableNativePolicy=()=>f.db.query(`insert into quantum_private.activity_meetup_admission_policies(study_room_id,amount_krw,policy_version,summary,conditions,enabled)values($1,17000,'fixture-only','테스트 정책',array['실제 돈 없음'],true)`,[f.nativeRoom])
 f.nativePrepare=async(user=f.users.mechanicalMember)=>{await f.as(user);const q=(await f.nativeContext()).quote;return f.value('select public.prepare_native_meetup_admission($1,$2,$3::jsonb)as value',['study',f.nativeRoom,JSON.stringify({intro:'미분 같이 풀어요',strength:'문제풀이를 기록해요',paymentMethod:'new',consent:true,policyVersion:q.policyVersion,quoteId:q.id,idempotencyKey:randomUUID(),metadata:{}})])}
 f.nativeConfirm=async(intent,receipt=randomUUID())=>{await f.db.exec("set role service_role;select set_config('request.jwt.claim.role','service_role',false)");try{return await f.value('select public.confirm_native_meetup_admission_payment_for_service($1,$2,$3,$4)as value',[intent,'fixture-provider',receipt,17000])}finally{await f.db.exec('reset role')}}
 f.nativeList=()=>f.value('select public.get_native_meetup_admissions($1,$2,null)as value',['study',f.nativeRoom])
 f.nativeDecide=(id,action='approve',revision=0)=>f.value('select public.decide_native_meetup_admission($1,$2,$3,$4,$5)as value',['study',f.nativeRoom,id,action,revision])
 f.nativeCancel=(id,revision=0)=>f.value('select public.cancel_my_native_meetup_admission($1,$2,$3,$4)as value',['study',f.nativeRoom,id,revision])
 f.addNativeUser=async()=>{const id=randomUUID();await f.db.query('insert into auth.users(id)values($1)',[id]);await f.db.query('insert into public.users(id)values($1)',[id]);await f.db.query("insert into quantum_private.community_member_profiles(user_id,school_scope,department,community_gender,display_name)values($1,'pnu_self_selected','기계공학과','male','추가 참가자')",[id]);return id}
 return f
}
