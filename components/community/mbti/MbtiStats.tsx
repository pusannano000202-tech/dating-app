'use client'

import Link from 'next/link'
import { ArrowLeft, RefreshCw, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { MbtiPublicSnapshotDto } from '@/lib/community/mbti/snapshot.server'

interface MbtiStatsProps {
  onBack: () => void
  onBackLabel: string
  onManage: () => void
  canManage: boolean
}

export default function MbtiStats({ onBack, onBackLabel, onManage, canManage }: MbtiStatsProps) {
  const [snapshot, setSnapshot] = useState<MbtiPublicSnapshotDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/community/mbti/stats', { cache: 'no-store' })
      if (!response.ok) throw new Error('통계를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
      setSnapshot(await response.json() as MbtiPublicSnapshotDto)
    } catch {
      setSnapshot(null)
      setError('통계를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const aggregate = snapshot?.selfReported
  const published = aggregate?.status === 'published'

  return (
    <section className="mx-auto w-full max-w-4xl px-4 pb-24 pt-5 sm:px-6 sm:pt-8">
      <header className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-black outline-none hover:bg-boot-soft focus-visible:ring-2 focus-visible:ring-boot-primary" aria-label={onBackLabel}><ArrowLeft size={18} /> {onBackLabel}</button>
        {canManage && <button type="button" onClick={onManage} className="flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-black text-boot-primary"><Settings2 size={17} /> 내 응답 관리</button>}
      </header>
      <div className="mt-7">
        <span className="inline-flex rounded-full bg-boot-soft px-3 py-1 text-xs font-black text-boot-primary">선택 참여 통계</span>
        <h1 className="mt-4 text-3xl font-black tracking-[-0.03em] sm:text-4xl">어떤 유형을 많이 만났을까요?</h1>
        <p className="mt-3 text-sm font-bold leading-6 text-boot-body">자기보고 연애 경험과 실제 회차 통계는 섞지 않아요.</p>
      </div>

      {loading ? (
        <div className="mt-7 rounded-2xl border border-boot-hairline bg-white p-6 text-sm font-bold text-boot-muted">공개 가능한 최신 통계를 확인하는 중…</div>
      ) : error ? (
        <div role="alert" className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-black text-red-800">통계를 불러오지 못했어요.</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-red-700">연결이 원활하지 않아 최신 통계를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.</p>
          <button type="button" onClick={() => void load()} className="mt-4 flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-black text-red-800"><RefreshCw size={16} /> 다시 시도</button>
        </div>
      ) : !published ? (
        <div className="mt-7 rounded-2xl border border-boot-hairline bg-white p-6">
          <h2 className="text-lg font-black">아직 공개할 수 있는 통계가 없어요.</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">응답이 없거나 표본 보호 기준을 통과하지 못했거나, 검수된 공개본이 24시간보다 오래되었어요. 숫자를 임의로 채우지 않아요.</p>
          <button type="button" onClick={() => void load()} className="mt-4 flex min-h-11 items-center gap-2 rounded-xl border border-boot-hairline px-4 text-sm font-black"><RefreshCw size={16} /> 다시 확인</button>
        </div>
      ) : (
        <div className="mt-7 grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-boot-hairline bg-white p-5">
            <h2 className="text-lg font-black">내 MBTI 분포</h2>
            <p className="mt-1 text-xs font-bold text-boot-muted">응답자 {aggregate.respondentCount ?? '보호됨'}명 · 경험 {aggregate.experienceCount ?? '보호됨'}건</p>
            <ul className="mt-4 grid grid-cols-2 gap-2">
              {aggregate.selfMbti.map((cell) => <li key={cell.selfMbti} className="flex items-center justify-between rounded-xl bg-boot-canvas px-3 py-3 text-sm font-black"><span>{cell.selfMbti}</span><span>{cell.respondentCount}명</span></li>)}
            </ul>
          </article>
          <article className="rounded-2xl border border-boot-hairline bg-white p-5">
            <h2 className="text-lg font-black">많이 보고된 조합</h2>
            <p className="mt-1 text-xs font-bold text-boot-muted">실제 커플 수가 아니에요.</p>
            <ul className="mt-4 grid gap-2">
              {aggregate.reportedCombinations.map((cell) => (
                <li key={[cell.selfMbtiSnapshot, cell.partnerMbti, cell.selfGender, cell.partnerGender, cell.relationshipStatus].join('-')} className="rounded-xl bg-boot-canvas px-3 py-3">
                  <strong className="text-sm">{cell.selfMbtiSnapshot} × {cell.partnerMbti === 'UNKNOWN' ? '유형 모름' : cell.partnerMbti}</strong>
                  <span className="mt-1 block text-xs font-bold text-boot-muted">응답자 n명 표기는 공개 보호값 기준 · 현재 {cell.respondentCount}명 · 경험 {cell.experienceCount}건</span>
                </li>
              ))}
            </ul>
          </article>
          <article className="rounded-2xl border border-boot-hairline bg-white p-5 lg:col-span-2">
            <h2 className="text-lg font-black">잘 맞았다고 답한 조합</h2>
            {aggregate.ratedCombinations.length === 0 ? <p className="mt-3 text-sm font-bold text-boot-muted">30명 이상의 유효 점수 응답과 보호 기준을 통과한 조합이 아직 없어요.</p> : (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">{aggregate.ratedCombinations.map((cell) => <li key={[cell.selfMbtiSnapshot, cell.partnerMbti, cell.selfGender, cell.partnerGender, cell.relationshipStatus].join('-')} className="rounded-xl bg-boot-soft px-4 py-3 text-sm font-black">{cell.selfMbtiSnapshot} × {cell.partnerMbti} · {Math.round(cell.positiveRate * 100)}%</li>)}</ul>
            )}
          </article>
        </div>
      )}

      {!loading && !error && snapshot && <article className="mt-4 rounded-2xl border border-boot-hairline bg-white p-5">
        <h2 className="font-black">같은 회차에서 만난 조합</h2>
        {snapshot?.meetingStats.status === 'published' ? (
          <>
            <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">서비스에서 확인한 같은 행사 출석 기록과 두 사람의 별도 동의가 있을 때만 공개해요. 1:1 매칭이나 확인된 커플 수가 아니에요.</p>
            <p className="mt-1 text-xs font-bold text-boot-muted">공개 가능 회차 {snapshot.meetingStats.eligibleOccurrenceCount}개 · 고유 동의자 {snapshot.meetingStats.uniqueConsentingParticipantCount}명</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {snapshot.meetingStats.cells.map((cell) => (
                <li key={`${cell.firstMbti}-${cell.secondMbti}`} className="rounded-xl bg-boot-canvas px-3 py-3 text-sm font-black">
                  {cell.firstMbti} 여성 × {cell.secondMbti} 남성
                  <span className="mt-1 block text-xs font-bold text-boot-muted">서로 다른 회차 {cell.occurrenceCount}개 · 고유 동의자 {cell.uniqueConsentingParticipantCount}명</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">서비스에서 같은 행사 출석 기록과 두 사람의 별도 동의를 확인한 뒤, 공개해도 안전한 수가 되면 보여드려요.</p>
        )}
      </article>}
      <p className="mt-4 text-xs font-bold leading-5 text-boot-muted">{aggregate?.limitations.join(' ') ?? '선택 참여한 자기보고 응답은 과학적 궁합이나 미래 관계 성공률을 뜻하지 않아요.'}</p>
      <div className="mt-6 rounded-2xl border border-boot-hairline bg-white p-5">
        <p className="font-black">유형보다, 우리가 편했던 순간</p>
        <p className="mt-2 text-sm leading-6 text-boot-muted">처음 만났을 때 편했던 대화는 무엇이었나요?</p>
        <Link href="/community/relationship-advice?starter=first-hello" className="mt-3 flex min-h-11 items-center text-sm font-black text-boot-primary">내 이야기 초안 열기 →</Link>
        <p className="mt-1 text-xs leading-5 text-boot-muted">내 MBTI 응답이나 상대 정보는 옮겨지지 않아요. 직접 쓴 뒤 게시 여부를 선택해요.</p>
      </div>
    </section>
  )
}
