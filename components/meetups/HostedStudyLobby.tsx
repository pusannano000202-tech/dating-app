'use client'
import Image from 'next/image'
import Link from 'next/link'
import {useRouter,useSearchParams} from 'next/navigation'
import {useCallback,useRef,useState} from 'react'
import {ArrowLeft,ArrowRight,Plus,RefreshCw} from 'lucide-react'
import {createManualStudyCourse,getStudyCourse,getStudyCoursePhoto} from '@/lib/meetups/study-catalog'
import {parseStudyRoomDetail,parseStudyRoomList,type StudyRoomSummary} from '@/lib/meetups/study-room-contract'
import {getStudyGuide} from '@/lib/meetups/study-guide'
import {applicationChatPath,applicationPagePath} from '@/lib/meetups/application-view'
import {HostedConnection,HostedRoomCard} from './HostedRoomCards'
import {useHostedResource} from './useHostedResource'
import s from './hosted-rooms.module.css'

const decodeList=(payload:unknown)=>parseStudyRoomList((payload as {data?:unknown}|null)?.data)
export default function HostedStudyLobby(){
 const params=useSearchParams(),router=useRouter(),courseId=params.get('course')??''
 const course=getStudyCourse(courseId),manual=courseId==='custom'?createManualStudyCourse(params.get('title')??''):null
 const courseName=course?.title??manual?.title??'',photo=getStudyCoursePhoto(courseName)
 const query=new URLSearchParams({course_id:courseId,level:'beginner',...(manual?{course_name:courseName}:{})})
 const parse=useCallback((body:unknown)=>decodeList(body),[])
 const resource=useHostedResource(courseName?`/api/meetups/study-rooms?${query}`:null,parse)
 const [creating,setCreating]=useState(false),[title,setTitle]=useState('')
 const pending=useRef<{scope:string;signature:string;id:string}|null>(null)
 const rooms=resource.data?.rooms??[],own=rooms.find(r=>r.joined)
 const guide=getStudyGuide({kind:course?.guideKind??'major-general',level:'beginner',sessionNumber:1})
 async function create(){
  if(!title.trim()||!resource.data||own)return
  const scope=`${resource.account}:${courseId}:${courseName}`,signature=title.trim()
  if(pending.current?.scope!==scope||pending.current?.signature!==signature)pending.current={scope,signature,id:crypto.randomUUID()}
  const next=await resource.mutate('/api/meetups/study-rooms',{course_id:courseId,...(manual?{course_name:courseName}:{}),level:'beginner',title:signature,client_id:pending.current.id},body=>parseStudyRoomDetail((body as {data?:unknown})?.data))
  if(next&&next.joined&&next.admission_mode==='hosted')router.push(applicationChatPath(next.id,'study'))
 }
 function card(room:StudyRoomSummary){return <HostedRoomCard key={room.id} room={{id:room.id,title:room.title??`${room.course_name} · ${room.room_number}번 방`,label:`${room.department_label} · ${room.current_session}/10회차`,count:room.member_count,capacity:room.capacity,joined:room.joined,isHost:!!room.is_host,closed:!!room.recruitment_closed||room.status!=='recruiting',href:room.joined?applicationChatPath(room.id,'study'):`${applicationPagePath(room.id,'study')}/apply`}}/>}
 if(!courseName)return <main className={s.page}><Link href="/meetups/department/courses" className={s.back}><ArrowLeft size={16}/>과목 찾기</Link><header className={s.header}><h1>같이 공부할 수업부터 골라요</h1><p>내 학과·학년에 맞는 과목을 먼저 확인해 주세요.</p></header></main>
 return <main className={s.page}><Link href="/meetups/department/courses" className={s.back}><ArrowLeft size={16}/>내 수업 같이 공부하기</Link>{!creating?<header className={s.header}><span className={s.eyebrow}>OUR CLASS, TOGETHER</span><h1>{courseName}<br/>혼자 막히던 부분도, 같이.</h1><p>같은 과 친구들과 조금씩, 최대 10회.<br/>실력 구분 없이 함께 공부하고 다음 약속도 같이 정해요.</p><Image className={s.hero} src={photo.src} alt={photo.description} width={900} height={500} sizes="(max-width:820px) 94vw,776px" priority/></header>:null}
  <HostedConnection account={resource.account} error={resource.error} loading={resource.loading&&!resource.data} onRetry={()=>void resource.load()}/>
  {course&&!creating?<section className={s.section} aria-label="스터디 합류 대기판"><div className={s.bar}><div><h2>같이 공부할 준비가 됐어요</h2><p>방을 직접 만들지 않아도, 같은 과목을 공부할 사람들에게 알려요.</p></div></div><Link className={s.secondary} href={`/meetups/candidates?kind=study&key=${encodeURIComponent(courseId)}`}>이 과목 합류 대기판 →</Link>{process.env.NODE_ENV==='development'?<Link className={s.back} href={`/meetups/dev-candidates?kind=study&key=${encodeURIComponent(courseId)}`}>예시로 흐름 둘러보기 · 실제 등록 아님</Link>:null}</section>:null}
  {creating?<section className={s.form}><button className={s.back} onClick={()=>setCreating(false)} disabled={resource.busy}><ArrowLeft size={15}/>모집방으로</button><span className={s.eyebrow}>START A STUDY</span><h2>우리 스터디의 이름을 지어요</h2><p className={s.note}>{courseName} · 최대 5명 · 내가 방장이에요.<br/>날짜와 장소는 채팅에서 투표로 정해요.</p><form onSubmit={e=>{e.preventDefault();void create()}}><label className={s.field}>모임 이름<input autoFocus maxLength={60} value={title} onChange={e=>setTitle(e.target.value)} placeholder="예: 수요일, 한 챕터씩 끝내기" required disabled={resource.busy}/></label><p className={s.note}>다른 사람은 보증금 조건을 확인한 뒤 신청해요. 방장이 수락하면 채팅에 함께 들어와요. 방 개설은 보증금 납부 완료를 뜻하지 않아요.</p><div className={s.actions}><button className={s.secondary} type="button" onClick={()=>setCreating(false)} disabled={resource.busy}>취소</button><button className={s.button} disabled={resource.busy||!resource.data||!!own||!title.trim()}>{resource.busy?'방 확인 중…':'방 만들고 채팅 열기'}<ArrowRight size={16}/></button></div></form></section>:<><div className={s.bar}><div><h2>같이 공부할 모임</h2><p>{resource.data?`${rooms.length}개 방 · 빈자리에 참가 신청`:'실제 모집 현황을 확인해요'}</p></div><button className={s.quiet} aria-label="스터디방 새로고침" onClick={()=>void resource.load()}><RefreshCw size={16}/></button></div><div className={s.list}>{rooms.map(card)}{resource.data&&!rooms.length?<p className={s.empty}>아직 열린 모임이 없어요.<br/>이름 하나 정하고 첫 모임을 열어볼까요?</p>:null}</div>{!own?<button className={`${s.secondary} mt-4 w-full`} disabled={resource.busy} onClick={()=>setCreating(true)}><Plus size={17}/>내 스터디 열기</button>:null}</>}
  {guide?<details className={s.details}><summary>만나면 무엇부터 하나요?</summary><p className="mt-3 font-bold">1회차 · {guide.title}</p><p>{guide.goal}</p>{guide.steps.map(step=><p key={step.id} className="mt-3"><b>{step.title} · {step.minutes}분</b><br/>{step.body}</p>)}<p className="mt-4">10회차 안내는 권장 활동이에요. 실제 수업 진도에 맞춰 조정하고, 원하지 않으면 언제든 나갈 수 있어요.</p></details>:null}
 </main>
}
