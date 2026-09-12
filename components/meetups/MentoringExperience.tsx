'use client'

import Image from 'next/image'
import Link from 'next/link'
import {useRouter,useSearchParams} from 'next/navigation'
import {ArrowLeft,ArrowRight,Check,Clock3,Loader2,RefreshCw,Send,UsersRound} from 'lucide-react'
import {Suspense,useCallback,useEffect,useRef,useState} from 'react'
import {useQuantumLocale} from '@/components/i18n/QuantumLocaleProvider'
import {createClient} from '@/lib/supabase'
import {socialChatHref} from '@/lib/chat/social-room-presentation'
import {useSocialChatRead} from '@/lib/chat/useSocialChatRead'
import {mentoringTargetMatches,mentoringInvitationOnly} from '@/lib/notifications/common-contract'
import {parseGroupMentoringSnapshot,type GroupMentoringCommand,type GroupMentoringRole,type GroupMentoringSnapshot} from '@/lib/mentoring/group-contract'
import {advanceMentoringDemo,createMentoringDemo,type MentoringDemoAction} from '@/lib/mentoring/group-demo'
import s from './mentoring.module.css'
import HostedMentoringLobby from './HostedMentoringLobby'

type MentoringExperienceProps = {demo?:boolean;chatOnly?:boolean;fixedSessionId?:string;readOnly?:boolean}
export default function MentoringExperience(props:MentoringExperienceProps){
 return <Suspense fallback={<p role="status">멘토링을 불러오고 있어요…</p>}>{props.chatOnly||props.fixedSessionId||props.demo?<MentoringContent {...props}/>:<MentoringEntry {...props}/>}</Suspense>
}
function MentoringEntry(props:MentoringExperienceProps){
 const params=useSearchParams()
 if(!props.demo&&!props.chatOnly&&!props.fixedSessionId&&!params.get('party')&&!params.get('session')&&params.get('legacy')!=='1')return <HostedMentoringLobby/>
 return <MentoringContent {...props}/>
}
function MentoringContent({demo=false,chatOnly=false,fixedSessionId,readOnly=false}:MentoringExperienceProps){
 const router=useRouter()
 const params=useSearchParams(),notificationParty=demo||fixedSessionId?null:params.get('party'),notificationSession=demo?null:fixedSessionId??params.get('session')
 const {t,locale}=useQuantumLocale()
 const [stored,setSnapshot]=useState<GroupMentoringSnapshot|null>(()=>demo?createMentoringDemo():null)
 const [role,setRole]=useState<GroupMentoringRole|null>(null),[sideSize,setSideSize]=useState<2|3>(2)
 const [stage,setStage]=useState<'size'|'friends'>('size'),[friendIds,setFriendIds]=useState<string[]>([])
 const [loading,setLoading]=useState(!demo),[busy,setBusy]=useState(false),[problem,setProblem]=useState('')
 const [draft,setDraft]=useState(''),[panel,setPanel]=useState<'end'|'report'|'plan'|null>(null)
 const [report,setReport]=useState(''),[target,setTarget]=useState(''),[meetingAt,setMeetingAt]=useState(''),[place,setPlace]=useState(''),[reported,setReported]=useState(false)
 const [,setTick]=useState(0)
 const epoch=useRef(0),requestAbort=useRef<AbortController|null>(null),mutating=useRef(false),mounted=useRef(true)
 const owner=useRef<string|null|undefined>(undefined),session=useRef<string|null>(null)
 const previousPhase=useRef<GroupMentoringSnapshot['phase']|null>(null)
 const pending=useRef<{signature:string;client_id:string}|null>(null),clock=useRef({server:Date.now(),received:Date.now()})
 const invalidate=useCallback(()=>{++epoch.current;requestAbort.current?.abort();requestAbort.current=null},[])
 const request=useCallback(async(command?:GroupMentoringCommand):Promise<boolean>=>{
  if(demo){if(command)setSnapshot(old=>advanceMentoringDemo(old??createMentoringDemo(),command));return true}
  if(mutating.current||(!command&&requestAbort.current))return false
  if(command){mutating.current=true;setBusy(true)}
  const ticket=++epoch.current;requestAbort.current?.abort();const abort=new AbortController();requestAbort.current=abort
  const timeout=window.setTimeout(()=>abort.abort(),12000)
  try{
   const response=await fetch('/api/mentoring',{method:command?'POST':'GET',cache:'no-store',signal:abort.signal,...(command?{headers:{'Content-Type':'application/json'},body:JSON.stringify(command)}:{})})
   const payload=await response.json().catch(()=>null) as {data?:unknown;error?:unknown}|null
   if(!mounted.current||ticket!==epoch.current)return false
   const next=response.ok?parseGroupMentoringSnapshot(payload?.data):null
   if(!next){setSnapshot(null);setProblem(typeof payload?.error==='string'&&['auth_required','profile_required','forbidden','rate_limited','already_waiting','friend_unavailable','not_active','legacy_active','conflict','invalid'].includes(payload.error)?payload.error:'unavailable');return false}
   if(!mentoringTargetMatches(next,{session:notificationSession,party:notificationParty})){setSnapshot(null);setProblem('social_target_ended');return false}
   clock.current={server:Date.parse(next.server_now),received:Date.now()}
   if(session.current!==next.session_id){setDraft('');setPanel(null);pending.current=null}
   const activated=next.phase==='active'&&(previousPhase.current==='offered'||command?.action==='accept')
   previousPhase.current=next.phase
   session.current=next.session_id;setSnapshot(next);setProblem('')
   if(activated&&!chatOnly&&next.session_id) router.push(socialChatHref({kind:'mentoring',id:next.session_id})??'/chat')
   return true
  }catch{if(mounted.current&&ticket===epoch.current){setSnapshot(null);setProblem('unavailable')}return false}
  finally{window.clearTimeout(timeout);if(command)mutating.current=false;if(ticket===epoch.current){requestAbort.current=null;if(mounted.current){setBusy(false);setLoading(false)}}}
 },[demo,notificationParty,notificationSession,chatOnly,router])
 useEffect(()=>{
  mounted.current=true
  setLoading(!demo)
  if(demo){setSnapshot(createMentoringDemo());setLoading(false);return()=>{mounted.current=false}}
  void request();const client=createClient()
  const {data:{subscription}}=client.auth.onAuthStateChange((event,current)=>{const id=current?.user.id??null;if(event==='SIGNED_OUT'||(owner.current!==undefined&&owner.current!==id)){invalidate();setSnapshot(null);setDraft('');setPanel(null);setFriendIds([]);setRole(null);pending.current=null;setProblem('auth_required');setBusy(false);setLoading(false)}owner.current=id})
  const poll=window.setInterval(()=>{if(document.visibilityState==='visible')void request()},5000)
  return()=>{mounted.current=false;invalidate();subscription.unsubscribe();window.clearInterval(poll)}
 },[demo,invalidate,request])
 useEffect(()=>{const timer=window.setInterval(()=>setTick(n=>n+1),1000);return()=>window.clearInterval(timer)},[])
 const alias=(value:string)=>value.replace(/^(멘토|멘티) (\d+)$/,(_match,kind:string,n:string)=>t(kind==='멘토'?'mentor.mentorName':'mentor.menteeName',{n}))
 const snapshot=stored?{...stored,members:stored.members.map(m=>({...m,label:alias(m.label)})),report_targets:stored.report_targets.map(m=>({...m,label:alias(m.label)})),messages:stored.messages.map(m=>({...m,alias:alias(m.alias),text:demo&&m.id==='42000000-0000-4000-8000-000000000070'?t('mentor.demoHello'):m.text}))}:null
 const invitationOnly=mentoringInvitationOnly(snapshot,notificationParty)
 const targetMismatch=Boolean(stored&&!mentoringTargetMatches(stored,{session:notificationSession,party:notificationParty}))
 const phase=targetMismatch?'target_changed':invitationOnly?'invited':snapshot?.phase??'idle',now=demo?Date.now():clock.current.server+Date.now()-clock.current.received
 const remaining=snapshot?.expires_at?Math.max(0,Math.ceil((Date.parse(snapshot.expires_at)-now)/1000)):0
 const usable=Boolean(snapshot)&&!targetMismatch&&!loading&&!busy&&!problem,active=usable&&phase==='active'&&remaining>0&&!readOnly
 const chatReadRoot=useRef<HTMLDivElement>(null)
 useSocialChatRead('mentoring',snapshot?.session_id,snapshot?.messages??[],{root:chatReadRoot,enabled:!demo&&chatOnly&&!targetMismatch&&!problem&&phase==='active'})
 const reset=()=>{setRole(null);setStage('size');setFriendIds([]);setPanel(null);setReported(false);pending.current=null}
 const example=(action:MentoringDemoAction['action'])=>{if(demo)setSnapshot(old=>advanceMentoringDemo(old??createMentoringDemo(),{action,args:{}} as MentoringDemoAction))}
 const keyed=(signature:string)=>{if(pending.current?.signature!==signature)pending.current={signature,client_id:crypto.randomUUID()};return pending.current.client_id}
 const join=async()=>{if(!role||!usable)return;const args={role,side_size:sideSize,friend_ids:friendIds};if(await request({action:'join',args:{...args,client_id:keyed(JSON.stringify(args))}}))pending.current=null}
 const send=async()=>{const text=draft.trim();if(!active||!text||!snapshot?.session_id)return;const client_id=keyed(`${snapshot.session_id}:${text}`);if(await request({action:'message',args:{session_id:snapshot.session_id,text,client_id}})){setDraft(current=>current.trim()===text?'':current);pending.current=null}}
 const finish=async()=>{if(!snapshot?.session_id||!panel)return;if(await request({action:panel==='report'?'report':'end',args:{session_id:snapshot.session_id,...(panel==='report'?{member_id:target,reason:report.trim()}:{})}})){if(panel==='report')setReported(true);setPanel(null);setReport('');setTarget('')}}
 const plan=async()=>{if(!meetingAt||!place.trim()||!snapshot?.session_id)return;const date=new Date(meetingAt);if(!Number.isFinite(date.getTime()))return;if(await request({action:'plan',args:{session_id:snapshot.session_id,starts_at:date.toISOString(),place:place.trim(),revision:snapshot.meeting?.revision??0}}))setPanel(null)}
 const dateText=(value:string)=>new Intl.DateTimeFormat({ko:'ko-KR',en:'en-GB',ja:'ja-JP',zh:'zh-CN'}[locale],{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))
 const sizeLabel=(n:number)=>t('mentor.composition',{n})
 const reportForm=snapshot&&panel==='report'?<section className={s.exitPanel}><h3>{t('mentor.report')}</h3><p>{t('mentor.reportNote')}</p><label>{t('mentor.reportTarget')}<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">{t('mentor.selectMember')}</option>{snapshot.report_targets.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label><textarea rows={3} value={report} maxLength={2000} aria-label={t('mentor.reportText')} placeholder={t('mentor.reportText')} onChange={e=>setReport(e.target.value)}/><button className={s.primary} disabled={busy||!target||!report.trim()} onClick={()=>void finish()}>{t('mentor.submitReport')}</button><button className={s.textButton} onClick={()=>setPanel(null)}>{t('common.cancel')}</button></section>:null
 const startStatus=!usable&&!busy?<section id="mentoring-start-status" className={s.error} role="status"><p>{loading?t('mentor.loading'):t(`mentor.${problem||'unavailable'}`)}</p><p>역할과 인원 선택은 둘러볼 수 있어요. 연결 확인 전에는 신청되지 않으며, 선택한 내용은 다시 확인해도 유지돼요.</p>{!loading?(problem==='auth_required'?<Link className={s.secondary} href="/login?redirect=%2Fmeetups%2Fdepartment%2Fmentoring">{t('mentor.login')}</Link>:problem==='profile_required'?<Link className={s.secondary} href="/profile/edit">{t('mentor.profile')}</Link>:<button type="button" className={s.secondary} onClick={()=>{setLoading(true);void request()}}><RefreshCw size={16}/>{t('mentor.refresh')}</button>):null}</section>:null
 const Container=chatOnly?'section':'main'
 return <Container className={chatOnly?undefined:s.page}><div className={s.shell}>
  {demo?<p className={s.demo}>{t('mentor.demo')}</p>:!chatOnly?<Link href="/meetups/department" className={s.back}><ArrowLeft size={16}/>{t('mentor.back')}</Link>:null}
  {!chatOnly?<header className={s.header}><p className={s.eyebrow}>{t('mentor.label')}</p><h1>{phase==='active'?t('mentor.active'):t('mentor.title')}</h1><p>{t('mentor.intro')}</p></header>:null}
  {loading?<p className={s.notice} role="status"><Loader2 size={18}/>{t('mentor.loading')}</p>:null}
  {targetMismatch?<p role="status" className={s.notice}>선택한 알림의 참여 상태를 확인하고 있어요. 다른 멘토링 방은 표시하지 않아요.</p>:null}
  {problem==='social_target_ended'?<section className={s.error} role="status"><p>이 안내의 참여는 이미 종료되었거나 변경되었어요. 다른 멘토링 방으로 자동 이동하지 않아요.</p><Link className={s.secondary} href="/meetups/department">우리 과 모임으로 돌아가기</Link></section>:null}
  {problem&&problem!=='social_target_ended'?<section className={s.error} role="alert"><p>{t(`mentor.${problem}`)}</p>{problem==='auth_required'?<Link className={s.primary} href="/login?redirect=%2Fmeetups%2Fdepartment%2Fmentoring">{t('mentor.login')}</Link>:problem==='profile_required'?<Link className={s.primary} href="/profile/edit">{t('mentor.profile')}</Link>:problem==='legacy_active'?<button className={s.primary} disabled={busy} onClick={()=>void request({action:'leave_legacy',args:{}})}>{t('mentor.leaveLegacy')}</button>:<button className={s.secondary} disabled={busy} onClick={()=>void request()}><RefreshCw size={16}/>{t('mentor.refresh')}</button>}</section>:null}
  {!chatOnly&&!targetMismatch&&snapshot?.invitations.filter(i=>!notificationParty||i.party_id===notificationParty).map(i=><section key={i.party_id} className={s.invite}><p className={s.eyebrow}>{t('mentor.invitation')}</p><h2>{i.inviter_label}</h2><p>{sizeLabel(i.side_size)} · {t(`mentor.${i.role}`)}</p><small>{t('mentor.inviteConsent')}</small><div className={s.actions}><button className={s.primary} disabled={!usable||!['idle','ended','expired'].includes(snapshot.phase)} onClick={()=>void request({action:'party_accept',args:{party_id:i.party_id}})}>{t('mentor.acceptInvite')}</button><button className={s.secondary} disabled={!usable} onClick={()=>void request({action:'party_decline',args:{party_id:i.party_id}})}>{t('mentor.decline')}</button></div></section>)}
  {invitationOnly&&snapshot&&!['idle','ended','expired'].includes(snapshot.phase)?<aside className={s.notice}><p>이미 참여 중인 멘토링이 있어요. 이 화면에는 알림으로 받은 초대만 표시했어요. 현재 참여를 정리한 뒤 수락할 수 있어요.</p><Link href="/meetups/department/mentoring">내가 참여 중인 멘토링 확인하기</Link></aside>:null}
  {!chatOnly&&phase==='idle'&&!demo?<section className={s.panel}><h2>새 모집방에서 함께해요</h2><p>기존 초대는 위에서 확인할 수 있어요. 새 멘토링은 방을 골라 신청하는 방식으로 바뀌었어요.</p><Link className={s.primary} href="/meetups/department/mentoring">멘토링 모집방 보기<ArrowRight size={16}/></Link></section>:null}
  {!chatOnly&&phase==='idle'&&demo?<>{!role?<><div className={s.roleGrid}>{(['mentor','mentee'] as const).map(item=><button key={item} className={s.roleCard} onClick={()=>{setRole(item);setStage('size')}}><div className={s.photo}><Image src={item==='mentor'?'/images/quantum-campus-group.webp':'/images/meetups/meetup-study.webp'} alt="" fill sizes="(max-width:600px) 40vw, 340px" priority/></div><span className={s.roleBody}><strong>{t(`mentor.${item}`)}<ArrowRight size={18}/></strong><small>{t(`mentor.${item}Note`)}</small></span></button>)}</div><p className={s.finePrint}>{t('mentor.examplePhotos')}</p>{demo?<button className={s.example} onClick={()=>example('demo_invite')}>{t('mentor.demoInvite')}</button>:null}</>:
   <section className={s.panel}><button className={s.textButton} disabled={busy} onClick={()=>stage==='friends'?setStage('size'):setRole(null)}><ArrowLeft size={15}/>{t('common.back')}</button><p className={s.eyebrow}>{t(`mentor.${role}`)} · {stage==='size'?'1 / 2':'2 / 2'}</p><h2>{t(stage==='size'?'mentor.chooseSize':'mentor.chooseFriends')}</h2>
    {stage==='size'?<><div className={s.sizes}>{([2,3] as const).map(n=><button key={n} aria-pressed={sideSize===n} className={sideSize===n?s.selected:''} onClick={()=>{setSideSize(n);setFriendIds(ids=>ids.slice(0,n-1))}}><UsersRound size={22}/><span><strong>{sizeLabel(n)}</strong><small>{t(n===2?'mentor.sizeDefault':'mentor.sizeLarger')}</small></span>{sideSize===n?<Check size={20}/>:null}</button>)}</div><button className={s.primary} onClick={()=>setStage('friends')}>{t('common.next')}<ArrowRight size={17}/></button></>:
    <><p className={s.hint}>{t('mentor.friendHint',{max:sideSize-1})}</p><div className={s.friendList}>{!snapshot?<p>친구 목록을 아직 확인하지 못했어요. 연결을 다시 확인해 주세요.</p>:snapshot.friends.length?snapshot.friends.map(f=><label key={f.user_id}><input type="checkbox" checked={friendIds.includes(f.user_id)} disabled={busy||(!friendIds.includes(f.user_id)&&friendIds.length>=sideSize-1)} onChange={e=>setFriendIds(ids=>e.target.checked?[...ids,f.user_id]:ids.filter(id=>id!==f.user_id))}/><span>{f.label}</span></label>):<p>{t('mentor.noFriends')}</p>}</div><button className={s.primary} aria-describedby={startStatus?'mentoring-start-status':undefined} disabled={!usable} onClick={()=>void join()}>{busy?<Loader2 size={18}/>:<UsersRound size={18}/>} {t(friendIds.length?'mentor.inviteStart':'mentor.soloStart')}</button><small className={s.finePrint}>{t('mentor.noAutoJoin')}</small></>}
    {startStatus}
   </section>}</>:null}
  {!chatOnly&&snapshot&&['friends','waiting','offered'].includes(phase)?<section className={s.waitPanel}><div className={s.waitPhoto}><Image src="/images/meetups/meetup-cafe-friends-v1.webp" alt="" fill sizes="(max-width:600px) 100vw,760px"/></div><div className={s.waitBody}><p className={s.eyebrow}>{sizeLabel(snapshot.side_size??2)} · {t(`mentor.${snapshot.role}`)}</p><h2>{t(`mentor.${phase}`)}</h2><p className={s.hint}>{t(`mentor.${phase}Note`)}</p><p className={s.progress}><UsersRound size={18}/>{phase==='friends'?t('mentor.partyProgress',{accepted:snapshot.party_accepted,total:snapshot.party_total}):phase==='offered'?t('mentor.groupProgress',{accepted:snapshot.accepted_count,total:snapshot.member_count}):t('mentor.together',{total:snapshot.party_total})}</p>
   {phase==='offered'?<button className={s.primary} disabled={!usable||snapshot.my_accepted||remaining<=0} onClick={()=>void request({action:'accept',args:{session_id:snapshot.session_id}})}><Check size={18}/>{t(snapshot.my_accepted?'mentor.accepted':'mentor.accept')}</button>:null}
   {demo?<button className={s.example} disabled={phase==='offered'&&!snapshot.my_accepted} onClick={()=>example(phase==='friends'?'demo_friend_accept':phase==='waiting'?'demo_offer':'demo_all_accept')}>{t(phase==='friends'?'mentor.demoFriendAccept':phase==='waiting'?'mentor.demoOffer':'mentor.demoAllAccept')}</button>:null}
   <button className={s.secondary} disabled={busy} onClick={()=>void request({action:phase==='offered'?'decline':'cancel',args:phase==='offered'?{session_id:snapshot.session_id}:{}})}>{t(phase==='offered'?'mentor.decline':'mentor.cancel')}</button><p className={s.finePrint}><Clock3 size={13}/> {t('mentor.remaining',{time:`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`})} · {t('mentor.noPush')}</p></div></section>:null}
  {snapshot&&phase==='active'?<section className={s.activePanel}><div className={s.members}>{snapshot.members.map(m=><span key={m.id} className={m.mine?s.me:''}>{m.label}{m.mine?` · ${t('mentor.me')}`:''}</span>)}</div>
   {chatOnly||demo?<><div ref={chatReadRoot} className={s.chat} role="log" aria-live="polite" aria-label={t('mentor.chat')}>{snapshot.messages.length?snapshot.messages.map(m=><div key={m.id} data-social-message-id={m.id} className={`${s.message} ${m.mine?s.mine:''}`}><small>{m.alias}</small><p>{m.text}</p></div>):<p className={s.empty}>{t('mentor.emptyChat')}</p>}</div>
   <form className={s.composer} onSubmit={e=>{e.preventDefault();void send()}}><textarea rows={1} value={draft} aria-label={t('mentor.message')} placeholder={t('mentor.message')} maxLength={1000} disabled={!active} onChange={e=>setDraft(e.target.value)}/><button disabled={!active||!draft.trim()} aria-label={t('mentor.send')}><Send size={18}/></button></form></>:<Link className={s.primary} href={socialChatHref({kind:'mentoring',id:snapshot.session_id??''})??'/chat'}>멘토링 채팅으로<ArrowRight size={17}/></Link>}
   <details className={s.guide}><summary>{t('mentor.guide')}</summary><p>{t('mentor.guideText')}</p></details>
   {snapshot.meeting?<aside className={s.meeting}><small>{t('mentor.proposedMeeting')}</small><strong>{dateText(snapshot.meeting.starts_at)}</strong><span>{snapshot.meeting.place}</span><p>{t('mentor.planHint')}</p></aside>:null}
   <div className={s.actions}><button className={s.secondary} disabled={!active} onClick={()=>setPanel('plan')}>{t('mentor.plan')}</button><button className={s.textButton} disabled={busy} onClick={()=>setPanel('end')}>{t('mentor.end')}</button><button className={s.textButton} disabled={busy} onClick={()=>setPanel('report')}>{t('mentor.report')}</button></div>
   {panel==='plan'?<section className={s.exitPanel}><h3>{t('mentor.plan')}</h3><p>{t('mentor.planHint')}</p><label>{t('mentor.date')}<input type="datetime-local" value={meetingAt} onChange={e=>setMeetingAt(e.target.value)}/></label><label>{t('mentor.place')}<input value={place} maxLength={160} onChange={e=>setPlace(e.target.value)} placeholder={t('mentor.placeHint')}/></label><button className={s.primary} disabled={!active||!meetingAt||!place.trim()} onClick={()=>void plan()}>{t('mentor.sharePlan')}</button><button className={s.textButton} onClick={()=>setPanel(null)}>{t('common.cancel')}</button></section>:panel==='end'?<section className={s.exitPanel}><h3>{t('mentor.endAsk')}</h3><p>{t('mentor.endNote')}</p><button className={s.primary} disabled={busy} onClick={()=>void finish()}>{t('mentor.end')}</button><button className={s.textButton} onClick={()=>setPanel(null)}>{t('common.cancel')}</button></section>:reportForm}<p className={s.finePrint}>{t('mentor.safe')}</p>
  </section>:null}
  {phase==='ended'||phase==='expired'?<section className={s.finished}><Check size={28}/><h2>{t(phase==='ended'?'mentor.ended':'mentor.expired')}</h2><p>{t('mentor.endedNote')}</p>{reported?<p role="status">{t('mentor.reported')}</p>:null}{snapshot?.report_targets.length?<button className={s.secondary} disabled={busy} onClick={()=>setPanel('report')}>{t('mentor.afterReport')}</button>:null}{reportForm}{chatOnly?<Link className={s.primary} href="/chat">채팅 목록으로</Link>:<button className={s.primary} disabled={busy} onClick={()=>{reset();void request({action:'cancel',args:{}})}}>{t('mentor.restart')}<ArrowRight size={17}/></button>}</section>:null}
 </div></Container>
}
