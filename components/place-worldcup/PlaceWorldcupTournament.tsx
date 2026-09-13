'use client'

import { Check, ExternalLink, MapPin, RotateCcw, Trophy } from 'lucide-react'
import { useId, useReducer, useRef } from 'react'
import SaveContentRecord from '@/components/content-history/SaveContentRecord'
import { PLACE_CATEGORIES, type PlaceCatalog } from '@/lib/place-worldcup/contract'
import { createPlaceWorldcupState, placeWorldcupReducer, resultSnapshot } from '@/lib/place-worldcup/tournament'

function naverMapHref(query: string) {
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`
}

export default function PlaceWorldcupTournament({
  catalog,
  example = false,
}: {
  catalog: PlaceCatalog
  example?: boolean
}) {
  const [state, dispatch] = useReducer(placeWorldcupReducer, catalog.candidates, createPlaceWorldcupState)
  const headingId = useId()
  const runId = useRef<string | null>(null)
  const completedAt = useRef<string | null>(null)
  const label = PLACE_CATEGORIES.find(item => item.id === catalog.category)?.label ?? '장소'
  const byId = new Map(state.candidates.map(candidate => [candidate.id, candidate]))

  function start() {
    if (state.status === 'setup' && state.selectedIds.length >= 2) {
      runId.current = crypto.randomUUID()
      completedAt.current = null
    }
    dispatch({ type: 'start' })
  }

  function restart() {
    runId.current = null
    completedAt.current = null
    dispatch({ type: 'restart' })
  }

  if (state.status === 'setup') return (
    <section aria-labelledby={headingId} className="mt-5 rounded-3xl border border-boot-hairline bg-white p-5 shadow-sm sm:p-6">
      {example && <p className="mb-3 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">예시 후보 · 실제 순위 아님</p>}
      <p className="text-xs font-black tracking-wide text-boot-primary">STEP 1 · 가본 곳 선택</p>
      <h2 id={headingId} className="mt-2 text-2xl font-black tracking-tight">직접 가본 {label}을 골라 주세요</h2>
      <p className="mt-2 text-sm leading-6 text-boot-muted">2곳 이상 선택해야 실제 1:1 대결을 시작할 수 있어요. 방문하지 않은 곳은 순위에 넣지 않습니다.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {state.candidates.map(candidate => {
          const selected = state.selectedIds.includes(candidate.id)
          return <button
            key={candidate.id}
            type="button"
            aria-pressed={selected}
            onClick={() => dispatch({ type: 'toggle-visited', candidateId: candidate.id })}
            className={`min-h-24 rounded-2xl border p-4 text-left transition ${selected ? 'border-boot-primary bg-boot-soft ring-2 ring-boot-primary/15' : 'border-boot-hairline bg-white hover:border-boot-primary/50'}`}
          >
            <span className="flex items-start justify-between gap-3">
              <span><strong className="block text-base">{candidate.name}</strong><span className="mt-1 block text-xs leading-5 text-boot-muted">{candidate.address}</span></span>
              <span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full border ${selected ? 'border-boot-primary bg-boot-primary text-white' : 'border-boot-hairline'}`}>{selected && <Check size={15}/>}</span>
            </span>
          </button>
        })}
      </div>
      <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-stone-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm"><strong>{state.selectedIds.length}곳</strong> 선택 · 최소 2곳</p>
        <button type="button" onClick={start} disabled={state.selectedIds.length < 2} className="min-h-12 rounded-xl bg-boot-primary px-5 font-black text-white disabled:cursor-not-allowed disabled:opacity-45">월드컵 시작</button>
      </div>
      {state.error === 'minimum-two' && <p role="alert" className="mt-3 text-sm font-bold text-red-700">가본 곳을 2곳 이상 선택해 주세요.</p>}
      <p className="mt-4 text-xs leading-5 text-boot-muted">이 결과는 내 선택 기록입니다. 업장 추천·제휴·공개 인기 통계가 아니에요.</p>
    </section>
  )

  if (state.status === 'battle') {
    const first = byId.get(state.pair[0])
    const second = byId.get(state.pair[1])
    if (!first || !second) return <p role="alert">대결 후보를 불러오지 못했어요.</p>
    return (
      <section aria-labelledby={headingId} className="mt-5 rounded-3xl border border-boot-hairline bg-white p-5 shadow-sm sm:p-6">
        {example && <p className="mb-3 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">예시 후보 · 실제 순위 아님</p>}
        <p className="text-xs font-black tracking-wide text-boot-primary">ROUND {state.round} · {state.selections.length + 1}번째 선택</p>
        <h2 id={headingId} className="mt-2 text-2xl font-black tracking-tight">다시 간다면 어디?</h2>
        <p className="mt-2 text-sm text-boot-muted">둘 중 지금 더 가고 싶은 곳을 눌러 주세요.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch">
          {[first, second].map((candidate, index) => <div key={candidate.id} className="contents">
            <button type="button" onClick={() => dispatch({ type: 'pick', candidateId: candidate.id })} className="group min-h-40 rounded-2xl border border-boot-hairline bg-stone-50 p-5 text-left hover:border-boot-primary hover:bg-boot-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-boot-primary">
              <span className="text-xs font-black text-boot-primary">{index === 0 ? 'A' : 'B'}</span>
              <strong className="mt-3 block text-xl leading-7">{candidate.name}</strong>
              <span className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-boot-muted"><MapPin className="mt-0.5 shrink-0" size={14}/>{candidate.address}</span>
            </button>
            {index === 0 && <span aria-hidden="true" className="hidden self-center text-xs font-black text-boot-muted sm:block">VS</span>}
          </div>)}
        </div>
        <button type="button" onClick={restart} className="mt-5 min-h-11 text-sm font-bold text-boot-muted underline">가본 곳부터 다시 고르기</button>
      </section>
    )
  }

  const winner = byId.get(state.winnerId)
  if (!winner) return <p role="alert">1위 장소를 확인하지 못했어요.</p>
  completedAt.current ??= new Date().toISOString()
  runId.current ??= crypto.randomUUID()
  const snapshot = resultSnapshot({
    state,
    category: catalog.category,
    label,
    catalogRevision: catalog.catalogRevision,
    runId: runId.current,
    completedAt: completedAt.current,
  })

  return (
    <section aria-labelledby={headingId} className="mt-5 rounded-3xl border border-boot-hairline bg-white p-5 shadow-sm sm:p-6">
      {example && <p className="mb-3 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">예시 후보 · 실제 순위 아님</p>}
      <div className="grid size-12 place-items-center rounded-2xl bg-amber-100 text-amber-700"><Trophy size={25}/></div>
      <p className="mt-4 text-xs font-black tracking-wide text-boot-primary">내 {label} 월드컵 결과</p>
      <h2 id={headingId} className="mt-2 text-3xl font-black tracking-tight">1위 · {winner.name}</h2>
      <p className="mt-2 flex items-start gap-1.5 text-sm leading-6 text-boot-muted"><MapPin className="mt-1 shrink-0" size={15}/>{winner.address}</p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <a href={naverMapHref(winner.mapQuery)} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-boot-primary px-4 font-black text-white">지도에서 현재 정보 검색<ExternalLink size={16}/></a>
        <button type="button" onClick={restart} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-boot-hairline bg-white px-4 font-bold"><RotateCcw size={16}/>다시 선택</button>
      </div>
      <p className="mt-3 text-xs leading-5 text-boot-muted">지도 검색 결과는 현재 영업·가격·예약 가능 여부를 보장하지 않아요.</p>
      {!example && <>
        <SaveContentRecord snapshot={snapshot}/>
        <p className="mt-3 text-xs leading-5 text-boot-muted">결과를 저장한 뒤 ‘저장한 결과 보기’에서 선택 이유를 <strong>개인 메모</strong>로 남길 수 있어요. 공개 통계에는 반영되지 않습니다.</p>
      </>}
    </section>
  )
}
