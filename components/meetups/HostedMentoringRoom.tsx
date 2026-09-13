'use client'
import Link from 'next/link'
import {useRouter,useSearchParams} from 'next/navigation'
import {useEffect,useRef,useState} from 'react'
import {ArrowLeft,ArrowRight,CalendarDays,Send} from 'lucide-react'
import {parseHostedMentoringDetail,type HostedMentoringRole} from '@/lib/mentoring/hosted-contract'
import {applicationChatPath,applicationPagePath} from '@/lib/meetups/application-view'
import SocialMessenger, {SocialChatComposer} from '@/components/chat/SocialMessenger'
import ActivityRoomPolls from '@/components/chat-polls/ActivityRoomPolls'
import {PendingChatSends,clearSentDraft} from '@/lib/chat/social-messenger-state'
import {useSocialChatRead} from '@/lib/chat/useSocialChatRead'
import {useHostedResource} from './useHostedResource'
import {HostedConnection} from './HostedRoomCards'
import {MENTORING_ROLES,MENTORING_TOPICS} from './HostedMentoringLobby'
import MeetupApplications from './MeetupApplications'
import s from './hosted-rooms.module.css'
const parseDetail=(body:unknown,owner:string)=>{const parsed=parseHostedMentoringDetail((body as {data?:unknown})?.data);return parsed?.owner_id===owner?parsed:null}

export default function HostedMentoringRoom({id,chatOnly=false,readOnly=false}:{id:string;chatOnly?:boolean;readOnly?:boolean}){
 const resource=useHostedResource(`/api/mentoring/rooms/${id}`,parseDetail),router=useRouter(),params=useSearchParams()
 const scope=`${resource.account}:${id}`,currentScope=useRef(scope);currentScope.current=scope
 const room=resource.data?.room.id===id?resource.data.room:null
 const [role,setRole]=useState<HostedMentoringRole>(params.get('role')==='mentor'?'mentor':'mentee')
 const [panel,setPanel]=useState<'plan'|'leave'|'report'|null>(null),[draft,setDraft]=useState(''),[at,setAt]=useState(''),[place,setPlace]=useState(''),[target,setTarget]=useState(''),[reason,setReason]=useState(''),[notice,setNotice]=useState('')
 const chat=useRef<HTMLDivElement|null>(null),pending=useRef(new PendingChatSends())
 const [pollRequest,setPollRequest]=useState(0)
 useEffect(()=>{setDraft('');setPanel(null);setTarget('');setReason('');setNotice('');setAt('');setPlace('');pending.current.clear()},[resource.account,id])
 useSocialChatRead('mentoring',id,room?.messages??[],{root:chat,enabled:!!room?.joined&&chatOnly&&!resource.error})
 const writable=!!room?.joined&&room.status!=='closed'&&!readOnly
 const active=writable&&!resource.busy
 async function act(action:string,args:Record<string,unknown>){
  const result=await resource.mutate(`/api/mentoring/rooms/${id}`,{action,args:{session_id:id,...args}},body=>{
   const next=parseDetail(body,resource.account??'');return next?.room.id===id?next:null
  })
  if(!result||currentScope.current!==scope)return false
  if(action==='leave'){router.push('/chat');return true}
  setPanel(null);await resource.load();return currentScope.current===scope
 }
 async function send(){
  if(!active||!draft.trim())return
  const text=draft.trim(),key=pending.current.key(text,()=>crypto.randomUUID())
  if(await act('message',{text,client_id:key})){setDraft(current=>clearSentDraft(current,text));pending.current.acknowledge(text)}
 }
 const Container=chatOnly?'section':'main'
 const management=<Container className={chatOnly?s.section:s.page} key={`${resource.account}:${id}`}>
  {!chatOnly?<Link className={s.back} href="/meetups/department/mentoring"><ArrowLeft size={16}/>멘토링 모임</Link>:null}
  <HostedConnection account={resource.account} error={resource.error} loading={resource.loading&&!room} onRetry={()=>void resource.load()}/>
  {room?<><header className={s.detailHeader}><span className={s.eyebrow}>{room.participation_restricted?'내 참여 관리':`${room.department_label} · ${MENTORING_TOPICS[room.topic]}`}</span>{chatOnly?<h2>{room.title}</h2>:<h1>{room.title}</h1>}{room.participation_restricted?<p className={s.note}>현재 이 방의 인원·대화는 표시하지 않아요. 아래에서 본인의 참여를 관리할 수 있어요.</p>:<><div className={s.roleCounts}><span>경험 나눔 <b>{room.mentor_count}/{room.side_size}</b></span><span>도움 구함 <b>{room.mentee_count}/{room.side_size}</b></span></div><p className={s.note}>최대 {room.side_size*2}명 · {room.joined?'인원이 모이는 동안에도 채팅할 수 있어요.':'보증금 확인 → 참가 신청 → 방장 수락 → 채팅'}</p></>}{room.joined?<div className={s.members}>{room.members.map(m=><span className={s.member} key={m.id}>{m.label}{m.mine?' · 나':''}{m.is_host?' · 방장':''}<br/>{m.role==='mentor'?'경험 나눔':'도움 구함'}</span>)}</div>:null}</header>
  {notice?<p role="status" className={s.details}>{notice}</p>:null}
  {!room.joined&&room.status==='closed'?<p className={s.details}>이 모임은 새 참가 신청을 받지 않아요.</p>:null}
  {!room.joined&&room.status==='open'?<section className={`${s.form} mt-5`}><h2>어떤 역할로 함께할까요?</h2><div className={s.options}>{(['mentee','mentor'] as const).map(r=><button className={`${s.option} ${role===r?s.selected:''}`} aria-pressed={role===r} key={r} onClick={()=>setRole(r)}><strong>{MENTORING_ROLES[r]}</strong><small>{room.side_size-(r==='mentor'?room.mentor_count:room.mentee_count)}자리 남음</small></button>)}</div><p className={`${s.note} mt-5`}>신청 한마디는 방장에게만 보여요. 보증금과 반환 조건은 다음 화면에서 확인해요.</p>{room.status==='open'&&(role==='mentor'?room.mentor_count:room.mentee_count)<room.side_size?<Link href={`${applicationPagePath(id,'mentoring')}/apply?role=${role}`} className={`${s.button} mt-5 w-full`}>보증금 조건 보고 신청<ArrowRight size={17}/></Link>:<p className={s.empty}>이 역할은 모집이 마감됐어요.</p>}</section>:null}
  {room.joined||room.my_role!==null?<>
   {room.joined?<><div className={s.section}><MeetupApplications meetupId={id} kind="mentoring" noticesOnly/>{room.is_host?<Link href={`${applicationPagePath(id,'mentoring')}/applications`} className={s.secondary}>참가 신청 관리<ArrowRight size={16}/></Link>:null}</div>
   {!chatOnly?<Link href={applicationChatPath(id,'mentoring')} className={`${s.button} w-full`}>모임 채팅으로<ArrowRight size={17}/></Link>:null}
   {room.meeting?<aside className={s.details}><b>채팅에서 제안된 약속</b><p>{new Date(room.meeting.starts_at).toLocaleString('ko-KR')} · {room.meeting.place}</p><p>아직 모두가 확정한 일정은 아니에요. 대화로 참석 가능 여부를 확인해 주세요.</p></aside>:null}
   </>:<p className={s.details}>이 모임 대화는 더 이상 볼 수 없어요. 기존 참여에 대한 신고·나가기는 아래에서 할 수 있어요.</p>}
   <div className={s.actions}><button className={s.secondary} disabled={!active} onClick={()=>setPanel(panel==='plan'?null:'plan')}><CalendarDays size={17}/>날짜·장소 제안</button><button className={s.quiet} disabled={resource.busy} onClick={()=>setPanel('report')}>신고</button><button className={s.quiet} disabled={resource.busy} onClick={()=>setPanel('leave')}>모임 나가기</button></div>
   {panel?<section className={`${s.form} mt-5`}><button className={s.back} disabled={resource.busy} onClick={()=>setPanel(null)}><ArrowLeft size={15}/>닫기</button>{panel==='plan'?<form onSubmit={e=>{e.preventDefault();if(at&&Number.isFinite(Date.parse(at)))void act('plan',{starts_at:new Date(at).toISOString(),place:place.trim(),revision:room.meeting?.revision??0})}}><h2>언제, 어디서 만날까요?</h2><p className={s.note}>채팅에 제안으로 남겨요. 다른 사람의 동의를 대신 확정하지 않아요.</p><label className={s.field}>날짜·시간<input type="datetime-local" required value={at} onChange={e=>setAt(e.target.value)}/></label><label className={s.field}>장소<input required maxLength={160} value={place} onChange={e=>setPlace(e.target.value)} placeholder="예: 교내 카페"/></label><button className={s.button} disabled={!active||!at||!place.trim()}>약속 제안 올리기</button></form>:panel==='report'?<form onSubmit={async e=>{e.preventDefault();if(await act('report',{member_id:target,reason:reason.trim()})){setReason('');setNotice('신고를 접수하고 모임에서 나왔어요. 운영자가 검토하며, 보증금 반환 대상과 실제 반환 완료는 별개예요.')}}}><h2>어떤 일이 있었나요?</h2><label className={s.field}>신고할 참여자<select required value={target} onChange={e=>setTarget(e.target.value)}><option value="">참여자 선택</option>{room.report_targets.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label><label className={s.field}>내용과 근거<textarea required rows={3} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label><p className={s.note}>신고를 접수하면서 이 모임에서 나와요. 이전 대화에는 접근할 수 없어요. 보증금은 반환 대상으로 처리되며, 실제 반환 완료와는 달라요. 신고만으로 상대를 자동 제재하거나 보증금을 몰수하지 않아요.</p><button className={s.button} disabled={resource.busy||!target||!reason.trim()}>신고하고 나가기</button></form>:<><h2>이 모임에서 나갈까요?</h2><p className={s.note}>나가면 이 방의 대화에 접근할 수 없어요. 다른 사람의 대화 기록은 남아요. 보증금 반환 대상 처리와 실제 반환 완료는 별개예요.{room.is_host?' 방장이 나가면 남은 참가자에게 방장을 넘겨요. 마지막 참가자가 나가면 모집이 종료돼요.':''}</p><button className={`${s.button} mt-5`} disabled={resource.busy} onClick={()=>void act('leave',{})}>확인하고 나가기</button></>}</section>:null}
  </>:null}
  <details className={s.details}><summary>처음 만났을 때, 이렇게 시작해요</summary><p className="mt-3">오늘 나누고 싶은 질문을 하나씩 → 먼저 겪어본 경험을 한 가지씩 → 다음에 해볼 일을 하나씩 정해요. 답하기 부담스러운 이야기는 건너뛰어도 괜찮아요.</p></details>
  </>:null}
 </Container>
 return chatOnly?<SocialMessenger scope={scope} root={chat}
  messages={room?.joined?room.messages.map(m=>({id:m.id,alias:m.alias,text:m.text,createdAt:m.created_at,isMe:m.mine})):[]}
  loading={resource.loading} error={resource.error?'대화 연결을 확인하지 못했어요. 다시 연결하면 작성한 내용으로 이어갈 수 있어요.':undefined} onRetry={()=>void resource.load()} readOnly={!!room&&!writable}
  management={management} notice={notice?<p role="status">{notice}</p>:room?.joined?<MeetupApplications meetupId={id} kind="mentoring" noticesOnly/>:null}
  tools={room?.joined?<ActivityRoomPolls roomKind="mentoring-rooms" roomId={id} composerRequest={pollRequest} readOnly={!writable||!!resource.error}/>:null}
  composer={<SocialChatComposer value={draft} onChange={setDraft} onSend={()=>void send()} busy={resource.busy} disabled={!writable||!!resource.error} onCreatePoll={writable?()=>setPollRequest(value=>value+1):undefined} label="멘토링 메시지"/>}/>:management

}
