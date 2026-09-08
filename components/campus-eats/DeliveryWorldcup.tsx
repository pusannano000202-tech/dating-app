'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, ArrowRight, Check, ExternalLink, RotateCcw, Utensils } from 'lucide-react'
import { deliveryAvailability, deliveryRecordKey, formatDeliveryPrice, type DeliveryCandidate } from '@/lib/campus-eats/delivery'
import { createDeliveryContest, chooseDeliveryCandidate, restoreDeliveryContest, type DeliveryContest as Contest } from '@/lib/campus-eats/delivery-contest'

type Catalog = { candidates: DeliveryCandidate[]; canStart: boolean; verifiedCount: number; checkedAt: string }
const RECORD_KEY = deliveryRecordKey('pnu')

export default function DeliveryWorldcup() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState('')
  const [contest, setContest] = useState<Contest | null>(null)
  const [busy, setBusy] = useState(false)

  async function reload() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/campus-eats/delivery', { cache: 'no-store' })
      if (!response.ok) throw new Error('unavailable')
      const payload = await response.json() as Catalog
      if (!Array.isArray(payload.candidates)) throw new Error('unavailable')
      setCatalog(payload)
      setError('')
      return payload
    } catch {
      setError('배달 후보 정보를 가져오지 못했어요. 조건을 확인할 때까지 비교를 열지 않습니다.')
      setCatalog(null)
      return null
    } finally { setBusy(false) }
  }

  useEffect(() => {
    void reload()
    try {
      const raw = window.localStorage.getItem(RECORD_KEY)
      if (!raw) return
      setContest(restoreDeliveryContest(JSON.parse(raw)))
    } catch { /* Corrupt local preference data must not prevent browsing. */ }
  }, [])

  function save(next: Contest) {
    setContest(next)
    try { window.localStorage.setItem(RECORD_KEY, JSON.stringify(next)) }
    catch { setError('이 기기에는 결과를 저장할 수 없어요. 현재 화면에서만 이어집니다.') }
  }

  async function start() {
    const current = await reload()
    if (!current?.canStart) return
    const availability = deliveryAvailability(current.candidates, new Date())
    if (!availability.canStart) return
    save(createDeliveryContest(availability.candidates.slice(0, 500).map((row) => row.id)))
  }

  const eligible = catalog ? deliveryAvailability(catalog.candidates, new Date()) : null
  const activeCatalog = new Map(eligible?.candidates.map((row) => [row.id, row]) ?? [])
  const validContest = contest && catalog?.canStart && contest.candidateIds.every((id) => activeCatalog.has(id))
  const pair = validContest ? contest.remaining.slice(0, 2).flatMap((id) => activeCatalog.get(id) ?? []) : []

  function choose(id: string) {
    if (!contest || !validContest || !catalog || pair.length !== 2 || !pair.some((row) => row.id === id)) return
    const fresh = deliveryAvailability(catalog.candidates, new Date())
    if (!fresh.canStart || contest.candidateIds.some((candidateId) => !fresh.candidates.some((row) => row.id === candidateId))) {
      setError('비교 중 후보의 확인 기한이 지났어요. 조건을 다시 확인해 주세요.')
      return
    }
    save(chooseDeliveryCandidate(contest, id))
  }

  const winner = validContest && contest.winner ? activeCatalog.get(contest.winner) : null
  return (
    <main className="min-h-screen bg-[#fff9f6] px-4 pb-28 pt-5 text-[#292321]">
      <div className="mx-auto max-w-4xl">
        <Link href="/community" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-[#77645b]"><ArrowLeft size={18} /> 커뮤니티</Link>
        <header className="my-5">
          <p className="text-xs font-bold text-[#B94B3F]">부산대 앞 · 1인 메뉴 취향</p>
          <h1 className="mt-2 text-3xl font-black">오늘은 혼자, 맛있게.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#77645b]">가게와 대표 1인 메뉴를 골라보는 배달 월드컵이에요. 방문 맛집 순위와 따로 저장되며, 실제 주문은 배달 서비스에서 직접 확인합니다.</p>
        </header>
        <div className="rounded-[20px] border border-[#eadbd4] bg-white p-5" aria-busy={busy}>
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="font-black">{busy ? '배달 후보 확인 중' : error && !catalog ? '후보 정보를 불러오지 못했어요' : '현재 확인된 후보'}</h2><p className="mt-1 text-sm text-[#77645b]">{catalog ? `${eligible?.verifiedCount ?? 0}개 · 8개 이상이면 시작할 수 있어요` : busy ? '메뉴와 주문 조건을 확인하고 있어요.' : '연결이 복구되면 다시 확인할 수 있어요.'}</p></div>
            <Utensils size={24} className="shrink-0 text-[#B94B3F]" />
          </div>
          {catalog && !catalog.canStart ? <p className="mt-4 rounded-xl bg-[#fff5eb] p-3 text-sm leading-6">후보를 준비하고 있어요. 최소 주문 금액·메뉴·확인 시각이 갖춰진 가게부터 보여드릴게요. 검증되지 않은 가게를 임의로 채우지 않습니다.</p> : null}
          {error ? <p role="status" className="mt-3 text-sm leading-6 text-[#9e3e34]">{error}</p> : null}
          {contest && !validContest && catalog ? <p className="mt-3 text-sm text-[#9e3e34]">이전 대진의 후보 정보가 바뀌었어요. 확인된 후보로 새로 시작해 주세요.</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => void start()} disabled={busy || !eligible?.canStart} className="flex min-h-12 items-center gap-2 rounded-xl bg-[#B94B3F] px-5 text-sm font-bold text-white disabled:bg-[#e6dad4] disabled:text-[#77645b]">{contest ? '새 대진 시작' : '배달 월드컵 시작'} <ArrowRight size={16} /></button>
            <button type="button" onClick={() => void reload()} disabled={busy} className="flex min-h-12 items-center gap-2 rounded-xl border border-[#eadbd4] px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-[#B94B3F]"><RotateCcw size={16} /> {busy ? '확인하는 중…' : '조건 다시 확인'}</button>
          </div>
        </div>

        {!busy && !eligible?.canStart && <aside className="mt-4 rounded-2xl border border-[#eadbd4] bg-[#fff5ef] p-5">
          <h2 className="text-base font-black">기다리는 동안, 먹어본 맛집은 어때요?</h2>
          <p className="mt-2 text-sm leading-6 text-[#77645b]">방문 맛집 월드컵은 지금 둘러볼 수 있어요. 배달 후보와 결과는 섞이지 않아요.</p>
          <Link href="/community/campus-eats?mode=choose" className="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#B94B3F] px-3 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B94B3F]">음식 종류부터 고르기 <ArrowRight size={16} aria-hidden="true" /></Link>
        </aside>}

        {pair.length === 2 && !winner ? <section aria-label="배달 메뉴 비교" className="mt-5 grid grid-cols-2 gap-3">{pair.map((row) => <DeliveryCard key={row.id} row={row} onChoose={() => choose(row.id)} />)}</section> : null}
        {winner ? <section aria-label="내 배달 월드컵 결과" className="mt-5"><h2 className="mb-3 flex items-center gap-2 text-xl font-black"><Check className="text-[#B94B3F]" /> 이번 대진의 내 선택</h2><DeliveryCard row={winner} /><p className="mt-3 text-xs text-[#77645b]">내 기기에만 저장된 취향 결과예요. 전체 이용자 순위나 주문 완료를 뜻하지 않아요.</p></section> : null}
        {!pair.length && !winner && eligible?.candidates.length ? <section aria-label="확인된 배달 후보" className="mt-5 grid gap-3 sm:grid-cols-2">{eligible.candidates.map((row) => <DeliveryCard key={row.id} row={row} />)}</section> : null}
        <p className="mt-5 text-xs leading-6 text-[#77645b]">메뉴·가게 정보는 7일, 혜택은 24시간마다 재확인이 필요해요. 금액 미확인은 무료를 뜻하지 않으며 배달 가능 여부와 최종 결제 금액은 주소·시간·회원 조건에 따라 달라집니다. 특정 플랫폼과 제휴한 공식 서비스가 아닙니다.</p>
      </div>
    </main>
  )
}

function DeliveryCard({ row, onChoose }: { row: DeliveryCandidate; onChoose?: () => void }) {
  return <article className="min-w-0 rounded-[18px] border border-[#eadbd4] bg-white p-4">
    {row.imagePath && row.imageRights ? <div className="relative mb-3 aspect-square overflow-hidden rounded-xl"><Image src={row.imagePath} alt={`${row.storeName} ${row.menuName}`} fill sizes="(max-width: 639px) 45vw, 400px" className="object-contain" /></div> : null}
    <p className="text-[11px] font-bold text-[#B94B3F]">{row.region}</p>
    <h3 className="mt-2 break-words text-lg font-black">{row.menuName}</h3>
    <p className="mt-1 break-words text-sm text-[#77645b]">{row.storeName}</p>
    <dl className="mt-4 space-y-2 text-xs leading-5">
      <div><dt className="text-[#77645b]">메뉴 / 필수 선택</dt><dd>{formatDeliveryPrice(row.menuPrice)} / {formatDeliveryPrice(row.mandatoryOptionPrice)}</dd></div>
      <div><dt className="text-[#77645b]">적용 최소 주문 / 배달비</dt><dd>{formatDeliveryPrice(row.minimumOrderPrice)} / {formatDeliveryPrice(row.deliveryFee)}</dd></div>
      <div><dt className="text-[#77645b]">회원 조건</dt><dd>{row.membershipCondition}</dd></div>
      {row.benefit ? <div><dt className="text-[#77645b]">확인한 혜택</dt><dd>{row.benefit}</dd></div> : null}
    </dl>
    {onChoose ? <button type="button" onClick={onChoose} className="mt-4 min-h-12 w-full rounded-xl bg-[#B94B3F] px-2 text-sm font-bold text-white">이 메뉴 선택</button> : null}
    <a href={row.orderUrl} target="_blank" rel="noopener noreferrer" className="mt-3 flex min-h-11 items-center gap-1 text-xs font-bold text-[#77645b]">주문 조건 확인 <ExternalLink size={14} /></a>
    <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#77645b] underline">정보 출처 · {row.verifiedAt ? new Date(row.verifiedAt).toLocaleDateString('ko-KR') : '확인 전'}</a>
  </article>
}
