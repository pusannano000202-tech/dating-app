'use client'
import Image from 'next/image'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useEffect,useRef,useState} from 'react'
import {ArrowLeft,ArrowRight,Plus,RefreshCw} from 'lucide-react'
import {parseHostedMentoringList,parseHostedMentoringDetail,type HostedMentoringRole,type HostedMentoringTopic} from '@/lib/mentoring/hosted-contract'
import {HostedConnection,HostedRoomCard} from './HostedRoomCards'
import {applicationChatPath} from '@/lib/meetups/application-view'
import {useHostedResource} from './useHostedResource'
import s from './hosted-rooms.module.css'

export const MENTORING_TOPICS:Record<HostedMentoringTopic,string>={courses:'수업·전공 이야기',career:'진로·취업 이야기',campus:'학교생활 이야기'}
export const MENTORING_ROLES:Record<HostedMentoringRole,string>={mentor:'경험을 나눌래요',mentee:'도움을 구할래요'}
export function MentoringRolePicker({onChoose}:{onChoose:(role:HostedMentoringRole)=>void}){
 return <div className={s.roles}>{(['mentee','mentor'] as const).map(role=><button className={s.role} key={role} onClick={()=>onChoose(role)}><div className={s.rolePhoto}><Image src={role==='mentor'?'/images/quantum-campus-group.webp':'/images/meetups/meetup-study.webp'} alt="" fill sizes="(max-width:600px) 44vw,370px" priority/></div><span className={s.roleText}><strong><span>{role==='mentor'?'경험을':'도움을'}<br/>{role==='mentor'?'나눌래요':'구할래요'}</span><ArrowRight size={17}/></strong><small>{role==='mentor'?'먼저 겪어본 이야기를, 편하게.':'혼자 고민하던 질문을, 함께.'}</small></span></button>)}</div>
}
const parseList=(body:unknown,owner:string)=>{const parsed=parseHostedMentoringList((body as {data?:unknown})?.data);return parsed?.owner_id===owner?parsed:null}
export default function HostedMentoringLobby(){
 const router=useRouter(),resource=useHostedResource('/api/mentoring/rooms',parseList)
 const [role,setRole]=useState<HostedMentoringRole|null>(null),[creating,setCreating]=useState(false),[title,setTitle]=useState(''),[size,setSize]=useState<2|3>(2),[topic,setTopic]=useState<HostedMentoringTopic>('courses')
 const request=useRef<{signature:string;id:string}|null>(null)
 useEffect(()=>{setTitle('');setCreating(false);request.current=null},[resource.account])
 const own=resource.data?.rooms.filter(r=>r.joined||r.participation_restricted)??[]
 const rooms=resource.data?.rooms.filter(r=>!r.joined&&!r.participation_restricted&&(!role||(role==='mentor'?r.mentor_count:r.mentee_count)<r.side_size))??[]
 async function create(){
  if(!role||!title.trim()||Array.from(title.trim()).length>60||!resource.data||own.length)return
  const signature=JSON.stringify([resource.account,title.trim(),role,size,topic])
  if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()}
  const next=await resource.mutate('/api/mentoring/rooms',{action:'create',args:{title:title.trim(),topic,role,side_size:size,client_id:request.current.id}},body=>{
   const result=parseHostedMentoringDetail((body as {data?:unknown})?.data);return result?.owner_id===resource.account?result:null
  })
  if(next?.room.joined)router.push(applicationChatPath(next.room.id,'mentoring'))
 }
 const card=(r:NonNullable<typeof resource.data>['rooms'][number])=><HostedRoomCard key={r.id} room={{id:r.id,title:r.title,label:`${r.department_label} · ${MENTORING_TOPICS[r.topic]}`,count:r.member_count,capacity:r.side_size*2,joined:r.joined,isHost:r.is_host,closed:r.status!=='open',needsAttention:r.participation_restricted,roles:{mentor:r.mentor_count,mentee:r.mentee_count,size:r.side_size},href:r.joined?applicationChatPath(r.id,'mentoring'):`/meetups/mentoring-rooms/${r.id}${role?'?role='+role:''}`}}/>
 return <main className={s.page}><Link className={s.back} href="/meetups/department"><ArrowLeft size={16}/>우리 과끼리</Link>{!creating?<header className={s.header}><span className={s.eyebrow}>A LITTLE EXPERIENCE, A GOOD START</span><h1>질문 하나, 경험 하나.<br/>우리 과에서 함께 나눠요.</h1><p>2+2 또는 3+3, 여럿이라 더 편한 시작.<br/>역할을 고르고 마음에 드는 모임에 신청해요.</p></header>:null}
 {!role?<MentoringRolePicker onChoose={setRole}/>:<button className={s.back} onClick={()=>{setRole(null);setCreating(false)}}><ArrowLeft size={15}/>역할 다시 고르기 · {MENTORING_ROLES[role]}</button>}
 <HostedConnection account={resource.account} error={resource.error} loading={resource.loading&&!resource.data} onRetry={()=>void resource.load()}/>
 {!creating?<section className={s.section} aria-label="멘토링 합류 대기판"><div className={s.bar}><div><h2>내 이야기를 나눌 사람, 기다려요</h2><p>원하는 역할로 등록하고 함께하자는 초대를 받아보세요.</p></div></div><Link className={s.secondary} href={`/meetups/candidates?kind=mentoring&key=${topic}`}>멘토링 합류 대기판 →</Link>{process.env.NODE_ENV==='development'&&process.env.NEXT_PUBLIC_QUANTUM_LOCAL_RUNTIME_MODE==='offline-ui'?<Link className={s.back} href={`/meetups/dev-candidates?kind=mentoring&key=${topic}`}>예시로 흐름 둘러보기 · 실제 등록 아님</Link>:null}</section>:null}
 {own.length?<section className={s.section}><div className={s.bar}><h2>내가 참여한 모임</h2></div><div className={s.list}>{own.map(card)}</div></section>:null}
 {role?creating?<section className={s.form}><button className={s.back} onClick={()=>setCreating(false)} disabled={resource.busy}><ArrowLeft size={15}/>열린 모임으로</button><h2>어떤 이야기를 나눌까요?</h2><form onSubmit={e=>{e.preventDefault();void create()}}><label className={s.field}>모임 이름<input required maxLength={60} value={title} onChange={e=>setTitle(e.target.value)} placeholder="예: 전공 선택, 선배에게 물어봐" disabled={resource.busy}/></label><label className={s.field}>이야기 주제<select value={topic} onChange={e=>setTopic(e.target.value as HostedMentoringTopic)} disabled={resource.busy}>{Object.entries(MENTORING_TOPICS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><p className={s.field}>함께할 인원</p><div className={s.options}>{([2,3] as const).map(n=><button key={n} type="button" className={`${s.option} ${size===n?s.selected:''}`} aria-pressed={size===n} onClick={()=>setSize(n)} disabled={resource.busy}><strong>{n}+{n} · 총 {n*2}명</strong><small>경험 나눔 {n}명 + 도움 구함 {n}명</small></button>)}</div><p className={`${s.note} mt-5`}>나는 ‘{MENTORING_ROLES[role]}’로 참여해요. 친구도 직접 신청하고 수락받아야 해요. 다른 사람의 참여를 대신 확정하지 않아요.</p><p className={s.note}>방 개설은 보증금 납부 완료가 아니에요. 신청자는 보증금 조건 확인 후 신청하며, 날짜·장소는 채팅에서 함께 정해요.</p><div className={s.actions}><button type="button" className={s.secondary} onClick={()=>setCreating(false)} disabled={resource.busy}>취소</button><button className={s.button} disabled={resource.busy||!resource.data||!!own.length||!title.trim()}>{resource.busy?'방 확인 중…':'방 만들고 채팅 열기'}<ArrowRight size={16}/></button></div></form></section>:<section className={s.section}><div className={s.bar}><div><h2>함께 이야기할 모임</h2><p>{resource.data?`${rooms.length}개 방 · 선택한 역할의 빈자리`:'내 역할에 맞는 빈자리를 확인해요'}</p></div><button className={s.quiet} onClick={()=>void resource.load()} aria-label="멘토링 모집 새로고침"><RefreshCw size={16}/></button></div><div className={s.list}>{rooms.map(card)}{resource.data&&!rooms.length?<p className={s.empty}>이 역할로 신청할 수 있는 모임이 아직 없어요.<br/>같이 나누고 싶은 이야기로 모임을 열어볼까요?</p>:null}</div>{!own.length?<button className={`${s.secondary} mt-4 w-full`} disabled={resource.busy} onClick={()=>setCreating(true)}><Plus size={17}/>내 이야기로 모임 열기</button>:null}</section>:null}
 <p className={`${s.note} mt-6`}>사진은 활동 분위기 예시예요. 전문 상담·자격 인증이 아닌 같은 과 사람들의 경험 나눔이에요.</p><Link href="/meetups/department/mentoring?legacy=1" className={s.back}>이전에 받은 초대·참여 확인<ArrowRight size={14}/></Link>
 </main>
}
