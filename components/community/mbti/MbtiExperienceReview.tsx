'use client'

import { ArrowLeft, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import Link from 'next/link'

import type { MbtiExperienceDraft } from '@/lib/community/mbti/draft'
import { transitionExpandedReviewId } from '@/lib/community/mbti/journey'
import {
  MATCHED_ASPECTS,
  type CommunityMbtiGender,
  type MatchedAspect,
} from '@/lib/community/mbti/types'

import MbtiJourneyProgress from './MbtiJourneyProgress'

const GENDER_OPTIONS: ReadonlyArray<{ value: CommunityMbtiGender; label: string }> = [
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
  { value: 'other_or_undisclosed', label: '기타·응답 안 함' },
  { value: 'unknown', label: '모름' },
]

const ASPECT_LABELS: Record<MatchedAspect, string> = {
  conversation: '대화',
  contact: '연락',
  conflict: '갈등 조율',
  lifestyle: '생활 방식',
  values: '가치관',
}

interface MbtiExperienceReviewProps {
  drafts: MbtiExperienceDraft[]
  selfGender: CommunityMbtiGender
  consent: boolean
  submitting: boolean
  recoveryLocked: boolean
  error: string | null
  authenticated: boolean | null
  onRetryService: () => Promise<void>
  onDraftChange: (drafts: MbtiExperienceDraft[]) => void
  onSelfGenderChange: (gender: CommunityMbtiGender) => void
  onConsentChange: (consent: boolean) => void
  onBack: () => void
  onSubmit: () => void
}

export default function MbtiExperienceReview({
  drafts,
  selfGender,
  consent,
  submitting,
  recoveryLocked,
  error,
  authenticated,
  onRetryService,
  onDraftChange,
  onSelfGenderChange,
  onConsentChange,
  onBack,
  onSubmit,
}: MbtiExperienceReviewProps) {
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(drafts[0]?.draftId ?? null)
  const [checkingService, setCheckingService] = useState(false)

  useEffect(() => {
    if (expandedDraftId === null || drafts.some((draft) => draft.draftId === expandedDraftId)) return
    setExpandedDraftId(drafts[0]?.draftId ?? null)
  }, [drafts, expandedDraftId])

  const update = (draftId: string, patch: Partial<MbtiExperienceDraft>) => {
    onDraftChange(drafts.map((draft) => draft.draftId === draftId ? { ...draft, ...patch } : draft))
  }

  const toggleAspect = (draft: MbtiExperienceDraft, aspect: MatchedAspect) => {
    const matchedAspects = draft.matchedAspects.includes(aspect)
      ? draft.matchedAspects.filter((entry) => entry !== aspect)
      : [...draft.matchedAspects, aspect]
    update(draft.draftId, { matchedAspects })
  }

  return (
    <section aria-busy={submitting} className="mx-auto w-full max-w-3xl px-4 pb-24 pt-5 sm:px-6 sm:pt-8">
      <header className="flex items-center justify-between gap-3">
        <button type="button" disabled={submitting || recoveryLocked} onClick={onBack} className="flex h-11 w-11 items-center justify-center rounded-full outline-none hover:bg-boot-soft focus-visible:ring-2 focus-visible:ring-boot-primary disabled:opacity-40" aria-label="경험 횟수로 돌아가기"><ArrowLeft /></button>
        <MbtiJourneyProgress active={3} />
      </header>
      <fieldset disabled={submitting || recoveryLocked}>
      <legend className="sr-only">경험 검토와 저장</legend>
      <div className="mt-6">
        <span className="inline-flex rounded-full bg-boot-soft px-3 py-1 text-xs font-black text-boot-primary">3단계 · 확인과 동의</span>
        <h1 className="mt-4 break-keep text-3xl font-black tracking-[-0.03em] sm:text-4xl">선택한 경험을 확인해요.</h1>
        <p className="mt-3 text-sm font-bold leading-5 text-boot-body">한 번에 한 경험만 열어 실제 선택 값을 확인하거나 고칠 수 있어요.</p>
        <details className="mt-2 text-xs font-bold leading-5 text-boot-muted">
          <summary className="cursor-pointer text-boot-primary outline-none focus-visible:ring-2 focus-visible:ring-boot-primary">입력하지 않는 개인정보 보기</summary>
          <p className="mt-1">상대의 이름·전화번호·계정·사진·정확한 날짜·자유서술은 받지 않아요.</p>
        </details>
      </div>

      <fieldset className="mt-7 rounded-2xl border border-boot-hairline bg-white p-4">
        <legend className="px-1 text-sm font-black">통계에 사용할 내 성별</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {GENDER_OPTIONS.map((option) => (
            <button key={option.value} type="button" onClick={() => onSelfGenderChange(option.value)} aria-pressed={selfGender === option.value} className={`min-h-11 rounded-xl border px-2 text-xs font-black outline-none focus-visible:ring-2 focus-visible:ring-boot-primary ${selfGender === option.value ? 'border-boot-primary bg-boot-soft text-boot-primary' : 'border-boot-hairline text-boot-body'}`}>
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      {drafts.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-boot-hairline bg-white p-5">
          <h2 className="font-black">연애 경험 없음</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">내 MBTI 분포에만 참여하며 경험 건수에는 포함되지 않아요.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <p className="text-sm font-black text-boot-body">총 {drafts.length}건 · 한 항목씩 확인</p>
          {drafts.map((draft) => (
            <details key={draft.draftId} open={expandedDraftId === draft.draftId} onToggle={(event) => { const isOpen = event.currentTarget.open; setExpandedDraftId((current) => transitionExpandedReviewId(current, draft.draftId, isOpen)) }} className="rounded-2xl border border-boot-hairline bg-white shadow-[0_10px_24px_rgba(41,35,33,0.04)]">
              <summary className="flex min-h-[68px] cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-boot-primary">
                <span><strong className="block font-black">{draft.partnerMbti === 'UNKNOWN' ? '유형 모름' : draft.partnerMbti} 경험 {draft.ordinal}</strong><span className="mt-1 block text-xs font-bold text-boot-muted">상대 성별 {GENDER_OPTIONS.find((option) => option.value === draft.partnerGender)?.label} · {draft.relationshipStatus === 'current' ? '현재 연애' : '지난 연애'} · {draft.evaluateIndividually ? `개별 평가${draft.score ? ` ${draft.score}점` : ''}` : '개별 평가 안 함'}</span></span>
                <span className="shrink-0 text-xs font-black text-boot-primary">{expandedDraftId === draft.draftId ? '접기' : '수정'}</span>
              </summary>
              <div className="border-t border-boot-hairline p-4 pt-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <fieldset>
                  <legend className="text-xs font-black text-boot-body">상대 성별</legend>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {GENDER_OPTIONS.map((option) => (
                      <button key={option.value} type="button" onClick={() => update(draft.draftId, { partnerGender: option.value })} aria-pressed={draft.partnerGender === option.value} className={`min-h-11 rounded-xl border px-2 text-[11px] font-black outline-none focus-visible:ring-2 focus-visible:ring-boot-primary ${draft.partnerGender === option.value ? 'border-boot-primary bg-boot-soft text-boot-primary' : 'border-boot-hairline text-boot-body'}`}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="text-xs font-black text-boot-body">관계 상태</legend>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {([
                      ['past', '지난 연애'],
                      ['current', '현재 연애'],
                    ] as const).map(([value, label]) => (
                      <button key={value} type="button" onClick={() => update(draft.draftId, { relationshipStatus: value })} aria-pressed={draft.relationshipStatus === value} className={`min-h-11 rounded-xl border text-xs font-black outline-none focus-visible:ring-2 focus-visible:ring-boot-primary ${draft.relationshipStatus === value ? 'border-boot-primary bg-boot-soft text-boot-primary' : 'border-boot-hairline text-boot-body'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>

              <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 border-t border-boot-hairline pt-4 text-sm font-black">
                <input type="checkbox" checked={draft.evaluateIndividually} onChange={(event) => update(draft.draftId, { evaluateIndividually: event.target.checked, score: null, matchedAspects: [] })} className="h-5 w-5 accent-boot-primary" />
                경험별로 평가하기 <span className="text-xs font-bold text-boot-muted">선택</span>
              </label>

              {draft.evaluateIndividually && (
                <div className="mt-3 rounded-xl bg-boot-canvas p-3">
                  <p className="text-xs font-black text-boot-body">잘 맞았다고 느낀 정도</p>
                  <div className="mt-2 grid grid-cols-5 gap-1.5">
                    {([1, 2, 3, 4, 5] as const).map((score) => (
                      <button key={score} type="button" onClick={() => update(draft.draftId, { score })} aria-pressed={draft.score === score} className={`min-h-11 rounded-xl border text-sm font-black outline-none focus-visible:ring-2 focus-visible:ring-boot-primary ${draft.score === score ? 'border-boot-primary bg-boot-primary text-white' : 'border-boot-hairline bg-white'}`} aria-label={`${score}점`}>{score}</button>
                    ))}
                  </div>
                  <p className="mt-4 text-xs font-black text-boot-body">잘 맞았던 항목 · 복수 선택</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {MATCHED_ASPECTS.map((aspect) => (
                      <button key={aspect} type="button" onClick={() => toggleAspect(draft, aspect)} aria-pressed={draft.matchedAspects.includes(aspect)} className={`min-h-11 rounded-full border px-3 text-xs font-black outline-none focus-visible:ring-2 focus-visible:ring-boot-primary ${draft.matchedAspects.includes(aspect) ? 'border-boot-primary bg-boot-soft text-boot-primary' : 'border-boot-hairline bg-white text-boot-body'}`}>
                        {draft.matchedAspects.includes(aspect) && <Check size={13} className="mr-1 inline" />}{ASPECT_LABELS[aspect]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              </div>
            </details>
          ))}
        </div>
      )}

      </fieldset>
      <section className="mt-5 rounded-2xl border border-boot-hairline bg-white p-4" aria-labelledby="mbti-final-consent">
        <h2 id="mbti-final-consent" className="font-black">마지막 확인 및 저장</h2>
        <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">선택한 {drafts.length}건과 내 유형을 저장하려면 아래 동의를 직접 체크해 주세요.</p>
        <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm font-bold leading-6">
          <input type="checkbox" disabled={submitting || recoveryLocked} checked={consent} onChange={(event) => onConsentChange(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-boot-primary" />
          <span>이 응답이 내 계정과 연결된 비공개 응답이며, 마지막 명시 확인 후 90일 동안 통계 목적으로 처리되는 데 동의해요. 언제든 개별 삭제하거나 전체 철회할 수 있어요.</span>
        </label>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
        {recoveryLocked && <p role="status" className="mt-3 rounded-xl bg-boot-info-soft px-4 py-3 text-sm font-bold leading-6 text-boot-info">직접 입력을 다시 시작하거나 내용을 수정하면 중복 저장 위험이 있어요. 같은 내용으로 저장을 끝낸 뒤 내 응답 관리에서 수정할 수 있어요.</p>}
        {authenticated !== true && <div className="mt-3 rounded-xl bg-boot-canvas p-3 text-xs font-bold leading-5 text-boot-body">
          <p>{authenticated === false ? '저장하려면 로그인이 필요해요. 로그인 화면으로 이동하면 아직 저장하지 않은 초안은 사라져요.' : '저장하기 전에 서비스 연결 확인이 필요해요. 다시 확인해도 입력은 유지돼요.'}</p>
          {authenticated === false ? <Link href="/login?next=/community/mbti" className="mt-2 inline-flex min-h-11 items-center font-black text-boot-primary underline">로그인하러 가기</Link> : <button type="button" disabled={checkingService} onClick={async () => { setCheckingService(true); try { await onRetryService() } finally { setCheckingService(false) } }} className="mt-2 min-h-11 font-black text-boot-primary underline disabled:opacity-50">{checkingService ? '연결 확인 중…' : '서비스 연결 다시 확인'}</button>}
        </div>}
        <button type="button" onClick={onSubmit} disabled={!consent || submitting} className="mt-4 min-h-14 w-full rounded-2xl bg-boot-primary px-5 text-base font-black text-white outline-none focus-visible:ring-2 focus-visible:ring-boot-primary focus-visible:ring-offset-2 disabled:opacity-40">
          {submitting ? '안전하게 저장하는 중…' : recoveryLocked ? '같은 내용으로 다시 저장하기' : '동의하고 응답 저장하기'}
        </button>
      </section>
    </section>
  )
}
