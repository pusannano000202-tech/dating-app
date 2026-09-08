'use client'

import { ArrowLeft, Minus, Plus, ShieldCheck, Trash2, UnfoldVertical } from 'lucide-react'
import { useRef, useState } from 'react'

import { createStableMbtiMutationRegistry } from '@/lib/community/mbti/client-mutation'
import {
  COMMUNITY_MBTI_CONSENT_VERSION,
  COMMUNITY_MBTI_MEETING_STATS_CONSENT_VERSION,
  type MbtiExperienceDto,
  type MbtiOwnerStateDto,
} from '@/lib/community/mbti/types'

interface MbtiResponseManagerProps {
  state: MbtiOwnerStateDto
  onBack: () => void
  onRefresh: () => Promise<void>
  onLoadMore: () => Promise<void>
  onWithdrawn: () => void
}

export default function MbtiResponseManager({ state, onBack, onRefresh, onLoadMore, onWithdrawn }: MbtiResponseManagerProps) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mutationIds = useRef(createStableMbtiMutationRegistry())

  const request = async (url: string, method: string, body: unknown) => {
    setError(null)
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(response.status === 409 ? '다른 기기에서 응답이 바뀌었어요. 새로고침 후 다시 시도해 주세요.' : '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.')
  }

  const update = async (experience: MbtiExperienceDto, patch: Record<string, unknown>) => {
    const mutationKey = `update:${experience.experienceId}:${experience.revision}:${JSON.stringify(patch)}`
    setBusyId(experience.experienceId)
    try {
      await request(`/api/community/mbti/experiences/${experience.experienceId}`, 'PATCH', {
        expected_revision: experience.revision,
        client_mutation_id: mutationIds.current.get(mutationKey),
        ...patch,
      })
      await onRefresh()
      mutationIds.current.complete(mutationKey)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '응답을 수정하지 못했어요.')
    } finally { setBusyId(null) }
  }

  const increment = async (experience: MbtiExperienceDto) => {
    if (experience.entryMode !== 'count_only') return
    if (experience.reportedCount < 100) {
      await update(experience, { reported_count: experience.reportedCount + 1 })
      return
    }

    const mutationKey = `count-overflow:${experience.experienceId}:${experience.revision}`
    setBusyId(experience.experienceId)
    try {
      await request('/api/community/mbti/experiences', 'POST', {
        self_mbti_snapshot: experience.selfMbtiSnapshot,
        partner_mbti: experience.partnerMbti,
        partner_gender: experience.partnerGender,
        relationship_status: experience.relationshipStatus,
        entry_mode: 'count_only',
        reported_count: 1,
        score: null,
        matched_aspects: null,
        client_mutation_id: mutationIds.current.get(mutationKey),
      })
      await onRefresh()
      mutationIds.current.complete(mutationKey)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '경험을 추가하지 못했어요.')
    } finally { setBusyId(null) }
  }

  const remove = async (experience: MbtiExperienceDto) => {
    if (!window.confirm('이 경험을 바로 삭제할까요? 서버 집계에서 바로 제외되고 공개 통계는 24시간 안에 갱신돼요.')) return
    const mutationKey = `delete:${experience.experienceId}:${experience.revision}`
    setBusyId(experience.experienceId)
    try {
      await request(`/api/community/mbti/experiences/${experience.experienceId}`, 'DELETE', {
        expected_revision: experience.revision,
        client_mutation_id: mutationIds.current.get(mutationKey),
      })
      await onRefresh()
      mutationIds.current.complete(mutationKey)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '경험을 삭제하지 못했어요.') }
    finally { setBusyId(null) }
  }

  const expand = async (experience: MbtiExperienceDto) => {
    const mutationKey = `expand:${experience.experienceId}:${experience.revision}`
    setBusyId(experience.experienceId)
    try {
      await request(`/api/community/mbti/experiences/${experience.experienceId}/expand`, 'POST', {
        expected_revision: experience.revision,
        client_mutation_id: mutationIds.current.get(mutationKey),
      })
      await onRefresh()
      mutationIds.current.complete(mutationKey)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '경험별 평가로 펼치지 못했어요.') }
    finally { setBusyId(null) }
  }

  const renew = async () => {
    if (!state.participant) return
    const mutationKey = `renew:${state.participant.revision}`
    setBusyId('renew')
    try {
      await request('/api/community/mbti/me', 'PUT', {
        self_mbti: state.participant.selfMbti,
        self_gender: state.participant.selfGender,
        consent: true,
        consent_version: COMMUNITY_MBTI_CONSENT_VERSION,
        expected_revision: state.participant.revision,
        client_mutation_id: mutationIds.current.get(mutationKey),
      })
      await onRefresh()
      mutationIds.current.complete(mutationKey)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '동의를 갱신하지 못했어요.') }
    finally { setBusyId(null) }
  }

  const toggleMeetingConsent = async () => {
    if (!state.participant) return
    const mutationKey = state.meetingStatsConsent
      ? `meeting-withdraw:${state.meetingStatsConsent.revision}`
      : 'meeting-consent:0'
    setBusyId('meeting')
    try {
      if (state.meetingStatsConsent) {
        await request('/api/community/mbti/meeting-stats-consent', 'DELETE', {
          expected_revision: state.meetingStatsConsent.revision,
          client_mutation_id: mutationIds.current.get(mutationKey),
        })
      } else {
        await request('/api/community/mbti/meeting-stats-consent', 'PUT', {
          self_mbti: state.participant.selfMbti,
          self_gender: state.participant.selfGender,
          consent: true,
          consent_version: COMMUNITY_MBTI_MEETING_STATS_CONSENT_VERSION,
          expected_revision: 0,
          client_mutation_id: mutationIds.current.get(mutationKey),
        })
      }
      await onRefresh()
      mutationIds.current.complete(mutationKey)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '실제 만남 통계 동의를 바꾸지 못했어요.') }
    finally { setBusyId(null) }
  }

  const withdrawAll = async () => {
    if (!state.participant || !window.confirm('내 MBTI 설문 응답과 모든 연애 경험을 바로 철회·삭제할까요?')) return
    const mutationKey = `withdraw:${state.participant.revision}`
    setBusyId('withdraw')
    try {
      await request('/api/community/mbti/withdraw', 'POST', {
        expected_revision: state.participant.revision,
        client_mutation_id: mutationIds.current.get(mutationKey),
      })
      onWithdrawn()
      mutationIds.current.complete(mutationKey)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '전체 철회를 처리하지 못했어요.') }
    finally { setBusyId(null) }
  }

  const loadMore = async () => {
    setBusyId('load-more')
    setError(null)
    try {
      await onLoadMore()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '추가 경험을 불러오지 못했어요.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-24 pt-5 sm:px-6 sm:pt-8">
      <button type="button" onClick={onBack} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-boot-soft" aria-label="통계로 돌아가기"><ArrowLeft /></button>
      <h1 className="mt-6 text-3xl font-black tracking-[-0.03em]">내 응답 관리</h1>
      <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">다른 계정의 원시 응답은 볼 수 없어요. 변경은 revision이 맞을 때만 반영됩니다.</p>

      {state.participant && (
        <article className="mt-6 rounded-2xl border border-boot-hairline bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><strong className="text-lg">내 유형 {state.participant.selfMbti}</strong><p className="mt-1 text-xs font-bold text-boot-muted">동의 만료 {new Date(state.participant.expiresAt).toLocaleDateString('ko-KR')}</p></div>
            <button type="button" onClick={() => void renew()} disabled={busyId !== null} className="min-h-11 rounded-xl bg-boot-soft px-4 text-sm font-black text-boot-primary"><ShieldCheck size={16} className="mr-1 inline" />90일 동의 다시 확인</button>
          </div>
        </article>
      )}

      <div className="mt-4 grid gap-3">
        {state.experiences.map((experience) => (
          <article key={experience.experienceId} className="rounded-2xl border border-boot-hairline bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="font-black">{experience.partnerMbti === 'UNKNOWN' ? '유형 모름' : experience.partnerMbti} · {experience.relationshipStatus === 'past' ? '지난 연애' : '현재 연애'}</h2><p className="mt-1 text-xs font-bold text-boot-muted">{experience.entryMode === 'count_only' ? `${experience.reportedCount}회 묶음` : `개별 평가 · ${experience.score ? `${experience.score}점` : '점수 없음'}`}</p></div>
              <button type="button" onClick={() => void remove(experience)} disabled={busyId !== null} className="flex h-11 w-11 items-center justify-center rounded-full text-red-600" aria-label={`${experience.partnerMbti} 경험 삭제`}><Trash2 size={18} /></button>
            </div>
            {state.participant && experience.selfMbtiSnapshot !== state.participant.selfMbti && (
              <button type="button" disabled={busyId !== null} onClick={() => void update(experience, { self_mbti_snapshot: state.participant?.selfMbti, confirm_self_snapshot_change: true })} className="mt-3 min-h-11 w-full rounded-xl border border-boot-hairline px-3 text-xs font-black text-boot-body">
                당시 내 유형을 현재 {state.participant.selfMbti}로 수정
              </button>
            )}
            {experience.entryMode === 'count_only' ? (
              <div className="mt-3 border-t border-boot-hairline pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={busyId !== null || experience.reportedCount <= 1} onClick={() => void update(experience, { reported_count: experience.reportedCount - 1 })} className="flex h-11 w-11 items-center justify-center rounded-full border border-boot-hairline"><Minus size={17} /></button>
                  <strong className="w-8 text-center">{experience.reportedCount}</strong>
                  <button type="button" disabled={busyId !== null} onClick={() => void increment(experience)} className="flex h-11 w-11 items-center justify-center rounded-full border border-boot-hairline text-boot-primary"><Plus size={17} /></button>
                  <button type="button" disabled={busyId !== null} onClick={() => void expand(experience)} className="ml-auto min-h-11 rounded-xl border border-boot-primary px-3 text-xs font-black text-boot-primary"><UnfoldVertical size={15} className="mr-1 inline" />{Math.min(experience.reportedCount, 100)}개 펼치기</button>
                </div>
                {experience.reportedCount > 100 && <p className="mt-2 text-right text-[11px] font-bold text-boot-muted">한 번에 최대 100개씩 안전하게 펼쳐요.</p>}
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-5 gap-1.5 border-t border-boot-hairline pt-3">
                {([1, 2, 3, 4, 5] as const).map((score) => <button key={score} type="button" disabled={busyId !== null} onClick={() => void update(experience, { score, matched_aspects: experience.matchedAspects })} aria-pressed={experience.score === score} className={`min-h-11 rounded-xl border text-sm font-black outline-none focus-visible:ring-2 focus-visible:ring-boot-primary ${experience.score === score ? 'border-boot-primary bg-boot-primary text-white' : 'border-boot-hairline'}`}>{score}</button>)}
              </div>
            )}
          </article>
        ))}
        {state.experiences.length === 0 && <p className="rounded-2xl border border-boot-hairline bg-white p-5 text-sm font-bold text-boot-muted">저장된 연애 경험이 없어요.</p>}
      </div>
      {state.nextCursor && (
        <button type="button" onClick={() => void loadMore()} disabled={busyId !== null} className="mt-4 min-h-12 w-full rounded-2xl border border-boot-hairline bg-white text-sm font-black text-boot-body disabled:opacity-40">
          {busyId === 'load-more' ? '불러오는 중…' : '다음 경험 불러오기'}
        </button>
      )}

      <article className="mt-5 rounded-2xl border border-boot-hairline bg-white p-5">
        <h2 className="font-black">실제 만남 통계 별도 동의</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">설문 동의와 별개예요. 서비스에서 같은 행사에 참석한 기록과 상대방의 동의가 모두 있을 때만 통계 후보가 돼요. 교제 확인을 뜻하지 않아요.</p>
        <button type="button" onClick={() => void toggleMeetingConsent()} disabled={!state.participant || busyId !== null} className={`mt-3 min-h-11 rounded-xl px-4 text-sm font-black ${state.meetingStatsConsent ? 'border border-red-200 bg-white text-red-700' : 'bg-boot-ink text-white'}`}>
          {state.meetingStatsConsent ? '실제 만남 통계 동의 철회' : '실제 만남 통계에 별도 동의'}
        </button>
      </article>

      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
      <button type="button" onClick={() => void withdrawAll()} disabled={!state.participant || busyId !== null} className="mt-6 min-h-12 w-full rounded-2xl border border-red-200 bg-white text-sm font-black text-red-700">설문 전체 철회 및 원시 경험 삭제</button>
    </section>
  )
}
