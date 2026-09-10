'use client'

import {useCallback,useEffect,useRef,useState} from 'react'
import Image from 'next/image'
import {ArrowLeft,ArrowRight,CalendarDays,Info,Plus,RefreshCw,Search,UsersRound} from 'lucide-react'
import {LEAGUE_SPORTS,type LeagueSport,type JourneyState} from '@/lib/meetups/challenge-journey'
import {parseLeagueRecruitmentBrowse,parseLeagueRecruitmentDetail,parseLeagueRecruitmentNotices,type LeagueRecruitmentTeam,type LeagueRecruitmentNotice,type LeagueRecruitmentDetail} from '@/lib/meetups/league-recruitment'
import {recruitmentDemoRows,type LeagueRecruitmentDemo,type LeagueRecruitmentDemoAction} from '@/lib/meetups/league-recruitment-demo'
import s from './league-recruitment.module.css'

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
type Page={sport:LeagueSport;my_department:string;total_count:number;next_cursor:string|null;teams?:LeagueRecruitmentTeam[];notices?:LeagueRecruitmentNotice[]}
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
function TeamSymbol({name}:{name:string}){return <span className={s.teamSymbol} aria-hidden="true">{Array.from(name.trim())[0]||'팀'}</span>}
function ReservedSlots({sport,slots}:{sport:LeagueSport;slots:readonly string[]}){return slots.length?<p className={s.reserved}>초대 중 {slots.map(key=>positionLabel(sport,key)).join(' / ')}<span>인원 확정 전</span></p>:null}
function Vacancy({sport,slots,recruiting=true}:{sport:LeagueSport;slots:readonly string[];recruiting?:boolean}){return slots.length?<div className={s.vacancy}><strong>{recruiting?`${slots.length}자리 모집`:`현재 빈자리 ${slots.length}자리`}</strong><p>{slots.map(key=><span key={key}>{positionLabel(sport,key)}</span>)}</p></div>:<p className={s.unavailable}>현재 신청 가능한 빈자리가 없어요.</p>}
type SelectRecruitment=(id:string,fromNotice?:boolean,slot?:string)=>void
export function LeagueRecruitmentTeamCard({sport,team,onSelect,featured=false}:{sport:LeagueSport;team:LeagueRecruitmentTeam;onSelect:SelectRecruitment;featured?:boolean}){
 const name=team.team_name||team.title
 return <article className={s.card} data-featured={featured}>
  <div className={s.teamIdentity}><TeamSymbol name={name}/><div><h3>{name}</h3><p>{team.department}{team.is_captain?' · 내가 주장':team.my_status==='requested'?' · 내 신청 대기':team.my_status==='accepted'?' · 내 팀':''}</p></div><span className={s.count}>{team.accepted_count}/{team.capacity}명 확정</span></div>
  <Vacancy sport={sport} slots={team.empty_slots}/><ReservedSlots sport={sport} slots={team.reserved_slots}/>
  <button type="button" className={featured&&team.empty_slots.length?s.primary:s.cardLink} onClick={()=>onSelect(team.challenge_id)}>{team.empty_slots.length?'빈자리 보기':'팀 지도 보기'}<ArrowRight size={17} aria-hidden="true"/></button>
 </article>
}
export function LeagueRecruitmentNoticeCard({sport,notice,onSelect}:{sport:LeagueSport;notice:LeagueRecruitmentNotice;onSelect:SelectRecruitment}){
 return <article className={`${s.card} ${s.noticeCard}`}>
  <div className={s.cardTop}><span className={s.noticeStatus} data-notice-status={notice.status}>{recruitmentNoticeLabel(notice)}</span><small>학생 모집 소식</small></div>
  <h3 className={s.noticeHeadline}>{notice.summary}</h3>
  <div className={s.noticeIdentity}><TeamSymbol name={notice.team_name}/><div><strong>{notice.team_name}</strong><small>{notice.department}</small></div></div>
  <div className={s.noticeFacts}><p><CalendarDays size={18} aria-hidden="true"/><time dateTime={notice.preferred_at}>{formatRecruitmentPreferredAt(notice.preferred_at)}<small>한국 시간 · 제안 시각</small></time></p><p><UsersRound size={18} aria-hidden="true"/><span>{notice.accepted_count}/{notice.capacity}명 확정 · {LEAGUE_SPORTS[sport].label}</span></p></div>
  <Vacancy sport={sport} slots={notice.empty_slots} recruiting={notice.status==='open'}/><ReservedSlots sport={sport} slots={notice.reserved_slots}/>
  <button type="button" className={notice.status==='open'?s.primary:s.cardLink} onClick={()=>onSelect(notice.challenge_id,true,notice.status==='open'&&notice.empty_slots.length===1?notice.empty_slots[0]:undefined)}>{notice.status==='open'?'빈자리 지도 보기':'마감된 소식 확인'}<ArrowRight size={17} aria-hidden="true"/></button>
 </article>
}
export default function LeagueRecruitment({sport,demo,journey,recruitment,reservations,onSelect,onCreate,onBack}:{sport:LeagueSport;demo:boolean;journey:JourneyState;recruitment:LeagueRecruitmentDemo;reservations:{team_id:string;slot:string}[];onSelect:(id:string,fromNotice?:boolean,slot?:string)=>void;onCreate:()=>void;onBack:()=>void}){
 const [tab,setTab]=useState<'teams'|'notices'>('teams'),[search,setSearch]=useState(''),[page,setPage]=useState<Page|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false)
 const generation=useRef(0),invalidate=useCallback(()=>{++generation.current},[])
 const load=useCallback(async(cursor?:string)=>{
  if(demo)return;const version=++generation.current;setLoading(true);setError('')
  try{const query=new URLSearchParams({sport,...(tab==='notices'?{action:'notices'}:{}),...(cursor?{cursor}:{})}),response=await fetch(`${endpoint}?${query}`,{cache:'no-store'}),body=await response.json().catch(()=>null),parsed=tab==='teams'?parseLeagueRecruitmentBrowse(body?.recruitment):parseLeagueRecruitmentNotices(body?.recruitment);if(!response.ok||!parsed||parsed.sport!==sport)throw new Error(body?.error??'recruitment_read_failed');if(version!==generation.current)return;setPage(previous=>{if(!cursor||!previous)return parsed;const next=parsed as Page;return{...next,teams:next.teams?[...(previous.teams??[]),...next.teams.filter(team=>!previous.teams?.some(old=>old.team_id===team.team_id))]:undefined,notices:next.notices?[...(previous.notices??[]),...next.notices.filter(notice=>!previous.notices?.some(old=>old.id===notice.id))]:undefined}})}
  catch(failure){if(version===generation.current){setError(recruitmentError(failure));if(!cursor)setPage(null)}}finally{if(version===generation.current)setLoading(false)}
 },[demo,sport,tab])
 useEffect(()=>{setPage(null);setSearch('');void load();return invalidate},[load,invalidate])
 const sample=demo?recruitmentDemoRows(journey,recruitment,reservations):null
 const teams=(sample?.teams??page?.teams??[]).filter(team=>`${team.team_name} ${team.title}`.includes(search)),notices=(sample?.notices??page?.notices??[]).filter(notice=>`${notice.team_name} ${notice.summary}`.includes(search))
 return <section className={s.directory} aria-label="우리 과 팀 찾기">
  <header className={s.directoryHeading}><button type="button" className={s.back} onClick={onBack}><ArrowLeft size={16} aria-hidden="true"/>종목 순위</button><span>{journey.my_department} · {LEAGUE_SPORTS[sport].label}</span><h2 className={s.srOnly}>함께할 우리 과 팀</h2></header>
  <div className={s.sportBanner}><Image src={LEAGUE_SPORTS[sport].photo} alt="" fill sizes="(max-width: 650px) 100vw, 980px"/><div><strong>{tab==='teams'?'오늘, 우리 팀으로 한 경기.':'우리 과 친구들과 함께할 한 경기.'}</strong><span>친구 초대 없이도 빈자리에 신청해요.</span></div><small>종목 공통 이미지</small></div>
  <div className={s.tabs} role="group" aria-label="팀 찾기 보기"><button type="button" aria-pressed={tab==='teams'} onClick={()=>setTab('teams')}>모집 중인 팀</button><button type="button" aria-pressed={tab==='notices'} onClick={()=>setTab('notices')}>우리 과 모집 소식</button></div>
  <div className={s.tools}><label className={s.searchField}><Search size={18} aria-hidden="true"/><input aria-label="불러온 목록에서 검색" placeholder={tab==='teams'?'불러온 팀 이름 검색':'불러온 팀·모집 내용 검색'} value={search} onChange={event=>setSearch(event.target.value)}/></label><button type="button" className={s.createButton} onClick={onCreate}>팀 만들기<Plus size={16} aria-hidden="true"/></button></div>
  <div className={s.directoryMeta}><p className={s.note}>{tab==='notices'?'학생이 직접 올린 모집 소식 · 학교·학과 공식 공지 아님':'빈자리에 신청하면 주장이 승인 후 팀원을 확정해요.'}</p><button type="button" className={s.refresh} disabled={loading} onClick={()=>void load()}><RefreshCw size={14} aria-hidden="true"/>새로고침</button></div>
  {error?<p role="alert" className={s.error}>{error}</p>:null}
  {loading&&!page&&!demo?<p role="status" className={s.empty}>우리 과 팀을 확인하고 있어요.</p>:tab==='teams'?<div className={s.cards}>{teams.length?teams.map((team,index)=><LeagueRecruitmentTeamCard key={team.team_id} sport={sport} team={team} onSelect={onSelect} featured={index===0}/>):<p className={s.empty}>{search?'검색에 맞는 팀이 없어요.':'아직 우리 과 모집팀이 없어요. 첫 팀을 만들어 보세요.'}</p>}</div>:<div className={s.cards}>{notices.length?notices.map(notice=><LeagueRecruitmentNoticeCard key={notice.id} sport={sport} notice={notice} onSelect={onSelect}/>):<p className={s.empty}>{search?'검색에 맞는 모집 소식이 없어요.':'아직 우리 과 학생 모집 소식이 없어요.'}</p>}</div>}
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
  <div className={s.summary}><div className={s.teamIdentity}><TeamSymbol name={team.team_name||detail.challenge.title}/><div><strong>{team.team_name||detail.challenge.title}</strong><p>{LEAGUE_SPORTS[detail.sport].label} · {team.players.filter(p=>p.status==='accepted').length}/{LEAGUE_SPORTS[detail.sport].capacity}명 확정</p></div></div><Vacancy sport={detail.sport} slots={detail.empty_slots}/><ReservedSlots sport={detail.sport} slots={detail.reserved_slots}/><small>현재 팀 지도에서 자동으로 가져왔어요.</small></div>
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
