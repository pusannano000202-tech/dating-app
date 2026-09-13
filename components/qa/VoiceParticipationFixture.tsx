'use client'

import { useState } from 'react'
import Link from 'next/link'
import VoiceParticipation from '@/components/voice/VoiceParticipation'
import VoiceEntryScenes, { ENTRY_TOPICS, type EntryTopic } from '@/components/voice/VoiceEntryScenes'
import { makeParticipationSummary } from '@/lib/participation/summary'
import type { VoiceEntryLoadState } from '@/lib/voice/entry-status'
import type { AdviceRole } from '@/lib/voice/contracts'
import s from '@/components/voice/voice-entry.module.css'

type Sample = 'people' | 'zero' | 'one' | 'unknown' | 'loading' | 'error'
const samples: { id: Sample; label: string }[] = [
  { id: 'people', label: '12명 예시' }, { id: 'zero', label: '0명 예시' },
  { id: 'one', label: '1명 예시' }, { id: 'unknown', label: '미응답 포함' },
  { id: 'loading', label: '불러오는 중' }, { id: 'error', label: '연결 실패' },
]

// This component is reachable only behind the existing development/offline-UI gate.
// It never contacts a voice API or joins a queue; production renders VoiceParticipation with API state.
export default function VoiceParticipationFixture() {
  const [sample, setSample] = useState<Sample>('people')
  const [topic, setTopic] = useState<EntryTopic>('romance')
  const [role, setRole] = useState<AdviceRole | null>(null)
  const [refreshes, setRefreshes] = useState(0)
  const chosen = ENTRY_TOPICS.find(item => item.id === topic)!
  const genders = sample === 'zero' ? [] : sample === 'one' ? ['female']
    : sample === 'unknown' ? ['female', 'male', 'unspecified']
      : [...Array<string>(7).fill('female'), ...Array<string>(5).fill('male')]
  const state: VoiceEntryLoadState = {
    phase: sample === 'loading' ? 'loading' : sample === 'error' ? 'error' : 'ready',
    refreshing: sample === 'loading',
    error: sample === 'error' ? '연결 실패 상태를 확인하는 개발 전용 예시입니다.' : '',
    data: sample === 'loading' || sample === 'error' ? null : {
      queued: false, sessionId: null, role: null, adviceTopic: null,
      waiting: makeParticipationSummary(`advice:fixture:${topic}`, genders, 'waiting_for_voice', new Date('2026-09-09T10:30:00Z')),
      talkers: topic === 'social' ? null : Math.ceil(genders.length / 2),
      listeners: topic === 'social' ? null : Math.floor(genders.length / 2),
    },
  }

  return <main className={s.page}>
    <div className={s.entry}>
      <p className={s.subtitle}><strong>디자인 검수 · 예시 데이터 · 실제 대기/통화 연결 없음</strong></p>
      <h1>오늘은 말할까요,<br /><em>들어볼까요?</em></h1>
      <p className={s.subtitle}>같은 학교의 한 사람과, 목소리로 가까워지는 시간.</p>
      <VoiceParticipation state={state} label={chosen.label} casual={topic === 'social'} onRefresh={() => { setRefreshes(n => n + 1); setSample('people') }} />
      <VoiceEntryScenes selected={topic} role={role} disabled={false} onRole={setRole} onTopic={setTopic} />
      <fieldset>
        <legend>현황 상태 확인 · 모두 예시</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {samples.map(item => <button key={item.id} type="button" aria-pressed={sample === item.id} style={{ minHeight: 44, padding: '8px 12px', border: '1px solid #d9b7a8', borderRadius: 10, background: sample === item.id ? '#fae8de' : '#fff' }} onClick={() => setSample(item.id)}>{item.label}</button>)}
        </div>
        <p role="status">예시 다시 확인 {refreshes}회 · 서버 요청 없음</p>
      </fieldset>
      <p><Link href="/community/voice/random?topic=worries&adviceTopic=romance">실제 보이스 화면 보기</Link></p>
    </div>
  </main>
}
