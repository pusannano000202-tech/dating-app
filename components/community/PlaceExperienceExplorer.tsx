'use client'

import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import PhotoSceneCarousel from '@/components/social/PhotoSceneCarousel'
import s from '@/components/social/social-scenes.module.css'

const categories = [
  { id:'pc', label:'PC방', title:'한 판 더 할래요?\n우리의 아지트를 찾아요.', description:'편한 자리와 좋은 장비, 같이 게임하기 좋은 곳.', image:'/images/meetups/meetup-gaming.webp' },
  { id:'gym', label:'헬스장', title:'오늘 운동,\n어디서 같이 할까요?', description:'학교 앞에서 꾸준히 가고 싶은 운동 공간.', image:'/social-scenes/gym.png' },
  { id:'boardgame', label:'보드게임방', title:'게임은 가볍게,\n웃음은 오래오래.', description:'시간 가는 줄 모르고 함께 놀기 좋은 곳.', image:'/social-scenes/boardgame.webp' },
] as const

export default function PlaceExperienceExplorer() {
  const [selected, setSelected] = useState<string>('pc')
  const active = categories.find(item => item.id === selected) ?? categories[0]
  return <>
    <PhotoSceneCarousel label="장소 종류" onChange={setSelected} items={categories.map(item => ({
      ...item, eyebrow:item.label, imageAlt:item.label+'에서 함께 시간을 보내는 연출 사진',
      actionLabel:'', note:'공간 연출 이미지 · 특정 업장이나 실제 이용 후기가 아니에요.',
    }))}/>
    <section className={s.pending} aria-label={active.label+' 월드컵 준비 상태'}>
      <strong>{active.label} 월드컵 후보를 확인 중이에요.</strong>
      <p className={s.note}>사진 사용 권한과 운영 정보를 확인한 후보가 모이면 비교를 시작해요. 아직 투표나 순위는 제공하지 않아요.</p>
      <a className={s.primary} href={'https://map.naver.com/p/search/'+encodeURIComponent('부산대 '+active.label)} target="_blank" rel="noopener noreferrer">
        주변 {active.label} 찾아보기<ExternalLink size={16}/>
      </a>
      <p className={s.note}>네이버 지도의 검색 결과로 이동해요. 예약·제휴나 검증된 추천 목록은 아니에요.</p>
    </section>
  </>
}
