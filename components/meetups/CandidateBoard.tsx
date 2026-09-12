'use client'

import Image from 'next/image'
import Link from 'next/link'
import {useCallback,useEffect,useRef,useState} from 'react'
import {ArrowLeft,ArrowRight,Bell,BookOpen,Check,ChevronDown,ChevronRight,Clock,MessageCircle,Pin,Plus,RefreshCw,ShieldCheck,UsersRound,X} from 'lucide-react'
import {candidatePositions,parseCandidateBoard,type CandidateBoard as Board,type CandidateInvite,type CandidateRow,type CandidateScope} from '@/lib/meetups/candidate-board-contract'
import {candidateRoomHref,candidateScopeTitle,compatibleSlots,displayCandidates,positionLabel as label} from '@/lib/meetups/candidate-board-view'
import {LEAGUE_SPORTS,type LeagueSport} from '@/lib/meetups/challenge-journey'
import {getStudyCourse,getStudyCoursePhoto} from '@/lib/meetups/study-catalog'
import {LeagueTierBadge,LeagueTierPicker} from '@/components/community/department/LeagueTier'
import {useHostedResource} from './useHostedResource'
import {CandidateDepositStep,LiveCandidateDepositStep} from './CandidateDepositStep'
import s from './candidate-board.module.css'

export type BoardAction=(action:string,args:Record<string,unknown>)=>Promise<Board|null>
type RegistrationDraft={positions:string[];tier:string|null;intro:string;availability:string;consent:boolean;expected_revision:number|null}
type BoardProps={scope:CandidateScope;board:Board;busy:boolean;error:string;filter:string;onFilter:(filter:string)=>void;onMore:()=>void;onRefresh:()=>void;onAction:BoardAction;demo?:boolean;onDemoChat?:()=>void;initialInviteId?:string}

export default function CandidateBoardLive({scope,initialInviteId}:{scope:CandidateScope;initialInviteId?:string}){
 const [filter,setFilter]=useState('all'),[cursor,setCursor]=useState<string|null>(null)
 const parse=useCallback((payload:unknown,owner:string)=>{
  const value=parseCandidateBoard((payload as {data?:unknown}|null)?.data)
  return value?.owner_id===owner&&value.scope.kind===scope.kind&&value.scope.key===scope.key?value:null
 },[scope.kind,scope.key])
 const query=new URLSearchParams({scope_kind:scope.kind,scope_key:scope.key,filter,...(cursor?{cursor}:{})})
 const resource=useHostedResource(`/api/meetups/candidates?${query}`,parse)
 const paginationOwner=useRef(resource.account)
 useEffect(()=>{
  if(paginationOwner.current!==resource.account){paginationOwner.current=resource.account;setCursor(null);setFilter('all')}
 },[resource.account])
 const action:BoardAction=async(command,args)=>{
  const result=await resource.mutate('/api/meetups/candidates',{action:command,args:{scope_kind:scope.kind,scope_key:scope.key,...args,idempotency_key:crypto.randomUUID()}},body=>parse(body,resource.account??''))
  if(result){setCursor(null);await resource.load()}
  return result
 }
 if(!resource.data)return <main className={s.page}><Header scope={scope}/><section className={s.connection} aria-live="polite">
  <UsersRound size={36}/><h1>합류 대기판</h1>
  <p>{resource.account===null?`로그인하면 같은 ${scope.kind==='meetup'?'학교':'학과'}의 합류 대기 현황을 볼 수 있어요.`:resource.loading?'대기 현황을 확인하고 있어요.':'실제 합류 대기 현황에 연결하지 못했어요.'}</p>
  <small>연결되지 않은 상태를 0명으로 표시하지 않아요.</small>
  {resource.account===null?<Link className={s.primary} href={`/login?returnTo=${encodeURIComponent(`/meetups/candidates?${new URLSearchParams({kind:scope.kind,key:scope.key,...(initialInviteId?{invite:initialInviteId}:{})})}`)}`}>로그인하고 보기</Link>:<button className={s.primary} disabled={resource.loading} onClick={()=>{setCursor(null);void resource.load()}}><RefreshCw size={18}/>다시 확인하기</button>}
  <Link className={s.textButton} href={candidateRoomHref(scope)}>모집 중인 모임으로 돌아가기</Link>
 </section></main>
 return <CandidateBoardView key={`${resource.account}:${scope.kind}:${scope.key}`} initialInviteId={initialInviteId} scope={scope} board={resource.data} busy={resource.busy} error={resource.error} filter={filter} onFilter={value=>{setCursor(null);setFilter(value)}} onMore={()=>setCursor(resource.data?.next_cursor??null)} onRefresh={()=>{setCursor(null);void resource.load()}} onAction={action}/>
}

function Header({scope,onBack,onInbox,unread=0}:{scope:CandidateScope;onBack?:()=>void;onInbox?:()=>void;unread?:number}){
 return <header className={s.header}>{onBack?<button className={s.circle} aria-label="대기판으로 돌아가기" onClick={onBack}><ArrowLeft size={22}/></button>:<Link className={s.circle} aria-label="모집 목록으로 돌아가기" href={candidateRoomHref(scope)}><ArrowLeft size={22}/></Link>}<strong>{candidateScopeTitle(scope)}</strong>{onInbox?<button className={s.bell} aria-label={`받은 초대 ${unread}개`} onClick={onInbox}><Bell size={23}/>{unread>0&&<span>{unread}</span>}</button>:null}</header>
}

export function CandidateBoardView({scope,board,busy,error,filter,onFilter,onMore,onRefresh,onAction,demo=false,onDemoChat,initialInviteId}:BoardProps){
 const [panel,setPanel]=useState<'board'|'register'|'deposit'|'detail'|'inbox'|'invite'|'cancel'|'chat'>(initialInviteId?'invite':'board')
 const [draft,setDraft]=useState<RegistrationDraft|null>(null),[depositConsent,setDepositConsent]=useState(false),[depositError,setDepositError]=useState('')
 const [selected,setSelected]=useState<string|null>(null),[inviteId,setInviteId]=useState<string|null>(initialInviteId??null),[feedback,setFeedback]=useState(''),[visibleCount,setVisibleCount]=useState(3)
 const anchor=useRef<HTMLHeadingElement>(null)
 const mine=board.mine,active=mine?.status==='waiting',joining=mine?.status==='joining',joined=mine?.status==='joined'
 const incoming=board.incoming.filter(i=>i.status==='pending'||i.status==='joining'),positions=candidatePositions(scope)
 const history=board.incoming.filter(i=>i.status!=='pending'&&i.status!=='joining')
 const joinedInvite=joined?board.incoming.find(i=>i.status==='joined'&&i.next_href===mine?.next_href):null
 const displayed=displayCandidates(board.candidates),limit=active?Math.max(2,visibleCount-1):visibleCount
 const candidate=board.candidates.find(c=>c.id===selected&&c.status==='waiting')
 const invitation=board.incoming.find(i=>i.id===inviteId)??board.outgoing.find(i=>i.id===inviteId)
 const title=scope.kind==='league'?'팀을 기다리는 친구들':scope.kind==='study'?'같이 공부할 친구들':scope.kind==='mentoring'?'함께 이야기할 친구들':'함께할 모임을 기다려요'
 const course=scope.kind==='study'?getStudyCourse(scope.key):null
 const scopeLabel=course?.title??label(scope.key)
 useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});anchor.current?.focus()},[panel])
 useEffect(()=>{if(joined&&!invitation?.is_sender&&['invite','register','deposit'].includes(panel))setPanel('board')},[joined,panel,invitation?.is_sender])
 useEffect(()=>{if(panel==='register')setFeedback('')},[panel])
 async function run(action:string,args:Record<string,unknown>){
  setFeedback('');const result=await onAction(action,args)
  if(!result){setFeedback('상태가 바뀌었거나 연결이 끊겼어요. 새로 확인한 뒤 다시 시도해 주세요.');return null}
  if(result.result?.status==='preparation_required')setFeedback('현재 이 모임의 보증금 결제 연결을 준비하고 있어요. 아직 합류한 상태가 아니며, 대기 등록과 초대는 유지돼요.')
  return result
 }
 function chat(href:string|null){if(!href)return;if(demo){setPanel('chat');onDemoChat?.()}}
 const chatLink=(href:string|null)=>href?(demo?<button className={s.primary} onClick={()=>chat(href)}><MessageCircle size={19}/>우리 모임 채팅으로<ArrowRight size={18}/></button>:<Link className={s.primary} href={href}><MessageCircle size={19}/>우리 모임 채팅으로<ArrowRight size={18}/></Link>):null
 return <main className={s.page} data-candidate-board={scope.kind}>
  <Header scope={scope} onBack={panel==='board'?undefined:()=>setPanel('board')} onInbox={()=>setPanel('inbox')} unread={incoming.length}/>
  {demo&&<div className={s.demoLabel}>로컬 체험 · 인원·계정·결제는 예시</div>}
  <div className={s.context}><span>{board.department_label}</span><span>{scopeLabel}</span></div>
  {panel==='board'&&<nav className={s.tabs} aria-label="모집 탐색"><Link href={candidateRoomHref(scope)}>{scope.kind==='league'?'모집 중인 팀':'모집 중인 모임'}</Link><span aria-current="page">합류 대기판</span></nav>}
  {(error||feedback)&&<div className={s.alert} role="alert">{feedback||'현황을 갱신하지 못했어요. 다시 확인해 주세요.'}<button disabled={busy} onClick={onRefresh}>새로 확인</button></div>}
  {panel==='board'&&<>
   <section className={s.intro}><h1 ref={anchor} tabIndex={-1}>{title}</h1><div className={s.countRow}><p><strong>{board.total_count}명</strong><span>합류 대기 중</span></p><Link href={candidateRoomHref(scope)}><Plus size={17}/>{scope.kind==='league'?'팀':'모임'} 만들기<ArrowRight size={15}/></Link></div><p className={s.muted}>방을 만들기 전에도 볼 수 있어요.</p></section>
   {(joined||joining)&&<section className={s.joined} aria-live="polite"><ShieldCheck size={24}/><div><strong>{joined?`${joinedInvite?.room_title??'모임'}에 합류했어요`:'참가 절차를 확인하고 있어요'}</strong><p>{joined?`다른 ${scope.kind==='league'?'팀':'모임'}의 초대는 자동으로 종료됐어요. 내 대기 카드도 내려갔어요.`:'이중 초대를 막기 위해 잠시 숨겼어요. 참가 취소·확인 시간 만료 시 다시 대기할 수 있어요.'}</p></div></section>}
   {positions.length>0&&<div className={s.filters} role="group" aria-label="가능한 포지션 필터">{['all',...positions].map(p=><button key={p} aria-pressed={filter===p} onClick={()=>onFilter(p)}>{p==='all'?'전체':label(p)}</button>)}</div>}
   {filter!=='all'&&<p className={s.filterCount}>{label(filter)} 가능한 친구 {board.filtered_count}명 · 여러 포지션을 선택해도 한 사람으로 집계해요.</p>}
   {active&&mine&&<article className={s.mine}><div className={s.pin}><Pin size={14}/>내 등록 · 공개 중</div><CandidateCard row={mine} scope={scope} onClick={()=>setPanel('register')}/><div className={s.mineFooter}><span>아직 합류한 모임은 없어요.</span><button onClick={()=>setPanel('register')}>등록 수정</button><button onClick={()=>setPanel('cancel')}>대기 취소</button></div></article>}
   <div className={s.list}>{displayed.slice(0,limit).map(row=><CandidateCard key={row.id} row={row} scope={scope} onClick={()=>{setSelected(row.id);setPanel('detail')}}/>)}</div>
   {board.filtered_count===0&&<section className={s.empty}><UsersRound size={28}/><h2>{filter==='all'?'첫 번째 친구가 되어 주세요':'아직 이 포지션의 대기자가 없어요'}</h2><p>{filter==='all'?'등록해 두면 같은 활동을 찾는 친구들이 초대할 수 있어요.':'다른 포지션을 함께 보거나 직접 대기 등록할 수 있어요.'}</p></section>}
   <div className={s.moreRow}>{(displayed.length>limit||board.next_cursor)&&<button onClick={()=>{if(displayed.length<=limit)onMore();setVisibleCount(n=>n+3)}} disabled={busy}>{displayed.length<=limit&&!demo?'다음 대기자 보기':'대기 중인 친구 더 보기'}<ChevronDown size={17}/></button>}<button aria-label="대기 현황 새로고침" disabled={busy} onClick={()=>{setVisibleCount(3);onRefresh()}}><RefreshCw size={17}/></button></div>
   <div className={s.bottomAction}>{joined?chatLink(mine?.next_href??null):joining?<button className={s.primary} onClick={()=>{setInviteId(incoming.find(i=>i.status==='joining')?.id??null);setPanel('invite')}}>참가 절차 이어서 확인하기<ArrowRight size={18}/></button>:active?<><p className={s.notice}><Bell size={17}/>초대가 오면 알림함으로 알려드려요.</p><button className={s.primary} onClick={()=>setPanel('inbox')}>받은 초대 확인하기 · {incoming.length}<ArrowRight size={18}/></button></>:<button className={s.primary} onClick={()=>setPanel('register')}>나도 합류 대기 등록하기<Plus size={19}/></button>}</div>
  </>}
  {panel==='register'&&(joining||joined)?<section className={s.empty}><h1>참가 상태를 먼저 확인해 주세요</h1><button className={s.primary} onClick={()=>setPanel('board')}>현재 상태 보기</button></section>:panel==='register'?<Registration scope={scope} mine={mine} draft={draft} busy={busy} onSubmit={async args=>{if(active){if(await run('register',args)){setDraft(null);setPanel('board')}}else{setDraft(args);setDepositConsent(false);setDepositError('');setPanel('deposit')}}}/>:null}
  {panel==='deposit'&&draft&&(demo?<CandidateDepositStep scope={scope} demo busy={busy} consent={depositConsent} error={depositError} onConsent={setDepositConsent} onBack={()=>setPanel('register')} onCancel={()=>{setDraft(null);setPanel('board')}} onFailure={()=>{setDepositError('예시 결제가 완료되지 않았어요. 글은 아직 공개되지 않았고, 다시 시도할 수 있어요.')}} onPublish={()=>{if(depositConsent&&!busy)void(async()=>{if(await run('register',draft)){setDraft(null);setDepositError('');setPanel('board')}})()}}/>:<LiveCandidateDepositStep scope={scope} ownerId={board.owner_id} onBack={()=>setPanel('register')} onCancel={()=>{setDraft(null);setPanel('board')}}/>)}
  {panel==='cancel'&&<section className={s.panel}><X size={32}/><h1>합류 대기를 취소할까요?</h1><p>대기판에서 내 카드가 내려가고, 아직 결정하지 않은 초대도 종료돼요. 이미 가입한 다른 모임은 그대로예요.</p><p className={s.small}>대기를 취소해도 자동 반환되지 않아요. 보증금 반환 신청을 하면 반환을 진행해요.<br/>{demo?'실제 납부가 없는 예시여서 반환도 발생하지 않아요.':'실제 반환 신청 기능은 준비 중이며, 이 화면에서 신청·반환 완료로 표시하지 않아요.'}</p><button className={s.primary} disabled={busy||!mine} onClick={async()=>{if(await run('cancel',{expected_revision:mine?.revision}))setPanel('board')}}>대기 등록 취소하기</button><button className={s.secondary} onClick={()=>setPanel('board')}>계속 기다릴게요</button></section>}
  {panel==='detail'&&(candidate?<CandidateDetail scope={scope} candidate={candidate} board={board} busy={busy} onInvite={async args=>{if(await run('invite',args)){setFeedback('초대를 보냈어요. 상대가 수락하기 전에는 합류가 확정되지 않아요.');setPanel('board')}}}/>:<section className={s.empty}><h1>이 친구는 지금 대기 중이 아니에요</h1><p>다른 모임에 합류했거나 등록을 취소했을 수 있어요.</p><button className={s.primary} onClick={()=>{onRefresh();setPanel('board')}}>현재 대기자 다시 보기</button></section>)}
  {panel==='inbox'&&<section className={s.panel}><span className={s.eyebrow}>내 합류 대기</span><h1 ref={anchor} tabIndex={-1}>{joined?'합류와 초대 기록':'함께하자는 초대가 왔어요'}</h1><p>{joined?'합류가 확정되어 다른 초대가 종료됐어요. 이제 우리 모임 채팅에서 이야기해요.':'초대만 받아서는 대기판에서 사라지지 않아요. 조건을 확인하고 직접 결정해 주세요.'}</p>{incoming.length===0?<div className={s.empty}><Bell size={27}/><h2>{history.length?'진행 중인 초대가 없어요':'아직 받은 초대가 없어요'}</h2><p>{joined?'지난 초대의 처리 결과를 아래에서 확인할 수 있어요.':active?'대기 등록은 그대로 유지돼요. 다른 화면을 둘러봐도 괜찮아요.':'대기판에서 현재 등록 상태를 확인해 주세요.'}</p></div>:incoming.map(inv=><button className={s.inviteCard} key={inv.id} onClick={()=>{setInviteId(inv.id);setPanel('invite')}}><span><strong>{inv.room_title}</strong><small>{inv.slot?`${label(inv.slot)} 자리로 초대했어요`:'같이 공부하자는 초대예요'}</small><span>{inv.status==='joining'?'참가 절차 진행 중':'초대 내용 확인하기'}</span></span><ChevronRight size={22}/></button>)}{history.length>0&&<details className={s.sent} open={joined}><summary>지난 초대 {history.length}개</summary>{history.map(inv=><p key={inv.id}><strong>{inv.room_title}</strong><span>{({pending:'수락 대기',joining:'참가 확인 중',joined:'합류 완료',declined:'내가 거절한 초대',cancelled:'취소',unavailable:'종료 · 더 이상 수락할 수 없어요'})[inv.status]}</span></p>)}</details>}{joined&&chatLink(mine?.next_href??null)}{board.outgoing.length>0&&<details className={s.sent}><summary>내가 보낸 초대 {board.outgoing.length}개</summary>{board.outgoing.map(i=><p key={i.id}>{i.candidate_alias} · {i.room_title}<span>{({pending:'수락 대기',joining:'참가 확인 중',joined:'합류 완료',declined:'거절',cancelled:'취소',unavailable:'종료'})[i.status]}</span></p>)}</details>}</section>}
  {panel==='invite'&&(invitation?.is_sender?<section className={s.panel}><span className={s.eyebrow}>내가 보낸 초대</span><h1>{invitation.room_title}</h1><h2>{invitation.candidate_alias}님의 초대 상태</h2><div className={s.joined}><Bell size={22}/><p>{({pending:'상대가 초대를 확인하고 있어요.',joining:'상대가 참가 조건을 확인하고 있어요. 아직 합류 확정은 아니에요.',joined:'합류가 확정됐어요. 같은 모임에서 함께 이야기해 보세요.',declined:'이번 초대는 거절했어요. 다른 대기자에게 초대할 수 있어요.',cancelled:'이 초대는 취소됐어요.',unavailable:'현재 유효하지 않은 초대예요. 모집 상태를 다시 확인해 주세요.'})[invitation.status]}</p></div>{['unavailable','cancelled','declined'].includes(invitation.status)?<button className={s.primary} onClick={()=>{onRefresh();setPanel('board')}}>다른 대기자 찾아보기<ArrowRight size={18}/></button>:<Link className={s.primary} href={candidateRoomHref(scope)}>우리 모임 현황 보기<ArrowRight size={18}/></Link>}<button className={s.secondary} onClick={()=>setPanel('board')}>합류 대기판으로 돌아가기</button></section>:<InviteDetail invite={invitation} busy={busy} demo={demo} onAction={async(action,inv)=>{const result=await run(action,{invite_id:inv.id,expected_revision:inv.revision});if(result&&action!=='accept')setPanel('board')}}/>)}
  {panel==='chat'&&demo&&<section className={s.panel}><span className={s.eyebrow}>로컬 예시 · 실제 메시지는 전송하지 않아요</span><h1>우리 모임 채팅</h1><div className={s.joined}><Check size={22}/><p>합류가 확정되어 대기판의 내 등록이 종료됐어요.</p></div><p className={s.chatBubble}>반가워요! 이번 주에 언제 만날까요?</p><p className={s.chatBubble}>위에 올린 시간 투표부터 같이 확인해 주세요.</p><p>운영 화면에서는 실제 소속 채팅방으로 이동하며, 기존 대화도 참여 권한에 따라 볼 수 있어요.</p><button className={s.secondary} onClick={()=>setPanel('board')}>대기판에서 내 카드가 내려갔는지 보기</button></section>}
 </main>
}

function CandidateCard({row,scope,onClick}:{row:CandidateRow;scope:CandidateScope;onClick:()=>void}){
 return <button className={s.candidate} onClick={onClick} aria-label={`${row.alias} · ${row.positions.map(label).join(', ')||'합류 대기'} 상세 보기`}>
  <span className={s.emblem}>{scope.kind==='league'&&scope.key==='lol'?<LeagueTierBadge tier={row.tier} label={label(row.tier??'')} size="detail" showLabel={false}/>:scope.kind==='study'?<BookOpen size={30}/>:<UsersRound size={30}/>}</span>
  <span className={s.cardBody}><strong>{row.alias}</strong>{row.tier&&<small>{label(row.tier)} · 직접 입력</small>}<span className={s.positionTags}>{row.positions.map(p=><span key={p}>{label(p)}</span>)}</span><span className={s.quote}>{row.intro?`“${row.intro}”`:row.availability||'함께할 친구를 기다리고 있어요.'}</span></span><ChevronRight className={s.chevron} size={20}/>
 </button>
}

function Registration({scope,mine,draft,busy,onSubmit}:{scope:CandidateScope;mine:CandidateRow|null;draft:RegistrationDraft|null;busy:boolean;onSubmit:(args:RegistrationDraft)=>Promise<void>}){
 const options=candidatePositions(scope),[positions,setPositions]=useState(draft?.positions??mine?.positions??[]),[tier,setTier]=useState(draft?.tier??mine?.tier??(scope.key==='lol'?'gold':'beginner'))
 const savedTimeParts=(draft?.availability??mine?.availability??'').split(' · ')
 const [intro,setIntro]=useState(draft?.intro??mine?.intro??''),[days,setDays]=useState<string[]>(()=>savedTimeParts.filter(value=>['월','화','수','목','금','토','일'].includes(value))),[times,setTimes]=useState<string[]>(()=>savedTimeParts.filter(value=>['오전','오후','저녁','조율 가능'].includes(value))),[availability,setAvailability]=useState(draft?.availability??mine?.availability??''),[consent,setConsent]=useState(draft?.consent??mine?.status==='waiting')
 const toggle=(p:string)=>setPositions(current=>current.includes(p)?current.filter(x=>x!==p):[...current,p])
 const updateTime=(value:string,isDay:boolean)=>{const values=isDay?days:times,next=values.includes(value)?values.filter(x=>x!==value):[...values,value];if(isDay)setDays(next);else setTimes(next);setAvailability([...(isDay?next:days),...(isDay?times:next)].join(' · '))}
 const course=scope.kind==='study'?getStudyCourse(scope.key):null
 return <form className={s.registration} onSubmit={event=>{event.preventDefault();void onSubmit({positions,tier:scope.kind==='league'?tier:null,intro:intro.trim(),availability:availability.trim(),consent,expected_revision:mine?.revision??null})}}>
  <span className={s.eyebrow}>{mine?.status==='waiting'?'대기 등록 수정':'대기 등록 · 1/2 소개'}</span><h1>{scope.kind==='league'?'어디든, 내 자리로.':scope.kind==='study'?'같이 공부하고 싶어요.':'함께할 친구를 기다려요.'}</h1><p className={s.muted}>{scope.kind==='league'?'가능한 포지션은 여러 개 골라도 좋아요. 초대받을 때 한 자리를 정해요.':'모임을 직접 만들지 않아도, 내가 먼저 함께할 의사를 전할 수 있어요.'}</p>
  <fieldset disabled={busy}>
  {scope.kind==='league'?<PositionMap scope={scope} positions={positions} onToggle={toggle}/>:scope.kind==='study'?<div className={s.courseImage}><Image src={getStudyCoursePhoto(course?.title??'').src} alt="" fill sizes="(max-width:640px) 100vw, 600px"/><strong>{course?.title??'전공 스터디'}</strong></div>:null}
  {options.length>0&&<div className={s.selection}><strong>{scope.kind==='mentoring'?'나의 역할':'가능한 포지션 · 복수 선택'}</strong><div className={s.wrapChips}>{options.map(p=><button type="button" key={p} aria-pressed={positions.includes(p)} onClick={()=>toggle(p)}>{positions.includes(p)&&<Check size={15}/>} {label(p)}</button>)}</div></div>}
  {scope.kind==='league'&&(scope.key==='lol'?<LeagueTierPicker value={tier} onChange={setTier} label="내 티어 · 직접 입력" getLabel={label}/>:<label className={s.field}>내 실력 · 직접 입력<select value={tier} onChange={e=>setTier(e.target.value)}>{['beginner','intermediate','advanced'].map(p=><option key={p} value={p}>{label(p)}</option>)}</select></label>)}
  <div className={s.selection}><strong><Clock size={16}/> 편한 요일과 시간</strong><div className={s.wrapChips}>{['월','화','수','목','금','토','일'].map(day=><button type="button" key={day} aria-pressed={days.includes(day)} onClick={()=>updateTime(day,true)}>{day}</button>)}</div><div className={s.wrapChips}>{['오전','오후','저녁','조율 가능'].map(time=><button type="button" key={time} aria-pressed={times.includes(time)} onClick={()=>updateTime(time,false)}>{time}</button>)}</div><label className={s.field}>가능한 시간<input value={availability} onChange={e=>setAvailability(e.target.value)} required maxLength={100} placeholder="예: 월·수 저녁, 시간은 함께 조율해요"/></label></div>
  <label className={s.field}>나를 소개하는 한마디 <small>선택 · {intro.length}/200</small><textarea value={intro} onChange={e=>setIntro(e.target.value)} maxLength={200} rows={2} placeholder={scope.kind==='study'?'차근차근, 질문하며 같이 공부하고 싶어요.':'시야 잘 잡고, 편하게 소통해요.'}/></label>
  <label className={s.consent}><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>이 활동을 찾는 같은 {scope.kind==='meetup'?'학교':'학과'} 친구들에게 닉네임{scope.kind==='league'?'·가능한 포지션·티어':scope.kind==='mentoring'?'·역할':''}·시간·소개를 공개하고 초대를 받을게요.</span></label>
  <p className={s.small}>{mine?.status==='waiting'?'현재 공개 중인 소개를 수정해요. 이 수정은 보증금 납부나 팀 가입이 아니에요.':'아직 글은 공개되지 않아요. 다음 단계에서 보증금을 확인한 뒤 등록해요.'}</p>
  <button className={s.primary} disabled={busy||!consent||!availability.trim()||(options.length>0&&!positions.length)} type="submit">{busy?'등록 확인 중…':mine?.status==='waiting'?'내 대기 등록 수정하기':'보증금 확인하기'}<ArrowRight size={18}/></button>
  </fieldset>
 </form>
}

function PositionMap({scope,positions,onToggle}:{scope:CandidateScope;positions:string[];onToggle:(position:string)=>void}){
 const sport=scope.key as LeagueSport,definition=LEAGUE_SPORTS[sport]
 const points=sport==='lol'?definition.slots.map(p=>({key:p.key,x:p.x,y:p.y})): [{key:'forward',x:50,y:18},{key:'midfielder',x:50,y:40},{key:'defender',x:50,y:64},{key:'goalkeeper',x:50,y:85}]
 return <div className={`${s.positionMap} ${sport==='lol'?s.lolMap:s.pitch}`} role="group" aria-label="지도에서 가능한 포지션 선택"><Image src={definition.image} alt={sport==='lol'?'LoL 미니맵':'축구 경기장'} fill sizes="(max-width:640px) 100vw, 600px"/>{points.map(p=><button type="button" key={p.key} style={{left:`${p.x}%`,top:`${p.y}%`}} className={s.mapPoint} aria-pressed={positions.includes(p.key)} aria-label={`${label(p.key)} 포지션`} onClick={()=>onToggle(p.key)}><span>{positions.includes(p.key)?<Check size={19}/>:<Plus size={19}/>}</span><strong>{label(p.key)}</strong></button>)}</div>
}

function CandidateDetail({scope,candidate,board,busy,onInvite}:{scope:CandidateScope;candidate:CandidateRow;board:Board;busy:boolean;onInvite:(args:Record<string,unknown>)=>Promise<void>}){
 const rooms=board.host_rooms.filter(r=>r.member_count<r.capacity&&(scope.kind==='study'||scope.kind==='meetup'||compatibleSlots(scope,candidate,r).length>0))
 const [roomId,setRoomId]=useState(rooms[0]?.id??''),[slot,setSlot]=useState('')
 const room=rooms.find(r=>r.id===roomId),slots=room?compatibleSlots(scope,candidate,room):[]
 const validSlot=scope.kind==='study'||scope.kind==='meetup'?null:slots.includes(slot)?slot:slots[0]??null
 return <section className={s.panel}><span className={s.eyebrow}>합류를 기다리고 있어요</span><h1>{candidate.alias}</h1><CandidateCard row={candidate} scope={scope} onClick={()=>{}}/>{candidate.intro&&<blockquote className={s.fullIntro}>{candidate.intro}</blockquote>}<div className={s.availability}><Clock size={18}/><span>{candidate.availability}</span></div><p>등록한 포지션 중, 우리 모임의 빈자리 하나로 초대해요. 상대가 직접 조건을 확인하고 결정해요.</p>
  {rooms.length===0?<div className={s.empty}><h2>초대할 수 있는 내 모임이 없어요</h2><p>모임을 만들거나 현재 모집 상태를 확인해 주세요. 이미 자리가 찬 모임은 선택할 수 없어요.</p><Link className={s.primary} href={candidateRoomHref(scope)}>모임 만들고 초대하기<ArrowRight size={17}/></Link></div>:<><label className={s.field}>어느 모임으로 초대할까요?<select value={roomId} disabled={busy} onChange={e=>{setRoomId(e.target.value);setSlot('')}}>{rooms.map(r=><option key={r.id} value={r.id}>{r.title} · {r.member_count}/{r.capacity}명</option>)}</select></label>{validSlot!==null&&<div className={s.selection}><strong>초대할 자리 · 한 자리 선택</strong><div className={s.wrapChips}>{slots.map(p=><button key={p} aria-pressed={validSlot===p} disabled={busy} onClick={()=>setSlot(p)}>{label(p)}</button>)}</div></div>}<button className={s.primary} disabled={busy||!room} onClick={()=>{if(room)void onInvite({candidate_id:candidate.id,candidate_revision:candidate.revision,room_id:room.id,room_revision:room.revision,slot:validSlot})}}>{busy?'초대 확인 중…':'이 자리로 초대 보내기'}<ArrowRight size={18}/></button></>}
 </section>
}

function InviteDetail({invite,busy,demo,onAction}:{invite:CandidateInvite|undefined;busy:boolean;demo:boolean;onAction:(action:string,invite:CandidateInvite)=>Promise<void>}){
 if(!invite||!['pending','joining'].includes(invite.status))return <section className={s.empty}><h1>현재 진행할 수 있는 초대가 아니에요</h1><p>취소되었거나, 다른 모임에 합류하면서 종료되었을 수 있어요. 대기판에서 현재 상태를 확인해 주세요.</p></section>
 const joining=invite.status==='joining'
 return <section className={s.panel}><span className={s.eyebrow}>함께하자는 초대</span><h1>{invite.room_title}</h1><div className={s.invitationHero}><UsersRound size={32}/><h2>{invite.slot?`${label(invite.slot)} 자리에 함께해요`:'같이 공부할 친구를 기다려요'}</h2><p>내 의사와 참가 조건을 확인한 뒤 합류해요.</p></div><div className={s.joined}><ShieldCheck size={24}/><div><strong>{demo?'보증금은 다시 내지 않아요':'보증금·참가 조건을 먼저 확인해요'}</strong><p>{demo?'대기 등록 때 확인한 예시 보증금을 이어 쓰는 흐름이에요. 실제 납부·가입은 발생하지 않아요.':'초대 수락만으로 결제하거나 가입하지 않아요. 결제 연결이 준비되지 않았다면 가입을 확정하지 않아요.'}</p></div></div>
  {joining?<><p>참가 절차를 확인하는 동안 대기판에서 잠시 숨겨져요. 실제 합류가 확정되어야 등록이 종료돼요.</p>{invite.next_href&&!demo?<Link className={s.primary} href={invite.next_href}>참가 조건·보증금 확인하기<ArrowRight size={18}/></Link>:<p className={s.small}>{demo?'아래 체험 도구의 합류 확정으로 다음 화면을 확인할 수 있어요.':'현재 보증금 결제 연결을 준비하고 있어요. 실제 참가를 완료한 상태가 아니에요.'}</p>}<button className={s.secondary} disabled={busy} onClick={()=>void onAction('release',invite)}>참가 확인 취소하고 다시 대기하기</button></>:<><button className={s.primary} disabled={busy} onClick={()=>void onAction('accept',invite)}>{busy?'현재 상태 확인 중…':'초대 수락하고 참가 조건 확인'}<ArrowRight size={18}/></button><button className={s.textButton} disabled={busy} onClick={()=>void onAction('decline',invite)}>이번 초대는 거절하고 계속 기다리기</button></>}
 </section>
}
