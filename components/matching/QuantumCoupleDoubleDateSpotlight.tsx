import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import s from './match-discovery.module.css'

export default function QuantumCoupleDoubleDateSpotlight() {
  return (
    <section aria-labelledby="couple-double-date-title" className={s.eventSection}>
      <p className={s.eventLabel}>다른 만남도 둘러봐요</p>
      <Link href="/match/couples/double-date" className={`${s.sceneCard} ${s.eventCard}`}>
        <span className={s.photo}>
          <Image
            src="/images/match/events/event-couple-double-date.png"
            alt="보드게임 카페에서 더블데이트를 즐기는 두 커플의 분위기 예시"
            fill
            sizes="(min-width: 760px) 284px, 36vw"
            className={s.image}
          />
        </span>
        <span className={s.sceneCopy}>
          <span className={s.category}>커플 이벤트</span>
          <span id="couple-double-date-title" className={s.title}>다른 커플들은 어떨까?</span>
          <span className={s.description}>커플 2팀 · 총 4명<br />보드게임과 가벼운 식사로 친해져요.</span>
          <span className={s.timeCue}>토요일 오후 · 커플 전용</span>
          <span className={s.cardAction}>우리 커플도 참가해보기 <ArrowRight size={15} aria-hidden="true" /></span>
        </span>
      </Link>
      <details className={`${s.rules} ${s.eventRules}`}>
        <summary>커플 이벤트 참여 안내</summary>
        <p>파트너가 수락해야 커플팀이 완성돼요. 상대 커플 프로필은 만남 종료 후 공개됩니다.</p>
        <p className={s.eventNote}>분위기 예시 · 실제 참가자 사진 아님</p>
      </details>
    </section>
  )
}
