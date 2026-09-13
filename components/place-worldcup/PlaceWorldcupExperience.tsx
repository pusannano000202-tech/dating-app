'use client'

import Link from 'next/link'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { PLACE_CATEGORIES, parsePlaceCatalog, type PlaceCatalog, type PlaceCategory } from '@/lib/place-worldcup/contract'
import PlaceSuggestionForm from './PlaceSuggestionForm'
import PlaceWorldcupTournament from './PlaceWorldcupTournament'

const STATE_COPY = {
  under_review: {
    title: '후보를 Quantum이 검수하고 있어요',
    body: '조사 초안이나 제안이 있어도 현재 운영 여부를 승인하기 전에는 대결에 넣지 않습니다.',
  },
  stale: {
    title: '후보 정보가 오래되어 다시 확인 중이에요',
    body: '예전 후보로 결과를 만들지 않도록 대결을 잠시 닫았습니다. 재검수 뒤 2곳 이상이 확인되면 열려요.',
  },
  insufficient: {
    title: '승인된 후보가 아직 2곳보다 적어요',
    body: '후보가 없다는 뜻과 연결 오류는 구분해 보여 드려요. 직접 가본 곳을 제안할 수 있습니다.',
  },
} as const

export default function PlaceWorldcupExperience({ category }: { category: PlaceCategory }) {
  const [catalog, setCatalog] = useState<PlaceCatalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)
  const label = PLACE_CATEGORIES.find(item => item.id === category)?.label ?? '장소'

  const retry = useCallback(() => setGeneration(value => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setCatalog(null)
    setError(null)
    void (async () => {
      try {
        const response = await fetch(`/api/place-worldcup?category=${encodeURIComponent(category)}`, {
          cache: 'no-store', signal: controller.signal,
        })
        const data: unknown = await response.json()
        if (!response.ok) {
          const message = data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
            ? data.message : '장소 후보를 불러오지 못했어요.'
          throw new Error(message)
        }
        const nextCatalog = parsePlaceCatalog(data)
        if (nextCatalog.category !== category) throw new Error('요청한 장소 종류와 후보 응답이 달라요.')
        if (!controller.signal.aborted) setCatalog(nextCatalog)
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '장소 후보를 불러오지 못했어요.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [category, generation])

  if (loading) return <section aria-live="polite" className="mt-5 rounded-2xl border border-boot-hairline bg-white p-5"><p className="font-black">{label} 후보를 확인하고 있어요…</p><p className="mt-2 text-sm text-boot-muted">승인 상태와 정보 유효기간을 확인합니다.</p></section>

  if (error) return <section className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5" aria-labelledby="place-worldcup-error">
    <h2 id="place-worldcup-error" className="font-black text-red-900">후보 연결에 실패했어요</h2>
    <p role="alert" className="mt-2 text-sm leading-6 text-red-800">{error}</p>
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={retry} className="flex min-h-11 items-center gap-2 rounded-xl bg-red-800 px-4 font-bold text-white"><RefreshCw size={15}/>다시 불러오기</button><Link href="/login?next=%2Fcommunity%2Fplaces" className="flex min-h-11 items-center px-3 text-sm font-bold underline">로그인 확인</Link></div>
  </section>

  if (!catalog) return null
  if (catalog.state === 'ready') return <>
    <PlaceWorldcupTournament key={`${catalog.category}:${catalog.catalogRevision}`} catalog={catalog}/>
    <PlaceSuggestionForm category={category} candidates={catalog.candidates}/>
  </>

  const copy = STATE_COPY[catalog.state]
  return <>
    <section className="mt-5 rounded-2xl border border-boot-hairline bg-stone-50 p-5" aria-labelledby="place-worldcup-unavailable">
      <p className="text-xs font-black text-boot-primary">현재 상태 · {catalog.state === 'under_review' ? '검수 중' : catalog.state === 'stale' ? '정보 갱신 필요' : '후보 부족'}</p>
      <h2 id="place-worldcup-unavailable" className="mt-2 text-xl font-black">{copy.title}</h2>
      <p className="mt-2 text-sm leading-6 text-boot-muted">{copy.body}</p>
      <a href={`https://map.naver.com/p/search/${encodeURIComponent(`부산대 ${label}`)}`} target="_blank" rel="noopener noreferrer" className="mt-4 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-boot-hairline bg-white px-4 font-bold">지도에서 주변 {label} 검색<ExternalLink size={16}/></a>
      <p className="mt-2 text-xs leading-5 text-boot-muted">지도 검색은 후보 승인이나 제휴를 뜻하지 않으며, 현재 영업 여부는 직접 확인해 주세요.</p>
    </section>
    <PlaceSuggestionForm category={category} candidates={[]}/>
  </>
}
