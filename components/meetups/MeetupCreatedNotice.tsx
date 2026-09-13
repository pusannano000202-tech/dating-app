'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowRight, Check, MessageCircle, Share2, UsersRound } from 'lucide-react'
import { getCreatedMeetupNotice, type CreatedMeetupSummary } from '@/lib/meetups/create-flow'
import MeetupShareSheet from './MeetupShareSheet'
import s from './create-meetup.module.css'

export default function MeetupCreatedNotice({ meetup, created }: { meetup: CreatedMeetupSummary; created: boolean }) {
  const [shareOpen, setShareOpen] = useState(false)
  const notice = getCreatedMeetupNotice(created, meetup)
  if (!notice) return null
  return <section className={s.createdNotice} aria-label="내 모임 개설 결과">
    <div className={s.createdHeading}><span className={s.createdCheck}><Check size={23} aria-hidden="true" /></span><div><p>내가 방장이에요</p><h2>{notice.heading}</h2></div></div>
    <div className={s.createdRoom}><strong>{meetup.title}</strong><div><span className={s.createdState}>{notice.recruitment}</span><span><UsersRound size={15} aria-hidden="true" />{meetup.member_count}/{meetup.capacity}명{notice.remaining > 0 ? ` · ${notice.remaining}자리 남음` : ''}</span></div></div>
    <p className={s.createdDescription}>{notice.accepting ? '친구들이 모집 목록에서 이 방을 보고 신청할 수 있어요. 신청이 오면 알림에서 확인하고, 수락한 친구들과 채팅을 시작해요.' : notice.active ? '지금은 모집이 마감됐어요. 참여한 친구들과 채팅에서 다음 약속을 정해요.' : '지금 방의 상태를 확인해 주세요. 이전 대화와 모임 기록은 채팅에서 이어볼 수 있어요.'}</p>
    <div className={s.createdActions}>{notice.active ? <Link className={s.createdSecondary} href={notice.applicationsHref}>참가 신청 확인<ArrowRight size={16} aria-hidden="true" /></Link> : null}{notice.accepting ? <button type="button" className={s.createdSecondary} onClick={()=>setShareOpen(true)}><Share2 size={16} aria-hidden="true" />친구에게 공유</button> : null}<Link className={s.createdPrimary} href={notice.chatHref}><MessageCircle size={17} aria-hidden="true" />채팅 열기</Link></div>
    {shareOpen && notice.accepting ? <MeetupShareSheet key={meetup.id} meetupId={meetup.id} title={meetup.title} onClose={()=>setShareOpen(false)} /> : null}
    {notice.active ? <p className={s.createdFootnote}>모임 개설은 보증금 납부 완료를 뜻하지 않아요. 참가자는 보증금 확인 후 신청하고, 방장 수락 뒤 채팅에 참여해요.</p> : null}
  </section>
}
