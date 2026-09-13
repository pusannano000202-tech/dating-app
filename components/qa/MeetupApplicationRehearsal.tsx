'use client'

import { useState } from 'react'
import MeetupApplicationFlow, { type MeetupApplicationResult } from '@/components/meetups/MeetupApplicationFlow'
import type { AdmissionDepositQuote } from '@/lib/meetups/admission-contract'
import {NEW_ADMISSION_DEPOSIT_KRW} from '@/lib/meetups/admission-deposit-policy'
import {ApplicationReviewCards,RoomApplicationNotices} from '@/components/meetups/MeetupApplications'
import {ApplicationStatusCard} from '@/components/meetups/MeetupAdmissionStatus'
import {RelationshipSummaryCard} from '@/components/relationship/RelationshipSummary'
import type {ApplicationManagementView,ApplicantView} from '@/lib/meetups/application-view'
import s from '@/components/meetups/meetup-admission.module.css'

const room = { kind: 'custom_meetup' as const, id: '96000000-0000-4000-8000-000000000001' }
const applicationId = '96000000-0000-4000-8000-000000000003'
const banner = 'sticky top-0 z-40 bg-[#edf0fa] px-4 py-2 text-center text-xs leading-5 text-[#435077]'

/** Imported exclusively by the server-gated development/offline rehearsal route. */
export default function MeetupApplicationRehearsal() {
  const [run, setRun] = useState(0)
  const [outcome, setOutcome] = useState('submitted')
  const [application, setApplication] = useState<MeetupApplicationResult | null>(null)
  const [closed, setClosed] = useState(false)
  const [chat, setChat] = useState(false)
  const [quote, setQuote] = useState<AdmissionDepositQuote>(() => newQuote())
  const [perspective,setPerspective]=useState('applicant')
  const [confirmation,setConfirmation]=useState<{application:ApplicantView;action:'approve'|'decline'}|null>(null)
  const [profile,setProfile]=useState({intro:'혼자 막혔던 문제, 같이 풀고 싶어요.',strength:'매주 배운 내용을 한 장으로 정리해 올게요.'})
  const example:ApplicationManagementView={accountKey:'96000000-0000-4000-8000-000000000004',room:{id:room.id,title:'공학미적분, 같이 풀어요',memberCount:application?.admission==='accepted'?4:3,capacity:5},isHost:true,pendingCount:application?.admission==='accepted'?0:1,applications:[{id:applicationId,alias:'차분한 아틀라스',...profile,admission:application?.admission==='accepted'?'accepted':'pending',payment:'held',revision:1,createdAt:'2026-09-12T02:00:00Z'}],notices:[{id:'96000000-0000-4000-8000-000000000005',kind:'application_received',text:'함께하고 싶은 새 참가 신청이 도착했어요. 방장이 확인하고 있어요.',createdAt:'2026-09-12T02:00:00Z'}],hasMore:false,nextCursor:null}
  function reset() { setRun(value => value + 1); setApplication(null); setClosed(false); setChat(false); setQuote(newQuote()) }
  return <>
    <aside className={banner}><strong>로컬 리허설</strong> · 신규 보증금 기준은 10,000원이에요. 이 화면의 결제·신청 결과는 가상 예시이며 실제 결제·신청·알림은 발생하지 않아요.
      <details className="mx-auto max-w-md text-left"><summary className="cursor-pointer py-1 text-center">테스트 상태 선택</summary><label className="flex items-center justify-between gap-3 py-2">결제 결과 예시<select aria-label="결제 결과 예시" value={outcome} onChange={event => setOutcome(event.target.value)} className="min-h-11 rounded-lg border bg-white p-2"><option value="submitted">납부 확인 후 신청 접수</option><option value="pending">결제 확인 중</option><option value="cancelled">결제 취소</option><option value="unconfigured">납부 미연결</option></select></label><div className="flex flex-wrap gap-2"><button type="button" onClick={reset} className="min-h-11 rounded-lg border bg-white px-3">처음부터 다시</button>{application?.admission === 'submitted' ? <button type="button" onClick={() => setApplication({ applicationId, admission: 'accepted', payment: 'held' })} className="min-h-11 rounded-lg border bg-white px-3">개설자 승인 결과 재현</button> : null}</div></details>
    </aside>
    <nav aria-label="리허설 관점" className="mx-auto flex max-w-xl flex-wrap justify-center gap-2 px-4 py-3">{[['applicant','신청자'],['host','방장 알림·검토'],['room','기존 채팅방'],['accepted','승인 후 입장'],['relationship','내 연애 상태']].map(([value,label])=><button key={value} className={`min-h-11 rounded-full border px-3 text-xs font-bold ${perspective===value?'border-[#385c43] bg-[#385c43] text-white':'border-[#e3dbce] bg-white text-[#77756b]'}`} aria-pressed={perspective===value} onClick={()=>setPerspective(value)}>{label}</button>)}</nav>
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 z-[60] text-center text-[10px] leading-[14px] text-[#526189]" style={{ bottom: 'calc(65px + env(safe-area-inset-bottom, 0px))' }}>로컬 예시 · 실제 결제·신청 없음</div>
    {perspective==='host'?<main className={s.page}><aside className={s.notice}><div><p><b>방장 개인 알림 예시</b><br/>새 참가 신청이 왔어요 · 공학미적분, 같이 풀어요</p><small>알림함·퀀텀 안내·기기 알림으로 이어지는 소식 (실제 발송 없음)</small></div></aside><section className={s.surface}><div className={s.heading}><div><span className={s.eyebrow}>TOGETHER, NEXT</span><h2>함께하고 싶은 사람들이에요</h2></div><span className={s.badge}>대기 {example.pendingCount}명</span></div><p className={s.intro}>공학미적분, 같이 풀어요 · {example.room.memberCount}/5명<br/>소개는 방장에게만 보여요. 수락하면 모임 채팅에 함께해요.</p><ApplicationReviewCards data={example} confirmation={confirmation} onChoose={(a,action)=>setConfirmation({application:a,action})} onBack={()=>setConfirmation(null)} onConfirm={()=>{setConfirmation(null);if(confirmation?.action==='approve'){setApplication({applicationId,admission:'accepted',payment:'held'});setPerspective('accepted')}}}/></section></main>
    :perspective==='room'?<main className={s.page}><section className={s.surface}><div className={s.heading}><div><span className={s.eyebrow}>채팅 / 우리 과 스터디</span><h2>공학미적분, 같이 풀어요</h2><span className={s.roomTitle}>현재 3 / 5명 · 가상 참가자 대화 예시</span></div></div><div className="px-5 pb-5"><p className="mb-4 rounded-2xl bg-[#f3f3ed] p-4 text-sm leading-7"><b>초록빛 오로라</b><br/>이번 주 목요일 6시 어때요? 도서관 앞에서 만나요.</p><RoomApplicationNotices data={example}/><p className="mt-4 rounded-2xl bg-[#f3f3ed] p-4 text-sm leading-7"><b>따뜻한 페가수스</b><br/>좋아요! 날짜 투표에도 체크했어요.</p></div></section></main>
    :perspective==='accepted'?<main className={s.page}><ApplicationStatusCard application={{id:applicationId,admission:'accepted',payment:'held',amountKrw:10000,revision:2,chatHref:`/chat/rooms/meetup/${room.id}`}} onRefresh={()=>{}} onCancel={()=>{}} onBack={()=>{}} onConfirm={()=>{}} onOpenChat={()=>setPerspective('room')}/></main>
    :perspective==='relationship'?<main className={`${s.page} space-y-4`}><p className="text-sm text-boot-muted">홈·매칭 상단에 표시되는 본인 상태 카드 예시</p><RelationshipSummaryCard state={{status:'single',changed_at:null,next_change_at:null,can_change:true,server_now:'2026-09-12T02:00:00Z'}} onRetry={()=>{}}/><RelationshipSummaryCard state={{status:'in_relationship',changed_at:'2026-09-12T02:00:00Z',next_change_at:'2026-10-12T02:00:00Z',can_change:false,server_now:'2026-09-12T02:00:00Z'}} onRetry={()=>{}}/><RelationshipSummaryCard state={null} unavailable onRetry={()=>{}}/></main>
    :closed || chat ? <main className="mx-auto max-w-md px-5 pb-28 pt-12 text-center"><h1 className="text-2xl font-black">{chat ? '채팅 탭으로 이어지는 단계' : '신청 화면을 닫았어요'}</h1><p className="mt-4 leading-7 text-boot-muted">{chat ? '실제 승인 후에는 채팅 탭의 해당 모임방으로 이동해요. 이 리허설은 실제 채팅방을 만들지 않아요.' : '실제 신청이나 결제는 생성되지 않았어요.'}</p><button onClick={reset} className="mt-6 min-h-12 rounded-xl bg-boot-primary px-6 font-bold text-white">신청 흐름 다시 보기</button></main> : <MeetupApplicationFlow
      key={run}
      room={room}
      newDepositAmountKrw={NEW_ADMISSION_DEPOSIT_KRW}
      accountKey="local-rehearsal-account"
      meetup={{ title: '공학미적분, 같이 풀어요', activityLabel: '우리 과 스터디', imageSrc: '/social-scenes/course-calculus.png', imageAlt: '공학미적분 문제를 공부하는 활동 분위기 예시', summary: '현재 2 / 4명 · 어려운 문제도 같이 풀면 괜찮아요.', scheduleLabel: '시간은 채팅에서 함께 정해요', locationLabel: '부산대 근처 · 장소 미정' }}
      quote={outcome === 'unconfigured' ? null : quote}
      policy={outcome === 'unconfigured' ? null : { summary: '아래는 흐름 확인용 정책 예시이며 운영 정책이 아니에요.', conditions: ['참가 승인 전 취소·미승인·모집 취소 시 반환 대상으로 처리해요.', '활동 후 출석과 분쟁 여부를 확인해 반환하거나, 본인 동의로 다음 모임에 이월해요.', '불참 신고만으로 바로 몰수하지 않아요. 근거 확인과 소명 후 운영자가 판단해요.'] }}
      carryover={{ eligible: true, availableKrw: 10000 }}
      application={application}
      onSubmit={async (_input, { signal }) => {
        if (signal.aborted) throw new Error('aborted')
        if (outcome === 'cancelled') throw new Error('payment_cancelled')
        setProfile({intro:_input.intro,strength:_input.strength??''})
        const result: MeetupApplicationResult = outcome === 'pending'
          ? { applicationId: null, admission: 'draft', payment: 'pending' }
          : { applicationId, admission: 'submitted', payment: 'held' }
        setApplication(result)
        return result
      }}
      onRefreshStatus={async () => application ?? { applicationId: null, admission: 'draft', payment: 'pending' }}
      onCancel={() => setClosed(true)}
      onOpenChat={() => setChat(true)}
    />}
  </>
}

function newQuote(): AdmissionDepositQuote {
  return { id: '96000000-0000-4000-8000-000000000002', room, amountKrw: 10000, currency: 'KRW', policyVersion: 'rehearsal-only-v1', expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), paymentMethods: ['new', 'carryover'] }
}
