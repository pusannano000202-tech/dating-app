'use client'

import SanjiCharacter, { type SanjiMood } from '@/components/SanjiCharacter'

const MOODS: { mood: SanjiMood; label: string; speech: string; anim: string }[] = [
  {
    mood: 'pleading',
    label: 'beg_3000 — 간청',
    speech: '잠깐만요!! 3,000원만 남겨주시면 안될깡요?? 🥺',
    anim: 'animate-bounce',
  },
  {
    mood: 'desperate',
    label: 'beg_2000 — 절박',
    speech: '그, 그럼 2,000원만은요??!! 제발요!!!',
    anim: 'animate-wiggle',
  },
  {
    mood: 'crying',
    label: 'beg_1000 — 오열',
    speech: '1,000원만... 1,000원만이라도... 😭',
    anim: 'animate-sway',
  },
  {
    mood: 'collapsed',
    label: 'too_much — 쓰러짐',
    speech: '너... 너무해... 산지니 쓰러졌어요... 💔',
    anim: '',
  },
]

export default function SanjiDebugPage() {
  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-black text-center gradient-fate-text mb-2">산지니 캐릭터 프리뷰</h1>
        <p className="text-center text-xs text-gray-500 mb-8">구걸 단계별 표정 / 애니메이션 확인용</p>

        <div className="grid grid-cols-2 gap-5">
          {MOODS.map(({ mood, label, speech }) => (
            <div key={mood} className="glass-card rounded-3xl p-4 flex flex-col items-center">
              <p className="text-[10px] text-violet-300 font-bold mb-3">{label}</p>

              {/* 말풍선 */}
              <div className="relative w-full mb-1">
                <div className="glass rounded-2xl px-3 py-2 text-center">
                  <p className="text-[11px] font-bold text-violet-100 leading-snug">{speech}</p>
                </div>
                <div className="flex justify-center">
                  <svg width="20" height="10" viewBox="0 0 20 10" fill="none">
                    <polygon points="0,0 20,0 10,10" fill="rgba(255,255,255,0.055)" />
                  </svg>
                </div>
              </div>

              {/* 캐릭터 */}
              <SanjiCharacter mood={mood} />
            </div>
          ))}
        </div>

        <p className="text-center text-[10px] text-gray-600 mt-6">
          이 페이지는 확인용입니다. 실제 흐름: /match/[id]/refund
        </p>
      </div>
    </main>
  )
}
