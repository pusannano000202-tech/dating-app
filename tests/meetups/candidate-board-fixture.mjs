import {readFile}from'node:fs/promises'
import {nativeFullFixture,ids}from'./native-admission-full-fixture.mjs'
export{ids}
export const candidateMigration=new URL('../../supabase/migrations/20260912134959_meetup_candidate_board.sql',import.meta.url)
export async function candidateFixture({skipCandidate=false}={}){
 const f=await nativeFullFixture();try{
  const base=await readFile(new URL('../../supabase/migrations/20260906181225_community_social_integrated.sql',import.meta.url),'utf8')
  const tail=base.slice(base.indexOf('create or replace function quantum_private.meetup_activity_key_valid('));await f.db.exec(tail.slice(0,tail.indexOf('$$;')+3))
  const gender=await readFile(new URL('../../supabase/migrations/20260906101018_community_meetup_gender_restrictions.sql',import.meta.url),'utf8')
  await f.db.exec(gender.slice(gender.indexOf('ALTER TABLE public.activity_meetups'),gender.indexOf('CREATE FUNCTION quantum_private.meetup_gender_eligibility')))
  if(!skipCandidate)await f.db.exec(await readFile(candidateMigration,'utf8'))
  const board=(user,action,args)=>f.rpc(user,'meetup_candidate_board',[action,JSON.stringify(args)])
  const scope={scope_kind:'league',scope_key:'lol'}
  const overview=(user=ids[1],s=scope,extra={})=>board(user,'overview',{...s,filter:'all',cursor:null,...extra})
  const register=(user=ids[1],s=scope,extra={})=>board(user,'register',{...s,positions:s.scope_kind==='league'?s.scope_key==='lol'?['mid','support']:['defender']:s.scope_kind==='mentoring'?['mentee']:[],tier:s.scope_kind==='league'?s.scope_key==='lol'?'gold':'beginner':null,intro:'함께 즐겁게 참여해요',availability:'월 · 수 / 저녁',consent:true,expected_revision:null,idempotency_key:crypto.randomUUID(),...extra})
  const league=()=>f.rpc(ids[0],'department_league_journey',['create',JSON.stringify({sport:'lol',title:'함께 하는 팀',slot:'top',tier:'gold',idempotency_key:crypto.randomUUID()})])
  const study=(user=ids[0])=>f.rpc(user,'study_room_action',['create_hosted',JSON.stringify({course_id:'pnu:AN1600527',level:'beginner',title:'같이 문제 풀이',client_id:crypto.randomUUID()})])
  return{...f,board,overview,register,league,study,scope}
 }catch(e){await f.db.close();throw e}
}
