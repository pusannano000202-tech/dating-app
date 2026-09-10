'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, UsersRound } from 'lucide-react'
import styles from './department-discovery.module.css'
import { useQuantumLocale } from '@/components/i18n/QuantumLocaleProvider'

const sports = [
  { id: 'gaming', title: '게임 한 판', subtitle: '우리 과 팀워크, 게임에서 보여줘요', image: '/social-scenes/department-clubhouse-gaming.webp', alt: 'PC 게임을 함께 즐기는 대학생들의 학과 게임 대항 분위기 예시', note: 'LoL 5 대 5 등 · 실제 팀 정원은 모집에서 확인해요', action: '게임 팀 찾아보기' },
  { id: 'soccer', title: '축구 한 경기', subtitle: '같은 과 이름으로, 같이 뛰어봐요', image: '/social-scenes/home-playmaker-football.webp', alt: '운동장에서 함께 축구하는 대학생들의 학과 대항 분위기 예시', note: '경기 방식에 따라 정원이 달라요 · 모집의 정원을 확인해요', action: '축구 팀 찾아보기' },
] as const

export default function DepartmentChallengeDiscovery() {
  const { t } = useQuantumLocale()
  return <main className={styles.page}>
    <div className={styles.shell}>
      <Link href="/meetups" className={styles.back}><ArrowLeft size={17} />{t('challenge.back')}</Link>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{t('challenge.eyebrow')}</p>
        <h1>{t('challenge.title')}</h1>
        <p>{t('challenge.intro')}</p>
      </header>

      <nav className={styles.sportList} aria-label={t('challenge.chooseScene')}>
        {sports.map(sport => <Link key={sport.id} href={`/meetups/league?category=${sport.id}`} className={styles.sportCard}>
          <div className={styles.sportPhoto}><Image src={sport.image} alt={t(sport.id === 'gaming' ? 'challenge.lolIntro' : 'challenge.soccerIntro')} fill sizes="(max-width: 580px) 100vw, 340px" priority={sport.id === 'gaming'} /></div>
          <div className={styles.sportBody}><p className={styles.eyebrow}>{t('challenge.myDept')}</p><h2>{t(sport.id === 'gaming' ? 'challenge.lol' : 'challenge.soccer')}</h2><p>{t(sport.id === 'gaming' ? 'challenge.lolIntro' : 'challenge.soccerIntro')}</p><span className={styles.sportCapacity}><UsersRound size={16} />{t(sport.id === 'gaming' ? 'challenge.lolNote' : 'challenge.soccerNote')}</span><span className={styles.sportAction}>{t('challenge.findTeams')}<ArrowRight size={17} /></span></div>
        </Link>)}
      </nav>

      <section className={styles.howTo} aria-labelledby="department-challenge-how-title">
        <p className={styles.eyebrow}>{t('challenge.voluntary')}</p>
        <h2 id="department-challenge-how-title">{t('challenge.howTitle')}</h2>
        <ol>{[1,2,3].map(step => <li key={step}><span>{step}</span><div><strong>{t(`challenge.step${step}`)}</strong></div></li>)}</ol>
        <p className={styles.consentNote}><Check size={17} />{t('challenge.friendChoice')}</p>
      </section>

      <aside className={styles.nextTime}><p>{t('challenge.laterSports')}</p></aside>
      <Link href="/meetups/department" className={styles.bottomLink}>{t('challenge.socialInstead')}<ArrowRight size={16} /></Link>
    </div>
  </main>
}
