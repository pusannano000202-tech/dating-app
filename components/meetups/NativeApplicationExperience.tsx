'use client'
import Link from 'next/link'
import {useRouter,useSearchParams} from 'next/navigation'
import {useCallback} from 'react'
import {ArrowLeft} from 'lucide-react'
import {parseNativeAdmissionContext,type NativeAdmissionKind} from '@/lib/meetups/native-admission-contract'
import {applicationBasePath} from '@/lib/meetups/application-view'
import {getStudyCoursePhoto} from '@/lib/meetups/study-catalog'
import MeetupApplicationFlow from './MeetupApplicationFlow'
import MeetupAdmissionStatus from './MeetupAdmissionStatus'
import {useHostedResource} from './useHostedResource'
import {HostedConnection} from './HostedRoomCards'
import s from './hosted-rooms.module.css'
import {useAdmissionCheckout} from './useAdmissionCheckout'
import {NEW_ADMISSION_DEPOSIT_KRW} from '@/lib/meetups/admission-deposit-policy'

export default function NativeApplicationExperience({kind,id}:{kind:NativeAdmissionKind;id:string}){
 return <MeetupAdmissionStatus meetupId={id} kind={kind}><NativeApplicationForm kind={kind} id={id}/></MeetupAdmissionStatus>
}
function NativeApplicationForm({kind,id}:{kind:NativeAdmissionKind;id:string}){
 const params=useSearchParams(),router=useRouter(),role=params.get('role')
 const validRole=kind==='study'||role==='mentor'||role==='mentee'
 const metadata=kind==='study'?{}:{role:role==='mentor'?'mentor' as const:'mentee' as const}
 const parse=useCallback((payload:unknown,owner:string)=>{
  if(!payload||typeof payload!=='object'||!('accountKey'in payload)||payload.accountKey!==owner)return null
  const {accountKey:_,...body}=payload
  return parseNativeAdmissionContext(body,{kind,id},kind==='study'?{}:{role:role==='mentor'?'mentor':'mentee'})
 },[kind,id,role])
 const endpoint=`${applicationBasePath(id,kind)}/application${kind==='mentoring'?`?role=${role}`:''}`
 const resource=useHostedResource(validRole?endpoint:null,parse)
 const checkout=useAdmissionCheckout({kind,id},resource.account??null,metadata)
 const back=kind==='study'?'/meetups/department/courses':`/meetups/mentoring-rooms/${id}`
 if(!validRole)return <main className={s.page}><Link href={back} className={s.back}><ArrowLeft size={16}/>모임으로</Link><h1 className="mt-8 text-2xl font-bold">참가할 역할부터 골라 주세요</h1><p className={s.note}>경험을 나눌지 도움을 구할지, 방에서 빈자리를 확인한 뒤 신청해요.</p></main>
 const context=resource.data
 if(!context)return <main className={s.page}><Link href={back} className={s.back}><ArrowLeft size={16}/>모임으로</Link><HostedConnection account={resource.account} error={resource.error} loading={resource.loading} onRetry={()=>void resource.load()}/></main>
 const photo=kind==='study'?getStudyCoursePhoto(context.roomDetails.title):{src:'/images/quantum-campus-group.webp',description:'멘토링 활동 분위기 예시'}
 return <MeetupApplicationFlow key={`${resource.account}:${kind}:${id}:${metadata.role??''}`}
  room={context.room} accountKey={resource.account??null} quote={context.quote} policy={context.policy}
  newDepositAmountKrw={NEW_ADMISSION_DEPOSIT_KRW} onSubmit={checkout.submit} onRefreshStatus={checkout.refresh} onResumeCheckout={checkout.resume} application={checkout.application}
  meetup={{title:context.roomDetails.title,activityLabel:kind==='study'?'우리 과 전공 스터디':metadata.role==='mentor'?'멘토링 · 경험을 나눌래요':'멘토링 · 도움을 구할래요',imageSrc:photo.src,imageAlt:photo.description,summary:`${context.roomDetails.memberCount} / ${context.roomDetails.capacity}명 · 보증금 확인 후 신청, 방장 수락 후 채팅 입장`,scheduleLabel:'날짜는 채팅에서 함께 정해요',locationLabel:'장소는 채팅에서 함께 정해요'}}
  onOpenChat={result=>{const expected=`/chat/rooms/${kind==='study'?'study_room':'mentoring'}/${id}`;if(result.chatHref===expected)router.push(expected)}} onCancel={()=>router.push(back)}/>
}
