'use client'

import {useCallback,useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {ArrowLeft,ArrowRight,CalendarDays,Info,Plus,RefreshCw,Search,UsersRound} from 'lucide-react'
import {LEAGUE_SPORTS,type LeagueSport,type JourneyState} from '@/lib/meetups/challenge-journey'
import {parseLeagueRecruitmentBrowse,parseLeagueRecruitmentDetail,type LeagueRecruitmentTeam,type LeagueRecruitmentNotice,type LeagueRecruitmentDetail} from '@/lib/meetups/league-recruitment'
import {recruitmentDemoRows,type LeagueRecruitmentDemo,type LeagueRecruitmentDemoAction} from '@/lib/meetups/league-recruitment-demo'
import s from './league-recruitment.module.css'
import DepartmentMascot from './DepartmentMascot'

const endpoint='/api/community/department/league/recruitment'
export function isRecruitmentNoticeClosed(notice:Pick<LeagueRecruitmentNotice,'status'|'expires_at'>|null|undefined,now=Date.now()):boolean{return !notice||notice.status!=='open'||!Number.isFinite(Date.parse(notice.expires_at))||Date.parse(notice.expires_at)<=now}
export function recruitmentError(error:unknown){const code=error instanceof Error?error.message:String(error);if(/stale|revision|slot|capacity|full|occupied/.test(code))return '팀 구성이나 빈자리가 바뀌었어요. 새로고침해서 현재 지도를 확인해 주세요.';if(/expired|closed|not_recruiting|notice|invalid_time/.test(code))return '모집 소식이 마감됐거나 희망 시각이 올바르지 않아요. 현재 상태를 확인해 주세요.';if(/forbidden|identity|captain|blocked|restricted|unavailable/.test(code))return '현재 팀이나 참가 권한을 확인할 수 없어요. 팀 목록에서 다시 확인해 주세요.';return '요청을 확인하지 못했어요. 새로고침 후 다시 시도해 주세요.'}
export async function readLeagueRecruitmentDetail(sport:LeagueSport,challengeId:string,signal?:AbortSignal):Promise<LeagueRecruitmentDetail>{
 const query=new URLSearchParams({action:'detail',sport,challenge_id:challengeId}),response=await fetch(`${endpoint}?${query}`,{cache:'no-store',signal}),body=await response.json().catch(()=>null),detail=parseLeagueRecruitmentDetail(body?.recruitment)
 if(!response.ok||!detail||detail.sport!==sport||detail.challenge.id!==challengeId)throw new Error(body?.error??'recruitment_detail_unavailable')
 return detail
}
export async function leagueRecruitmentCommand(action:'publish'|'close'|'reject',args:Record<string,unknown>,key:string){
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,args:{...args,idempotency_key:key}})}),body=await response.json().catch(()=>null),result=body?.recruitment
 if(!response.ok||!result||typeof result.challenge_id!=='string'||result.team_id!==args.team_id||!Number.isSafeInteger(result.revision))throw new Error(body?.error??'recruitment_write_failed')
 return result as {team_id:string;challenge_id:string;revision:number;notice:LeagueRecruitmentNotice|null;replayed:boolean}
}
export type LeagueRecruitmentBrowseState={tab:'teams'|'notices';search:string;scrollY?:number;loadedPages?:number}
export function recruitmentDirectoryState({demo,loading,error,hasPage}:{demo:boolean;loading:boolean;error:string;hasPage:boolean}):'error'|'loading'|'ready'{if(!demo&&error&&!hasPage)return 'error';if(!demo&&!hasPage)return 'loading';return 'ready'}
type Page={sport:LeagueSport;my_department:string;total_count:number;next_cursor:string|null;teams?:LeagueRecruitmentTeam[];notices?:LeagueRecruitmentNotice[]}
type LoadedDirectory={scope:string;page:Page;count:number}
const pageCount=(value:number|undefined)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0?value:1
function mergeDirectoryPages(previous:Page|null,next:Page):Page{
 if(!previous)return next
 return{...next,teams:next.teams?[...(previous.teams??[]),...next.teams.filter(team=>!previous.teams?.some(old=>old.team_id===team.team_id))]:undefined,notices:next.notices?[...(previous.notices??[]),...next.notices.filter(notice=>!previous.notices?.some(old=>old.id===notice.id))]:undefined}
}
const slotLabels=(sport:LeagueSport,slots:readonly string[])=>slots.map(key=>LEAGUE_SPORTS[sport].slots.find(slot=>slot.key===key)?.label??key).join(' · ')
export function recruitmentNoticeLabel(notice:LeagueRecruitmentNotice){return notice.status==='filled'&&notice.accepted_count<notice.capacity?'빈자리 모두 초대 중':({open:'모집 중',filled:'충원 마감',expired:'시간 마감',closed:'모집 마감',matched:'대전 확정'})[notice.status]}
export function formatRecruitmentPreferredAt(value:string){
 const date=new Date(value)
 if(!Number.isFinite(date.getTime()))return '희망 시각 확인 필요'
 const parts=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date)
 const part=(type:Intl.DateTimeFormatPartTypes)=>parts.find(item=>item.type===type)?.value??''
 return `희망 ${part('month')}. ${part('day')}(${part('weekday')}) ${part('hour')}:${part('minute')}`
}
const positionNames:Record<string,string>={top:'탑',jungle:'정글',mid:'미드',adc:'바텀',support:'서포터',gk:'골키퍼',ld:'왼쪽 수비',rd:'오른쪽 수비',lm:'왼쪽 미드필더',rm:'오른쪽 미드필더',st:'공격수',lb:'왼쪽 수비',lcb:'왼쪽 중앙 수비',rcb:'오른쪽 중앙 수비',rb:'오른쪽 수비',lcm:'왼쪽 중앙 미드필더',cm:'중앙 미드필더',rcm:'오른쪽 중앙 미드필더',lw:'왼쪽 윙',rw:'오른쪽 윙'}
function positionLabel(sport:LeagueSport,key:string){const label=slotLabels(sport,[key]);return positionNames[key]?`${positionNames[key]} · ${label}`:label}
function TeamSymbol({name}:{name:string}){return <DepartmentMascot department={name} size={56} className={s.teamSymbol}/>}
function ReservedSlots({sport,slots}:{sport:LeagueSport;slots:readonly string[]}){return slots.length?<p className={s.reserved}>초대 중 {slots.map(key=>positionLabel(sport,key)).join(' / ')}<span>인원 확정 전</span></p>:null}
function Vacancy({sport,slots,recruiting=true}:{sport:LeagueSport;slots:readonly string[];recruiting?:boolean}){return slots.length?<div className={s.vacancy}><strong>{recruiting?`${slots.length}자리 모집`:`현재 빈자리 ${slots.length}자리`}</strong><p>{slots.map(key=><span key={key}>{positionLabel(sport,key)}</span>)}</p></div>:<p className={s.unavailable}>현재 신청 가능한 빈자리가 없어요.</p>}
type SelectRecruitment=(id:string,fromNotice?:boolean,slot?:string)=>void
export function LeagueRecruitmentTeamCard({sport,team,onSelect,featured=false}:{sport:LeagueSport;team:LeagueRecruitmentTeam;onSelect:SelectRecruitment;featured?:boolean}){
 const name=team.team_name||team.title
 return <article className={s.card} data-featured={featured}>
  <div className={s.teamIdentity}><TeamSymbol name={team.department}/><div><h3>{name}</h3><p>{team.department}{team.is_captain?' · 내가 주장':team.my_status==='requested'?' · 내 신청 대기':''}</p>{team.my_status==='accepted'||team.is_captain?<span className={s.memberBadge}>참여 중</span>:null}</div><span className={s.count}>{team.accepted_count}/{team.capacity}명 확정</span></div>
  <Vacancy sport={sport} slots={team.empty_slots}/><ReservedSlots sport={sport} slots={team.reserved_slots}/>
  {team.notice?<div className={s.inlineNotice}><p>{team.notice.summary}</p>{team.notice.status!=='open'?<small>{recruitmentNoticeLabel(team.notice)}</small>:null}</div>:null}
  <div className={s.teamFooter}>{team.notice?<span><CalendarDays size={14} aria-hidden="true"/><time dateTime={team.notice.preferred_at}>{formatRecruitmentPreferredAt(team.notice.preferred_at)}</time></span>:<span/>}<button type="button" className={s.cardLink} onClick={()=>onSelect(team.challenge_id)}>{team.my_status==='accepted'||team.is_captain?'우리 팀 열기':team.my_status==='requested'?'내 신청 확인':team.empty_slots.length?'빈자리 보기':'팀 지도 보기'}<ArrowRight size={17} aria-hidden="true"/></button></div>
 </article>
}
export function LeagueRecruitmentNoticeCard({sport,notice,onSelect}:{sport:LeagueSport;notice:LeagueRecruitmentNotice;onSelect:SelectRecruitment}){
 return <article className={`${s.card} ${s.noticeCard}`}>
  <div className={s.cardTop}><span className={s.noticeStatus} data-notice-status={notice.status}>{recruitmentNoticeLabel(notice)}</span><small>학생 모집 소식</small></div>
  <h3 className={s.noticeHeadline}>{notice.summary}</h3>
  <div className={s.noticeIdentity}><TeamSymbol name={notice.department}/><div><strong>{notice.team_name}</strong><small>{notice.department}</small></div></div>
  <div className={s.noticeFacts}><p><CalendarDays size={18} aria-hidden="true"/><time dateTime={notice.preferred_at}>{formatRecruitmentPreferredAt(notice.preferred_at)}<small>한국 시간 · 제안 시각</small></time></p><p><UsersRound size={18} aria-hidden="true"/><span>{notice.accepted_count}/{notice.capacity}명 확정 · {LEAGUE_SPORTS[sport].label}</span></p></div>
  <Vacancy sport={sport} slots={notice.empty_slots} recruiting={notice.status==='open'}/><ReservedSlots sport={sport} slots={notice.reserved_slots}/>
  <button type="button" className={notice.status==='open'?s.primary:s.cardLink} onClick={()=>onSelect(notice.challenge_id,true,notice.status==='open'&&notice.empty_slots.length===1?notice.empty_slots[0]:undefined)}>{notice.status==='open'?'빈자리 지도 보기':'마감된 소식 확인'}<ArrowRight size={17} aria-hidden="true"/></button>
 </article>
}
export default function LeagueRecruitment({sport,demo,journey,recruitment,reservations,onSelect,onCreate,onBack,browseState,onBrowseStateChange}:{browseState?:LeagueRecruitmentBrowseState;onBrowseStateChange?:(view:LeagueRecruitmentBrowseState)=>void;sport:LeagueSport;demo:boolean;journey:JourneyState;recruitment:LeagueRecruitmentDemo;reservations:{team_id:string;slot:string}[];onSelect:(id:string,fromNotice?:boolean,slot?:string)=>void;onCreate:()=>void;onBack:()=>void}){
 const [localView,setLocalView]=useState<LeagueRecruitmentBrowseState>({tab:'teams',search:'',loadedPages:1}),[loaded,setLoaded]=useState<LoadedDirectory|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false)
 const view=browseState??localView,{search}=view
 const department=journey.my_department,scope=JSON.stringify([sport,department]),scopeRef=useRef(scope);scopeRef.current=scope
 const page=loaded?.scope===scope?loaded.page:null,loadedRef=useRef(loaded);loadedRef.current=loaded?.scope===scope?loaded:null
 const viewRef=useRef(view);viewRef.current=view
 const updateView=(next:LeagueRecruitmentBrowseState)=>{viewRef.current=next;setLocalView(next);onBrowseStateChange?.(next)}
 const rememberView=useRef(updateView);rememberView.current=updateView
 const restoreScroll=useRef(browseState?.scrollY??0)
 const generation=useRef(0),controller=useRef<AbortController|null>(null)
 const invalidate=useCallback(()=>{++generation.current;controller.current?.abort();controller.current=null},[])
 const setSearch=(search:string)=>{restoreScroll.current=0;updateView({...view,search,scrollY:0})}
 const select:SelectRecruitment=(...args)=>{updateView({...view,loadedPages:loadedRef.current?.count??1,scrollY:window.scrollY});onSelect(...args)}
 useEffect(()=>{if(!loading&&!error&&(demo||page)&&restoreScroll.current>0){const top=restoreScroll.current;const frame=requestAnimationFrame(()=>{window.scrollTo({top,behavior:'instant'});restoreScroll.current=0});return()=>cancelAnimationFrame(frame)}},[demo,page,loading,error])
 const directoryState=recruitmentDirectoryState({demo,loading,error,hasPage:!!page})
 const load=useCallback(async(cursor?:string)=>{
  if(demo)return
  const prior=cursor?loadedRef.current:null
  if(cursor&&(!prior||prior.page.next_cursor!==cursor))return
  invalidate();const version=generation.current,abort=new AbortController();controller.current=abort
  // Navigation invalidates the generation; a timeout keeps the current
  // generation and must surface an error instead of leaving an empty loader.
  const current=()=>version===generation.current&&scopeRef.current===scope
  const target=cursor?(prior!.count+1):pageCount(viewRef.current.loadedPages)
  let merged=prior?.page??null,count=prior?.count??0,nextCursor=cursor
  const seen=new Set<string>();setLoading(true);setError('');if(!cursor)setLoaded(null)
  try{
   // Remember only depth. Returning always walks the server's new cursor chain,
   // publishing no partial rows until the requested range is restored.
   do{
    if(nextCursor){if(seen.has(nextCursor))throw new Error('recruitment_read_failed');seen.add(nextCursor)}
    const timeout=window.setTimeout(()=>abort.abort(),12000)
    let response:Response,body:unknown
    try{const query=new URLSearchParams({sport,...(nextCursor?{cursor:nextCursor}:{})});response=await fetch(`${endpoint}?${query}`,{cache:'no-store',signal:abort.signal});body=await response.json()}finally{window.clearTimeout(timeout)}
    if(!current())return
    if(abort.signal.aborted)throw new Error('recruitment_read_timeout')
    const payload=body as {recruitment?:unknown;error?:string}|null,parsed=parseLeagueRecruitmentBrowse(payload?.recruitment)
    if(!response.ok||!parsed||parsed.sport!==sport||parsed.my_department!==department||merged&&merged.my_department!==parsed.my_department)throw new Error(payload?.error??'recruitment_read_failed')
    merged=mergeDirectoryPages(merged,parsed);count+=1;nextCursor=parsed.next_cursor??undefined
   }while(count<target&&nextCursor)
   if(!current()||!merged)return
   const result={scope,page:merged,count};loadedRef.current=result;setLoaded(result)
   rememberView.current({...viewRef.current,loadedPages:count})
  }catch(failure){if(version===generation.current&&scopeRef.current===scope){loadedRef.current=null;setLoaded(null);setError(recruitmentError(failure))}}
  finally{if(version===generation.current&&scopeRef.current===scope){controller.current=null;setLoading(false)}}
 },[demo,sport,department,scope,invalidate])
 const priorScope=useRef(scope)
 useEffect(()=>{if(priorScope.current!==scope){restoreScroll.current=0;rememberView.current({...viewRef.current,loadedPages:1,scrollY:0});priorScope.current=scope}setLoaded(null);void load();return invalidate},[scope,load,invalidate])
 const sample=demo?recruitmentDemoRows(journey,recruitment,reservations):null
 const teams=(sample?.teams??page?.teams??[]).filter(team=>`${team.team_name} ${team.title} ${team.notice?.summary??''}`.includes(search))
 return <section className={s.directory} aria-label="우리 과 팀 찾기">
  <header className={s.directoryHeading}><h2>함께할 우리 과 팀</h2><span>{directoryState==='ready'?`전체 ${sample?sample.teams.length:page?.total_count??'—'}개 · 모집 팀`:'목록 확인 중'}</span></header>

  <div className={s.tools}><label className={s.searchField}><Search size={18} aria-hidden="true"/><input aria-label="불러온 목록에서 검색" placeholder="불러온 팀 이름 검색" value={search} onChange={event=>setSearch(event.target.value)}/></label><button type="button" className={s.createButton} onClick={onCreate}>팀 만들기<Plus size={16} aria-hidden="true"/></button></div>
  <div className={s.directoryMeta}><p className={s.note}>빈자리에 신청하면 주장이 승인 후 팀원을 확정해요.</p><button type="button" className={s.refresh} disabled={loading} onClick={()=>void load()}><RefreshCw size={14} aria-hidden="true"/>새로고침</button></div>
  {error?<p role="alert" className={s.error}>{error}</p>:null}
  {directoryState==='error'?null:directoryState==='loading'?<p role="status" className={s.empty}>우리 과 팀을 확인하고 있어요.</p>:<div className={s.cards}>{teams.length?teams.map((team,index)=><LeagueRecruitmentTeamCard key={team.team_id} sport={sport} team={team} onSelect={select} featured={index===0}/>):<p className={s.empty}>{search?'검색에 맞는 팀이 없어요.':'아직 우리 과 모집팀이 없어요. 첫 팀을 만들어 보세요.'}</p>}</div>}
  <div className={s.candidateEntry}><UsersRound size={24}/><div><small>초대를 기다리고 싶다면</small><Link href={`/meetups/${demo?'dev-candidates':'candidates'}?kind=league&key=${sport}`}>합류 대기판 보기 <ArrowRight size={16}/></Link></div></div>
  {!demo&&page?.next_cursor?<button type="button" className={s.secondary} disabled={loading} onClick={()=>void load(page.next_cursor!)}>{loading?'불러오는 중…':'다음 목록 더 보기'}</button>:null}
 </section>
}
function localTime(value:string){const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)}
export function LeagueRecruitmentNoticeForm({detail,demo,onDemo,onRefresh,onBack}:{detail:LeagueRecruitmentDetail;demo:boolean;onDemo:(action:LeagueRecruitmentDemoAction)=>void;onRefresh:()=>Promise<unknown>;onBack:()=>void}){
 const team=detail.challenge.teams.find(team=>team.id===detail.team_id)!,current=detail.notice
 const [preferredAt,setPreferredAt]=useState(()=>localTime(current?.preferred_at??new Date(Date.now()+7200000).toISOString())),[summary,setSummary]=useState(current?.summary??''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const mutation=useRef(false),pending=useRef<{signature:string;key:string}|null>(null)
 async function submit(action:'publish'|'close'){
  if(mutation.current)return;setError('');const date=new Date(preferredAt)
  if(action==='publish'&&(!Number.isFinite(date.getTime())||date.getTime()<=Date.now()||!summary.trim()||summary.trim().length>160)){setError('앞으로 희망하는 날짜·시각과 160자 이내 한 줄 설명을 입력해 주세요.');return}
  mutation.current=true;setBusy(true)
  try{if(demo)onDemo(action==='publish'?{type:'publish',challengeId:detail.challenge.id,preferredAt:date.toISOString(),summary}:{type:'close',challengeId:detail.challenge.id});else{const args={sport:detail.sport,team_id:detail.team_id,expected_revision:detail.challenge.revision,...(action==='publish'?{preferred_at:date.toISOString(),summary:summary.trim()}:{})},signature=JSON.stringify({action,args});if(pending.current?.signature!==signature)pending.current={signature,key:crypto.randomUUID()};await leagueRecruitmentCommand(action,args,pending.current.key);pending.current=null;await onRefresh()}onBack()}
  catch(failure){setError(recruitmentError(failure))}finally{mutation.current=false;setBusy(false)}
 }
 return <section className={s.formPage}>
  <button type="button" className={s.back} disabled={busy} onClick={onBack}><ArrowLeft size={17} aria-hidden="true"/>팀 지도로 돌아가기</button>
  <header className={s.heading}><small>{detail.my_department} · 학생 모집 소식</small><h2>{current?'모집 소식 관리':'우리 과에 팀원 모집하기'}</h2><p>언제, 어떤 친구와 함께하고 싶은가요?</p></header>
  <div className={s.summary}><div className={s.teamIdentity}><TeamSymbol name={team.department}/><div><strong>{team.team_name||detail.challenge.title}</strong><p>{LEAGUE_SPORTS[detail.sport].label} · {team.players.filter(p=>p.status==='accepted').length}/{LEAGUE_SPORTS[detail.sport].capacity}명 확정</p></div></div><Vacancy sport={detail.sport} slots={detail.empty_slots}/><ReservedSlots sport={detail.sport} slots={detail.reserved_slots}/><small>현재 팀 지도에서 자동으로 가져왔어요.</small></div>
  {error?<p className={s.error} role="alert">{error}</p>:null}
  <form onSubmit={event=>{event.preventDefault();void submit('publish')}}>
   <label><span><CalendarDays size={17} aria-hidden="true"/>희망 날짜·시각</span><input type="datetime-local" required value={preferredAt} onChange={event=>setPreferredAt(event.target.value)} disabled={busy}/></label>
   <label>한 줄 설명<textarea rows={3} maxLength={160} required value={summary} placeholder="예: 오늘 대회에 함께할 정글 한 분을 찾아요." onChange={event=>setSummary(event.target.value)} disabled={busy}/><small>{summary.length}/160</small></label>
   <p className={s.formNote}><Info size={17} aria-hidden="true"/><span>희망 시각이 지나거나 정원이 차면 마감돼요. 경기 약속을 확정하는 기능은 아니에요.</span></p>
   <button type="submit" className={s.primary} disabled={busy||!team.is_captain||!detail.empty_slots.length}>{current?.status==='open'?'모집 소식 수정':current?'다시 모집 게시':'모집 소식 게시'}<ArrowRight size={17} aria-hidden="true"/></button>
  </form>
  <div className={s.formActions}>{current?.status==='open'?<button type="button" className={s.secondary} disabled={busy||!team.is_captain} onClick={()=>void submit('close')}>모집 소식 마감</button>:null}<button type="button" className={s.refresh} disabled={busy} onClick={()=>void onRefresh()}><RefreshCw size={15} aria-hidden="true"/>팀 구성 새로고침</button></div>
 </section>
}
