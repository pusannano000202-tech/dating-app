'use client'

import { useState } from 'react'
import PhotoSceneCarousel from '@/components/social/PhotoSceneCarousel'
import PlaceWorldcupExperience from '@/components/place-worldcup/PlaceWorldcupExperience'
import { placeCategory, type PlaceCategory } from '@/lib/place-worldcup/contract'

const categories = [
  { id:'pc', label:'PC방', title:'한 판 더 할래요?\n우리의 아지트를 찾아요.', description:'편한 자리와 좋은 장비, 같이 게임하기 좋은 곳.', image:'/images/meetups/meetup-gaming.webp' },
  { id:'gym', label:'헬스장', title:'오늘 운동,\n어디서 같이 할까요?', description:'학교 앞에서 꾸준히 가고 싶은 운동 공간.', image:'/social-scenes/gym.png' },
  { id:'boardgame', label:'보드게임방', title:'게임은 가볍게,\n웃음은 오래오래.', description:'시간 가는 줄 모르고 함께 놀기 좋은 곳.', image:'/social-scenes/boardgame.webp' },
] as const

export default function PlaceExperienceExplorer({ initialCategory = 'pc' }: { initialCategory?: PlaceCategory }) {
  const [selected, setSelected] = useState<PlaceCategory>(initialCategory)
  const active = categories.find(item => item.id === selected) ?? categories[0]
  function select(value: string) {
    try { setSelected(placeCategory(value)) } catch { setSelected('pc') }
  }
  return <>
    <PhotoSceneCarousel label="장소 종류" initialId={initialCategory} onChange={select} items={categories.map(item => ({
      ...item, eyebrow:item.label, imageAlt:item.label+'에서 함께 시간을 보내는 연출 사진',
      actionLabel:'', note:'공간 연출 이미지 · 특정 업장이나 실제 이용 후기가 아니에요.',
    }))}/>
    <PlaceWorldcupExperience category={active.id}/>
  </>
}
