'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, ShieldCheck, LockKeyhole, Headphones } from 'lucide-react'
import type { AdviceRole } from '@/lib/voice/contracts'
import { voiceFetch } from '@/lib/voice/client'
import { createVoiceEntryLoader, parseVoiceQueueIdentity, INITIAL_VOICE_ENTRY_STATE, type VoiceEntryLoadState } from '@/lib/voice/entry-status'
import VoiceEntryScenes, { ENTRY_TOPICS, type EntryTopic } from './VoiceEntryScenes'
import VoiceParticipation from './VoiceParticipation'
import s from './voice-entry.module.css'

export default function VoiceRandom({ initialTopic = 'worries', initialRole, initialAdviceTopic }: {
  initialTopic?: string; initialRole?: string; initialAdviceTopic?: string
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<EntryTopic>(initialTopic === 'social' ? 'social' : initialAdviceTopic === 'romance' || initialAdviceTopic === 'career' ? initialAdviceTopic : 'general')
  const [role, setRole] = useState<AdviceRole | null>(initialRole === 'talker' || initialRole === 'listener' ? initialRole : null)
  const [queued, setQueued] = useState(false)
  const [busy, setBusy] = useState(false)
  const [prepared, setPrepared] = useState(false)
  const [rulesConfirmed, setRulesConfirmed] = useState(false)
  const [commandError, setCommandError] = useState('')
  const [scopedLoad, setScopedLoad] = useState<{ key: EntryTopic; state: VoiceEntryLoadState }>({ key: selected, state: INITIAL_VOICE_ENTRY_STATE })
  const loaderRef = useRef<ReturnType<typeof createVoiceEntryLoader> | null>(null)
  const search = useRef('')
  const busyRef = useRef(false)
  const rulesPanel = useRef<HTMLDetailsElement>(null)
  const casual = selected === 'social'
  const adviceTopic = casual ? null : selected
  const chosen = ENTRY_TOPICS.find(item => item.id === selected)!
  const load = scopedLoad.key === selected ? scopedLoad.state : INITIAL_VOICE_ENTRY_STATE

  useEffect(() => {
    search.current = sessionStorage.getItem('quantum-voice-search') || crypto.randomUUID()
    sessionStorage.setItem('quantum-voice-search', search.current)
  }, [])

  useEffect(() => {
    const loader = createVoiceEntryLoader(
      signal => voiceFetch(selected === 'social' ? '/api/voice/queue' : '/api/voice/advice/queue?adviceTopic=' + selected, undefined, signal),
      selected !== 'social',
      state => {
        setScopedLoad({ key: selected, state })
        if (state.phase !== 'ready' || !state.data || busyRef.current) return
        const data = state.data
        setQueued(data.queued)
        if (data.queued && data.role) setRole(data.role)
        if (data.queued && data.adviceTopic && data.adviceTopic !== selected) setSelected(data.adviceTopic)
        if (data.sessionId) router.replace('/community/voice/session/' + data.sessionId)
      },
      selected,
    )
    loaderRef.current = loader
    void loader.refresh()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !busyRef.current) void loader.refresh()
    }, 4000)
    return () => { clearInterval(timer); loader.dispose(); if (loaderRef.current === loader) loaderRef.current = null }
  }, [selected, router])

  function chooseTopic(next: EntryTopic) {
    if (queued || busyRef.current || selected === next) return
    loaderRef.current?.dispose()
    setSelected(next)
    setPrepared(false)
    setRulesConfirmed(false)
    setCommandError('')
  }

  function prepare() {
    setPrepared(true)
    requestAnimationFrame(() => {
      rulesPanel.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
      rulesPanel.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
    })
  }

  async function command(action: 'join' | 'leave' | 'resume') {
    if (busyRef.current) return
    if (action === 'join' && (!rulesConfirmed || (!casual && !role) || load.phase !== 'ready')) {
      setCommandError('역할과 대화 약속, 현재 대기 현황을 먼저 확인해 주세요.')
      return
    }
    busyRef.current = true
    setBusy(true)
    setCommandError('')
    try {
      if (action === 'join') await voiceFetch('/api/voice/rules', {})
      let acknowledgement: unknown
      if (!casual) {
        acknowledgement = await voiceFetch('/api/voice/advice/queue', action === 'resume'
          ? { action, idempotencyKey: crypto.randomUUID() }
          : { action, ...(action === 'join' ? { role, adviceTopic } : {}), searchId: search.current, idempotencyKey: crypto.randomUUID() })
      } else {
        acknowledgement = await voiceFetch('/api/voice/queue', { action, topic: 'social', searchId: search.current, idempotencyKey: crypto.randomUUID() })
      }
      const confirmed = parseVoiceQueueIdentity(acknowledgement, action === 'leave')
      setQueued(confirmed.queued)
      if (confirmed.sessionId) router.replace('/community/voice/session/' + confirmed.sessionId)
      if (action === 'leave') { setPrepared(false); setRulesConfirmed(false) }
    } catch (caught) {
      setCommandError(caught instanceof Error ? caught.message : '처리하지 못했어요.')
    } finally {
      busyRef.current = false
      setBusy(false)
      // A new refresh invalidates any pre-command response, including fetchers ignoring abort.
      void loaderRef.current?.refresh()
    }
  }

  return <main className={s.page}>
    <header className={s.header}>
      <Link href="/community/voice" aria-label="보이스 목록으로"><ArrowLeft size={21} /></Link>
      <span>익명 보이스</span><span />
    </header>
    <div className={s.entry}>
      <h1>{queued ? <>같은 이야기를 고른<br /><em>한 사람을 기다려요.</em></> : casual ? <>오늘 하루,<br /><em>가볍게 나눠볼까요?</em></> : <>오늘은 말할까요,<br /><em>들어볼까요?</em></>}</h1>
      <p className={s.subtitle}>같은 학교의 한 사람과, 목소리로 가까워지는 시간.</p>
      <VoiceParticipation state={load} label={chosen.label} casual={casual} onRefresh={() => { if (!busyRef.current) void loaderRef.current?.refresh() }} />
      {queued ? <section className={s.waiting} aria-label="대화 상대 대기 중">
        <Headphones size={32} />
        <h2>{chosen.label} 이야기를 함께할 사람을 찾고 있어요.</h2>
        <p>{!casual && (role === 'talker' ? '내 이야기를 말하는 역할로 기다리고 있어요. ' : '이야기를 들어주는 역할로 기다리고 있어요. ')}서로 수락한 뒤 연결돼요.</p>
        <small>대기는 5분 후 만료돼요. 원할 때 다시 참여할 수 있어요.</small>
      </section> : <>
        <VoiceEntryScenes selected={selected} role={role} disabled={busy} onRole={setRole} onTopic={chooseTopic} />
        <p className={s.prompt}>첫마디가 어렵다면<strong>“{chosen.prompt}”</strong></p>
      </>}
      {!queued && <details ref={rulesPanel} className={s.rules} open={prepared} onToggle={event => setPrepared(event.currentTarget.open)}>
        <summary><ShieldCheck size={18} /><span>가볍게 시작해도, 서로에게는 다정하게</span><span className={s.more}>확인</span></summary>
        <div className={s.rulesBody}>
          <p>고민 나눔은 전문 상담이 아닌 또래 간 대화예요. 비난·성희롱·개인정보 요구 없이 대화해요.</p>
          <p>이름과 전화번호는 공개하지 않고 친구로 자동 추가되지 않아요. 마이크는 연결 화면에서 직접 켜요.</p>
          <label><input type="checkbox" checked={rulesConfirmed} disabled={busy} onChange={event => setRulesConfirmed(event.target.checked)} />대화 약속을 확인했고 지키겠습니다.</label>
        </div>
      </details>}
      {commandError && <p className={s.commandError} role="alert">{commandError}</p>}
      <div className={s.actions}>
        {queued ? <>
          {!casual && <button className={s.primary} disabled={busy} onClick={() => void command('resume')}>{busy ? '상태 확인 중…' : '연결 정리 확인하고 계속 찾기'}<ArrowRight size={18} /></button>}
          <button className={s.secondary} disabled={busy} onClick={() => void command('leave')}>대기 그만하기</button>
        </> : !prepared ? <button className={s.primary} disabled={busy || (!casual && !role)} onClick={prepare}>{!casual && !role ? '오늘의 역할을 먼저 골라 주세요' : chosen.label + ' 대화 준비하기'}<ArrowRight size={18} /></button> : <button className={s.primary} disabled={busy || !rulesConfirmed || (!casual && !role) || load.phase !== 'ready'} onClick={() => void command('join')}>{busy ? '처리 중…' : '대화 상대 찾기'}<ArrowRight size={18} /></button>}
      </div>
      <p className={s.reassurance}><LockKeyhole size={13} />익명으로 시작해요. 서로 수락하기 전에는 연결되지 않아요.</p>
    </div>
  </main>
}
