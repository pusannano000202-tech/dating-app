'use client'

import PlaceWorldcupTournament from './PlaceWorldcupTournament'
import type { PlaceCatalog } from '@/lib/place-worldcup/contract'

const EXAMPLE_CATALOG: PlaceCatalog = Object.freeze({
  category: 'boardgame',
  state: 'ready',
  requiredMinimum: 2,
  candidateCount: 3,
  catalogRevision: 'offline-example',
  candidates: Object.freeze([
    { id: '11111111-1111-4111-8111-111111111111', name: '예시 보드게임 라운지', address: '예시 주소 1', mapQuery: '부산대 보드게임카페' },
    { id: '22222222-2222-4222-8222-222222222222', name: '예시 플레이 스튜디오', address: '예시 주소 2', mapQuery: '부산대 보드게임카페' },
    { id: '33333333-3333-4333-8333-333333333333', name: '예시 게임 살롱', address: '예시 주소 3', mapQuery: '부산대 보드게임카페' },
  ]),
})

export default function PlaceWorldcupPreview() {
  return <main className="min-h-screen bg-[#fffaf7] px-4 py-8 text-boot-ink">
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-black text-amber-800">개발 전용 OFFLINE UI</p>
      <h1 className="mt-2 text-3xl font-black">장소 월드컵 화면 검수</h1>
      <p className="mt-3 text-sm leading-6 text-boot-muted">예시 후보 · 실제 순위 아님 · API 호출과 계정 저장을 하지 않습니다.</p>
      <PlaceWorldcupTournament catalog={EXAMPLE_CATALOG} example/>
    </div>
  </main>
}
