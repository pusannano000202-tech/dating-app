'use client'
import { RefreshCw, Users } from 'lucide-react'
import type { VoiceEntryLoadState } from '@/lib/voice/entry-status'
import s from './voice-entry.module.css'

export default function VoiceParticipation({ state, label, casual, onRefresh }: {
  state: VoiceEntryLoadState; label: string; casual: boolean; onRefresh: () => void
}) {
  const data = state.data
  return <section className={s.participation} aria-label={`${label} 대기 현황`}>
    <div className={s.countHeading}>
      <span><Users size={16} />{casual ? '우리 학교 일대일' : label} · 대기 현황</span>
      <button type="button" onClick={onRefresh} disabled={state.refreshing} aria-label="대기 현황 다시 확인"><RefreshCw size={15} /></button>
    </div>
    {state.phase === 'loading' && <p className={s.statusMessage} role="status">현황 확인 중…</p>}
    {state.phase === 'error' && <div className={s.countError} role="status">
      <p>지금은 대기 인원을 확인할 수 없어요.</p>
      <button type="button" onClick={onRefresh} disabled={state.refreshing}>{state.refreshing ? '확인 중…' : '다시 확인'}<RefreshCw size={13} /></button>
      <details><summary>상세 안내</summary><p>{state.error}</p></details>
    </div>}
    {state.phase === 'ready' && data && <>
      <dl className={s.countGrid}>
        <div className={s.countTotal}><dt>전체</dt><dd>{data.waiting.totalPeople}<small>명</small></dd></div>
        <div><dt>남자</dt><dd>{data.waiting.genderBreakdown.malePeople}<small>명</small></dd></div>
        <div><dt>여자</dt><dd>{data.waiting.genderBreakdown.femalePeople}<small>명</small></dd></div>
      </dl>
      <div className={s.countMeta}>
        <span>{data.talkers !== null ? `말하기 ${data.talkers} · 듣기 ${data.listeners}` : '학교 전체 일대일 대기 기준'}{data.waiting.genderBreakdown.otherOrUnspecifiedPeople > 0 && ` · 기타·비공개 ${data.waiting.genderBreakdown.otherOrUnspecifiedPeople}명`}</span>
        <time dateTime={data.waiting.asOf}>{new Date(data.waiting.asOf).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })} 기준</time>
      </div>
      <p className={s.countScope}>같은 학교의 대기 인원 · 통화 중인 인원은 제외해요.</p>
    </>}
  </section>
}
