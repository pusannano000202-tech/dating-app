'use client'

import PhotoSceneCarousel from '@/components/social/PhotoSceneCarousel'
import { useQuantumLocale } from '@/components/i18n/QuantumLocaleProvider'

const challengeScenes = [
  {
    id: 'gaming',
    eyebrow: '학과 게임',
    title: '우리 과 LoL 한 팀, 친구부터 초대해요',
    description: '게임 종목에 맞는 정원을 정하고, 수락한 친구만 직접 초대해 팀을 만들어요.',
    image: '/images/meetups/meetup-gaming.webp',
    imageAlt: '학생들이 PC 게임을 함께 즐기는 학과 게임 대항 분위기 예시',
    actionLabel: '게임 대항 시작',
    href: '/meetups/league?category=gaming',
    note: '팀 초대와 친구 관계는 별도예요. 자동으로 학과 친구가 생기지 않아요.',
  },
  {
    id: 'soccer',
    eyebrow: '학과 축구',
    title: '정원을 정하고 상대 학과와 한 경기',
    description: '종목별 정원을 채운 뒤 상대 학과와 시간·장소를 맞춰 한 경기를 준비해요.',
    image: '/social-scenes/football.png',
    imageAlt: '관중이 있는 축구장에서 경기를 준비하는 학과 축구 대항 분위기 예시',
    actionLabel: '축구 대항 시작',
    href: '/meetups/league?category=soccer',
    note: '사진은 장소나 예약을 보장하지 않으며 일정은 양쪽 주장이 확인해요.',
  },
] as const

export default function DepartmentChallengeEntry() {
  const { t } = useQuantumLocale()
  const scenes = challengeScenes.map(scene => ({...scene, eyebrow:t('challenge.myDept'), title:t(scene.id === 'gaming' ? 'challenge.lol' : 'challenge.soccer'), description:t(scene.id === 'gaming' ? 'challenge.lolNote' : 'challenge.soccerNote'), imageAlt:t(scene.id === 'gaming' ? 'challenge.lolIntro' : 'challenge.soccerIntro'), actionLabel:t('challenge.findTeams'), note:t('challenge.friendChoice')}))
  return <section className="mt-5" aria-labelledby="department-challenge-entry-title">
    <div className="mb-3 flex items-end justify-between gap-3">
      <div><p className="text-xs font-black text-[#B94B3F]">{t('challenge.myDept')}</p><h2 id="department-challenge-entry-title" className="mt-1 text-xl font-black">{t('challenge.chooseScene')}</h2></div>
      <span className="text-[11px] font-bold text-boot-muted">{t('challenge.voluntary')}</span>
    </div>
    <PhotoSceneCarousel label={t('challenge.chooseScene')} items={scenes} />
  </section>
}
