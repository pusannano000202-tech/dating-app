'use client'

import { ArrowUpRight, RefreshCw } from 'lucide-react'
import type { CalendarReadiness } from '@/components/matching/calendar-readiness'

/** Reconnect the existing profile/photo preparation, without writing or analysing on page load. */
export default function TonightPreparationGate({ value, onRetry, direct = false }: {
  value: CalendarReadiness
  onRetry: () => Promise<boolean>
  direct?: boolean
}) {
  if (value.status === 'ready') return null
  return <section className="rounded-2xl border border-[#ead9d2] bg-white p-5" aria-label="오늘밤 참가 준비" role="status">
    <h2 className="font-black">신청 전, 기존 참가 준비를 이어가요</h2>
    <p className="mt-2 text-sm leading-6 text-[#77645b]">{value.status === 'loading'
      ? '내 프로필·사진 준비 상태를 확인하고 있어요.'
      : value.status === 'missing'
        ? '기본정보·취향·사진 중 남은 단계만 완료해 주세요. 사진 분석은 기존 준비 화면에서 직접 시작하며 점수는 공개되지 않아요.'
        : value.status === 'account_changed'
          ? '로그인 계정이 바뀌었어요. 새로고침한 뒤 같은 계정으로 이어가 주세요.'
          : '참가 준비 상태를 확인하지 못했어요. 다시 확인한 뒤 신청할 수 있어요.'}</p>
    {value.status === 'missing' && <>
      <a href={direct ? value.profileHref : '/tonight/prepare'} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#b44733] px-4 text-sm font-bold text-white">남은 참가 준비 이어가기<ArrowUpRight size={16} aria-hidden /></a>
      <p className="mt-3 text-xs leading-5 text-[#8a7c72]">새 탭에서 준비한 뒤 돌아오세요. 이 탭의 활동 순위는 그대로 유지돼요.</p>
    </>}
    {value.status !== 'loading' && <button type="button" onClick={() => void onRetry()} className="mt-3 flex min-h-11 items-center gap-2 text-sm font-bold text-[#a84230]"><RefreshCw size={15} aria-hidden />준비 상태 다시 확인</button>}
  </section>
}
