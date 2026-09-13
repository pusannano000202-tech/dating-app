'use client'

import { Eye, Sparkles } from 'lucide-react'
import { useReducer } from 'react'

import { DailyIdentityPresentation } from '@/components/daily-identity/DailyIdentityPresentation'
import {
  DAILY_IDENTITY_ODDS,
  dailyIdentityCardReducer,
  initialDailyIdentityCardState,
  type DailyIdentity,
} from '@/lib/daily-identity'

const PREVIEW_IDENTITIES: readonly DailyIdentity[] = [
  previewIdentity({ tier: 'C', displayName: '디어다니엘', characterKey: 'dear-daniel' }),
  previewIdentity({ tier: 'A', displayName: '시나모롤', characterKey: 'cinnamoroll' }),
  previewIdentity({ tier: 'SS', displayName: '스파이더맨', characterKey: 'spider-man' }),
]

export function DailyIdentityExamplesPreview() {
  return (
    <main className="min-h-screen bg-[#fffaf6] px-5 py-10 text-boot-ink sm:px-7 sm:py-14">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[#EEE8FF] px-3 py-1.5 text-xs font-black text-[#512DA8]"><Sparkles size={14} aria-hidden />개발 전용 UI 미리보기</p>
          <h1 className="mt-4 text-3xl font-black tracking-[-0.04em] sm:text-4xl">오늘의 캐릭터 별명 카드</h1>
          <p className="mt-3 text-sm font-bold leading-6 text-boot-muted">아래 카드는 화면 표현 확인용 예시이며, 서버 배정이나 실제 계정 데이터가 아닙니다.</p>
        </header>

        <div className="mt-9 grid items-start gap-5 lg:grid-cols-3">
          {PREVIEW_IDENTITIES.map((identity) => <RevealExample key={identity.tier} identity={identity} />)}
        </div>
      </div>
    </main>
  )
}

function RevealExample({ identity }: { identity: DailyIdentity }) {
  const [card, dispatch] = useReducer(dailyIdentityCardReducer, initialDailyIdentityCardState)
  if (card.status === 'ready') {
    return <DailyIdentityPresentation identity={card.identity} exampleLabel="예시 별명 · 실제 배정 아님" />
  }

  const reveal = () => {
    dispatch({ type: 'reveal' })
    dispatch({ type: 'resolved', identity })
  }

  return (
    <section className="rounded-[28px] border border-[#7C4DFF]/20 bg-white p-5 shadow-[0_14px_38px_rgba(42,34,29,0.08)]">
      <p className="text-xs font-black text-[#512DA8]">{identity.tier} 등급 화면 예시</p>
      <h2 className="mt-2 text-xl font-black tracking-[-0.03em]">카드를 눌러 확인해 보세요</h2>
      <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">실제 추첨 없이 UI 상태만 펼칩니다.</p>
      <button type="button" onClick={reveal} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#6D4AFF] px-4 text-sm font-black text-white shadow-[0_8px_20px_rgba(109,74,255,0.22)]">
        <Eye size={17} aria-hidden />{identity.tier} 예시 별명 확인하기
      </button>
    </section>
  )
}

function previewIdentity({ tier, displayName, characterKey }: Pick<DailyIdentity, 'tier' | 'displayName' | 'characterKey'>): DailyIdentity {
  return Object.freeze({
    localDate: '2026-09-09',
    timezone: 'Asia/Seoul',
    poolVersion: 'campus-characters-v1-2026-09',
    tier,
    characterKey,
    displayName,
    odds: DAILY_IDENTITY_ODDS,
  })
}
