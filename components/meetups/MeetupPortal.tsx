'use client'

import { useQuantumLocale } from '@/components/i18n/QuantumLocaleProvider'
import LanguagePicker from '@/components/i18n/LanguagePicker'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import s from './meetup-discovery.module.css'

const entries = [
  { id: 'play', title: '같이 놀 사람!', description: '처음 보는 사이도, 같이 놀면 가까워져요', detail: '학과 상관없이 가볍게 모여요', imageSrc: '/images/match/events/event-board-game.webp', imageAlt: '보드게임을 하며 함께 웃는 대학생들의 연출 사진', href: '/meetups/explore?intent=play' },
  { id: 'achieve', title: '같이 해낼 사람!', description: '공부도 도전도, 혼자 말고 같이', detail: '어학 · 취업 · 프로젝트', imageSrc: '/images/meetups/meetup-study.webp', imageAlt: '책과 노트북을 펼치고 함께 공부하는 대학생들의 연출 사진', href: '/meetups/explore?intent=achieve' },
  { id: 'department', title: '우리 과끼리', description: '수업 밖에서도, 우리 조금 친해질까?', detail: '전공 · 멘토링 · 친목', imageSrc: '/images/meetups/meetup-cafe-friends-v1.webp', imageAlt: '학교 친구들과 함께 모여 이야기하는 연출 사진', href: '/meetups/department' },
  { id: 'challenges', title: '학과 대항전', description: '우리 과 이름 걸고, 한 판 붙자!', detail: '우리 팀 빈자리 찾기', imageSrc: '/social-scenes/home-playmaker-football.webp', imageAlt: '운동장에서 공을 차며 함께 경기하는 연출 사진', href: '/meetups/challenges' },
] as const

export default function MeetupPortal() {
  const { t } = useQuantumLocale()
  const key = (id:string) => 'meetup.'+(id==='challenges'?'challenge':id)
  return (
    <main className={s.page}>
      <div className={s.container}>
        <header className={s.portalHeader}>
          <div className="flex items-center justify-between"><p className={s.eyebrow}>Quantum</p><LanguagePicker compact /></div>
          <h1>{t('meetup.title')}</h1>
          <p className={s.lead}>{t('meetup.subtitle')}</p>
        </header>
        <nav className={s.portalPhotos} aria-label="모임 네 가지 입구">
          {entries.map(entry => (
            <Link key={entry.id} href={entry.href} className={s.portalPhotoCard}>
              <Image className={s.portalPhotoImage} src={entry.imageSrc} alt={entry.imageAlt} width={900} height={600} sizes="(min-width: 760px) 430px, 94vw" priority={entry.id === 'play'} />
              <div className={s.portalPhotoCopy}>
                <h2>{t(key(entry.id))}</h2>
                <p>{t(key(entry.id)+'Sub')}</p>
              </div>
              <span className={s.portalPhotoArrow}><ArrowRight size={20} aria-hidden="true" /><span className="sr-only">{entry.title} 둘러보기</span></span>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  )
}
