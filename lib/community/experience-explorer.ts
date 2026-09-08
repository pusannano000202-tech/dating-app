export const COMMUNITY_EXPERIENCES = [
  {
    id:'visit', label:'방문 맛집 월드컵', shortLabel:'방문 맛집', eyebrow:'학교 앞, 나만의 한 끼',
    title:'다음 한 끼,\n내 최애부터 골라요.',
    description:'먹어본 맛집을 사진으로 비교해요. 음식 종류부터 고르고, 내 취향의 1등을 찾아봐요.',
    cta:'먹어본 맛집 고르기', href:'/community/campus-eats?mode=choose',
    image:'/social-scenes/content.png', imageAlt:'파스타와 음료가 놓인 식탁의 연출 사진',
    imageNote:'음식 연출 이미지 · 실제 매장 사진과 달라요',
    notice:'먹어본 곳 2곳 이상으로 시작 · 내 선택으로 만드는 취향 순위예요.',
    accent:'orange', photoPosition:'center',
  },
  {
    id:'mbti', label:'MBTI 연애 통계', shortLabel:'MBTI', eyebrow:'우리의 연애 취향',
    title:'나는 어떤 MBTI와\n잘 맞았을까?',
    description:'여러 번의 연애 경험을 더하고 통계로 만나봐요. 자기보고 통계이며, 과학적인 궁합 예측은 아니에요.',
    cta:'나의 MBTI 이야기 시작하기', href:'/community/mbti',
    image:'/images/quantum-campus-group.webp', imageAlt:'웃으며 대화하는 대학생들의 연출 사진',
    imageNote:'인물 연출 이미지 · 실제 회원이 아니에요',
    notice:'선택 참여 · 자기보고 통계이며 과학적인 궁합 예측이 아니에요.',
    accent:'rose', photoPosition:'center 42%',
  },
  {
    id:'delivery', label:'배달 월드컵', shortLabel:'배달', eyebrow:'집에서 즐기는 한 끼',
    title:'오늘 배달,\n뭐가 제일 맛있을까?',
    description:'오늘은 편하게 시켜 먹고 싶을 때. 가게와 대표 1인 메뉴 후보를 비교해요.',
    cta:'배달 메뉴 후보 둘러보기', href:'/community/campus-eats/delivery',
    image:'/social-scenes/delivery.png', imageAlt:'안전하게 정차한 배달 라이더와 오토바이의 연출 사진',
    imageNote:'배달 연출 이미지 · 실제 배달 업체와 무관해요',
    notice:'최소 주문·배달비·혜택은 확인된 조건만 · 특정 플랫폼 공식 서비스가 아니에요.',
    accent:'olive', photoPosition:'center',
  },
  {
    id:'places', label:'장소 월드컵', shortLabel:'장소', eyebrow:'우리 학교 주변, 같이 가고 싶은 곳',
    title:'놀고, 운동하고.\n어디가 제일 좋았나요?',
    description:'PC방부터 헬스장, 보드게임방까지. 다녀온 공간에서 우리 학교 취향을 찾아봐요.',
    cta:'장소 종류 고르기', href:'/community/places',
    image:'/social-scenes/boardgame.webp', imageAlt:'보드게임을 함께 즐기는 사람들의 연출 이미지',
    imageNote:'장소 연출 이미지 · 특정 업장이 아니에요',
    notice:'후보의 사진·운영 정보를 확인한 뒤 월드컵을 열어요. 예약이나 제휴를 뜻하지 않아요.',
    accent:'orange', photoPosition:'center',
  },
] as const

export function nextExperienceIndex(index: number, direction: -1 | 1): number {
  return (index + direction + COMMUNITY_EXPERIENCES.length) % COMMUNITY_EXPERIENCES.length
}
export function experienceSwipeDirection(deltaX: number, deltaY: number): -1 | 0 | 1 {
  if (Math.abs(deltaX) < 44 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.3) return 0
  return deltaX < 0 ? 1 : -1
}
export function experienceKeyboardIndex(key: string, index: number): number | null {
  if (key === 'ArrowLeft') return nextExperienceIndex(index,-1)
  if (key === 'ArrowRight') return nextExperienceIndex(index,1)
  if (key === 'Home') return 0
  if (key === 'End') return COMMUNITY_EXPERIENCES.length-1
  return null
}
