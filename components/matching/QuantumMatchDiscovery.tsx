'use client'

import { ArrowRight, Heart, LoaderCircle, RefreshCw } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useRelationshipState } from '@/components/relationship/useRelationshipState'
import { matchingEntryFor } from '@/lib/matching/match-entry-policy'
import s from './match-journey.module.css'

export default function QuantumMatchDiscovery() {
  const { state, unavailable, refresh, owner } = useRelationshipState()
  const router = useRouter()
  const entry = matchingEntryFor(state?.status ?? null)
  const retry = () => {
    if (!owner || owner === 'unavailable') window.location.reload()
    else void refresh()
  }
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('discovery') === 'scheduled') router.replace('/match/calendar')
  }, [router])
  return (
    <section aria-labelledby="matching-entry-title" className={s.entry}>
      <div className={s.entryHeading}>
        <h2 id="matching-entry-title">{entry.audience === 'couple' ? '우리 둘의 데이트, 더 새롭게' : '어떤 만남으로 시작할까요?'}</h2>
        {entry.audience === 'couple' ? <p>내 연인과 함께, 새로운 커플을 만나요.</p> : null}
      </div>
      {entry.audience === 'unknown' ? (
        <div className={s.pendingEntry} aria-busy={!unavailable}>
          <p role="status">{unavailable ? '내 설정을 불러오지 못했어요.' : '나에게 맞는 만남을 불러오고 있어요.'}</p>
          {unavailable ? <button type="button" className={s.quietButton} onClick={retry}><RefreshCw size={16} aria-hidden="true" />다시 불러오기</button> : <LoaderCircle size={22} aria-hidden="true" />}
          {unavailable ? <Link href="/match/calendar" className={s.quietButton}>행사 일정 둘러보기 <ArrowRight size={16} aria-hidden="true" /></Link> : null}
        </div>
      ) : <div className={`${s.entryCards} ${!entry.showTonight ? s.coupleEntry : ''}`}>
        {entry.showTonight ? <EntryCard href="/tonight" title="오늘밤 만나기" detail="오늘의 활동과 모집 상태를 확인해요" image="/images/match/tonight-social-20260915.webp" alt="저녁 거리에서 웃으며 걷는 성인 대학생 다섯 명의 AI 생성 분위기 이미지" priority /> : null}
        <EntryCard href={entry.calendarHref} title={entry.calendarTitle}
          detail={entry.audience === 'couple' ? '날짜를 골라, 연인과 함께 신청해요' : '날짜마다 준비된 특별한 만남'}
          image={entry.audience === 'couple' ? '/images/match/couple-play-20260915.webp' : '/images/match/calendar-play-20260915.webp'}
          alt={entry.audience === 'couple' ? '보드게임을 즐기는 두 커플의 AI 생성 분위기 이미지' : '블록 게임을 즐기는 성인 대학생들의 AI 생성 분위기 이미지'} priority={!entry.showTonight} />
      </div>}
      {state && unavailable ? <p className={s.entryRefreshNotice} role="status">최근 확인한 설정을 표시하고 있어요. <button type="button" className={s.quietButton} onClick={retry}>다시 확인</button></p> : null}
      <div className={s.entryFoot}>
        <span>사진은 AI로 만든 활동 분위기 예시예요.</span>
        <Link href="/profile/relationship"><Heart size={14} aria-hidden="true" /> 내 연애 상태 관리 <ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
    </section>
  )
}

function EntryCard({ href, title, detail, image, alt, priority = false }: {
  href: string; title: string; detail: string; image: string; alt: string; priority?: boolean
}) {
  return <Link href={href} className={s.entryCard}>
    <Image src={image} alt={alt} fill priority={priority} sizes="(min-width: 960px) 440px, (min-width: 640px) 46vw, 100vw" className={s.coverImage} />
    <span className={s.photoScrim} />
    <span className={s.entryCopy}><strong>{title}</strong><span>{detail}</span></span>
    <span className={s.entryArrow} aria-hidden="true"><ArrowRight size={22} /></span>
  </Link>
}
