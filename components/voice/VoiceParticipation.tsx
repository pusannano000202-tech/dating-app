'use client'
import { RefreshCw, UserRound, Users } from 'lucide-react'
import type { VoiceEntryLoadState } from '@/lib/voice/entry-status'
import s from './voice-participation.module.css'

export default function VoiceParticipation({ state, label, casual, onRefresh }: {
  state: VoiceEntryLoadState; label: string; casual: boolean; onRefresh: () => void
}) {
  const data = state.data
  const scopeLabel = casual ? '우리 학교 일대일' : label
  return <section className={s.participation} aria-label={`${scopeLabel} 대기 현황`}>
    <div className={s.countHeading}>
      <h2><Users size={16} aria-hidden="true" />{scopeLabel} · 대기 현황</h2>
      <button type="button" onClick={onRefresh} disabled={state.refreshing} aria-label="대기 현황 다시 확인" aria-busy={state.refreshing}>
        <RefreshCw size={15} aria-hidden="true" className={state.refreshing ? s.refreshing : undefined} />
      </button>
    </div>
    <div aria-live="polite" aria-atomic="true">
    {state.phase === 'loading' && <p className={s.statusMessage}>현황 확인 중…</p>}
    {state.phase === 'error' && <div className={s.countError}>
      <p>지금은 대기 인원을 확인할 수 없어요.</p>
      <button type="button" onClick={onRefresh} disabled={state.refreshing}>{state.refreshing ? '확인 중…' : '다시 확인'}<RefreshCw size={13} aria-hidden="true" /></button>
      <details><summary>상세 안내</summary><p>{state.error}</p></details>
    </div>}
    {state.phase === 'ready' && data && <>
      <dl className={s.countGrid}>
        <div className={s.countTotal}><dt>전체 대기</dt><dd>{data.waiting.totalPeople}<small>명</small></dd></div>
        <div className={s.genderCard}><dt><UserRound size={14} aria-hidden="true" />여성</dt><dd>{data.waiting.genderBreakdown.femalePeople}<small>명</small></dd></div>
        <div className={s.genderCard}><dt><UserRound size={14} aria-hidden="true" />남성</dt><dd>{data.waiting.genderBreakdown.malePeople}<small>명</small></dd></div>
      </dl>
      <div className={s.countMeta}>
        {data.talkers !== null && data.listeners !== null && <span>말하기 {data.talkers}명 · 듣기 {data.listeners}명</span>}
        {data.waiting.genderBreakdown.otherOrUnspecifiedPeople > 0 && <span className={s.otherCount}>기타·미응답 {data.waiting.genderBreakdown.otherOrUnspecifiedPeople}명 포함</span>}
        <time dateTime={data.waiting.asOf}>{new Date(data.waiting.asOf).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} 기준</time>
        {state.refreshing && <span className={s.refreshMessage}>현황 다시 확인 중…</span>}
      </div>
      <p className={s.countScope}>같은 학교의 대기 인원 · 통화 중인 인원은 제외해요.</p>
    </>}
    </div>
  </section>
}
